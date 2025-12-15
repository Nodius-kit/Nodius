/**
 * @file useElementSize.ts
 * @description Element size tracking hook using ResizeObserver with zoom correction
 * @module client/hooks
 *
 * Monitors an HTML element's bounding rectangle and automatically updates when the element
 * resizes or the page zooms. Uses ResizeObserver for efficient, native size tracking.
 *
 * Features:
 * - **ResizeObserver**: Native browser API for efficient size tracking
 * - **Zoom Correction**: Automatically adjusts for document.documentElement.style.zoom
 * - **Callback Ref Pattern**: Compatible with React's ref callback pattern
 * - **Auto-Updates**: Fires on element resize, zoom changes
 * - **Cleanup**: Properly disconnects observer on unmount
 * - **Generic Type Support**: Works with any HTMLElement subtype
 *
 * Returns:
 * - refCallBack: Callback ref to attach to the element
 * - bounds: Current DOMRect with zoom-corrected dimensions
 * - ref: Direct reference to the element
 *
 * Zoom Handling:
 * - Reads document.documentElement.style.zoom
 * - Multiplies all DOMRect properties by (1 / zoom)
 * - Ensures consistent measurements regardless of zoom level
 *
 * Use Cases:
 * - Responsive component layouts
 * - Dynamic canvas sizing
 * - Tooltip positioning
 * - Virtualized list item measurements
 * - Column width synchronization in tables
 *
 * @example
 * const { refCallBack, bounds } = useElementSize();
 *
 * return (
 *   <div ref={refCallBack}>
 *     {bounds && `Width: ${bounds.width}px`}
 *   </div>
 * );
 */

import {useCallback, useEffect, useState} from "react";

type UseElementSizeReturn<T> = {
    refCallBack: (node: T | null) => void,
    bounds: DOMRect | undefined,
    ref: T | null
};

/**
 * A hook that returns a callback ref and the current bounding rect
 * of the referenced element, automatically updated by ResizeObserver.
 */
export function useElementSize<T extends HTMLElement = HTMLElement>(): UseElementSizeReturn<T> {
    const [ref, setRef] = useState<T | null>(null);
    const [bounds, setBounds] = useState<DOMRect|undefined>(undefined);

    // Callback ref that we can attach to the element we want to observe
    const refCallback = useCallback((node: T | null) => {
        setRef(node);
    }, []);

    useEffect(() => {
        if (!ref) return;

        const bounds = (rect:DOMRect) => {
            const zoom =  (document.documentElement.style.zoom == undefined || document.documentElement.style.zoom == "") ? 1 : 1 / parseFloat(document.documentElement.style.zoom);
            setBounds({
                height: rect.height*zoom,
                width: rect.width*zoom,
                top: rect.top*zoom,
                bottom: rect.bottom*zoom,
                left: rect.left*zoom,
                right: rect.right*zoom,
                x: rect.x*zoom,
                y: rect.y*zoom,
                toJSON: rect.toJSON
            });
        }

        const observer = new ResizeObserver(entries => {
            const rect = entries[0].target.getBoundingClientRect();
            bounds(rect);
        });

        observer.observe(ref);
        //bounds(ref.getBoundingClientRect());

        // Cleanup when the element or component unmounts
        return () => {
            observer.disconnect();
        };
    }, [ref]);

    return {
        bounds:bounds,
        refCallBack: refCallback,
        ref:ref
    };
}