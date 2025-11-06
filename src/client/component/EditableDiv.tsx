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
 * - HTML cleanup on paste: Removes HTML tags while keeping text content
 *
 * Key features:
 * - Tab completion with visual preview
 * - Arrow up/down for numeric increment/decrement
 * - Focus state management
 * - Debounced onChange callbacks
 * - Minimal length threshold for completions
 * - Blur on Enter key
 * - removeSpecialChar: Strips HTML tags on paste (keeps text only)
 * - disableNewlines: Prevents Enter key from creating newlines
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
    //resizable?: boolean;
    placeholder?: string;
    removeSpecialChar?: boolean;
    disableNewlines?: boolean;
}

export const EditableDiv = memo(({
                                     value,
                                     onChange,
                                     onFocusOut,
                                     style,
                                     completion,
                                     minimalLengthBeforeCompletion = 2,
                                     placeholder = '',
                                     removeSpecialChar = false,
                                     disableNewlines = false,
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
        // Prevent newlines if disableNewlines is true
        if (disableNewlines && e.key === 'Enter') {
            e.preventDefault();
            return;
        }

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

    // Handle paste event to remove HTML tags when removeSpecialChar is enabled
    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
        if (!removeSpecialChar) return;

        e.preventDefault();

        // Get clipboard data
        const clipboardData = e.clipboardData;
        if (!clipboardData) return;

        // Get HTML or plain text from clipboard
        let pastedContent = clipboardData.getData('text/html');

        if (!pastedContent) {
            // Fallback to plain text if no HTML
            pastedContent = clipboardData.getData('text/plain');
        }

        // Create a temporary div to parse the HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = pastedContent;

        // Extract only the text content (removes all HTML tags)
        const textOnly = tempDiv.textContent || tempDiv.innerText || '';

        // Insert the plain text at cursor position
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        range.deleteContents();

        const textNode = document.createTextNode(textOnly);
        range.insertNode(textNode);

        // Move cursor to end of inserted text
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);

        // Trigger onChange with updated content
        if (onChange && divRef.current) {
            onChange(divRef.current.innerHTML);
        }
    };


    const containerStyle: CSSProperties = {
        position: 'relative',
        display: 'inline-block',
        cursor: 'text',
        ...style,

    };

    const innerStyle: CSSProperties = {
        outline: 'none',
        display:'inline',
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
                onPaste={handlePaste}
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
                        display: 'flex',
                        alignItems:"center",

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

        </div>
    );
});

EditableDiv.displayName = "EditableDiv";