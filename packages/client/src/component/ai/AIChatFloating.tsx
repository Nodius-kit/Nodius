/**
 * @file AIChatFloating.tsx
 * @description Floating AI chat button + overlay panel
 * @module component/ai
 *
 * Renders a floating action button (bottom-right corner) that toggles
 * an overlay chat panel. Manages the AI WebSocket connection lifecycle
 * via useAIChat hook internally.
 *
 * Used in both HomeWorkflow (selection menu) and SchemaEditor (editing view).
 */

import { memo, useState, useCallback, useContext, useMemo } from "react";
import { Bot, X } from "lucide-react";
import { useDynamicClass } from "../../hooks/useDynamicClass";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { ProjectContext } from "../../hooks/contexts/ProjectContext";
import { useStableProjectRef } from "../../hooks/useStableProjectRef";
import { useAIChat, type AIContextType, type AIApplyAction } from "../../hooks/useAIChat";
import { AIChatPanel } from "./AIChatPanel";
import { Fade } from "../animate/Fade";
import type { GraphInstructions, Node, Edge } from "@nodius/utils";

export const AIChatFloating = memo(() => {
    const Project = useContext(ProjectContext);
    const projectRef = useStableProjectRef();
    const [open, setOpen] = useState(false);

    // Derive contextType and contextKey from current editing state
    const { contextType, contextKey } = useMemo((): { contextType: AIContextType; contextKey: string } => {
        const graph = Project.state.graph;
        if (!graph) return { contextType: "home", contextKey: "home" };
        if (Project.state.editedNodeConfig) return { contextType: "nodeConfig", contextKey: Project.state.editedNodeConfig };
        if (Project.state.editedHtml) return { contextType: "htmlClass", contextKey: graph._key };
        return { contextType: "graph", contextKey: graph._key };
    }, [Project.state.graph, Project.state.editedNodeConfig, Project.state.editedHtml]);

    // Apply AI-approved mutations via the standard sync pipeline
    const handleApplyAction = useCallback(async (action: AIApplyAction) => {
        const state = projectRef.current.state;

        // 1. Apply graph instructions (move, update)
        if (action.instructions.length > 0) {
            await state.updateGraph?.(action.instructions as GraphInstructions[]);
        }

        // 2. Create new nodes/edges
        if (action.nodesToCreate.length > 0 || action.edgesToCreate.length > 0) {
            await state.batchCreateElements?.(
                action.nodesToCreate as Node<unknown>[],
                action.edgesToCreate as Edge[],
                action.sheetId,
            );
        }

        // 3. Delete nodes/edges
        if (action.nodeKeysToDelete.length > 0 || action.edgeKeysToDelete.length > 0) {
            await state.batchDeleteElements?.(
                action.nodeKeysToDelete,
                action.edgeKeysToDelete,
                action.sheetId,
            );
        }
    }, []);

    const {
        messages,
        isConnected,
        isTyping,
        threadId,
        sendMessage,
        resume,
        stopGeneration,
        connect,
        disconnect,
        threads,
        loadThread,
        newThread,
        deleteThread,
        refreshThreads,
    } = useAIChat({
        graphKey: contextKey,
        contextType,
        serverInfo: Project.state.serverInfo ?? null,
        autoConnect: false,
        onApplyAction: handleApplyAction,
    });

    const handleToggle = useCallback(() => {
        setOpen(prev => {
            const next = !prev;
            if (next && !isConnected) {
                connect();
            }
            return next;
        });
    }, [isConnected, connect]);

    const { width, height, isResizing, resetSize, startResize } = useResizablePanel({
        storageKey: "nodius-ai-panel-size",
        defaultWidth: 400,
        defaultHeight: 520,
        minWidth: 320,
        minHeight: 400,
    });

    // ── Styles ──────────────────────────────────────────────────────

    const fabClass = useDynamicClass(`
        & {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: var(--nodius-primary-main);
            color: white;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            transition: transform 0.2s, background-color 0.2s;
            z-index: 10000010;
        }
        &:hover {
            transform: scale(1.08);
            background: var(--nodius-primary-dark);
        }
        &:active {
            transform: scale(0.95);
        }
    `);

    const panelOverlayClass = useDynamicClass(`
        & {
            position: fixed;
            bottom: 84px;
            right: 24px;
            border-radius: 12px;
            overflow: visible;
            box-shadow: 0 8px 32px rgba(0,0,0,0.25);
            z-index: 10000010;
            display: flex;
            flex-direction: column;
        }
    `);

    const panelInnerClass = useDynamicClass(`
        & {
            width: 100%;
            height: 100%;
            border-radius: 12px;
            overflow: hidden;
        }
    `);

    return (
        <>
            {/* Floating Action Button */}
            <button className={fabClass} onClick={handleToggle} title="AI Assistant">
                {open ? <X size={22} /> : <Bot size={22} />}
            </button>

            {/* Chat Panel Overlay */}
            <Fade in={open} timeout={200} unmountOnExit={true}>
                <div className={panelOverlayClass} style={{ width, height }}>
                    {/* Resize handles */}
                    <div
                        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, cursor: "n-resize", zIndex: 2 }}
                        onMouseDown={(e) => startResize("top", e)}
                    />
                    <div
                        style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 6, cursor: "w-resize", zIndex: 2 }}
                        onMouseDown={(e) => startResize("left", e)}
                    />
                    <div
                        style={{ position: "absolute", top: 0, left: 0, width: 12, height: 12, cursor: "nw-resize", zIndex: 3 }}
                        onMouseDown={(e) => startResize("topLeft", e)}
                    />
                    <div className={panelInnerClass}>
                        <AIChatPanel
                            messages={messages}
                            isTyping={isTyping}
                            isConnected={isConnected}
                            threadId={threadId}
                            contextType={contextType}
                            onSend={sendMessage}
                            onStop={stopGeneration}
                            onResume={resume}
                            onClose={() => setOpen(false)}
                            onResetSize={resetSize}
                            threads={threads}
                            onLoadThread={loadThread}
                            onNewThread={newThread}
                            onDeleteThread={deleteThread}
                            onRefreshThreads={refreshThreads}
                        />
                    </div>
                </div>
            </Fade>
        </>
    );
});
AIChatFloating.displayName = "AIChatFloating";
