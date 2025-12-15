/**
 * @file SelectTransparent.tsx
 * @description Transparent inline select dropdown that blends into content
 * @module component/form
 *
 * A minimalist select dropdown designed to appear as plain text until user interaction.
 * Mirrors the behavior of InputTransparent but for dropdown selections.
 *
 * Behavior:
 * - **Default State**: Appears as regular text, no visible select styling
 * - **Hover State**: Subtle background and border appear to indicate interactivity
 * - **Focus State**: Full select mode with visible styling
 * - **Browser Arrow Removed**: Uses appearance: none for cross-browser consistency
 *
 * Features:
 * - Controlled component (value/setValue props)
 * - Options array with optional disabled items
 * - Placeholder support
 * - Inherits font styling from parent
 * - Theme-aware background for dropdown menu
 *
 * Common Use Cases:
 * - Inline category selection
 * - Status dropdowns in tables
 * - Seamless form fields
 * - Dashboard select controls
 */

import React, { useState, memo } from 'react';
import {useDynamicClass} from "../../hooks/useDynamicClass";

interface SelectTransparentProps {
    value: string;
    setValue: (value: string) => void;
    options: { value: string; label: string, disabled?: boolean }[];
    style?: React.CSSProperties;
    placeholder?: string;
}

export const SelectTransparent = memo(({
                                           value,
                                           setValue,
                                           options,
                                           style = {},
                                           placeholder = 'Select...'
                                       }: SelectTransparentProps) => {


    // Handle select change
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setValue(e.target.value);
    };



    const selectClass = useDynamicClass(`
        & {
            border: none;
            outline: none;
            padding: 4px 24px 4px 8px; /* Extra right padding for arrow */
            border-radius: 4px;
            transition: all 0.2s ease;
            cursor: pointer;
            width: 100%;
            font-size: inherit;
            font-family: inherit;
            color: inherit;
            
            /* Remove default arrows across browsers */
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
            
            background: transparent;
            border-bottom: 1px solid transparent;
        }
        
        &:hover {
            background: rgba(255, 255, 255, 0.05);
            border-bottom: 1px solid rgba(150, 150, 150, 0.3);
        }
        
        &:focus {
            background: rgba(255, 255, 255, 0.1);
            border-bottom: 2px solid rgba(100, 100, 255, 0.5);
        }
        
        & option {
            background-color: var(--nodius-background-default);
        }
    `);

    return (
        <select
            value={value}
            onChange={handleChange}
            style={style}
            className={selectClass}
        >
            {placeholder && (
                <option value="" disabled>
                    {placeholder}
                </option>
            )}
            {options.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                </option>
            ))}
        </select>
    );
});

// Display name for debugging
SelectTransparent.displayName = 'SelectTransparent';