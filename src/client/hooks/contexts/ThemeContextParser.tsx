/**
 * @file ThemeContextParser.tsx
 * @description Applies theme values to CSS custom properties for runtime theming
 * @module hooks/contexts
 *
 * Synchronizes theme context state with CSS custom properties:
 * - ThemeContextParser: Component that applies theme to DOM
 * - CSS variable mapping: Maps theme values to --nodius-* CSS variables
 * - Reverse theme: Provides inverse theme colors for contrast
 * - Dynamic updates: Reacts to theme changes and updates CSS
 *
 * Key features:
 * - Sets data-nodius-theme attribute for theme-based selectors
 * - Creates CSS variables for all theme colors and shadows
 * - Provides reverse theme variables for advanced styling
 * - Updates on theme, primary color, or color palette changes
 * - Zero visual output (renders nothing)
 *
 * @example
 * // CSS usage after parser runs:
 * .element {
 *   color: var(--nodius-primary-main);
 *   background: var(--nodius-background-paper);
 * }
 */

import {memo, useContext, useEffect} from "react";
import {ThemeContext, ThemeContextType} from "./ThemeContext";


interface ThemeContextParserProps {}

export const ThemeContextParser = memo(({}: ThemeContextParserProps) => {
    const Theme = useContext(ThemeContext);

    useEffect(() => {
        const root = document.documentElement;

        // Set theme mode attribute for CSS selectors
        root.setAttribute('data-nodius-theme', Theme.state.theme);

        // List of theme properties to convert to CSS variables
        const toDos:Partial<keyof ThemeContextType>[] = ["primary","secondary","text","info","background","success","warning","error", "shadow"];

        // Apply current theme CSS variables
        toDos.forEach((toDo) => {
            Object.entries((Theme.state as any)[toDo][Theme.state.theme]).forEach(([key, value]) => {
                root.style.setProperty(`--nodius-${toDo}-${key}`, value as any);
            });
        })
        // Apply reverse theme CSS variables for contrast effects
        toDos.forEach((toDo) => {
            Object.entries((Theme.state as any)[toDo][Theme.state.theme == "light" ? "dark" : "light"]).forEach(([key, value]) => {
                root.style.setProperty(`--nodius-reverse-${toDo}-${key}`, value as any);
            });
        })


        // Set all color palette variables
        Object.entries(Theme.state.color).forEach(([colorName, colorShades]) => {
            Object.entries(colorShades).forEach(([shade, color]) => {
                root.style.setProperty(`--nodius-${colorName}-${shade}`, color);
            });
        });

        Object.entries(Theme.state.transition).forEach(([type, transition]) => {
            root.style.setProperty(`--nodius-transition-${type}`, transition);
        });

        document.body.style.color = "var(--nodius-text-primary)"



    }, [Theme.state.theme, Theme.state.primary, Theme.state.color]);

    return <></>
});
ThemeContext.displayName = "ThemeContext";