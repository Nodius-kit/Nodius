import React, { useState, memo, useRef, useEffect } from 'react';
import {useDynamicClass} from "../../hooks/useDynamicClass";

interface InputTransparentProps {
    type?: React.HTMLInputTypeAttribute;
    value: string;
    setValue: (value: string) => void;
    style?: React.CSSProperties;
    placeholder?: string;
    minLength?: number;
    valid?: boolean;
}

/**
 * A transparent input component that becomes visible on hover and editable on click
 * Appears as plain text by default, making it seamless with the surrounding content
 * Validates minimum length and custom validation on blur, restoring last valid value if validation fails
 */
export const InputTransparent = memo(({
                                          type = 'text',
                                          value,
                                          setValue,
                                          style = {},
                                          placeholder = '',
                                          minLength,
                                          valid = true
                                      }: InputTransparentProps) => {
    const [isFocused, setIsFocused] = useState(false);

    // Store the last valid value
    const lastValidValue = useRef(value);

    // Update last valid value when the prop value changes and meets all validation criteria
    useEffect(() => {
        const meetsMinLength = minLength === undefined || value.length >= minLength;
        if (meetsMinLength && valid) {
            lastValidValue.current = value;
        }
    }, [value, minLength, valid]);

    // Handle input change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setValue(e.target.value);
    };

    // Handle focus state
    const handleFocus = () => {
        setIsFocused(true);
    };

    // Handle blur state - validate minimum length and custom validation
    const handleBlur = () => {
        setIsFocused(false);

        // Check if current value fails minimum length validation
        const failsMinLength = minLength !== undefined && value.length < minLength;

        // If validation fails (either minLength or custom valid prop), restore last valid value
        if (failsMinLength || !valid) {
            setValue(lastValidValue.current);
        } else {
            // Update last valid value if all validations pass
            lastValidValue.current = value;
        }
    };

    const inputClass = useDynamicClass(`
        & {
            border: none;
            outline: none;
            background: transparent;
            padding: 4px 8px;
            border-radius: 4px;
            transition: all 0.2s ease;
            cursor: pointer;
            width: 100%;
            font-size: inherit;
            font-family: inherit;
            color: inherit;
            border-bottom: 1px solid transparent;
        }
        
        &:hover {
            background: rgba(255, 255, 255, 0.05);
            border-bottom: 1px solid rgba(150, 150, 150, 0.3);
        }
        
        &:focus {
            background: rgba(255, 255, 255, 0.1);
            cursor: text; /* switch pointer to text editing mode */
            border-bottom: 2px solid rgba(100, 100, 255, 0.5);
        }
        
        &::placeholder {
            font-style: italic;
        }
    `);


    return (
        <input
            type={type}
            value={value}
            className={inputClass}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            style={style}
        />
    );
});

// Display name for debugging
InputTransparent.displayName = 'InputTransparent';