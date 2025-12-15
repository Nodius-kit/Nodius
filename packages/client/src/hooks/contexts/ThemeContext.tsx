/**
 * @file ThemeContext.tsx
 * @description Theme configuration context with comprehensive color system
 * @module hooks/contexts
 *
 * Provides theming capabilities with light/dark mode support:
 * - ThemeContext: React context for theme state and utilities
 * - Color palette: Primary, secondary, error, warning, info, success colors
 * - Material-inspired colors: Full color spectrum (50-900 shades)
 * - Text and background: Theme-aware text and background colors
 * - Shadow system: Elevation-based shadow definitions
 * - Utility functions: Color manipulation (opacity, brightness, reverse)
 *
 * Key features:
 * - Dual theme support (light/dark)
 * - CSS custom properties integration
 * - Color utility functions (reverseHexColor, changeOpacity, changeBrightness)
 * - Comprehensive color palette based on Material Design
 * - Transition timing configurations
 */

import {ActionType, Dispatch} from "../useCreateReducer";
import {createContext} from "react";


export interface ThemeContextProps {
    state: ThemeContextType;
    dispatch: Dispatch<ActionType<ThemeContextType>>
}

export const ThemeContext = createContext<ThemeContextProps>(undefined!);


export type ThemeContextTypeTheme = "dark" | "light";
export interface ThemeContextObject {
    main: string,
    light: string,
    dark: string,
    contrastText: string,
}
export interface ThemeContextTypeColor {
    50: string,
    100: string,
    200: string,
    300: string,
    400: string,
    500: string,
    600: string,
    700: string,
    800: string,
    900: string,
}
// https://uicolors.app/generate/d2d6f2
export interface ThemeContextType {
    theme: ThemeContextTypeTheme,
    primary: Record<ThemeContextTypeTheme, ThemeContextObject>,
    secondary:  Record<ThemeContextTypeTheme, ThemeContextObject>,
    error:  Record<ThemeContextTypeTheme, ThemeContextObject>,
    warning:  Record<ThemeContextTypeTheme, ThemeContextObject>,
    info:  Record<ThemeContextTypeTheme, ThemeContextObject>,
    success:  Record<ThemeContextTypeTheme, ThemeContextObject>,
    text: Record<ThemeContextTypeTheme, {
        primary: string,
        secondary: string,
        disabled: string,
        divider: string,
    }>,
    background: Record<ThemeContextTypeTheme, {
        paper: string,
        default: string,
        resizeBar: string,
    }>,
    color: {
        red: ThemeContextTypeColor,
        pink: ThemeContextTypeColor,
        purple: ThemeContextTypeColor,
        deepPurple: ThemeContextTypeColor,
        indigo: ThemeContextTypeColor,
        blue: ThemeContextTypeColor,
        lightBlue: ThemeContextTypeColor,
        cyan: ThemeContextTypeColor,
        teal: ThemeContextTypeColor,
        green: ThemeContextTypeColor,
        lightGreen: ThemeContextTypeColor,
        lime: ThemeContextTypeColor,
        yellow: ThemeContextTypeColor,
        amber: ThemeContextTypeColor,
        orange: ThemeContextTypeColor,
        deepOrange: ThemeContextTypeColor,
        brown: ThemeContextTypeColor,
        grey: ThemeContextTypeColor,
        blueGrey: ThemeContextTypeColor,
    },
    shadow: Record<ThemeContextTypeTheme,{
        1: string,
        2: string,
        3: string,
        4: string
    }>,
    transition: {
        default: string
    },
    reverseHexColor: (hex: string, opacity?: number) => string,
    changeOpacity: (color: string, opacity: number) => string,
    changeBrightness: (color: string, percentage: number, type: "positive" | "negative") => string,
    changeColor: (css:string, toNewColor:string) => string, // detect color in a css rule, and change it to "toNewColor"
}

export const ThemeContextDefaultValue: ThemeContextType = {
    theme: "light",
    primary: {
        light: {
            main:"#1976d2",
            light:"#42a5f5",
            dark:"#1565c0",
            contrastText:"#fff",
        },
        dark: {
            main:"#1976d2",
            light:"#e3f2fd",
            dark:"#42a5f5",
            contrastText:"rgba(0, 0, 0, 0.87)",
        }
    },
    secondary: {
        light: {
            main:"#9c27b0",
            light:"#ba68c8",
            dark:"#7b1fa2",
            contrastText:"#fff",
        },
        dark: {
            main:"#ce93d8",
            light:"#f3e5f5",
            dark:"#ab47bc",
            contrastText:"rgba(0, 0, 0, 0.87)",
        }
    },
    error: {
        light: {
            main: "#d32f2f",
            light: "#ef5350",
            dark: "#c62828",
            contrastText: "#fff"
        },
        dark: {
            main: "#f44336",
            light: "#e57373",
            dark: "#d32f2f",
            contrastText: "#fff"
        }
    },
    warning: {
        light: {
            main: "#ed6c02",
            light: "#ff9800",
            dark: "#e65100",
            contrastText: "#fff"
        },
        dark: {
            main: "#ffa726",
            light: "#ffb74d",
            dark: "#f57c00",
            contrastText: "rgba(0, 0, 0, 0.87)"
        }
    },
    info: {
        light: {
            main: "#0288d1",
            light: "#03a9f4",
            dark: "#01579b",
            contrastText: "#fff"
        },
        dark: {
            main: "#29b6f6",
            light: "#4fc3f7",
            dark: "#0288d1",
            contrastText: "rgba(0, 0, 0, 0.87)"
        }
    },
    success: {
        light: {
            main: "#2e7d32",
            light: "#4caf50",
            dark: "#1b5e20",
            contrastText: "#fff"
        },
        dark: {
            main: "#66bb6a",
            light: "#81c784",
            dark: "#388e3c",
            contrastText: "rgba(0, 0, 0, 0.87)"
        }
    },
    text: {
        light: {
            primary: "rgba(0, 0, 0, 0.87)",
            secondary: "rgba(0, 0, 0, 0.6)",
            disabled: "rgba(0, 0, 0, 0.38)",
            divider: "rgba(0, 0, 0, 0.15)"
        },
        dark: {
            primary: "#fff",
            secondary: "rgba(255, 255, 255, 0.7)",
            disabled: "rgba(255, 255, 255, 0.5)",
            divider: "rgba(255, 255, 255, 0.15)"
        }
    },
    background: {
        light: {
            paper: "#FFF",
            default: "#fefefe",
            resizeBar: "#e8e8e8",
        },
        dark: {
            paper: "#282E3B",
            default: "#1F242F",
            resizeBar: "#30394d"
        }
    },
    color: {
        red: {
            50: "#ffebee",
            100: "#ffcdd2",
            200: "#ef9a9a",
            300: "#e57373",
            400: "#ef5350",
            500: "#f44336",
            600: "#e53935",
            700: "#d32f2f",
            800: "#c62828",
            900: "#b71c1c",
        },
        pink: {
            50: "#fce4ec",
            100: "#f8bbd0",
            200: "#f48fb1",
            300: "#f06292",
            400: "#ec407a",
            500: "#e91e63",
            600: "#d81b60",
            700: "#c2185b",
            800: "#ad1457",
            900: "#880e4f",
        },
        purple: {
            50: "#f3e5f5",
            100: "#e1bee7",
            200: "#ce93d8",
            300: "#ba68c8",
            400: "#ab47bc",
            500: "#9c27b0",
            600: "#8e24aa",
            700: "#7b1fa2",
            800: "#6a1b9a",
            900: "#4a148c",
        },
        deepPurple: {
            50: "#ede7f6",
            100: "#d1c4e9",
            200: "#b39ddb",
            300: "#9575cd",
            400: "#7e57c2",
            500: "#673ab7",
            600: "#5e35b1",
            700: "#512da8",
            800: "#4527a0",
            900: "#311b92",
        },
        indigo: {
            50: "#e8eaf6",
            100: "#c5cae9",
            200: "#9fa8da",
            300: "#7986cb",
            400: "#5c6bc0",
            500: "#3f51b5",
            600: "#3949ab",
            700: "#303f9f",
            800: "#283593",
            900: "#1a237e",
        },
        blue: {
            50: "#e3f2fd",
            100: "#bbdefb",
            200: "#90caf9",
            300: "#64b5f6",
            400: "#42a5f5",
            500: "#2196f3",
            600: "#1e88e5",
            700: "#1976d2",
            800: "#1565c0",
            900: "#0d47a1",
        },
        lightBlue: {
            50: "#e1f5fe",
            100: "#b3e5fc",
            200: "#81d4fa",
            300: "#4fc3f7",
            400: "#29b6f6",
            500: "#03a9f4",
            600: "#039be5",
            700: "#0288d1",
            800: "#0277bd",
            900: "#01579b",
        },
        cyan: {
            50: "#e0f7fa",
            100: "#b2ebf2",
            200: "#80deea",
            300: "#4dd0e1",
            400: "#26c6da",
            500: "#00bcd4",
            600: "#00acc1",
            700: "#0097a7",
            800: "#00838f",
            900: "#006064",
        },
        teal: {
            50: "#e0f2f1",
            100: "#b2dfdb",
            200: "#80cbc4",
            300: "#4db6ac",
            400: "#26a69a",
            500: "#009688",
            600: "#00897b",
            700: "#00796b",
            800: "#00695c",
            900: "#004d40",
        },
        green: {
            50: "#e8f5e9",
            100: "#c8e6c9",
            200: "#a5d6a7",
            300: "#81c784",
            400: "#66bb6a",
            500: "#4caf50",
            600: "#43a047",
            700: "#388e3c",
            800: "#2e7d32",
            900: "#1b5e20",
        },
        lightGreen: {
            50: "#f1f8e9",
            100: "#dcedc8",
            200: "#c5e1a5",
            300: "#aed581",
            400: "#9ccc65",
            500: "#8bc34a",
            600: "#7cb342",
            700: "#689f38",
            800: "#558b2f",
            900: "#33691e",
        },
        lime: {
            50: "#f9fbe7",
            100: "#f0f4c3",
            200: "#e6ee9c",
            300: "#dce775",
            400: "#d4e157",
            500: "#cddc39",
            600: "#c0ca33",
            700: "#afb42b",
            800: "#9e9d24",
            900: "#827717",
        },
        yellow: {
            50: "#fffde7",
            100: "#fff9c4",
            200: "#fff59d",
            300: "#fff176",
            400: "#ffee58",
            500: "#ffeb3b",
            600: "#fdd835",
            700: "#fbc02d",
            800: "#f9a825",
            900: "#f57f17",
        },
        amber: {
            50: "#fff8e1",
            100: "#ffecb3",
            200: "#ffe082",
            300: "#ffd54f",
            400: "#ffca28",
            500: "#ffc107",
            600: "#ffb300",
            700: "#ffa000",
            800: "#ff8f00",
            900: "#ff6f00",
        },
        orange: {
            50: "#fff3e0",
            100: "#ffe0b2",
            200: "#ffcc80",
            300: "#ffb74d",
            400: "#ffa726",
            500: "#ff9800",
            600: "#fb8c00",
            700: "#f57c00",
            800: "#ef6c00",
            900: "#e65100",
        },
        deepOrange: {
            50: "#fbe9e7",
            100: "#ffccbc",
            200: "#ffab91",
            300: "#ff8a65",
            400: "#ff7043",
            500: "#ff5722",
            600: "#f4511e",
            700: "#e64a19",
            800: "#d84315",
            900: "#bf360c",
        },
        brown: {
            50: "#efebe9",
            100: "#d7ccc8",
            200: "#bcaaa4",
            300: "#a1887f",
            400: "#8d6e63",
            500: "#795548",
            600: "#6d4c41",
            700: "#5d4037",
            800: "#4e342e",
            900: "#3e2723",
        },
        grey: {
            50: "#fafafa",
            100: "#f5f5f5",
            200: "#eeeeee",
            300: "#e0e0e0",
            400: "#bdbdbd",
            500: "#9e9e9e",
            600: "#757575",
            700: "#616161",
            800: "#424242",
            900: "#212121",
        },
        blueGrey: {
            50: "#eceff1",
            100: "#cfd8dc",
            200: "#b0bec5",
            300: "#90a4ae",
            400: "#78909c",
            500: "#607d8b",
            600: "#546e7a",
            700: "#455a64",
            800: "#37474f",
            900: "#263238",
        }
    },
    shadow: {
        light: {
            "1": "rgba(0, 0, 0, 0.12) 0px 1px 3px, rgba(0, 0, 0, 0.24) 0px 1px 2px",
            "2": "rgba(0, 0, 0, 0.16) 0px 3px 6px, rgba(0, 0, 0, 0.23) 0px 3px 6px",
            "3": "rgba(0, 0, 0, 0.19) 0px 10px 20px, rgba(0, 0, 0, 0.23) 0px 6px 6px",
            "4": "rgba(0, 0, 0, 0.25) 0px 14px 28px, rgba(0, 0, 0, 0.22) 0px 10px 10px"
        },
        dark: {
            "1": "rgba(0, 0, 0, 0.12) 0px 1px 3px, rgba(0, 0, 0, 0.24) 0px 1px 2px",
            "2": "rgba(0, 0, 0, 0.16) 0px 3px 6px, rgba(0, 0, 0, 0.23) 0px 3px 6px",
            "3": "rgba(0, 0, 0, 0.19) 0px 10px 20px, rgba(0, 0, 0, 0.23) 0px 6px 6px",
            "4": "rgba(0, 0, 0, 0.25) 0px 14px 28px, rgba(0, 0, 0, 0.22) 0px 10px 10px"
        }
    },
    transition: {
        default: "all 0.3s ease-in-out",
    },
    /**
     * Invert a hex color and optionally apply opacity.
     *
     * @param hex - Hex color string (e.g. "#ff9933" or "ff9933")
     * @param opacity - Optional opacity value (0 to 1)
     * @returns Inverted hex color string (e.g. "#0066cc" or "#0066cc80")
     */
    reverseHexColor: (hex: string, opacity?: number) : string =>{
        // Remove leading "#" if present
        let cleanHex = hex.replace(/^#/, "");

        // Support 3-digit shorthand (#f93 → #ff9933)
        if (cleanHex.length === 3) {
            cleanHex = cleanHex.split("").map(c => c + c).join("");
        }

        // Ensure it's a valid 6-digit hex
        if (!/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
            throw new Error("Invalid hex color format. Expected 3- or 6-digit hex.");
        }

        // Convert to RGB
        const r = parseInt(cleanHex.slice(0, 2), 16);
        const g = parseInt(cleanHex.slice(2, 4), 16);
        const b = parseInt(cleanHex.slice(4, 6), 16);

        // Invert RGB
        const ir = (255 - r).toString(16).padStart(2, "0");
        const ig = (255 - g).toString(16).padStart(2, "0");
        const ib = (255 - b).toString(16).padStart(2, "0");

        // Handle opacity
        if (opacity !== undefined) {
            if (opacity < 0 || opacity > 1) {
                throw new Error("Opacity must be between 0 and 1.");
            }
            const alpha = Math.round(opacity * 255)
                .toString(16)
                .padStart(2, "0");
            return `#${ir}${ig}${ib}${alpha}`;
        }

        return `#${ir}${ig}${ib}`;
    },
    changeOpacity: (color: string, opacity: number): string => {
        // Clamp opacity between 0 and 1
        opacity = Math.min(Math.max(opacity, 0), 1);

        // Handle hex (#RGB, #RRGGBB, #RRGGBBAA)
        if (color.startsWith("#")) {
            let hex = color.replace("#", "");

            // Expand shorthand (#RGB → #RRGGBB)
            if (hex.length === 3) {
                hex = hex.split("").map(ch => ch + ch).join("");
            }

            // If hex already has alpha (#RRGGBBAA), ignore it
            if (hex.length === 8) {
                hex = hex.substring(0, 6);
            }

            if (hex.length === 6) {
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                return `rgba(${r}, ${g}, ${b}, ${opacity})`;
            }
        }

        // Handle rgb/rgba
        const rgbRegex = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i;
        const match = color.match(rgbRegex);

        if (match) {
            const r = parseInt(match[1], 10);
            const g = parseInt(match[2], 10);
            const b = parseInt(match[3], 10);
            return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }

        throw new Error(`Unsupported color format: ${color}`);
    },
    changeBrightness: (color: string, percentage: number, type: "positive" | "negative"): string => {
        percentage = Math.min(Math.max(percentage, 0), 1);

        let r: number, g: number, b: number, a = 1;

        // HEX (#RGB, #RRGGBB, #RRGGBBAA)
        if (color.startsWith("#")) {
            let hex = color.slice(1);

            if (hex.length === 3) {
                hex = hex.split("").map(ch => ch + ch).join("");
            }

            if (hex.length === 8) {
                a = parseInt(hex.slice(6, 8), 16) / 255;
                hex = hex.slice(0, 6);
            }

            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        }
        // RGB / RGBA
        else {
            const match = color.match(
                /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i
            );
            if (!match) {
                throw new Error(`Unsupported color format: ${color}`);
            }
            r = parseFloat(match[1]);
            g = parseFloat(match[2]);
            b = parseFloat(match[3]);
            if (match[4] !== undefined) a = parseFloat(match[4]);
        }

        // Adjust brightness
        if (type === "positive") {
            r = r + (255 - r) * percentage;
            g = g + (255 - g) * percentage;
            b = b + (255 - b) * percentage;
        } else {
            r = r * (1 - percentage);
            g = g * (1 - percentage);
            b = b * (1 - percentage);
        }

        // Clamp values
        r = Math.round(Math.min(Math.max(r, 0), 255));
        g = Math.round(Math.min(Math.max(g, 0), 255));
        b = Math.round(Math.min(Math.max(b, 0), 255));

        // Output format: hex if no alpha, rgba if alpha < 1
        if (a < 1) {
            return `rgba(${r}, ${g}, ${b}, ${a})`;
        } else {
            const toHex = (val: number) => val.toString(16).padStart(2, "0");
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }
    },
    changeColor: (css: string, toNewColor: string) => {
        // Match rgb(), rgba(), hsl(), hsla(), or hex colors
        const colorRegex =
            /rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8}\b/g;

        // Replace all detected color instances with the new color
        return css.replace(colorRegex, toNewColor);
    }
}