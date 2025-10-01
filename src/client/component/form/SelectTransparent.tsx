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