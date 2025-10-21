/**
 * @file MultiFade.tsx
 * @description Multi-element crossfade animation component for smooth content switching
 * @module animate
 *
 * Provides crossfade transitions between multiple children:
 * - MultiFade: Manages fade transitions between indexed children
 * - Two-step transition: Fade out current, then fade in new
 * - Pointer events control: Disables interaction during transitions
 * - Selective rendering: Only renders active child in DOM
 *
 * Key features:
 * - Active index-based child selection
 * - Sequential fade-out then fade-in animation
 * - unmountOnExit for non-active children
 * - Custom CSS support via extraCss prop
 * - Built on top of Fade component for consistent behavior
 */

import React, {CSSProperties, memo, useEffect, useState} from "react";
import {Fade} from "./Fade";

interface MultiFadeProps {
    active: number;
    timeout?: number;
    children: React.ReactNode[];
    extraCss?:CSSProperties
}

export const MultiFade = memo(({
                                                        active,
                                                        timeout = 500,
                                                        children,
                                                        extraCss
                                                    }:MultiFadeProps) => {
    const [displayedIndex, setDisplayedIndex] = useState(active);
    const [visibleIndex, setVisibleIndex] = useState(active);

    useEffect(() => {
        if (active === displayedIndex) return;

        // Two-step crossfade process
        // Step 1: Fade out current child
        setVisibleIndex(-1);

        // Step 2: After fade-out completes, switch to new child and fade in
        const timer = setTimeout(() => {
            setDisplayedIndex(active);
            setVisibleIndex(active);
        }, timeout);

        return () => clearTimeout(timer);
    }, [active, displayedIndex, timeout]);

    return (
        <>
            {React.Children.map(children, (child, index) => (
                <Fade in={index === visibleIndex} timeout={timeout} unmountOnExit={true}>
                    <div style={{ width: "100%", height: "100%", pointerEvents: index === visibleIndex ? 'inherit':'none', ...(extraCss ?? {}) }} data-multifade={index}>{
                        index === displayedIndex ? child : null
                    }</div>
                </Fade>
            ))}
        </>
    );
});
