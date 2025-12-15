/**
 * @file ResizeBar.tsx
 * @description Interactive resize handle for adjustable panel layouts
 * @module animate
 *
 * Provides draggable resize bars for panel resizing:
 * - ResizeBar: Draggable divider for horizontal or vertical resizing
 * - Min/max constraints: Configurable value boundaries
 * - Glue positioning: Attach to any edge (top, bottom, left, right)
 * - Lifecycle hooks: beforeResize and afterResize callbacks
 *
 * Key features:
 * - Smooth mouse-based resizing with delta tracking
 * - Text selection disabled during drag for better UX
 * - Visual indicator with themed colors
 * - Optional offset positioning outside parent
 * - Collapsible with show/hide animation
 * - Cursor changes based on resize direction
 */

import React, {CSSProperties, memo, useContext} from "react";
import {Collapse} from "./Collapse";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";
import {disableTextSelection, enableTextSelection} from "@nodius/utils";

interface ResizeBarProps {
    type: "vertical" | "horizontal";
    glueTo: "right" | "left" | "top" | "bottom";
    offsetBar?:boolean;
    value: number,
    setValue: (value: number) => void;
    maxValue?: number;
    minValue?: number;
    show?: boolean;
    beforeResize?: () => void;
    afterResize?: () => void;
    aditionnalStyle?: CSSProperties;
}

export const ResizeBar = memo(({
                                   glueTo,
                                   offsetBar,
                                   type,
                                   setValue,
                                   value,
                                   show = true,
                                   afterResize,
                                   beforeResize,
                                   minValue = -Infinity,
                                   maxValue = Infinity,
                                   aditionnalStyle
                               }:ResizeBarProps) => {

    const Theme = useContext(ThemeContext);

    const barWidth = 8;

    // Build dynamic styles based on type and position
    const style:CSSProperties = {
        ...aditionnalStyle,
        position:"absolute",
    }
    // Set dimensions based on vertical/horizontal type
    if(type === "vertical") {
        style.width = barWidth+"px";
        style.height = "100%";
    } else {
        style.width = "100%";
        style.height = barWidth+"px";
    }

    if(glueTo === "top") {
        style.top = offsetBar ? (-barWidth)+"px" : "0px";
    } else if(glueTo === "left") {
        style.left = offsetBar ? (-barWidth)+"px" : "0px";
    } else if(glueTo === "right") {
        style.right = offsetBar ? (-barWidth)+"px" : "0px";
    } else if(glueTo === "bottom") {
        style.bottom = offsetBar ? (-barWidth)+"px" : "0px";
    }

    style.display = "flex";
    style.justifyContent = "center";
    style.alignItems = "center";
    style.backgroundColor = "var(--nodius-background-resizeBar)";
    style.cursor = type === "vertical" ? "col-resize" : "row-resize"




    /**
     * Handles mouse down to initiate drag operation
     * Sets up move and up handlers for tracking resize
     */
    const mouseDown = (evt:React.MouseEvent) => {
        const startX = evt.clientX;
        const startY = evt.clientY;
        const baseValue = value;

        beforeResize?.();

        // Track mouse movement to calculate delta and update value
        const mouseMove = (evt:MouseEvent) => {
            const newX = evt.clientX;
            const newY = evt.clientY;

            if (type === "vertical") {
                const deltaX = newX - startX;
                const newValue = baseValue + deltaX;
                setValue(Math.min(maxValue, Math.max(minValue, newValue)));
            } else if (type === "horizontal") {
                const deltaY = newY - startY;
                const newValue = baseValue + deltaY;
                setValue(Math.min(maxValue, Math.max(minValue, newValue)));
            }
        }

        // Clean up event listeners on mouse release
        const mouseUp = () => {
            window.removeEventListener("mouseout", mouseUp);
            window.removeEventListener("mouseup", mouseUp);
            window.removeEventListener("mousemove", mouseMove);
            enableTextSelection();
            afterResize?.();
        }
        disableTextSelection();
        window.addEventListener("mouseup", mouseUp);
        window.addEventListener("mousemove", mouseMove);

    }

    return (
        <Collapse in={show} timeout={200} >
            <div style={style} onMouseDown={mouseDown}>
                <div style={{
                    height: type === "vertical" ? 40 : barWidth/2,
                    width: type === "horizontal" ? 40 : barWidth/2,
                    backgroundColor:Theme.state.changeBrightness(Theme.state.background[Theme.state.theme].resizeBar, 0.5, Theme.state.theme === "dark" ? "positive" : "negative"),
                    borderRadius:barWidth/2
                }}>

                </div>
            </div>
        </Collapse>
    )
})