/**
 * @file EditableDiv.tsx
 * @description Contenteditable div with autocomplete and selection preservation
 * @module component
 *
 * Provides an editable div component with advanced features:
 * - EditableDiv: Contenteditable with autocomplete support
 * - Selection preservation: Maintains cursor position during updates
 * - Auto-completion: Suggests completions based on input
 * - Numeric prefix handling: Extracts leading numbers for special logic
 *
 * Key features:
 * - Tab completion with visual preview
 * - Arrow up/down for numeric increment/decrement
 * - Focus state management
 * - Debounced onChange callbacks
 * - Minimal length threshold for completions
 * - Blur on Enter key
 */

import React, {CSSProperties, memo, useEffect, useRef, useState} from 'react';
import { GripVertical } from 'lucide-react';

interface EditableDivProps {
    value: string;
    onChange?: (value: string) => Promise<void>;
    onFocusOut?: () => void;
    style?: CSSProperties;
    completion?: string[];
    minimalLengthBeforeCompletion?: number;
    resizable?: boolean;
    placeholder?: string;
}

export const EditableDiv = memo(({
                                     value,
                                     onChange,
                                     onFocusOut,
                                     style,
                                     completion,
                                     minimalLengthBeforeCompletion = 2,
                                     resizable = false,
                                     placeholder = '',
                                 }: EditableDivProps) => {
    const divRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const completionRef = useRef<HTMLSpanElement>(null);

    const [focused, setFocused] = useState<boolean>(false);
    const [currentCompletion, setCurrentCompletion] = useState<string>('');

    const resizeStartY = useRef<number>(0);
    const resizeStartHeight = useRef<number>(0);
    const [isResizing, setIsResizing] = useState(false);

    // Update internal div content when `value` changes from parent
    useEffect(() => {
        const div = divRef.current;
        if (!div) return;

        // Only update if the content is actually different
        if (div.innerHTML !== value) {
            // Save current selection
            const selection = document.getSelection();
            const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

            div.innerHTML = value;

            // Restore selection
            if (range && selection && focused) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
    }, [value, focused]);

    function extractLeadingNumber(input: string): number | null {
        const match = input.match(/^(\d+(\.\d+)?)/);
        return match ? Number(match[0]) : null;
    }

    // Handle completion logic
    useEffect(() => {
        const div = divRef.current;
        if (!div) return;

        const text = div.innerText.trim();

        if (completion && minimalLengthBeforeCompletion <= text.length && focused) {
            const leadingNumber = extractLeadingNumber(text);

            const completions = leadingNumber
                ? completion.map(pattern =>
                    pattern.includes("*") ? pattern.replace("*", leadingNumber.toString()) : pattern
                )
                : completion.filter((c) => !c.includes("*"));

            const find = completions.find((c) =>
                c.toLowerCase().startsWith(text.toLowerCase()) &&
                c.toLowerCase() !== text.toLowerCase() // Check value diff
            );

            if (find && find.length !== text.length) {
                const rest = find.substring(text.length);
                setCurrentCompletion(rest);
            } else {
                setCurrentCompletion('');
            }
        } else {
            setCurrentCompletion('');
        }
    }, [value, focused, completion, minimalLengthBeforeCompletion]);

    // Handle resizing events
    useEffect(() => {
        if (isResizing) {
            const handleMouseMove = (e: MouseEvent) => {
                const delta = e.clientY - resizeStartY.current;
                const newHeight = Math.max(50, resizeStartHeight.current + delta);
                if (containerRef.current) {
                    containerRef.current.style.height = `${newHeight}px`;
                }
            };

            const handleMouseUp = () => {
                setIsResizing(false);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isResizing]);

    // Handle user input
    const handleInput = async () => {
        if (onChange && divRef.current) {
            await onChange(divRef.current.innerHTML);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        // Accept completion with Tab or Right Arrow at end of text
        if ((e.key === 'Tab' || e.key === 'ArrowRight') && currentCompletion) {
            e.preventDefault();

            const div = divRef.current;
            if (!div) return;

            const newValue = div.innerText + currentCompletion;
            div.innerHTML = newValue;
            setCurrentCompletion('');

            // Move cursor to end
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(div);
            range.collapse(false);
            selection?.removeAllRanges();
            selection?.addRange(range);

            if (onChange) {
                onChange(newValue);
            }
        }
    };

    const _onFocus = () => {
        setFocused(true);
    };

    const _onFocusOut = () => {
        setFocused(false);
        setCurrentCompletion('');
        onFocusOut?.();
    };

    const handleContainerClick = () => {
        divRef.current?.focus();
    };

    const handleResizeStart = (e: React.MouseEvent<SVGSVGElement>) => {
        e.stopPropagation();
        if (containerRef.current) {
            resizeStartY.current = e.clientY;
            resizeStartHeight.current = containerRef.current.clientHeight;
            setIsResizing(true);
        }
    };

    const containerStyle: CSSProperties = {
        ...style,
        position: 'relative',
        display: 'inline-block',
        cursor: 'text',
    };

    if (resizable) {
        containerStyle.overflow = 'auto';
        if (style?.height === '100%') {
            containerStyle.height = '100px'; // Fixed initial height if parent prop was 100%
        }
    }

    const innerStyle: CSSProperties = {
        outline: 'none',
        display: resizable ? 'block' : 'inline',
        height: '100%',
        minWidth: '12px',
    };

    const showPlaceholder = placeholder && !focused && (!value || value.trim() === '');

    return (
        <div
            ref={containerRef}
            onClick={handleContainerClick}
            style={containerStyle}
        >
            <div
                ref={divRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                style={innerStyle}
                onFocus={_onFocus}
                onBlur={_onFocusOut}
            />
            {showPlaceholder && (
                <span
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        color: 'gray',
                        pointerEvents: 'none',
                        userSelect: 'none',
                        whiteSpace: 'pre-wrap',
                        overflow: 'hidden',
                        width: '100%',
                        height: '100%',
                        display: resizable ? 'block' : 'inline',
                    }}
                >
                    {placeholder}
                </span>
            )}
            {currentCompletion && (
                <span
                    ref={completionRef}
                    style={{
                        opacity: 0.4,
                        userSelect: 'none',
                        pointerEvents: 'none',
                        color: 'inherit',
                        position: 'relative'
                    }}
                >
                    {currentCompletion}
                </span>
            )}
            {resizable && (
                <GripVertical
                    size={12}
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        cursor: 'ns-resize',
                        color: 'gray',
                    }}
                    onMouseDown={handleResizeStart}
                />
            )}
        </div>
    );
});

EditableDiv.displayName = "EditableDiv";