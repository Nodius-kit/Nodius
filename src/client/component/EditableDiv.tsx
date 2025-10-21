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

interface EditableDivProps {
    value: string;
    onChange?: (value: string) => Promise<void>;
    style: CSSProperties;
    completion?: string[];
    minimalLengthBeforeCompletion?: number;
}

export const EditableDiv = memo(({
                                     value,
                                     onChange,
                                     style,
                                     completion,
                                     minimalLengthBeforeCompletion = 2,
                                 }: EditableDivProps) => {
    const divRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const completionRef = useRef<HTMLSpanElement>(null);

    const [focused, setFocused] = useState<boolean>(false);
    const [currentCompletion, setCurrentCompletion] = useState<string>('');

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

    const onFocus = () => {
        setFocused(true);
    };

    const onFocusOut = () => {
        setFocused(false);
        setCurrentCompletion('');
    };

    const handleContainerClick = () => {
        divRef.current?.focus();
    };

    return (
        <div
            ref={containerRef}
            onClick={handleContainerClick}
            style={{
                ...style,
                position: 'relative',
                display: 'inline-block',
                cursor: "text",
            }}
        >
            <div
                ref={divRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                style={{
                    outline: 'none',
                    display: 'inline',
                    height:"100%",
                    minWidth:"12px"
                }}
                onFocus={onFocus}
                onBlur={onFocusOut}
            />
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
        </div>
    );
});

EditableDiv.displayName = "EditableDiv";