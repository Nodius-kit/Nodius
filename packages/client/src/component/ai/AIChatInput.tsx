/**
 * @file AIChatInput.tsx
 * @description Text input for sending messages to the AI assistant
 * @module component/ai
 *
 * Features:
 * - Auto-expanding textarea
 * - Enter to send, Shift+Enter for newline
 * - Send button (when idle) / Stop button (when streaming)
 * - Disabled state when disconnected
 */

import { memo, useCallback, useRef, useState, useContext, type KeyboardEvent } from "react";
import { SendHorizontal, Square } from "lucide-react";
import { useDynamicClass } from "../../hooks/useDynamicClass";
import { ThemeContext } from "../../hooks/contexts/ThemeContext";

interface AIChatInputProps {
    onSend: (text: string) => void;
    onStop: () => void;
    isTyping: boolean;
    disabled?: boolean;
    placeholder?: string;
}

export const AIChatInput = memo(({
    onSend,
    onStop,
    isTyping,
    disabled = false,
    placeholder = "Ask the AI assistant...",
}: AIChatInputProps) => {
    const Theme = useContext(ThemeContext);
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = useCallback(() => {
        const trimmed = text.trim();
        if (!trimmed || isTyping) return;
        onSend(trimmed);
        setText("");
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    }, [text, isTyping, onSend]);

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    const handleInput = useCallback(() => {
        const el = textareaRef.current;
        if (el) {
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 150) + "px";
        }
    }, []);

    const containerClass = useDynamicClass(`
        & {
            display: flex;
            align-items: flex-end;
            gap: 8px;
            padding: 8px 12px;
            border-top: 1px solid var(--nodius-grey-300);
            background: var(--nodius-background-default);
        }
    `);

    const textareaClass = useDynamicClass(`
        & {
            flex: 1;
            resize: none;
            border: 1px solid var(--nodius-grey-400);
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 14px;
            font-family: inherit;
            line-height: 1.4;
            color: var(--nodius-text-primary);
            background: var(--nodius-background-paper);
            outline: none;
            min-height: 36px;
            max-height: 150px;
            overflow-y: auto;
            transition: border-color 0.2s;
        }
        &:focus {
            border-color: var(--nodius-primary-main);
        }
        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        &::placeholder {
            color: var(--nodius-text-secondary);
        }
    `);

    const buttonClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: background-color 0.2s, transform 0.1s;
            flex-shrink: 0;
        }
        &:hover:not(:disabled) {
            transform: scale(1.05);
        }
        &:active:not(:disabled) {
            transform: scale(0.95);
        }
        &:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
    `);

    const sendClass = useDynamicClass(`
        & {
            background: var(--nodius-primary-main);
            color: white;
        }
        &:hover:not(:disabled) {
            background: var(--nodius-primary-dark);
        }
    `);

    const stopClass = useDynamicClass(`
        & {
            background: var(--nodius-error-main);
            color: white;
        }
        &:hover:not(:disabled) {
            background: var(--nodius-red-700);
        }
    `);

    return (
        <div className={containerClass}>
            <textarea
                ref={textareaRef}
                className={textareaClass}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                onInput={handleInput}
                placeholder={placeholder}
                disabled={disabled}
                rows={1}
            />
            {isTyping ? (
                <button
                    className={`${buttonClass} ${stopClass}`}
                    onClick={onStop}
                    title="Stop generation"
                >
                    <Square size={16} />
                </button>
            ) : (
                <button
                    className={`${buttonClass} ${sendClass}`}
                    onClick={handleSend}
                    disabled={disabled || !text.trim()}
                    title="Send message"
                >
                    <SendHorizontal size={16} />
                </button>
            )}
        </div>
    );
});
AIChatInput.displayName = "AIChatInput";
