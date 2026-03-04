/**
 * @file useResizablePanel.ts
 * @description Hook for resizable panel with localStorage persistence and viewport clamping.
 * Panel is anchored bottom-right, so resize expands toward top and left.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { disableTextSelection, enableTextSelection } from "@nodius/utils";

export interface UseResizablePanelOptions {
    storageKey: string;
    defaultWidth: number;
    defaultHeight: number;
    minWidth: number;
    minHeight: number;
    maxWidthRatio?: number;
    maxHeightRatio?: number;
}

export interface UseResizablePanelReturn {
    width: number;
    height: number;
    isResizing: boolean;
    resetSize: () => void;
    startResize: (edge: "top" | "left" | "topLeft", e: React.MouseEvent) => void;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function loadSize(key: string, defaultW: number, defaultH: number): { w: number; h: number } {
    try {
        const raw = localStorage.getItem(key);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (typeof parsed.w === "number" && typeof parsed.h === "number") {
                return parsed;
            }
        }
    } catch { /* ignore */ }
    return { w: defaultW, h: defaultH };
}

export function useResizablePanel(options: UseResizablePanelOptions): UseResizablePanelReturn {
    const {
        storageKey,
        defaultWidth,
        defaultHeight,
        minWidth,
        minHeight,
        maxWidthRatio = 0.9,
        maxHeightRatio = 0.85,
    } = options;

    const getMaxWidth = () => window.innerWidth * maxWidthRatio;
    const getMaxHeight = () => window.innerHeight * maxHeightRatio;

    const [size, setSize] = useState(() => {
        const saved = loadSize(storageKey, defaultWidth, defaultHeight);
        return {
            w: clamp(saved.w, minWidth, getMaxWidth()),
            h: clamp(saved.h, minHeight, getMaxHeight()),
        };
    });

    const [isResizing, setIsResizing] = useState(false);
    const resizingRef = useRef(false);

    // Clamp on window resize
    useEffect(() => {
        const onWindowResize = () => {
            setSize(prev => {
                const w = clamp(prev.w, minWidth, getMaxWidth());
                const h = clamp(prev.h, minHeight, getMaxHeight());
                if (w === prev.w && h === prev.h) return prev;
                return { w, h };
            });
        };
        window.addEventListener("resize", onWindowResize);
        return () => window.removeEventListener("resize", onWindowResize);
    }, [minWidth, minHeight, maxWidthRatio, maxHeightRatio]);

    const resetSize = useCallback(() => {
        setSize({ w: defaultWidth, h: defaultHeight });
        localStorage.removeItem(storageKey);
    }, [storageKey, defaultWidth, defaultHeight]);

    const startResize = useCallback((edge: "top" | "left" | "topLeft", e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startY = e.clientY;
        // Read current size from DOM-time value via closure over state setter
        let startW = 0;
        let startH = 0;
        setSize(prev => {
            startW = prev.w;
            startH = prev.h;
            return prev;
        });

        disableTextSelection();
        setIsResizing(true);
        resizingRef.current = true;

        const onMouseMove = (ev: MouseEvent) => {
            const dx = startX - ev.clientX; // positive = mouse moved left = wider
            const dy = startY - ev.clientY; // positive = mouse moved up = taller

            const maxW = getMaxWidth();
            const maxH = getMaxHeight();

            setSize(prev => {
                let w = prev.w;
                let h = prev.h;

                if (edge === "left" || edge === "topLeft") {
                    w = clamp(startW + dx, minWidth, maxW);
                }
                if (edge === "top" || edge === "topLeft") {
                    h = clamp(startH + dy, minHeight, maxH);
                }

                if (w === prev.w && h === prev.h) return prev;
                return { w, h };
            });
        };

        const onMouseUp = () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            enableTextSelection();
            setIsResizing(false);
            resizingRef.current = false;

            // Persist final size
            setSize(prev => {
                try {
                    localStorage.setItem(storageKey, JSON.stringify(prev));
                } catch { /* quota exceeded */ }
                return prev;
            });
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }, [storageKey, minWidth, minHeight, maxWidthRatio, maxHeightRatio]);

    return {
        width: size.w,
        height: size.h,
        isResizing,
        resetSize,
        startResize,
    };
}
