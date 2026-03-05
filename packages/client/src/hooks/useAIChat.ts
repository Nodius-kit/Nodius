/**
 * useAIChat — React hook for consuming AI streaming via a dedicated WebSocket.
 *
 * Uses its own WebSocket connection (separate from useWebSocket/sync) because
 * the sync socket routes messages by `_id` to a one-shot resolver, which is
 * incompatible with multi-message streaming (ai:token, ai:complete, etc.).
 *
 * Supports multi-thread: listing threads, switching, creating new, deleting.
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
    /** Accumulated token usage for this message. */
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    /** Set when tool round limit is reached, waiting for user decision. */
    toolLimitInfo?: { roundsUsed: number; maxExtended: number };
    /** Error code from the server (rate_limit, server_error, timeout, etc.). */
    errorCode?: string;
    /** Whether the error is retryable. */
    retryable?: boolean;
}

export type AIContextType = "graph" | "nodeConfig" | "htmlClass" | "home";

export interface AIThreadSummary {
    threadId: string;
    graphKey: string;
    contextType: AIContextType;
    title: string;
    totalTokens: number;
    messageCount: number;
    createdTime: number;
    lastUpdatedTime: number;
}

export interface UseAIChatOptions {
    graphKey: string;
    contextType?: AIContextType;
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
    // ── Multi-thread ────────────────────────
    threads: AIThreadSummary[];
    loadThread: (threadId: string) => void;
    newThread: () => void;
    deleteThread: (threadId: string) => void;
    refreshThreads: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────

const FLUSH_INTERVAL_MS = 32;

// ─── Hook ───────────────────────────────────────────────────────────

export function useAIChat(options: UseAIChatOptions): UseAIChatReturn {
    const { graphKey, contextType = "graph", serverInfo, autoConnect = false } = options;

    // ── State ───────────────────────────────────────────────────────
    const [messages, setMessages] = useState<AIChatMessage[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [threads, setThreads] = useState<AIThreadSummary[]>([]);

    // ── Refs ────────────────────────────────────────────────────────
    const threadIdRef = useRef<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const requestIdRef = useRef(0);
    const pendingTextRef = useRef("");
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const graphKeyRef = useRef(graphKey);
    graphKeyRef.current = graphKey;
    const contextTypeRef = useRef(contextType);
    contextTypeRef.current = contextType;

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

    // ── Refresh threads list ─────────────────────────────────────────

    const refreshThreads = useCallback(() => {
        fetch("/api/ai/threads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ graphKey: graphKeyRef.current, contextType: contextTypeRef.current }),
        })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data?.threads) {
                    setThreads(data.threads.map((t: any) => ({
                        threadId: t.threadId,
                        graphKey: t.graphKey,
                        contextType: t.contextType || "graph",
                        title: t.title || "New conversation",
                        totalTokens: t.totalTokens || 0,
                        messageCount: t.messageCount || 0,
                        createdTime: t.createdTime,
                        lastUpdatedTime: t.lastUpdatedTime,
                    })));
                }
            })
            .catch(() => { /* silent */ });
    }, []);

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
                        // Deduplicate by id — ignore if already present
                        if (last.toolCalls?.some(tc => tc.id === toolCallId)) return prev;
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

            case "ai:tool_limit": {
                const roundsUsed = data.roundsUsed as number;
                const maxExtended = data.maxExtended as number;
                setMessages(prev => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant") {
                        return [...prev.slice(0, -1), { ...last, toolLimitInfo: { roundsUsed, maxExtended } }];
                    }
                    return prev;
                });
                break;
            }

            case "ai:usage": {
                const usage = data.usage as { promptTokens: number; completionTokens: number; totalTokens: number };
                if (usage) {
                    setMessages(prev => {
                        const last = prev[prev.length - 1];
                        if (last?.role === "assistant") {
                            const existing = last.usage;
                            const merged = existing
                                ? {
                                    promptTokens: existing.promptTokens + usage.promptTokens,
                                    completionTokens: existing.completionTokens + usage.completionTokens,
                                    totalTokens: existing.totalTokens + usage.totalTokens,
                                }
                                : usage;
                            return [...prev.slice(0, -1), { ...last, usage: merged }];
                        }
                        return prev;
                    });
                }
                break;
            }

            case "ai:complete": {
                const fullText = data.fullText as string;
                const newThreadId = data.threadId as string;

                // Flush any remaining tokens
                if (pendingTextRef.current) {
                    flushTokens();
                }

                // Check if the complete message contains a HITL interrupt or tool_limit
                let proposedAction: unknown = undefined;
                let isToolLimit = false;
                try {
                    const parsed = JSON.parse(fullText);
                    if (parsed?.type === "interrupt" && parsed.proposedAction) {
                        proposedAction = parsed.proposedAction;
                    } else if (parsed?.type === "tool_limit") {
                        isToolLimit = true;
                    }
                } catch {
                    // Not JSON — normal text completion
                }

                // Finalize the last assistant message
                setMessages(prev => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant" && last.isStreaming) {
                        // For tool_limit, keep existing content and toolLimitInfo — don't overwrite
                        if (isToolLimit) {
                            return [...prev.slice(0, -1), { ...last, isStreaming: false }];
                        }
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

                // Refresh threads list after each completion
                refreshThreads();
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
    }, [flushTokens, scheduleFlush, refreshThreads]);

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
                        // Refresh threads on connect
                        refreshThreads();
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
    }, [serverInfo, handleMessage, refreshThreads]);

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

    // ── Reset on context change ────────────────────────────────────
    useEffect(() => {
        threadIdRef.current = null;
        setThreadId(null);
        setMessages([]);
        setIsTyping(false);
        refreshThreads();
    }, [graphKey, contextType, refreshThreads]);

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
            contextType,
        }));
    }, [graphKey, contextType]);

    // ── Resume (HITL approve/reject) ────────────────────────────────

    const resume = useCallback((resumeThreadId: string, approved: boolean, feedback?: string) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        // Clear toolLimitInfo and resume streaming on the last assistant bubble
        setMessages(prev => {
            const cleaned = prev.map(msg =>
                msg.toolLimitInfo ? { ...msg, toolLimitInfo: undefined } : msg,
            );
            // Find last assistant message and mark it as streaming again
            const lastAssistantIdx = cleaned.findLastIndex(m => m.role === "assistant");
            if (lastAssistantIdx !== -1) {
                const updated = [...cleaned];
                updated[lastAssistantIdx] = {
                    ...updated[lastAssistantIdx],
                    isStreaming: true,
                    // Keep existing content — new tokens will append
                };
                return updated;
            }
            // Fallback: create new bubble if no assistant message found
            return [...cleaned, { id: `asst_${Date.now()}`, role: "assistant", content: "", isStreaming: true }];
        });

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

    // ── Multi-thread: load thread ───────────────────────────────────

    const loadThread = useCallback((targetThreadId: string) => {
        threadIdRef.current = targetThreadId;
        setThreadId(targetThreadId);
        setMessages([]);
        setIsTyping(false);

        // Fetch conversation history from server
        fetch(`/api/ai/thread/${targetThreadId}/messages`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data?.conversationHistory) {
                    const converted: AIChatMessage[] = [];
                    let pendingAssistant: AIChatMessage | null = null;

                    const flushPending = () => {
                        if (pendingAssistant) {
                            converted.push(pendingAssistant);
                            pendingAssistant = null;
                        }
                    };

                    for (const msg of data.conversationHistory) {
                        const m = msg as { role?: string; content?: string; tool_calls?: any[] };

                        if (m.role === "user" && m.content) {
                            flushPending();
                            converted.push({
                                id: `hist_user_${converted.length}`,
                                role: "user",
                                content: m.content,
                            });
                        } else if (m.role === "assistant") {
                            const toolCalls = m.tool_calls?.map((tc: any) => ({
                                id: tc.id,
                                name: tc.function?.name ?? tc.name ?? "unknown",
                                result: "done",
                            }));
                            const hasContent = !!(m.content && m.content.trim());
                            const hasToolCalls = !!(toolCalls && toolCalls.length > 0);

                            if (!hasContent && hasToolCalls) {
                                // Tool-only message — merge into pending
                                if (!pendingAssistant) {
                                    pendingAssistant = {
                                        id: `hist_asst_${converted.length}`,
                                        role: "assistant",
                                        content: "",
                                        toolCalls: toolCalls,
                                    };
                                } else {
                                    pendingAssistant.toolCalls = [
                                        ...(pendingAssistant.toolCalls ?? []),
                                        ...toolCalls,
                                    ];
                                }
                            } else if (hasContent) {
                                // Content message — merge with pending and flush
                                if (pendingAssistant) {
                                    pendingAssistant.content = m.content!;
                                    if (hasToolCalls) {
                                        pendingAssistant.toolCalls = [
                                            ...(pendingAssistant.toolCalls ?? []),
                                            ...toolCalls!,
                                        ];
                                    }
                                    flushPending();
                                } else {
                                    converted.push({
                                        id: `hist_asst_${converted.length}`,
                                        role: "assistant",
                                        content: m.content!,
                                        toolCalls: hasToolCalls ? toolCalls : undefined,
                                    });
                                }
                            }
                        }
                    }
                    flushPending();
                    setMessages(converted);
                }
            })
            .catch(() => { /* silent */ });
    }, []);

    // ── Multi-thread: new thread ────────────────────────────────────

    const newThread = useCallback(() => {
        threadIdRef.current = null;
        setThreadId(null);
        setMessages([]);
        setIsTyping(false);
    }, []);

    // ── Multi-thread: delete thread ─────────────────────────────────

    const deleteThread = useCallback((targetThreadId: string) => {
        fetch(`/api/ai/thread/${targetThreadId}`, { method: "DELETE" })
            .then(res => {
                if (res.ok) {
                    // If we deleted the active thread, reset
                    if (threadIdRef.current === targetThreadId) {
                        threadIdRef.current = null;
                        setThreadId(null);
                        setMessages([]);
                        setIsTyping(false);
                    }
                    refreshThreads();
                }
            })
            .catch(() => { /* silent */ });
    }, [refreshThreads]);

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
        threads,
        loadThread,
        newThread,
        deleteThread,
        refreshThreads,
    };
}
