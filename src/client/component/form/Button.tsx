import {useDynamicClass} from "../../hooks/useDynamicClass";
import {CSSProperties, PropsWithChildren, useContext, useRef, useState} from "react";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";
import {Point} from "../../../utils/objectUtils";

interface ButtonProps {
    disabled?: boolean;
    onClick?: (evt:React.MouseEvent) => void;
    variant?: "text" | "contained" | "outlined";
    color?: "primary" | "secondary" | "error" | "success" | "warning" | "info";
    size?: "small" | "medium" | "large";
    fullWidth?: boolean;
    className?: string;
    style?:CSSProperties;
    title?:string;
    type?: "submit" |"button";
}

export const Button = ({
    disabled,
    onClick,
    variant = "contained",
    color = "primary",
    size = "medium",
    fullWidth = false,
    style,
    children,
    className,
    title,
    type
}: PropsWithChildren<ButtonProps>) => {

    const Theme = useContext(ThemeContext);

    const containerRef = useRef<HTMLDivElement>(null);

    const getColorVar = (shade: "main" | "light" | "dark" | "contrastText") => {
        return `var(--nodius-${color}-${shade})`;
    };

    const getPadding = () => {
        if (size === "small") {
            return "4px 10px";
        } else if (size === "large") {
            return "8px 22px";
        }
        return "6px 16px";
    };

    const getFontSize = () => {
        if (size === "small") {
            return "0.8125rem";
        } else if (size === "large") {
            return "0.9375rem";
        }
        return "0.875rem";
    };

    const getMinWidth = () => {
        if(size === "small") {
            return "48px"
        }
        return "64px"
    }

    const containerClass = useDynamicClass(`
        & {
            position: relative;
            display: ${fullWidth ? "block" : "inline-block"};
            width: ${fullWidth ? "100%" : "auto"};
        }
    `);

    const getButtonStyles = () => {
        const isDark = Theme.state.theme === "dark";

        const baseStyles = `
            position: relative;
            overflow: hidden;
            padding: ${getPadding()};
            border-radius: 4px;
            border: none;
            cursor: pointer;
            font-size: ${getFontSize()};
            font-weight: 500;
            line-height: 1.75;
            letter-spacing: 0.02857em;
            text-transform: uppercase;
            min-width: ${getMinWidth()};
            width: ${fullWidth ? "100%" : "auto"};
            transition: background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
                        box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
                        border-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
                        color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-family: inherit;
            user-select: none;
            vertical-align: middle;
            -webkit-tap-highlight-color: transparent;
        `;

        // Disabled state
        if (disabled) {
            const disabledBg = isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)";
            const disabledText = isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.26)";
            const disabledBorder = isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)";

            if (variant === "contained") {
                return baseStyles + `
                    background-color: ${disabledBg};
                    color: ${disabledText};
                    box-shadow: none;
                    cursor: default;
                    pointer-events: none;
                `;
            } else if (variant === "outlined") {
                return baseStyles + `
                    background-color: transparent;
                    color: ${disabledText};
                    border: 1px solid ${disabledBorder};
                    cursor: default;
                    pointer-events: none;
                `;
            } else { // text
                return baseStyles + `
                    background-color: transparent;
                    color: ${disabledText};
                    cursor: default;
                    pointer-events: none;
                `;
            }
        }

        // Active states
        if (variant === "contained") {
            return baseStyles + `
                background-color: ${getColorVar("main")};
                color: ${getColorVar("contrastText")};
                box-shadow: 0px 3px 1px -2px rgba(0,0,0,0.2),
                            0px 2px 2px 0px rgba(0,0,0,0.14),
                            0px 1px 5px 0px rgba(0,0,0,0.12);
            `;
        } else if (variant === "outlined") {
            return baseStyles + `
                background-color: transparent;
                color: ${getColorVar("main")};
                border: 1px solid ${isDark ? "rgba(255, 255, 255, 0.23)" : "rgba(0, 0, 0, 0.23)"};
            `;
        } else { // text
            return baseStyles + `
                background-color: transparent;
                color: ${getColorVar("main")};
                padding: ${size === "small" ? "4px 5px" : size === "large" ? "8px 11px" : "6px 8px"};
            `;
        }
    };

    const getHoverStyles = () => {
        if (disabled) return "";

        const colorValue = Theme.state[color]?.[Theme.state.theme]?.main || Theme.state.primary[Theme.state.theme].main;
        const isDark = Theme.state.theme === "dark";

        if (variant === "contained") {
            return `
                &:hover {
                    background-color: ${Theme.state.changeBrightness(colorValue, 0.08, "positive")};
                    box-shadow: 0px 2px 4px -1px rgba(0,0,0,0.2),
                                0px 4px 5px 0px rgba(0,0,0,0.14),
                                0px 1px 10px 0px rgba(0,0,0,0.12);
                }
            `;
        } else if (variant === "outlined") {
            return `
                &:hover {
                    background-color: ${isDark ? "rgba(255, 255, 255, 0.08)" : `${getColorVar("main")}08`};
                    border-color: ${getColorVar("main")};
                }
            `;
        } else { // text
            return `
                &:hover {
                    background-color: ${isDark ? "rgba(255, 255, 255, 0.08)" : `${getColorVar("main")}08`};
                }
            `;
        }
    };

    const getActiveStyles = () => {
        if (disabled) return "";

        const isDark = Theme.state.theme === "dark";

        if (variant === "contained") {
            return `
                &:active {
                    box-shadow: 0px 5px 5px -3px rgba(0,0,0,0.2),
                                0px 8px 10px 1px rgba(0,0,0,0.14),
                                0px 3px 14px 2px rgba(0,0,0,0.12);
                }
            `;
        } else if (variant === "outlined") {
            return `
                &:active {
                    background-color: ${isDark ? "rgba(255, 255, 255, 0.16)" : `${getColorVar("main")}16`};
                }
            `;
        } else { // text
            return `
                &:active {
                    background-color: ${isDark ? "rgba(255, 255, 255, 0.16)" : `${getColorVar("main")}16`};
                }
            `;
        }
    };

    const buttonClass = useDynamicClass(`
        & {
            ${getButtonStyles()}
        }
        ${getHoverStyles()}
        ${getActiveStyles()}
    `);

    const middleWareOnClick = (evt:React.MouseEvent) => {
        if (disabled) return;

        /*
        const containerRect = containerRef.current!.getBoundingClientRect();

        const clientX = evt.clientX - containerRect.x;
        const clientY = evt.clientY - containerRect.y;
        */

        onClick?.(evt);
    }

    return (
        <div className={containerClass} ref={containerRef}>
            <button className={buttonClass+" "+(className??"")} onClick={middleWareOnClick} style={style} title={title} type={type}>
                {children}
            </button>
        </div>
    )
}