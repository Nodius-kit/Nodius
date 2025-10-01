import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

export type PortalContainer = HTMLElement | (() => HTMLElement | null) | null;

export interface PortalProps {
    /** If `true`, the portal behavior is disabled and children render in place. */
    disablePortal?: boolean;
    /** Container to render into. Can be an HTMLElement or a function that returns one. Defaults to `document.body`. */
    container?: PortalContainer;
    /** Called after the portal content is attached to the DOM. */
    onRendered?: () => void;
    /** Optional className forwarded to the wrapper element when disablePortal is true. */
    className?: string;
    /** Optional style forwarded to the wrapper element when disablePortal is true. */
    style?: React.CSSProperties;
    children?: React.ReactNode;
}

/**
 * A small Portal component inspired by MUI's Portal.
 * - Renders `children` into `container` using ReactDOM.createPortal.
 * - If `disablePortal` is true or during SSR, renders children in place.
 * - Calls `onRendered` when the portal is attached.
 *
 * Usage:
 * ```tsx
 * <Portal>
 *   <div className="p-4 bg-white shadow">I'm rendered into document.body</div>
 * </Portal>
 *
 * // Or into a specific element
 * <Portal container={() => document.getElementById('app-root')}>...</Portal>
 * ```
 */
export default function Portal(props: PortalProps) {
    const { children, container = typeof document !== 'undefined' ? document.body : null, disablePortal = false, onRendered, className, style } = props;

    // For SSR safety: if window is undefined, just render children in place.
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

    // Resolve container (call if function)
    const resolvedContainerRef = useRef<HTMLElement | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        if (!isBrowser) return;

        const resolve = () => {
            if (typeof container === 'function') return container();
            return container;
        };

        resolvedContainerRef.current = resolve() ?? document.body;
        setMounted(true);

        // Invoke onRendered on next tick to mimic effect after mount
        if (onRendered) {
            // Use setTimeout 0 to ensure DOM is ready for consumers that rely on it
            setTimeout(() => onRendered(), 0);
        }

        return () => {
            // cleanup reference
            resolvedContainerRef.current = null;
        };
        // We intentionally don't include `onRendered` in deps to avoid re-calling it unnecessarily
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [container, isBrowser]);

    // If portal disabled, or server-side render, render children in place
    if (disablePortal || !isBrowser) {
        // If children is a single React element, preserve props; otherwise wrap in a div so className/style can be applied
        if (React.isValidElement(children) && typeof children !== 'string') {
            // If a single element, clone it to attach a ref if needed in the future (keeps behaviour predictable)
            return children as React.ReactElement;
        }

        return (
            <div className={className} style={style}>
                {children}
            </div>
        );
    }

    // Wait until we've mounted and resolved the container
    if (!mounted || !resolvedContainerRef.current) return null;

    // createPortal requires a single node; we render children inside a fragment wrapper
    return ReactDOM.createPortal(<>{children}</>, resolvedContainerRef.current);
}
