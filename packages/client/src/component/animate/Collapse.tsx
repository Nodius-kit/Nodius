/**
 * @file Collapse.tsx
 * @description Vertical collapse/expand animation component with height transitions
 * @module animate
 *
 * Provides smooth height-based collapse animation:
 * - Collapse: Height transition component with enter/exit states
 * - Configurable timing: Customizable timeout for enter and exit transitions
 * - Lifecycle callbacks: onEnter, onEntering, onEntered, onExit, onExiting, onExited
 * - Flexible mounting: mountOnEnter and unmountOnExit options
 *
 * Key features:
 * - Smooth height transitions with easing functions
 * - Auto height detection for dynamic content
 * - Collapsed size configuration (default 0px)
 * - Visibility management during transitions
 * - Custom component support (default div)
 */

import React, { useRef, useState, useEffect, CSSProperties } from 'react';

interface CollapseProps {

    in: boolean;
    children?: React.ReactNode;
    timeout?: number | { enter?: number; exit?: number };
    easing?: string;
    onEnter?: () => void;
    onEntering?: () => void;
    onEntered?: () => void;
    onExit?: () => void;
    onExiting?: () => void;
    onExited?: () => void;
    collapsedSize?: string | number;
    unmountOnExit?: boolean;
    mountOnEnter?: boolean;
    className?: string;
    style?: CSSProperties;
    component?: React.ElementType;
}

type TransitionState = 'unmounted' | 'exited' | 'entering' | 'entered' | 'exiting';

export const Collapse: React.FC<CollapseProps> = ({
                                                      in: inProp,
                                                      children,
                                                      timeout = 300,
                                                      easing = 'cubic-bezier(0.4, 0, 0.2, 1)',
                                                      onEnter,
                                                      onEntering,
                                                      onEntered,
                                                      onExit,
                                                      onExiting,
                                                      onExited,
                                                      collapsedSize = '0px',
                                                      unmountOnExit = false,
                                                      mountOnEnter = false,
                                                      className = '',
                                                      style = {},
                                                      component: Component = 'div'
                                                  }) => {
    const [state, setState] = useState<TransitionState>(() => {
        if (mountOnEnter && !inProp) {
            return 'unmounted';
        }
        return inProp ? 'entered' : 'exited';
    });

    const containerRef = useRef<HTMLElement>(null);
    const heightRef = useRef<number | 'auto'>('auto');
    const timerRef = useRef<NodeJS.Timeout>(undefined);

    // Parse timeout values for separate enter/exit durations
    const enterTimeout = typeof timeout === 'object' ? timeout.enter || 300 : timeout;
    const exitTimeout = typeof timeout === 'object' ? timeout.exit || 300 : timeout;

    // Parse collapsed size
    const parsedCollapsedSize = typeof collapsedSize === 'number'
        ? `${collapsedSize}px`
        : collapsedSize;

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        if (inProp && (state === 'exited' || state === 'unmounted')) {
            // Entering: transition from collapsed to full height
            setState('entering');
            onEnter?.();

            // Get the actual height
            container.style.height = 'auto';
            const actualHeight = container.scrollHeight;
            heightRef.current = actualHeight;

            // Start from collapsed size
            container.style.height = parsedCollapsedSize;

            // Force reflow
            container.offsetHeight;

            // Animate to full height
            requestAnimationFrame(() => {
                onEntering?.();
                container.style.transition = `height ${enterTimeout}ms ${easing}`;
                container.style.height = `${actualHeight}px`;
            });

            timerRef.current = setTimeout(() => {
                setState('entered');
                if (container) {
                    container.style.height = 'auto';
                    container.style.transition = '';
                }
                onEntered?.();
            }, enterTimeout);

        } else if (!inProp && state === 'entered') {
            // Exiting: transition from full height to collapsed
            setState('exiting');
            onExit?.();

            // Get current height
            const actualHeight = container.scrollHeight;
            container.style.height = `${actualHeight}px`;

            // Force reflow
            container.offsetHeight;

            // Animate to collapsed size
            requestAnimationFrame(() => {
                onExiting?.();
                container.style.transition = `height ${exitTimeout}ms ${easing}`;
                container.style.height = parsedCollapsedSize;
            });

            timerRef.current = setTimeout(() => {
                setState('exited');
                if (container) {
                    container.style.transition = '';
                }
                onExited?.();
            }, exitTimeout);
        }
    }, [inProp, state, enterTimeout, exitTimeout, easing, parsedCollapsedSize,
        onEnter, onEntering, onEntered, onExit, onExiting, onExited]);

    // Handle unmounting
    if (state === 'unmounted' || (state === 'exited' && unmountOnExit)) {
        return null;
    }

    const getStyles = (): CSSProperties => {
        const baseStyles: CSSProperties = {
            overflow: 'hidden',
            minHeight: parsedCollapsedSize,
            ...style
        };

        if (state === 'exited' && !inProp) {
            baseStyles.height = parsedCollapsedSize;
            baseStyles.visibility = parsedCollapsedSize === '0px' ? 'hidden' : undefined;
        }

        return baseStyles;
    };

    return (
        <Component
            ref={containerRef}
            className={className}
            style={getStyles()}
        >
            <div>
                {children}
            </div>
        </Component>
    );
};
