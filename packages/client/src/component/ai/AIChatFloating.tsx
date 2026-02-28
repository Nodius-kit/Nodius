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

import { memo, useState, useCallback, useContext } from "react";
import { Bot, X } from "lucide-react";
import { useDynamicClass } from "../../hooks/useDynamicClass";
import { ProjectContext } from "../../hooks/contexts/ProjectContext";
import { useAIChat } from "../../hooks/useAIChat";
import { AIChatPanel } from "./AIChatPanel";
import { Fade } from "../animate/Fade";

interface AIChatFloatingProps {

}

export const AIChatFloating = memo(({  }: AIChatFloatingProps) => {
    const Project = useContext(ProjectContext);
    const [open, setOpen] = useState(false);

    const token = typeof localStorage !== "undefined" ? localStorage.getItem("authToken") : null;


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
    } = useAIChat({
        graphKey: Project.state.graph?._key ?? "home",
        serverInfo: Project.state.serverInfo ?? null,
        token,
        autoConnect: false,
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

    const handleClose = useCallback(() => {
        setOpen(false);
    }, []);

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
            width: 400px;
            height: 520px;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0,0,0,0.25);
            z-index: 10000010;
            display: flex;
            flex-direction: column;
        }
    `);

    const closeButtonClass = useDynamicClass(`
        & {
            position: absolute;
            top: 8px;
            right: 8px;
            width: 28px;
            height: 28px;
            border: none;
            border-radius: 50%;
            background: transparent;
            color: var(--nodius-text-secondary);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1;
            transition: background-color 0.15s;
        }
        &:hover {
            background: var(--nodius-grey-200);
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
                <div className={panelOverlayClass}>
                    <button className={closeButtonClass} onClick={handleClose} title="Close">
                        <X size={16} />
                    </button>
                    <AIChatPanel
                        messages={messages}
                        isTyping={isTyping}
                        isConnected={isConnected}
                        threadId={threadId}
                        onSend={sendMessage}
                        onStop={stopGeneration}
                        onResume={resume}
                    />
                </div>
            </Fade>
        </>
    );
});
AIChatFloating.displayName = "AIChatFloating";
