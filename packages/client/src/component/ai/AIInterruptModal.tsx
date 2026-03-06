/**
 * @file AIInterruptModal.tsx
 * @description Modal for approving or rejecting AI proposed actions (HITL)
 * @module component/ai
 *
 * Shows the proposed action details and provides Approve/Reject buttons
 * with an optional feedback text field.
 */

import { memo, useState, useContext, useCallback } from "react";
import { Check, X, AlertTriangle, Loader } from "lucide-react";
import { useDynamicClass } from "../../hooks/useDynamicClass";
import { UserContext } from "../../hooks/contexts/UserContext";

interface AIInterruptModalProps {
    /** The proposed action from the AI agent. */
    proposedAction: Record<string, unknown>;
    /** Thread ID to resume. */
    threadId: string;
    /** Called when the user approves or rejects the action. */
    onResume: (threadId: string, approved: boolean, feedback?: string) => void;
    /** Called to dismiss the modal without action. */
    onDismiss?: () => void;
}

export const AIInterruptModal = memo(({
    proposedAction,
    threadId,
    onResume,
    onDismiss,
}: AIInterruptModalProps) => {
    const { user } = useContext(UserContext);
    const [feedback, setFeedback] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    const actionType = (proposedAction.type as string) ?? "unknown";
    const actionPayload = proposedAction.payload as Record<string, unknown> | undefined;

    const handleApprove = useCallback(async () => {
        // For create_graph actions, call the API first
        if (actionType === "create_graph" && actionPayload) {
            setIsCreating(true);
            try {
                const payload = actionPayload as { name: string; type: string; description?: string };
                const workspace = user?.workspaces?.[0] || user?.userId || "";
                let body: Record<string, unknown>;

                if (payload.type === "htmlClass") {
                    body = {
                        htmlClass: {
                            name: payload.name,
                            description: payload.description || "",
                            category: "default",
                            workspace,
                            permission: 0,
                            object: {},
                        },
                    };
                } else {
                    body = {
                        graph: {
                            name: payload.name,
                            workspace,
                        },
                    };
                }

                const res = await fetch("/api/graph/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({ error: "Creation failed" }));
                    setIsCreating(false);
                    onResume(threadId, false, `Creation failed: ${err.error || res.statusText}`);
                    return;
                }

                const created = await res.json();
                const createdKey = created._key as string;
                const createdType = payload.type === "htmlClass" ? "html" : "graph";
                onResume(threadId, true, `created:${createdType}:${createdKey}`);
            } catch (err) {
                setIsCreating(false);
                onResume(threadId, false, `Creation error: ${err}`);
            }
            return;
        }

        onResume(threadId, true, feedback || undefined);
    }, [threadId, feedback, onResume, actionType, actionPayload, user]);

    const handleReject = useCallback(() => {
        onResume(threadId, false, feedback || undefined);
    }, [threadId, feedback, onResume]);

    const overlayClass = useDynamicClass(`
        & {
            position: fixed;
            inset: 0;
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.4);
        }
    `);

    const modalClass = useDynamicClass(`
        & {
            background: var(--nodius-background-paper);
            border-radius: 12px;
            box-shadow: var(--nodius-shadow-4);
            max-width: 480px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
        }
    `);

    const headerClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 16px 20px;
            border-bottom: 1px solid var(--nodius-grey-300);
        }
    `);

    const bodyClass = useDynamicClass(`
        & {
            padding: 16px 20px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
    `);

    const codeBlockClass = useDynamicClass(`
        & {
            background: var(--nodius-grey-100);
            border-radius: 8px;
            padding: 12px;
            font-family: monospace;
            font-size: 12px;
            color: var(--nodius-text-primary);
            overflow-x: auto;
            max-height: 200px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-word;
        }
    `);

    const feedbackInputClass = useDynamicClass(`
        & {
            width: 100%;
            border: 1px solid var(--nodius-grey-400);
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 13px;
            font-family: inherit;
            color: var(--nodius-text-primary);
            background: var(--nodius-background-default);
            outline: none;
            transition: border-color 0.2s;
        }
        &:focus {
            border-color: var(--nodius-primary-main);
        }
        &::placeholder {
            color: var(--nodius-text-secondary);
        }
    `);

    const footerClass = useDynamicClass(`
        & {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 12px 20px;
            border-top: 1px solid var(--nodius-grey-300);
        }
    `);

    const btnBase = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            border: none;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s, transform 0.1s;
        }
        &:active {
            transform: scale(0.97);
        }
    `);

    const approveClass = useDynamicClass(`
        & {
            background: var(--nodius-success-main);
            color: white;
        }
        &:hover {
            background: var(--nodius-green-700);
        }
    `);

    const rejectClass = useDynamicClass(`
        & {
            background: var(--nodius-error-main);
            color: white;
        }
        &:hover {
            background: var(--nodius-red-700);
        }
    `);

    return (
        <div className={overlayClass} onClick={onDismiss}>
            <div className={modalClass} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={headerClass}>
                    <AlertTriangle size={20} color="var(--nodius-warning-main)" />
                    <span style={{ fontWeight: 600, fontSize: 15 }}>
                        Action proposed: {actionType.replace(/_/g, " ")}
                    </span>
                </div>

                {/* Body */}
                <div className={bodyClass}>
                    <div style={{ fontSize: 13, color: "var(--nodius-text-secondary)" }}>
                        The AI wants to perform the following action. Please review and approve or reject.
                    </div>

                    <div className={codeBlockClass}>
                        {JSON.stringify(actionPayload ?? proposedAction, null, 2)}
                    </div>

                    <input
                        className={feedbackInputClass}
                        value={feedback}
                        onChange={e => setFeedback(e.target.value)}
                        placeholder="Optional feedback..."
                    />
                </div>

                {/* Footer */}
                <div className={footerClass}>
                    <button className={`${btnBase} ${rejectClass}`} onClick={handleReject} disabled={isCreating}>
                        <X size={14} />
                        Reject
                    </button>
                    <button className={`${btnBase} ${approveClass}`} onClick={handleApprove} disabled={isCreating}>
                        {isCreating ? <Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={14} />}
                        {isCreating ? "Creating..." : "Approve"}
                    </button>
                </div>
            </div>
        </div>
    );
});
AIInterruptModal.displayName = "AIInterruptModal";
