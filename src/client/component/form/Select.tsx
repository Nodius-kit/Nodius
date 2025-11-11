/**
 * @file Select.tsx
 * @description Fully-featured dropdown select component with validation and theming (MUI Material compatible)
 * @module component/form
 *
 * A comprehensive select (dropdown) component matching MUI Material's API and the Input component's styling:
 * - **Options Array**: Takes array of {value, label, disabled} objects
 * - **Visual States**: focus, error, success, disabled with color-coded borders
 * - **Icons**: Start and end icon support (end icon replaces default arrow)
 * - **Labels**: Optional labels with required indicator
 * - **Validation**: Error messages with red highlighting, helper text support
 * - **Theming**: Full dark/light theme support with dynamic CSS classes
 * - **Accessibility**: Proper HTML attributes, ARIA support, ref forwarding
 * - **Variants**: outlined (default), filled, standard
 * - **Sizes**: small, medium (default), large
 * - **Layout**: fullWidth option for responsive design
 * - **Multiple Selection**: Support for multi-select with array values
 *
 * Features:
 * - Controlled component with internal state synchronization
 * - Dynamic border colors based on state (focus, error, success)
 * - Custom dropdown arrow (CSS pseudo-element) that respects theme
 * - Placeholder option support with displayEmpty control
 * - Disabled state with visual feedback
 * - Individual options can be disabled
 * - Multiple selection mode with visual feedback for selected options
 * - Helper text for additional context (displays when no error)
 *
 * The component uses useDynamicClass for theme-aware styling that updates
 * automatically when the theme changes.
 */

import {CSSProperties, JSX, memo, useContext, useEffect, useRef, useState} from "react";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../hooks/useDynamicClass";

interface SelectProps {
    value?: string | string[];
    onChange?: (value: string | string[], previousValue?: string | string[]) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    options: { value: string; label: string, disabled?: boolean }[];
    placeholder?: string;
    style?: CSSProperties;
    containerStyle?: CSSProperties;
    selectStyle?: CSSProperties;
    startIcon?: JSX.Element;
    endIcon?: JSX.Element;
    label?: string;
    error?: boolean;
    errorMessage?: string;
    helperText?: string;
    success?: boolean;
    disabled?: boolean;
    required?: boolean;
    autoComplete?: string;
    name?: string;
    id?: string;
    size?: "small" | "medium" | "large";
    variant?: "outlined" | "filled" | "standard";
    fullWidth?: boolean;
    multiple?: boolean;
    displayEmpty?: boolean;
}

export const Select = memo(({
                                value = "",
                                onChange,
                                onFocus,
                                onBlur,
                                options,
                                placeholder,
                                selectStyle,
                                containerStyle,
                                style,
                                startIcon,
                                endIcon,
                                label,
                                error = false,
                                errorMessage,
                                helperText,
                                success = false,
                                disabled = false,
                                required = false,
                                autoComplete,
                                name,
                                id,
                                size = "medium",
                                variant = "outlined",
                                fullWidth = false,
                                multiple = false,
                                displayEmpty = false
                            }: SelectProps) => {
    const [isFocused, setIsFocused] = useState(false);
    const [internalValue, setInternalValue] = useState(value);
    const selectRef = useRef<HTMLSelectElement>(null);
    const Theme = useContext(ThemeContext);

    useEffect(() => {
        setInternalValue(value);
    }, [value]);

    const handleFocus = () => {
        setIsFocused(true);
        onFocus?.();
    };

    const handleBlur = () => {
        setIsFocused(false);
        onBlur?.();
    };

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (multiple) {
            const selectedOptions = Array.from(e.target.selectedOptions).map(option => option.value);
            setInternalValue(selectedOptions as any);
            onChange?.(selectedOptions, internalValue);
        } else {
            const newValue = e.target.value;
            setInternalValue(newValue);
            onChange?.(newValue, internalValue);
        }
    };

    // Extract theme values
    const themeMode = Theme.state.theme;
    const isDark = themeMode === "dark";
    const background = isDark ? Theme.state.background.dark.paper : Theme.state.color.grey[50];
    const defaultBorder = isDark ? Theme.state.color.grey[700] : Theme.state.color.grey[300];
    const textPrimary = Theme.state.text[themeMode].primary;
    const textSecondary = Theme.state.text[themeMode].secondary;
    const primaryMain = Theme.state.primary[themeMode].main;
    const errorMain = Theme.state.error[themeMode].main;
    const successMain = Theme.state.success[themeMode].main;

    // Size configuration
    const sizeConfig = {
        small: { padding: "8px", fontSize: "12px", iconPadding: "8px" },
        medium: { padding: "12px", fontSize: "14px", iconPadding: "12px" },
        large: { padding: "16px", fontSize: "16px", iconPadding: "16px" }
    };
    const currentSize = sizeConfig[size];

    // Variant styling
    const getVariantStyles = () => {
        switch (variant) {
            case "filled":
                return {
                    background: isDark ? Theme.state.color.grey[800] : Theme.state.color.grey[200],
                    border: "none",
                    borderBottom: `2px solid ${defaultBorder}`,
                    borderRadius: "4px 4px 0 0"
                };
            case "standard":
                return {
                    background: "transparent",
                    border: "none",
                    borderBottom: `1px solid ${defaultBorder}`,
                    borderRadius: "0"
                };
            case "outlined":
            default:
                return {
                    background: background,
                    border: `1px solid ${defaultBorder}`,
                    borderRadius: "8px"
                };
        }
    };
    const variantStyles = getVariantStyles();

    // Dynamic classes
    const containerClass = useDynamicClass(`& {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: ${fullWidth ? "100%" : "auto"};
    }`);

    const selectWrapperClass = useDynamicClass(`& {
        display: flex;
        flex-direction: row;
        align-items: center;
        border-radius: ${variantStyles.borderRadius};
        background-color: ${variantStyles.background};
        border: ${variantStyles.border};
        ${variant === "standard" || variant === "filled" ? `border-bottom: ${variantStyles.borderBottom};` : ""}
        transition: all 0.2s ease-in-out;
        cursor: pointer;
        position: relative;
        box-shadow: ${variant === "outlined" ? "var(--nodius-shadow-1)" : "none"};
        ${!endIcon && !multiple ? `
        &::after {
            content: '▼';
            position: absolute;
            right: ${currentSize.iconPadding};
            top: 50%;
            transform: translateY(-50%);
            color: ${textSecondary};
            pointer-events: none;
            font-size: ${size === "small" ? "10px" : size === "large" ? "14px" : "12px"};
        }
        ` : ''}
    }
    &[data-focused="true"] {
        ${variant === "outlined" ? `border: 1px solid ${primaryMain};` : ""}
        ${variant === "standard" ? `border-bottom: 2px solid ${primaryMain};` : ""}
        ${variant === "filled" ? `border-bottom: 2px solid ${primaryMain};` : ""}
    }
    &[data-success="true"] {
        ${variant === "outlined" ? `border: 1px solid ${successMain};` : ""}
        ${variant === "standard" ? `border-bottom: 2px solid ${successMain};` : ""}
        ${variant === "filled" ? `border-bottom: 2px solid ${successMain};` : ""}
    }
    &[data-error="true"] {
        ${variant === "outlined" ? `border: 1px solid ${errorMain};` : ""}
        ${variant === "standard" ? `border-bottom: 2px solid ${errorMain};` : ""}
        ${variant === "filled" ? `border-bottom: 2px solid ${errorMain};` : ""}
    }
    &[data-disabled="true"] {
        opacity: 0.6;
        cursor: not-allowed;
    }`);

    const selectClass = useDynamicClass(`& {
        flex: 1;
        padding: ${currentSize.padding};
        padding-left: ${startIcon ? "8px" : currentSize.padding};
        padding-right: ${endIcon ? "8px" : `calc(${currentSize.padding} + 20px)`};
        background: none;
        border: none;
        outline: none;
        font-size: ${currentSize.fontSize};
        font-family: inherit;
        color: ${textPrimary};
        min-width: 0;
        cursor: pointer;
        ${multiple ? "" : `
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        `}
        ${multiple ? `min-height: 100px;` : ""}
    }
    & option {
        background-color: ${background};
        color: ${textPrimary};
        padding: 8px;
    }
    & option:checked {
        background-color: ${primaryMain};
        color: ${textPrimary};
    }
    &[data-disabled="true"] {
        cursor: not-allowed;
    }`);

    const labelClass = useDynamicClass(`& {
        font-size: ${size === "small" ? "12px" : "14px"};
        font-weight: 500;
        color: ${textPrimary};
        transition: color 0.2s ease-in-out;
    }
    &[data-focused="true"] {
        color: ${primaryMain};
    }
    &[data-success="true"] {
        color: ${successMain};
    }
    &[data-error="true"] {
        color: ${errorMain};
    }`);

    const iconClass = useDynamicClass(`& {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 ${currentSize.iconPadding};
        color: ${textSecondary};
    }`);

    const errorClass = useDynamicClass(`& {
        font-size: 12px;
        color: ${errorMain};
        margin-top: 4px;
        margin-left: 4px;
    }`);

    const helperClass = useDynamicClass(`& {
        font-size: 12px;
        color: ${textSecondary};
        margin-top: 4px;
        margin-left: 4px;
    }`);

    return (
        <div className={containerClass} style={style}>
            {label && (
                <label htmlFor={id} className={labelClass} data-focused={isFocused} data-error={error} data-success={success}>
                    {label}
                    {required && <span style={{ color: errorMain }}> *</span>}
                </label>
            )}
            <div
                className={selectWrapperClass}
                style={containerStyle}
                data-focused={isFocused}
                data-error={error}
                data-success={success}
                data-disabled={disabled}
                onClick={() => !disabled && selectRef.current?.focus()}
            >
                {startIcon && (
                    <div className={iconClass}>
                        {startIcon}
                    </div>
                )}
                <select
                    ref={selectRef}
                    id={id}
                    name={name}
                    value={internalValue}
                    onChange={handleChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    disabled={disabled}
                    required={required}
                    autoComplete={autoComplete}
                    className={selectClass}
                    style={selectStyle}
                    data-disabled={disabled}
                    multiple={multiple}
                >
                    {placeholder && !multiple && (
                        <option value="" disabled={!displayEmpty}>
                            {placeholder}
                        </option>
                    )}
                    {options.map((option) => (
                        <option key={option.value} value={option.value} disabled={option.disabled}>
                            {option.label}
                        </option>
                    ))}
                </select>
                {endIcon && (
                    <div className={iconClass}>
                        {endIcon}
                    </div>
                )}
            </div>
            {errorMessage && error && (
                <div className={errorClass}>
                    {errorMessage}
                </div>
            )}
            {helperText && !error && (
                <div className={helperClass}>
                    {helperText}
                </div>
            )}
        </div>
    );
});
Select.displayName = "Select";