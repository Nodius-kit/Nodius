/**
 * @file AIChatPanel.tsx
 * @description Chat panel displaying AI conversation messages
 * @module component/ai
 *
 * Features:
 * - Scrollable message list with auto-scroll to bottom
 * - Differentiates user vs assistant messages
 * - Shows streaming indicator for in-progress responses
 * - Displays tool call badges
 * - Integrates AIChatInput and AIInterruptModal
 */

import { memo, useState, useEffect, useRef, useContext, useMemo, useCallback } from "react";
import { Bot, User, Wrench, Loader, ChevronDown, ChevronRight, Coins, Check, Plus, List } from "lucide-react";
import { useDynamicClass } from "../../hooks/useDynamicClass";
import { ThemeContext } from "../../hooks/contexts/ThemeContext";
import { ProjectContext } from "../../hooks/contexts/ProjectContext";
import type { AIChatMessage, AIThreadSummary } from "../../hooks/useAIChat";
import { AIChatInput } from "./AIChatInput";
import { AIInterruptModal } from "./AIInterruptModal";
import { AIToolLimitBanner } from "./AIToolLimitBanner";
import { renderMessageContent } from "./renderMessageContent";
import { AIThreadList } from "./AIThreadList";

// ─── Collapsible tool calls section ──────────────────────────────────

const ToolCallsSection = memo(({ toolCalls }: { toolCalls: Array<{ id: string; name: string; result?: string }> }) => {
    const [expanded, setExpanded] = useState(false);

    const containerClass = useDynamicClass(`
        & {
            margin-top: 6px;
            border: 1px solid var(--nodius-grey-300);
            border-radius: 8px;
            overflow: hidden;
            font-size: 12px;
        }
    `);

    const headerBtnClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 6px;
            width: 100%;
            padding: 6px 10px;
            border: none;
            background: var(--nodius-grey-100);
            color: var(--nodius-text-secondary);
            cursor: pointer;
            font-size: 12px;
            font-family: inherit;
        }
        &:hover {
            background: var(--nodius-grey-200);
        }
    `);

    const toolItemClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            border-top: 1px solid var(--nodius-grey-200);
            color: var(--nodius-text-primary);
            font-size: 11px;
        }
    `);

    const resultClass = useDynamicClass(`
        & {
            padding: 4px 10px 6px 28px;
            border-top: 1px solid var(--nodius-grey-100);
            color: var(--nodius-text-secondary);
            font-size: 11px;
            max-height: 80px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
            font-family: monospace;
        }
    `);

    return (
        <div className={containerClass}>
            <button className={headerBtnClass} onClick={() => setExpanded(e => !e)}>
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Wrench size={11} />
                {toolCalls.length} tool call{toolCalls.length > 1 ? "s" : ""}
                {toolCalls.every(tc => tc.result) && <Check size={11} style={{ color: "var(--nodius-success-main)" }} />}
            </button>
            {expanded && toolCalls.map(tc => (
                <div key={tc.id}>
                    <div className={toolItemClass}>
                        <Wrench size={10} />
                        <span style={{ fontWeight: 500 }}>{tc.name}</span>
                        {tc.result
                            ? <Check size={10} style={{ color: "var(--nodius-success-main)" }} />
                            : <Loader size={10} style={{ animation: "spin 1s linear infinite" }} />
                        }
                    </div>
                    {tc.result && expanded && (
                        <div className={resultClass}>
                            {tc.result.length > 300 ? tc.result.slice(0, 300) + "..." : tc.result}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
});
ToolCallsSection.displayName = "ToolCallsSection";

// ─── Token usage badge ──────────────────────────────────────────────

const TokenBadge = memo(({ usage }: { usage: { promptTokens: number; completionTokens: number; totalTokens: number } }) => {
    const badgeClass = useDynamicClass(`
        & {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 12px;
            background: var(--nodius-grey-100);
            color: var(--nodius-text-secondary);
            font-size: 10px;
            margin-top: 4px;
        }
    `);

    return (
        <div className={badgeClass} title={`Prompt: ${usage.promptTokens} | Completion: ${usage.completionTokens}`}>
            <Coins size={10} />
            {usage.totalTokens.toLocaleString()} tokens
        </div>
    );
});
TokenBadge.displayName = "TokenBadge";

// ─── Main panel ─────────────────────────────────────────────────────

interface AIChatPanelProps {
    messages: AIChatMessage[];
    isTyping: boolean;
    isConnected: boolean;
    threadId: string | null;
    onSend: (text: string) => void;
    onStop: () => void;
    onResume: (threadId: string, approved: boolean, feedback?: string) => void;
    // ── Multi-thread props ────────────────
    threads?: AIThreadSummary[];
    onLoadThread?: (threadId: string) => void;
    onNewThread?: () => void;
    onDeleteThread?: (threadId: string) => void;
    onRefreshThreads?: () => void;
}

export const AIChatPanel = memo(({
    messages,
    isTyping,
    isConnected,
    threadId,
    onSend,
    onStop,
    onResume,
    threads = [],
    onLoadThread,
    onNewThread,
    onDeleteThread,
    onRefreshThreads,
}: AIChatPanelProps) => {
    const Theme = useContext(ThemeContext);
    const Project = useContext(ProjectContext);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showThreadList, setShowThreadList] = useState(false);

    // Auto-scroll to bottom on new messages or typing
    useEffect(() => {
        const el = scrollRef.current;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }, [messages, isTyping]);

    // Build display name maps from current scene (resolved client-side)
    const nodeDisplayNames = useMemo(() => {
        const map = new Map<string, string>();
        const motor = Project.state.getMotor();
        const scene = motor?.getScene?.();
        if (!scene?.nodes) return map;
        const configs = Project.state.nodeTypeConfig;
        for (const [key, node] of scene.nodes) {
            const config = configs[node.type];
            const displayName = config?.displayName ?? node.type;
            map.set(key, `${displayName} (${key})`);
        }
        return map;
    }, [Project.state]);

    const sheetDisplayNames = useMemo(() => {
        const map = new Map<string, string>();
        const graph = Project.state.graph;
        if (graph?.sheets) {
            for (const [key, sheet] of Object.entries(graph.sheets)) {
                map.set(key, (sheet as { name?: string })?.name ?? key);
            }
        }
        return map;
    }, [Project.state.graph]);

    // ── Client action handlers ─────────────────────────────────────
    const handleNodeClick = useCallback((nodeKey: string) => {
        const motor = Project.state.getMotor();
        motor?.smoothFitToNode?.(nodeKey, { padding: 150 });
        Project.dispatch({ field: "selectedNode", value: [nodeKey] });
    }, [Project]);

    const handleSelectNodes = useCallback((nodeKeys: string[]) => {
        Project.dispatch({ field: "selectedNode", value: nodeKeys });
    }, [Project]);

    const handleFitArea = useCallback((bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
        const motor = Project.state.getMotor();
        motor?.smoothFitToArea?.(bounds, { padding: 50 });
    }, [Project.state]);

    const handleChangeSheet = useCallback((sheetKey: string) => {
        Project.state.changeSheet?.(sheetKey);
    }, [Project.state]);

    const handleOpenGraph = useCallback((graphKey: string) => {
        // Open graph by key — needs to fetch graph object first
        // For now, navigate via URL params which the app will pick up
        const url = new URL(window.location.href);
        url.searchParams.set("graph", graphKey);
        url.searchParams.delete("sheet");
        url.searchParams.delete("node");
        window.history.pushState({}, "", url.toString());
        window.dispatchEvent(new PopStateEvent("popstate"));
    }, []);

    // Find the last message with a pending proposedAction (for HITL modal)
    const pendingInterrupt = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (msg.role === "assistant" && msg.proposedAction && !msg.isStreaming) {
                return msg;
            }
        }
        return null;
    }, [messages]);

    // ── Styles ──────────────────────────────────────────────────────

    const panelClass = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            height: 100%;
            background: var(--nodius-background-default);
            border-left: 1px solid var(--nodius-grey-300);
        }
    `);

    const headerClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 16px;
            border-bottom: 1px solid var(--nodius-grey-300);
            background: var(--nodius-background-paper);
            flex-shrink: 0;
        }
    `);

    const messagesAreaClass = useDynamicClass(`
        & {
            flex: 1;
            overflow-y: auto;
            padding: 12px 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
    `);

    const userMsgClass = useDynamicClass(`
        & {
            display: flex;
            gap: 8px;
            align-self: flex-end;
            max-width: 85%;
        }
    `);

    const assistantMsgClass = useDynamicClass(`
        & {
            display: flex;
            gap: 8px;
            align-self: flex-start;
            max-width: 85%;
        }
    `);

    const avatarClass = useDynamicClass(`
        & {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
    `);

    const bubbleUserClass = useDynamicClass(`
        & {
            background: var(--nodius-primary-main);
            color: white;
            padding: 8px 12px;
            border-radius: 12px 12px 2px 12px;
            font-size: 13px;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-word;
        }
    `);

    const bubbleAssistantClass = useDynamicClass(`
        & {
            background: var(--nodius-background-paper);
            color: var(--nodius-text-primary);
            padding: 8px 12px;
            border-radius: 12px 12px 12px 2px;
            font-size: 13px;
            line-height: 1.5;
            word-break: break-word;
            border: 1px solid var(--nodius-grey-300);
        }
    `);

    const typingClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 0;
            color: var(--nodius-text-secondary);
            font-size: 12px;
        }
    `);

    const statusDotClass = useDynamicClass(`
        & {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }
    `);

    const emptyClass = useDynamicClass(`
        & {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--nodius-text-secondary);
            font-size: 13px;
            text-align: center;
            padding: 20px;
        }
    `);

    const headerBtnClass = useDynamicClass(`
        & {
            width: 28px;
            height: 28px;
            border: none;
            border-radius: 6px;
            background: transparent;
            color: var(--nodius-text-secondary);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.15s;
        }
        &:hover {
            background: var(--nodius-grey-200);
            color: var(--nodius-text-primary);
        }
    `);

    const headerBtnActiveClass = useDynamicClass(`
        & {
            width: 28px;
            height: 28px;
            border: none;
            border-radius: 6px;
            background: var(--nodius-primary-light);
            color: var(--nodius-primary-main);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.15s;
        }
        &:hover {
            background: var(--nodius-primary-light);
        }
    `);

    const handleSelectThread = useCallback((selectedThreadId: string) => {
        onLoadThread?.(selectedThreadId);
        setShowThreadList(false);
    }, [onLoadThread]);

    const handleNewThread = useCallback(() => {
        onNewThread?.();
        setShowThreadList(false);
    }, [onNewThread]);

    // ── Render ───────────────────────────────────────────────────────

    return (
        <div className={panelClass}>
            {/* Header */}
            <div className={headerClass}>
                <Bot size={18} color="var(--nodius-primary-main)" />
                <span style={{ fontWeight: 600, fontSize: 14 }}>AI Assistant</span>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
                    {onNewThread && (
                        <button className={headerBtnClass} onClick={handleNewThread} title="New conversation">
                            <Plus size={16} />
                        </button>
                    )}
                    {onLoadThread && (
                        <button
                            className={showThreadList ? headerBtnActiveClass : headerBtnClass}
                            onClick={() => setShowThreadList(v => !v)}
                            title="Conversation history"
                        >
                            <List size={16} />
                        </button>
                    )}
                    <div
                        className={statusDotClass}
                        style={{ background: isConnected ? "var(--nodius-success-main)" : "var(--nodius-grey-400)", marginLeft: 4 }}
                    />
                </div>
            </div>

            {/* Thread list overlay */}
            {showThreadList && onLoadThread && onDeleteThread ? (
                <AIThreadList
                    threads={threads}
                    activeThreadId={threadId}
                    onSelect={handleSelectThread}
                    onDelete={onDeleteThread}
                    onNewThread={handleNewThread}
                />
            ) : /* Messages */
            messages.length === 0 ? (
                <div className={emptyClass}>
                    <div>
                        <Bot size={32} color="var(--nodius-grey-400)" style={{ marginBottom: 8 }} />
                        <div>Ask anything about your graph.</div>
                    </div>
                </div>
            ) : (
                <div className={messagesAreaClass} ref={scrollRef}>
                    {messages.map(msg => (
                        <div key={msg.id} className={msg.role === "user" ? userMsgClass : assistantMsgClass}>
                            {msg.role === "assistant" && (
                                <div className={avatarClass} style={{ background: "var(--nodius-grey-200)" }}>
                                    <Bot size={16} color="var(--nodius-primary-main)" />
                                </div>
                            )}
                            <div>
                                <div className={msg.role === "user" ? bubbleUserClass : bubbleAssistantClass}>
                                    {msg.role === "assistant" && msg.content
                                        ? renderMessageContent(msg.content, {
                                            onNodeClick: handleNodeClick,
                                            onSelectNodes: handleSelectNodes,
                                            onFitArea: handleFitArea,
                                            onChangeSheet: handleChangeSheet,
                                            onOpenGraph: handleOpenGraph,
                                            nodeDisplayNames,
                                            sheetDisplayNames,
                                        })
                                        : (msg.content || (msg.isStreaming ? "" : "(empty)"))
                                    }
                                    {msg.isStreaming && <span style={{ opacity: 0.5 }}>|</span>}
                                </div>
                                {msg.toolCalls && msg.toolCalls.length > 0 && (
                                    <ToolCallsSection toolCalls={msg.toolCalls} />
                                )}
                                {msg.toolLimitInfo && threadId && !msg.isStreaming && (
                                    <AIToolLimitBanner
                                        roundsUsed={msg.toolLimitInfo.roundsUsed}
                                        maxExtended={msg.toolLimitInfo.maxExtended}
                                        threadId={threadId}
                                        onResume={onResume}
                                    />
                                )}
                                {msg.usage && !msg.isStreaming && (
                                    <TokenBadge usage={msg.usage} />
                                )}
                            </div>
                            {msg.role === "user" && (
                                <div className={avatarClass} style={{ background: "var(--nodius-primary-light)" }}>
                                    <User size={16} color="white" />
                                </div>
                            )}
                        </div>
                    ))}

                    {isTyping && (
                        <div className={typingClass}>
                            <Loader size={12} style={{ animation: "spin 1s linear infinite" }} />
                            AI is thinking...
                        </div>
                    )}
                </div>
            )}

            {/* Input */}
            <AIChatInput
                onSend={onSend}
                onStop={onStop}
                isTyping={isTyping}
                disabled={!isConnected}
            />

            {/* HITL Interrupt Modal */}
            {pendingInterrupt && threadId && (
                <AIInterruptModal
                    proposedAction={pendingInterrupt.proposedAction as Record<string, unknown>}
                    threadId={threadId}
                    onResume={onResume}
                />
            )}
        </div>
    );
});
AIChatPanel.displayName = "AIChatPanel";
