import {CSSProperties, JSX, memo, useContext, useEffect, useRef, useState} from "react";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../hooks/useDynamicClass";

interface InputProps {
    type?: "text" | "number" | "password" | "email" | "tel" | "url" | "search";
    value?: string;
    onChange?: (value: string, previousValue?: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    placeholder?: string;
    style?: CSSProperties;
    containerStyle?: CSSProperties;
    inputStyle?: CSSProperties;
    startIcon?: JSX.Element;
    endIcon?: JSX.Element;
    label?: string;
    error?: boolean;
    errorMessage?: string;
    success?: boolean;
    disabled?: boolean;
    required?: boolean;
    maxLength?: number;
    autoComplete?: string;
    name?: string;
    id?: string;
}

export const Input = memo(({
                               type = "text",
                               onChange,
                               onFocus,
                               onBlur,
                               value = "",
                               placeholder,
                               inputStyle,
                               containerStyle,
                               style,
                               startIcon,
                               endIcon,
                               label,
                               error = false,
                               errorMessage,
                               success = false,
                               disabled = false,
                               required = false,
                               maxLength,
                               autoComplete,
                               name,
                               id
                           }: InputProps) => {
    const [isFocused, setIsFocused] = useState(false);
    const [internalValue, setInternalValue] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);
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

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setInternalValue(newValue);
        onChange?.(newValue, internalValue);
    };

    // Extract theme values
    const themeMode = Theme.state.theme;
    const isDark = themeMode === "dark";
    const background = isDark ? Theme.state.background.dark.paper : Theme.state.color.grey[50];
    const defaultBorder = isDark ? Theme.state.color.grey[700] : Theme.state.color.grey[300];
    const textPrimary = isDark ? Theme.state.text.dark.primary : Theme.state.text.light.primary;
    const textSecondary = isDark ? Theme.state.text.dark.secondary : Theme.state.text.light.secondary;
    const primaryMain = Theme.state.primary[themeMode].main;
    const errorMain = Theme.state.error[themeMode].main;
    const successMain = Theme.state.success[themeMode].main;

    // Dynamic classes
    const containerClass = useDynamicClass(`& {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }`);

    const inputWrapperClass = useDynamicClass(`& {
        display: flex;
        flex-direction: row;
        align-items: center;
        border-radius: 8px;
        background-color: ${background};
        border: 1px solid ${defaultBorder};
        transition: all 0.2s ease-in-out;
        cursor: text;
    }
    &[data-focused="true"] {
        border: 1px solid ${primaryMain};
    }
    &[data-success="true"] {
        border: 1px solid ${successMain};
    }
    &[data-error="true"] {
        border: 1px solid ${errorMain};
    }
    &[data-disabled="true"] {
        opacity: 0.6;
        cursor: not-allowed;
    }`);

    const inputClass = useDynamicClass(`& {
        flex: 1;
        padding: 12px;
        padding-left: ${startIcon ? "8px" : "12px"};
        padding-right: ${endIcon ? "8px" : "12px"};
        background: none;
        border: none;
        outline: none;
        font-size: 14px;
        font-family: inherit;
        color: ${textPrimary};
        min-width: 0;
        cursor: text;
    }
    &::placeholder {
        color: ${textSecondary};
    }
    &[data-disabled="true"] {
        cursor: not-allowed;
    }`);

    const labelClass = useDynamicClass(`& {
        font-size: 14px;
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
        padding: 0 12px;
        color: ${textSecondary};
    }`);

    const errorClass = useDynamicClass(`& {
        font-size: 12px;
        color: ${errorMain};
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
                className={inputWrapperClass}
                style={containerStyle}
                data-focused={isFocused}
                data-error={error}
                data-success={success}
                data-disabled={disabled}
                onClick={() => inputRef.current?.focus()}
            >
                {startIcon && (
                    <div className={iconClass}>
                        {startIcon}
                    </div>
                )}
                <input
                    ref={inputRef}
                    id={id}
                    name={name}
                    type={type}
                    value={internalValue}
                    onChange={handleChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder={placeholder}
                    disabled={disabled}
                    required={required}
                    maxLength={maxLength}
                    autoComplete={autoComplete}
                    className={inputClass}
                    style={inputStyle}
                    data-disabled={disabled}
                />
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
        </div>
    );
});
Input.displayName = "Input";