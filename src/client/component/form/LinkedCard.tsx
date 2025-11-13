/**
 * @file LinkedCard.tsx
 * @description Floating card component that positions itself relative to a reference element
 * @module component/form
 *
 * Creates a floating card (tooltip, popover, dropdown) that automatically positions itself
 * relative to a reference element. Features advanced positioning logic with:
 * - **Automatic Positioning**: Calculates optimal placement (top, bottom, left, right)
 * - **Viewport Boundary Detection**: Prevents overflow by adjusting position dynamically
 * - **Scroll Tracking**: Maintains position during scroll events (including nested scrolling)
 * - **Resize Handling**: Updates position when window or reference element resizes
 * - **DOM Mutation Tracking**: Responds to layout changes that might affect positioning
 * - **Fade Animation**: Smooth entry/exit transitions using Fade component
 * - **Portal Rendering**: Renders outside parent DOM hierarchy to avoid clipping
 * - **Background Overlay**: Optional semi-transparent backdrop with click-to-close
 *
 * Positioning System:
 * - Uses useLinkedPosition hook for position calculation
 * - Monitors scroll, resize, and DOM mutations for real-time updates
 * - Adjusts position to keep card within viewport boundaries
 * - Supports 4 placement directions with customizable offset
 *
 * Common Use Cases:
 * - Tooltips with rich content
 * - Context menus
 * - Dropdown panels
 * - Popovers
 * - Autocomplete suggestions
 */

import {memo, PropsWithChildren, useMemo, useState, useEffect, useRef} from "react";
import {Fade} from "../animate/Fade";
import Portal from "../Portal";

interface Position {
    top: number;
    left: number;
    visible: boolean;
}

interface LinkedCardProps {
    element: HTMLElement; // ref element, where the card overlay should position
    show?: boolean,
    width: number, // width of the card where the element will be
    height: number, // height,
    placement?: "top" | "bottom" | "left" | "right",
    offset?: number,
    onClose?: () => void,
    background?:boolean,
    closeOnBackgroundClick?: boolean,
    zIndex?: number,
}

/**
 * Custom hook to calculate and maintain the position of an element relative to a reference element
 * Automatically updates position on scroll, resize, and DOM changes
 */
const useLinkedPosition = (
    element: HTMLElement | null,
    width: number,
    height: number,
    placement: "top" | "bottom" | "left" | "right",
    offset: number
): Position => {
    const [position, setPosition] = useState<Position>({ top: 0, left: 0, visible: false });

    const calculatePosition = useMemo(() => {
        return () => {
            if (!element) return;

            const rect = element.getBoundingClientRect();
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;

            let top: number, left: number;

            switch (placement) {
                case 'top':
                    top = rect.top + scrollY - height - offset;
                    left = rect.left + scrollX + (rect.width - width) / 2;
                    break;

                case 'bottom':
                    top = rect.bottom + scrollY + offset;
                    left = rect.left + scrollX + (rect.width - width) / 2;
                    break;

                case 'left':
                    top = rect.top + scrollY + (rect.height - height) / 2;
                    left = rect.left + scrollX - width - offset;
                    break;

                case 'right':
                default:
                    top = rect.top + scrollY + (rect.height - height) / 2;
                    left = rect.right + scrollX + offset;
                    break;
            }

            // Viewport boundary checks to prevent overflow
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Adjust horizontal position if overflowing
            if (left + width > viewportWidth + scrollX) {
                left = viewportWidth + scrollX - width - 10; // 10px margin from edge
            }
            if (left < scrollX) {
                left = scrollX + 10;
            }

            // Adjust vertical position if overflowing
            if (top + height > viewportHeight + scrollY) {
                top = viewportHeight + scrollY - height - 10;
            }
            if (top < scrollY) {
                top = scrollY + 10;
            }

            setPosition({ top, left, visible: true });
        };
    }, [element, width, height, placement, offset]);

    useEffect(() => {
        if (!element) return;

        // Initial position calculation
        calculatePosition();

        // Event handlers for position updates
        const handleUpdate = () => calculatePosition();

        // Listen to scroll events on all parents (capture phase)
        window.addEventListener('scroll', handleUpdate, { capture: true, passive: true });

        // Listen to window resize
        window.addEventListener('resize', handleUpdate);

        // Observe size changes of the reference element
        const resizeObserver = new ResizeObserver(handleUpdate);
        resizeObserver.observe(element);

        // Observe DOM mutations that might affect positioning
        const mutationObserver = new MutationObserver(handleUpdate);
        mutationObserver.observe(document.documentElement, {
            attributes: true,
            childList: true,
            subtree: true,
            attributeFilter: ['style', 'class']
        });

        // Cleanup function
        return () => {
            window.removeEventListener('scroll', handleUpdate, { capture: true });
            window.removeEventListener('resize', handleUpdate);
            resizeObserver.disconnect();
            mutationObserver.disconnect();
        };
    }, [calculatePosition]);

    return position;
};

export const LinkedCard = memo(({
                                    show = true,
                                    element,
                                    height,
                                    width,
                                    placement = "right",
                                    offset = 10,
                                    children,
                                    closeOnBackgroundClick,
                                    onClose,
                                    background,
                                    zIndex
                                }: PropsWithChildren<LinkedCardProps>) => {

    // Calculate position using our custom hook
    const position = useLinkedPosition(element, width, height, placement, offset);
    const isFirstRender = useRef<boolean>(true);

    // Memoize card styles to prevent unnecessary re-renders
    const cardStyles = useMemo(() => ({
        position: 'absolute' as const,
        top: position.top,
        left: position.left,
        width: width,
        height: height,
        // Add some default styling for the card
        backgroundColor: 'var(--nodius-background-default)',
        border: '2px solid var(--nodius-background-paper)',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        overflow: 'hidden',

    }), [position.top, position.left, width, height, zIndex]);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        if (!position.visible) {
            onClose?.();
        }
    }, [position.visible, onClose]);

    return (
        <Portal container={document.documentElement}>
            <div style={{position:"absolute", inset:"0px", pointerEvents:background ? "all" : "none", backgroundColor:background?"rgba(0,0,0,0.2)" :"transparent", zIndex:zIndex}} onClick={() => {
                if(closeOnBackgroundClick) {
                    onClose?.();
                }
            }}>
                <Fade in={show && position.visible} timeout={200} unmountOnExit>
                    <div style={cardStyles} onClick={(evt) => evt.stopPropagation()}>
                        {children}
                    </div>
                </Fade>
            </div>
        </Portal>
    );
});