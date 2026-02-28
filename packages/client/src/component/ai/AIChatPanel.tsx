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

import { memo, useEffect, useRef, useContext, useMemo } from "react";
import { Bot, User, Wrench, Loader } from "lucide-react";
import { useDynamicClass } from "../../hooks/useDynamicClass";
import { ThemeContext } from "../../hooks/contexts/ThemeContext";
import type { AIChatMessage } from "../../hooks/useAIChat";
import { AIChatInput } from "./AIChatInput";
import { AIInterruptModal } from "./AIInterruptModal";

interface AIChatPanelProps {
    messages: AIChatMessage[];
    isTyping: boolean;
    isConnected: boolean;
    threadId: string | null;
    onSend: (text: string) => void;
    onStop: () => void;
    onResume: (threadId: string, approved: boolean, feedback?: string) => void;
}

export const AIChatPanel = memo(({
    messages,
    isTyping,
    isConnected,
    threadId,
    onSend,
    onStop,
    onResume,
}: AIChatPanelProps) => {
    const Theme = useContext(ThemeContext);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new messages or typing
    useEffect(() => {
        const el = scrollRef.current;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }, [messages, isTyping]);

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
            white-space: pre-wrap;
            word-break: break-word;
            border: 1px solid var(--nodius-grey-300);
        }
    `);

    const toolBadgeClass = useDynamicClass(`
        & {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 12px;
            background: var(--nodius-grey-200);
            color: var(--nodius-text-secondary);
            font-size: 11px;
            margin-top: 4px;
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

    // ── Render ───────────────────────────────────────────────────────

    return (
        <div className={panelClass}>
            {/* Header */}
            <div className={headerClass}>
                <Bot size={18} color="var(--nodius-primary-main)" />
                <span style={{ fontWeight: 600, fontSize: 14 }}>AI Assistant</span>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                    <div
                        className={statusDotClass}
                        style={{ background: isConnected ? "var(--nodius-success-main)" : "var(--nodius-grey-400)" }}
                    />
                    <span style={{ fontSize: 11, color: "var(--nodius-text-secondary)" }}>
                        {isConnected ? "Connected" : "Disconnected"}
                    </span>
                </div>
            </div>

            {/* Messages */}
            {messages.length === 0 ? (
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
                                    {msg.content || (msg.isStreaming ? "" : "(empty)")}
                                    {msg.isStreaming && <span style={{ opacity: 0.5 }}>|</span>}
                                </div>
                                {msg.toolCalls && msg.toolCalls.length > 0 && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                                        {msg.toolCalls.map(tc => (
                                            <span key={tc.id} className={toolBadgeClass}>
                                                <Wrench size={10} />
                                                {tc.name}
                                            </span>
                                        ))}
                                    </div>
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
