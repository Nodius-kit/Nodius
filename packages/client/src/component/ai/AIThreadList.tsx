/**
 * @file AIThreadList.tsx
 * @description Scrollable list of AI conversation threads with select/delete.
 * @module component/ai
 */

import { memo, useCallback } from "react";
import { MessageSquare, Plus, Trash2, Clock, FileCode, Code, Home } from "lucide-react";
import { useDynamicClass } from "../../hooks/useDynamicClass";
import type { AIThreadSummary } from "../../hooks/useAIChat";

// ─── Helpers ────────────────────────────────────────────────────────

function timeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
}

function contextBadge(type?: string): { icon: typeof Home; label: string } | null {
    switch (type) {
        case "nodeConfig": return { icon: FileCode, label: "Config" };
        case "htmlClass": return { icon: Code, label: "HTML" };
        case "home": return { icon: Home, label: "Home" };
        default: return null; // "graph" — no badge needed
    }
}

// ─── Props ──────────────────────────────────────────────────────────

interface AIThreadListProps {
    threads: AIThreadSummary[];
    activeThreadId: string | null;
    onSelect: (threadId: string) => void;
    onDelete: (threadId: string) => void;
    onNewThread: () => void;
}

// ─── Component ──────────────────────────────────────────────────────

export const AIThreadList = memo(({
    threads,
    activeThreadId,
    onSelect,
    onDelete,
    onNewThread,
}: AIThreadListProps) => {

    const containerClass = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
        }
    `);

    const newBtnClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            padding: 10px 16px;
            border: none;
            border-bottom: 1px solid var(--nodius-grey-300);
            background: var(--nodius-background-paper);
            color: var(--nodius-primary-main);
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            font-family: inherit;
            flex-shrink: 0;
        }
        &:hover {
            background: var(--nodius-grey-100);
        }
    `);

    const listClass = useDynamicClass(`
        & {
            flex: 1;
            overflow-y: auto;
            padding: 4px 0;
        }
    `);

    const itemClass = useDynamicClass(`
        & {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 10px 16px;
            cursor: pointer;
            border-bottom: 1px solid var(--nodius-grey-100);
            transition: background-color 0.1s;
        }
        &:hover {
            background: var(--nodius-grey-100);
        }
    `);

    const itemActiveClass = useDynamicClass(`
        & {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 10px 16px;
            cursor: pointer;
            border-bottom: 1px solid var(--nodius-grey-100);
            background: var(--nodius-primary-light);
        }
        &:hover {
            background: var(--nodius-primary-light);
        }
    `);

    const titleClass = useDynamicClass(`
        & {
            font-size: 13px;
            font-weight: 500;
            color: var(--nodius-text-primary);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 260px;
        }
    `);

    const metaClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            color: var(--nodius-text-secondary);
            margin-top: 2px;
        }
    `);

    const deleteBtnClass = useDynamicClass(`
        & {
            margin-left: auto;
            flex-shrink: 0;
            border: none;
            background: transparent;
            color: var(--nodius-text-secondary);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        &:hover {
            color: var(--nodius-error-main);
            background: var(--nodius-grey-200);
        }
    `);

    const emptyClass = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            color: var(--nodius-text-secondary);
            font-size: 13px;
            text-align: center;
            gap: 8px;
        }
    `);

    const handleDelete = useCallback((e: React.MouseEvent, threadId: string) => {
        e.stopPropagation();
        onDelete(threadId);
    }, [onDelete]);

    return (
        <div className={containerClass}>
            <button className={newBtnClass} onClick={onNewThread}>
                <Plus size={16} />
                New conversation
            </button>

            <div className={listClass}>
                {threads.length === 0 ? (
                    <div className={emptyClass}>
                        <MessageSquare size={24} color="var(--nodius-grey-400)" />
                        <div>No conversations yet</div>
                    </div>
                ) : (
                    threads.map(thread => {
                        const badge = contextBadge(thread.contextType);
                        return (
                        <div
                            key={thread.threadId}
                            className={thread.threadId === activeThreadId ? itemActiveClass : itemClass}
                            onClick={() => onSelect(thread.threadId)}
                        >
                            <MessageSquare size={16} style={{ flexShrink: 0, marginTop: 2, color: "var(--nodius-text-secondary)" }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className={titleClass}>{thread.title}</div>
                                <div className={metaClass}>
                                    <Clock size={10} />
                                    <span>{timeAgo(thread.lastUpdatedTime)}</span>
                                    <span>{thread.messageCount} msg{thread.messageCount !== 1 ? "s" : ""}</span>
                                    {thread.totalTokens > 0 && (
                                        <span>{thread.totalTokens.toLocaleString()} tok</span>
                                    )}
                                    {badge && (
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: "var(--nodius-primary-main)", fontWeight: 500 }}>
                                            <badge.icon size={9} />
                                            {badge.label}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button
                                className={deleteBtnClass}
                                onClick={(e) => handleDelete(e, thread.threadId)}
                                title="Delete conversation"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                        );
                    })
                )}
            </div>
        </div>
    );
});
AIThreadList.displayName = "AIThreadList";
