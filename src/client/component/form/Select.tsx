import {CSSProperties, JSX, memo, useContext, useEffect, useRef, useState} from "react";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../hooks/useDynamicClass";

interface SelectProps {
    value?: string;
    onChange?: (value: string, previousValue?: string) => void;
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
    success?: boolean;
    disabled?: boolean;
    required?: boolean;
    autoComplete?: string;
    name?: string;
    id?: string;
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
                                success = false,
                                disabled = false,
                                required = false,
                                autoComplete,
                                name,
                                id
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

    const selectWrapperClass = useDynamicClass(`& {
        display: flex;
        flex-direction: row;
        align-items: center;
        border-radius: 8px;
        background-color: ${background};
        border: 1px solid ${defaultBorder};
        transition: all 0.2s ease-in-out;
        cursor: pointer;
        position: relative;
        ${endIcon ? '' : `
        &::after {
            content: '▼';
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            color: ${textSecondary};
            pointer-events: none;
        }
        `}
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

    const selectClass = useDynamicClass(`& {
        flex: 1;
        padding: 12px;
        padding-left: ${startIcon ? "8px" : "12px"};
        padding-right: ${endIcon ? "8px" : "32px"};
        background: none;
        border: none;
        outline: none;
        font-size: 14px;
        font-family: inherit;
        color: ${textPrimary};
        min-width: 0;
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
    }
    & option {
        background-color: ${background};
        color: ${textPrimary};
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
Select.displayName = "Select";