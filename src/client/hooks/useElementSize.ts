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