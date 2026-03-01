/**
 * useAIChat — React hook for consuming AI streaming via a dedicated WebSocket.
 *
 * Uses its own WebSocket connection (separate from useWebSocket/sync) because
 * the sync socket routes messages by `_id` to a one-shot resolver, which is
 * incompatible with multi-message streaming (ai:token, ai:complete, etc.).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { api_sync_info } from "@nodius/utils";

// ─── Types ──────────────────────────────────────────────────────────

export interface AIChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    isStreaming?: boolean;
    toolCalls?: Array<{ id: string; name: string; result?: string }>;
    proposedAction?: unknown;
    /** Error code from the server (rate_limit, server_error, timeout, etc.). */
    errorCode?: string;
    /** Whether the error is retryable. */
    retryable?: boolean;
}

export interface UseAIChatOptions {
    graphKey: string;
    serverInfo: api_sync_info | null;
    autoConnect?: boolean;
}

export interface UseAIChatReturn {
    messages: AIChatMessage[];
    isConnected: boolean;
    isTyping: boolean;
    sendMessage: (text: string) => void;
    resume: (threadId: string, approved: boolean, feedback?: string) => void;
    stopGeneration: () => void;
    connect: () => void;
    disconnect: () => void;
    threadId: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────

const FLUSH_INTERVAL_MS = 32;

// ─── Hook ───────────────────────────────────────────────────────────

export function useAIChat(options: UseAIChatOptions): UseAIChatReturn {
    const { graphKey, serverInfo, autoConnect = false } = options;

    // ── State ───────────────────────────────────────────────────────
    const [messages, setMessages] = useState<AIChatMessage[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isTyping, setIsTyping] = useState(false);

    // ── Refs ────────────────────────────────────────────────────────
    const threadIdRef = useRef<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const requestIdRef = useRef(0);
    const pendingTextRef = useRef("");
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Expose threadId as state-like via a derived value
    const [threadId, setThreadId] = useState<string | null>(null);

    // ── Flush tokens (throttled) ────────────────────────────────────

    const flushTokens = useCallback(() => {
        if (pendingTextRef.current) {
            const text = pendingTextRef.current;
            pendingTextRef.current = "";

            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && last.isStreaming) {
                    return [
                        ...prev.slice(0, -1),
                        { ...last, content: last.content + text },
                    ];
                }
                return prev;
            });
        }
        flushTimerRef.current = null;
    }, []);

    const scheduleFlush = useCallback(() => {
        if (flushTimerRef.current === null) {
            flushTimerRef.current = setTimeout(flushTokens, FLUSH_INTERVAL_MS);
        }
    }, [flushTokens]);

    // ── Message handler ─────────────────────────────────────────────

    const handleMessage = useCallback((data: Record<string, unknown>) => {
        const type = data.type as string;

        switch (type) {
            case "ai:token": {
                pendingTextRef.current += data.token as string;
                scheduleFlush();
                break;
            }

            case "ai:tool_start": {
                const toolCallId = data.toolCallId as string;
                const toolName = data.toolName as string;

                setMessages(prev => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant") {
                        const toolCalls = [...(last.toolCalls ?? []), { id: toolCallId, name: toolName }];
                        return [...prev.slice(0, -1), { ...last, toolCalls }];
                    }
                    return prev;
                });
                break;
            }

            case "ai:tool_result": {
                const toolCallId = data.toolCallId as string;
                const result = data.result as string;

                setMessages(prev => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant" && last.toolCalls) {
                        const toolCalls = last.toolCalls.map(tc =>
                            tc.id === toolCallId ? { ...tc, result } : tc,
                        );
                        return [...prev.slice(0, -1), { ...last, toolCalls }];
                    }
                    return prev;
                });
                break;
            }

            case "ai:complete": {
                const fullText = data.fullText as string;
                const newThreadId = data.threadId as string;

                // Flush any remaining tokens
                if (pendingTextRef.current) {
                    flushTokens();
                }

                // Check if the complete message contains a HITL interrupt
                let proposedAction: unknown = undefined;
                try {
                    const parsed = JSON.parse(fullText);
                    if (parsed?.type === "interrupt" && parsed.proposedAction) {
                        proposedAction = parsed.proposedAction;
                    }
                } catch {
                    // Not JSON — normal text completion
                }

                // Finalize the last assistant message
                setMessages(prev => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant" && last.isStreaming) {
                        const finalContent = proposedAction ? (last.content || fullText) : last.content;
                        return [
                            ...prev.slice(0, -1),
                            { ...last, content: finalContent, isStreaming: false, proposedAction },
                        ];
                    }
                    return prev;
                });

                threadIdRef.current = newThreadId;
                setThreadId(newThreadId);
                setIsTyping(false);
                break;
            }

            case "ai:error": {
                const error = data.error as string;
                const errorCode = data.code as string | undefined;
                const retryable = data.retryable as boolean | undefined;

                // Flush remaining tokens
                if (pendingTextRef.current) {
                    flushTokens();
                }

                setMessages(prev => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant" && last.isStreaming) {
                        return [
                            ...prev.slice(0, -1),
                            { ...last, content: last.content + `\n\n[Error: ${error}]`, isStreaming: false, errorCode, retryable },
                        ];
                    }
                    // Add error as new message
                    return [
                        ...prev,
                        { id: `err_${Date.now()}`, role: "assistant", content: `[Error: ${error}]`, errorCode, retryable },
                    ];
                });

                setIsTyping(false);
                break;
            }
        }
    }, [flushTokens, scheduleFlush]);

    // ── WebSocket connect/disconnect ────────────────────────────────

    const connect = useCallback(() => {
        if (!serverInfo || wsRef.current?.readyState === WebSocket.OPEN) return;

        const protocol = serverInfo.secure ? "wss" : "ws";
        const path = serverInfo.path ?? "";
        const url = `${protocol}://${serverInfo.host}:${serverInfo.port}${path}`;

        const ws = new WebSocket(url);
        let authenticated = false;

        ws.addEventListener("open", () => {
            // Send authentication message immediately
            const token = localStorage.getItem("authToken");
            if (token) {
                ws.send(JSON.stringify({ type: "authenticate", token }));
            } else {
                console.error('No auth token available for AI WebSocket authentication');
                ws.close();
            }
        });

        ws.addEventListener("close", () => {
            setIsConnected(false);
            setIsTyping(false);
            wsRef.current = null;
        });

        ws.addEventListener("error", () => {
            // error event is always followed by close
        });

        ws.addEventListener("message", (event) => {
            try {
                const data = JSON.parse(event.data as string);
                // Handle auth result before other messages
                if (!authenticated && data.type === "authResult") {
                    if (data.success) {
                        authenticated = true;
                        setIsConnected(true);
                    } else {
                        console.error('AI WebSocket authentication failed:', data.error);
                        ws.close();
                    }
                    return;
                }
                handleMessage(data);
            } catch {
                // Ignore non-JSON messages
            }
        });

        wsRef.current = ws;
    }, [serverInfo, handleMessage]);

    const disconnect = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
    }, []);

    // ── Auto-connect effect ─────────────────────────────────────────

    useEffect(() => {
        if (autoConnect && serverInfo) {
            connect();
        }

        return () => {
            if (flushTimerRef.current !== null) {
                clearTimeout(flushTimerRef.current);
                flushTimerRef.current = null;
            }
            disconnect();
        };
    }, [autoConnect, serverInfo, connect, disconnect]);

    // ── Send message ────────────────────────────────────────────────

    const sendMessage = useCallback((text: string) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const userMsgId = `user_${Date.now()}`;
        const assistantMsgId = `asst_${Date.now()}`;

        // Add user message + empty streaming assistant message
        setMessages(prev => [
            ...prev,
            { id: userMsgId, role: "user", content: text },
            { id: assistantMsgId, role: "assistant", content: "", isStreaming: true },
        ]);

        setIsTyping(true);
        pendingTextRef.current = "";

        const _id = ++requestIdRef.current;
        ws.send(JSON.stringify({
            type: "ai:chat",
            _id,
            graphKey,
            message: text,
            threadId: threadIdRef.current ?? undefined,
        }));
    }, [graphKey]);

    // ── Resume (HITL approve/reject) ────────────────────────────────

    const resume = useCallback((resumeThreadId: string, approved: boolean, feedback?: string) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        // Add a new streaming assistant message for the continuation
        setMessages(prev => [
            ...prev,
            { id: `asst_${Date.now()}`, role: "assistant", content: "", isStreaming: true },
        ]);

        setIsTyping(true);
        pendingTextRef.current = "";

        const _id = ++requestIdRef.current;
        ws.send(JSON.stringify({
            type: "ai:resume",
            _id,
            threadId: resumeThreadId,
            approved,
            feedback,
        }));
    }, []);

    // ── Stop generation ─────────────────────────────────────────────

    const stopGeneration = useCallback(() => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        ws.send(JSON.stringify({
            type: "ai:interrupt",
            _id: requestIdRef.current,
            threadId: threadIdRef.current ?? "",
        }));

        // Flush remaining tokens and stop streaming
        if (pendingTextRef.current) {
            flushTokens();
        }

        setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.isStreaming) {
                return [...prev.slice(0, -1), { ...last, isStreaming: false }];
            }
            return prev;
        });

        setIsTyping(false);
    }, [flushTokens]);

    // ── Return ──────────────────────────────────────────────────────

    return {
        messages,
        isConnected,
        isTyping,
        sendMessage,
        resume,
        stopGeneration,
        connect,
        disconnect,
        threadId,
    };
}
