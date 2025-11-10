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
    title
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
        `;

        if (disabled) {
            if (variant === "contained") {
                return baseStyles + `
                    background-color: rgba(255, 255, 255, 0.12);
                    color: rgba(255, 255, 255, 0.3);
                    box-shadow: none;
                    cursor: default;
                    pointer-events: none;
                `;
            } else if (variant === "outlined") {
                return baseStyles + `
                    background-color: transparent;
                    color: rgba(255, 255, 255, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    cursor: default;
                    pointer-events: none;
                `;
            } else {
                return baseStyles + `
                    background-color: transparent;
                    color: rgba(255, 255, 255, 0.3);
                    cursor: default;
                    pointer-events: none;
                `;
            }
        }

        if (variant === "contained") {
            return baseStyles + `
                background-color: ${getColorVar("main")};
                color: ${getColorVar("contrastText")};
                box-shadow: var(--nodius-shadow-2);
            `;
        } else if (variant === "outlined") {
            return baseStyles + `
                background-color: transparent;
                color: ${getColorVar("main")};
                border: 1px solid ${getColorVar("main")}80;
            `;
        } else {
            return baseStyles + `
                background-color: transparent;
                color: ${getColorVar("main")};
            `;
        }
    };

    const getHoverStyles = () => {
        if (disabled) return "";

        const colorValue = Theme.state[color]?.[Theme.state.theme]?.main || Theme.state.primary[Theme.state.theme].main;

        if (variant === "contained") {
            return `
                &:hover {
                    background-color: ${Theme.state.changeBrightness(colorValue, 0.15, "positive")};
                    box-shadow: var(--nodius-shadow-3);
                }
            `;
        } else if (variant === "outlined") {
            return `
                &:hover {
                    background-color: ${getColorVar("main")}0A;
                    border-color: ${getColorVar("main")};
                }
            `;
        } else {
            return `
                &:hover {
                    background-color: ${getColorVar("main")}0A;
                }
            `;
        }
    };

    const getActiveStyles = () => {
        if (disabled) return "";

        if (variant === "contained") {
            return `
                &:active {
                    box-shadow: var(--nodius-shadow-4);
                }
            `;
        }
        return "";
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
            <button className={buttonClass+" "+(className??"")} onClick={middleWareOnClick} style={style} title={title}>
                {children}
            </button>
        </div>
    )
}