import React, { useRef, useCallback, useState, useEffect } from 'react';
import {WSMessage, WSResponseMessage} from "../../utils/sync/wsObject";

interface WebSocketStats {
    messageRate: number; // messages per second
    bitrate: number; // bits per second
    latency: number; // milliseconds
    messagesReceived: number;
    messagesSent: number;
    bytesReceived: number;
    bytesSent: number;
}


interface WebSocketHookReturn {
    connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
    stats: WebSocketStats;
    connect: (url: string) => Promise<boolean>;
    disconnect: () => void;
    sendMessage:  <T extends any>(message: WSMessage<T>) => Promise<WSResponseMessage<WSMessage<T>>|undefined>;
    setMessageHandler: (handler: (message: any) => Promise<void>) => void;
}

export const useWebSocket = (
    autoReconnect = true,
    reconnectInterval = 1000,
    maxReconnectAttempts = 3
): WebSocketHookReturn => {
    const wsRef = useRef<WebSocket | null>(null);
    const urlRef = useRef<string>('');
    const reconnectTimeoutRef = useRef<NodeJS.Timeout>(undefined);
    const reconnectAttemptsRef = useRef(0);
    const messageHandlerRef = useRef<(message: any) => Promise<void>>(undefined);
    const messageReponseRef = useRef<Record<number, (message:WSResponseMessage<WSMessage<any>>) => void>>({});
    const messageResponseIdRef= useRef<number>(0);
    const pendingConnectResolversRef = useRef<{ resolve: (success: boolean) => void }[]>([]);
    const isManualDisconnectRef = useRef(false);

    const [connectionState, setConnectionState] = useState<
        'disconnected' | 'connecting' | 'connected' | 'reconnecting'
    >('disconnected');

    const [stats, setStats] = useState<WebSocketStats>({
        messageRate: 0,
        bitrate: 0,
        latency: 0,
        messagesReceived: 0,
        messagesSent: 0,
        bytesReceived: 0,
        bytesSent: 0,
    });

    // Stats tracking
    const lastMessageTimeRef = useRef<number>(Date.now());
    const messageCountRef = useRef(0);
    const bytesCountRef = useRef(0);
    const pingStartTimeRef = useRef<number>(0);

    // Update stats periodically
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const timeDiff = (now - lastMessageTimeRef.current) / 1000;

            if (timeDiff > 0) {
                const msgRate = messageCountRef.current / timeDiff;
                const bitRate = (bytesCountRef.current * 8) / timeDiff;

                setStats(prev => ({
                    ...prev,
                    messageRate: Math.round(msgRate * 10) / 10,
                    bitrate: Math.round(bitRate),
                }));

                messageCountRef.current = 0;
                bytesCountRef.current = 0;
                lastMessageTimeRef.current = now;
            }
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    const cleanup = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = undefined;
        }

        if (wsRef.current) {
            wsRef.current.onopen = null;
            wsRef.current.onclose = null;
            wsRef.current.onerror = null;
            wsRef.current.onmessage = null;

            if (
                wsRef.current.readyState === WebSocket.OPEN ||
                wsRef.current.readyState === WebSocket.CONNECTING
            ) {
                wsRef.current.close();
            }

            wsRef.current = null;
        }
    }, []);

    const attemptReconnect = useCallback(() => {
        if (!autoReconnect || isManualDisconnectRef.current) return;
        if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
            setConnectionState('disconnected');
            pendingConnectResolversRef.current.forEach(({ resolve }) => resolve(false));
            pendingConnectResolversRef.current = [];
            return;
        }

        reconnectAttemptsRef.current++;
        setConnectionState('reconnecting');

        reconnectTimeoutRef.current = setTimeout(() => {
            if (urlRef.current) {
                connectInternal(urlRef.current);
            }
        }, reconnectInterval * reconnectAttemptsRef.current);
    }, [autoReconnect, maxReconnectAttempts, reconnectInterval]);

    const connectInternal = useCallback(
        (url: string) => {
            cleanup();
            setConnectionState('connecting');

            const ws = new WebSocket(url);
            wsRef.current = ws;
            urlRef.current = url;

            const connectStartTime = Date.now();

            ws.onopen = () => {
                const latency = Date.now() - connectStartTime;
                setConnectionState('connected');
                reconnectAttemptsRef.current = 0;

                setStats(prev => ({ ...prev, latency }));

                pendingConnectResolversRef.current.forEach(({ resolve }) => resolve(true));
                pendingConnectResolversRef.current = [];

                // Send ping to measure latency periodically
                const pingInterval = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        pingStartTimeRef.current = Date.now();
                        ws.send(JSON.stringify({ type: '__ping__' }));
                    } else {
                        clearInterval(pingInterval);
                    }
                }, 5000);
            };

            ws.onmessage = async (event) => {
                const dataSize = new Blob([event.data]).size;

                setStats(prev => ({
                    ...prev,
                    messagesReceived: prev.messagesReceived + 1,
                    bytesReceived: prev.bytesReceived + dataSize,
                }));

                messageCountRef.current++;
                bytesCountRef.current += dataSize;

                const data = JSON.parse(event.data) as WSMessage<any>;
                if(data._id) {
                    messageReponseRef.current[data._id]?.(data);
                } else {

                    // Handle ping response
                    if (data.type === '__pong__') {
                        const latency = Date.now() - pingStartTimeRef.current;
                        setStats(prev => ({...prev, latency}));
                        return;
                    }

                    // Call user message handler
                    if (messageHandlerRef.current) {
                        await messageHandlerRef.current(data);
                    }
                }

            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

            ws.onclose = (event) => {
                if (!isManualDisconnectRef.current) {
                    attemptReconnect();
                } else {
                    setConnectionState('disconnected');
                }
            };
        },
        [cleanup, attemptReconnect]
    );

    const connect = useCallback(
        (url: string): Promise<boolean> => {
            return new Promise((resolve) => {
                isManualDisconnectRef.current = false;

                if (connectionState === 'connected') {
                    resolve(true);
                    return;
                }

                const pendingResolve = (success: boolean) => resolve(success);

                if (connectionState === 'connecting' || connectionState === 'reconnecting') {
                    pendingConnectResolversRef.current.push({ resolve: pendingResolve });
                    return;
                }

                urlRef.current = url;

                pendingConnectResolversRef.current.push({ resolve: pendingResolve });
                connectInternal(url);
            });
        },
        [connectInternal, connectionState]
    );

    const disconnect = useCallback(() => {
        isManualDisconnectRef.current = true;
        cleanup();
        setConnectionState('disconnected');
        pendingConnectResolversRef.current.forEach(({ resolve }) => resolve(false));
        pendingConnectResolversRef.current = [];
    }, [cleanup]);

    const sendMessage = useCallback(
        <T extends any>(message: WSMessage<T>): Promise<WSResponseMessage<WSMessage<T>> | undefined> => new Promise((resolve) => {
            // If not connected, try to reconnect first
            if (
                !wsRef.current ||
                wsRef.current.readyState !== WebSocket.OPEN
            ) {
                if (!urlRef.current) {
                    resolve(undefined);
                    return;
                }

                connect(urlRef.current).then((connected) => {
                    if (!connected) {
                        console.error('Failed to connect');
                        resolve(undefined);
                        return;
                    }

                    // Proceed to send message
                    sendMessageInternal(message, resolve);
                });
                return;
            }

            // Send message directly
            sendMessageInternal(message, resolve);
        }),
        [connect]
    );

    const sendMessageInternal = <T extends any>(
        message: WSMessage<T>,
        resolve: (value: WSResponseMessage<WSMessage<T>> | undefined) => void
    ) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            messageResponseIdRef.current++;
            let settled = false;
            messageReponseRef.current[messageResponseIdRef.current] = (message: WSResponseMessage<WSMessage<any>>) => {
                if (!settled) {
                    settled = true;
                    resolve(message);
                }
            };

            message._id = messageResponseIdRef.current;

            const messageStr = JSON.stringify(message);
            const messageSize = new Blob([messageStr]).size;

            wsRef.current.send(messageStr);

            setStats(prev => ({
                ...prev,
                messagesSent: prev.messagesSent + 1,
                bytesSent: prev.bytesSent + messageSize,
            }));

            setTimeout(() => {
                if (!settled) {
                    settled = true;
                    resolve(undefined);
                    delete messageReponseRef.current[messageResponseIdRef.current];
                }
            }, 1500);
        } else {
            resolve(undefined);
        }
    };

    const setMessageHandler = useCallback((handler: (message: any) => Promise<void>) => {
        messageHandlerRef.current = handler;
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            isManualDisconnectRef.current = true;
            cleanup();
        };
    }, [cleanup]);

    return {
        connectionState,
        stats,
        connect,
        disconnect,
        sendMessage,
        setMessageHandler,
    };
};