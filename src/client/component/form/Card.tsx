import {CSSProperties, JSX, memo, useContext, useState} from "react";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";

type CardVariant = "default" | "info" | "warning" | "error" | "success";
type CardElevation = 1 | 2 | 3 | 4;

interface CardProps {
    title?: string;
    description?: string;
    variant?: CardVariant;
    elevation?: CardElevation;
    icon?: JSX.Element;
    showIcon?: boolean;
    action?: JSX.Element;
    children?: JSX.Element;
    style?: CSSProperties;
    titleStyle?: CSSProperties;
    descriptionStyle?: CSSProperties;
    onClick?: () => void;
    closable?: boolean;
    onClose?: () => void;
    bordered?: boolean;
    hoverable?: boolean;
}

export const Card = memo(({
                              title,
                              description,
                              variant = "default",
                              elevation = 2,
                              icon,
                              showIcon = true,
                              action,
                              children,
                              style,
                              titleStyle,
                              descriptionStyle,
                              onClick,
                              closable = false,
                              onClose,
                              bordered = false,
                              hoverable = false
                          }: CardProps) => {
    const Theme = useContext(ThemeContext);
    const [isHovered, setIsHovered] = useState<boolean>(false);
    const [isClosed, setIsClosed] = useState<boolean>(false);

    if (isClosed) return null;

    const getDefaultIcon = () => {
        if (!showIcon || icon !== undefined) return icon;

        switch (variant) {
            case "info":
                return "ℹ️";
            case "warning":
                return "⚠️";
            case "error":
                return "❌";
            case "success":
                return "✅";
            default:
                return null;
        }
    };

    const getVariantColors = () => {
        const isDark = Theme.state.theme === "dark";

        switch (variant) {
            case "info":
                return {
                    primary: Theme.state.info[Theme.state.theme].main,
                    light: Theme.state.info[Theme.state.theme].light,
                    dark: Theme.state.info[Theme.state.theme].dark,
                    background: isDark
                        ? `${Theme.state.color.blue[900]}40`
                        : Theme.state.color.blue[50],
                    borderColor: Theme.state.info[Theme.state.theme].main,
                    iconBackground: isDark
                        ? `${Theme.state.info.dark.main}20`
                        : `${Theme.state.info.light.main}15`,
                };
            case "warning":
                return {
                    primary: Theme.state.warning[Theme.state.theme].main,
                    light: Theme.state.warning[Theme.state.theme].light,
                    dark: Theme.state.warning[Theme.state.theme].dark,
                    background: isDark
                        ? `${Theme.state.color.orange[900]}40`
                        : Theme.state.color.orange[50],
                    borderColor: Theme.state.warning[Theme.state.theme].main,
                    iconBackground: isDark
                        ? `${Theme.state.warning.dark.main}20`
                        : `${Theme.state.warning.light.main}15`,
                };
            case "error":
                return {
                    primary: Theme.state.error[Theme.state.theme].main,
                    light: Theme.state.error[Theme.state.theme].light,
                    dark: Theme.state.error[Theme.state.theme].dark,
                    background: isDark
                        ? `${Theme.state.color.red[900]}40`
                        : Theme.state.color.red[50],
                    borderColor: Theme.state.error[Theme.state.theme].main,
                    iconBackground: isDark
                        ? `${Theme.state.error.dark.main}20`
                        : `${Theme.state.error.light.main}15`,
                };
            case "success":
                return {
                    primary: Theme.state.success[Theme.state.theme].main,
                    light: Theme.state.success[Theme.state.theme].light,
                    dark: Theme.state.success[Theme.state.theme].dark,
                    background: isDark
                        ? `${Theme.state.color.green[900]}40`
                        : Theme.state.color.green[50],
                    borderColor: Theme.state.success[Theme.state.theme].main,
                    iconBackground: isDark
                        ? `${Theme.state.success.dark.main}20`
                        : `${Theme.state.success.light.main}15`,
                };
            default:
                return {
                    primary: Theme.state.primary[Theme.state.theme].main,
                    light: Theme.state.primary[Theme.state.theme].light,
                    dark: Theme.state.primary[Theme.state.theme].dark,
                    background: isDark
                        ? Theme.state.background.dark.paper
                        : Theme.state.background.light.paper,
                    borderColor: isDark
                        ? Theme.state.color.blueGrey[700]
                        : Theme.state.color.grey[300],
                    iconBackground: isDark
                        ? `${Theme.state.color.blueGrey[700]}40`
                        : Theme.state.color.grey[100],
                };
        }
    };

    const colors = getVariantColors();
    const displayIcon = getDefaultIcon();

    const getCardStyle = (): CSSProperties => {
        const isDark = Theme.state.theme === "dark";
        const baseStyle: CSSProperties = {
            borderRadius: "12px",
            padding: "16px",
            backgroundColor: variant === "default"
                ? (isDark ? Theme.state.background.dark.paper : Theme.state.background.light.paper)
                : colors.background,
            boxShadow: Theme.state.shadow[Theme.state.theme][elevation],
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            position: "relative",
            border: bordered ? `2px solid ${colors.borderColor}` : "none",
            cursor: onClick || hoverable ? "pointer" : "default",
            ...style
        };

        if (isHovered && (onClick || hoverable)) {
            baseStyle.boxShadow = Theme.state.shadow[Theme.state.theme][Math.min(elevation + 1, 4) as CardElevation];
        }

        return baseStyle;
    };

    const getHeaderStyle = (): CSSProperties => {
        return {
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            marginBottom: (description || children) ? "12px" : 0,
        };
    };

    const getIconContainerStyle = (): CSSProperties => {
        return {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            backgroundColor: colors.iconBackground,
            flexShrink: 0,
            fontSize: "20px",
        };
    };

    const getTitleStyle = (): CSSProperties => {
        const isDark = Theme.state.theme === "dark";
        return {
            fontSize: "16px",
            fontWeight: 600,
            color: variant === "default"
                ? (isDark ? Theme.state.text.dark.primary : Theme.state.text.light.primary)
                : colors.primary,
            margin: 0,
            flex: 1,
            lineHeight: "1.5",
            ...titleStyle
        };
    };

    const getDescriptionStyle = (): CSSProperties => {
        const isDark = Theme.state.theme === "dark";
        return {
            fontSize: "14px",
            color: isDark ? Theme.state.text.dark.secondary : Theme.state.text.light.secondary,
            margin: 0,
            lineHeight: "1.6",
            marginLeft: displayIcon && showIcon ? "52px" : 0,
            ...descriptionStyle
        };
    };

    const getCloseButtonStyle = (): CSSProperties => {
        const isDark = Theme.state.theme === "dark";
        return {
            position: "absolute" as const,
            top: "12px",
            right: "12px",
            background: "transparent",
            border: "none",
            color: isDark ? Theme.state.text.dark.secondary : Theme.state.text.light.secondary,
            cursor: "pointer",
            padding: "4px",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "18px",
            transition: "all 0.2s ease",
        };
    };


    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsClosed(true);
        onClose?.();
    };

    return (
        <div
            style={getCardStyle()}
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {closable && (
                <button
                    style={getCloseButtonStyle()}
                    onClick={handleClose}
                    aria-label="Close"
                >
                    ✕
                </button>
            )}

            {(title || displayIcon) && (
                <div style={getHeaderStyle()}>
                    {displayIcon && showIcon && (
                        <div style={getIconContainerStyle()}>
                            {displayIcon}
                        </div>
                    )}

                    <div style={{ flex: 1 }}>
                        {title && (
                            <h3 style={getTitleStyle()}>{title}</h3>
                        )}
                    </div>

                    {action && (
                        <div>{action}</div>
                    )}
                </div>
            )}

            {description && (
                <p style={getDescriptionStyle()}>{description}</p>
            )}

            {children && (
                <div style={{ marginLeft: displayIcon && showIcon ? "52px" : 0 }}>
                    {children}
                </div>
            )}
        </div>
    );
});
Card.displayName = "Card";