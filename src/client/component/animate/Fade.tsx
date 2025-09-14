import { JSX, useLayoutEffect, useEffect, useRef, useState, cloneElement, memo } from "react";

interface FadeProps {
    children?: JSX.Element;
    in?: boolean;
    timeout?: number; // in ms
    appear?: boolean;
    unmountOnExit?: boolean; // Remove from DOM when exited
    onEntered?: () => void; // Callback when fade in completes
    onExited?: () => void; // Callback when fade out completes
}

// Helper to merge refs
const mergeRefs = <T,>(...refs: any[]) => {
    return (el: T) => {
        refs.forEach(ref => {
            if (!ref) return;
            if (typeof ref === 'function') {
                ref(el);
            } else {
                ref.current = el;
            }
        });
    };
};

type Status = 'entering' | 'entered' | 'exiting' | 'exited';

export const Fade = memo(({ children, in: show = false, timeout = 500, appear = true, unmountOnExit = false, onEntered, onExited }: FadeProps) => {
    const elementRef = useRef<HTMLElement | null>(null);
    const initialStatus = show ? (appear ? 'entering' : 'entered') : 'exited';
    const [status, setStatus] = useState<Status>(initialStatus);
    const initialShouldRender = show || !unmountOnExit;
    const [shouldRender, setShouldRender] = useState(initialShouldRender);

    useEffect(() => {
        if (show) {
            if (!shouldRender) {
                setShouldRender(true);
            }
            setStatus(appear ? 'entering' : 'entered'); // Use appear to decide if to transition on re-mount as well, but for simplicity, always entering on change if appear
        } else {
            if (status === 'entered' || status === 'entering') {
                setStatus('exiting');
            }
        }
    }, [show, shouldRender, appear]);

    useLayoutEffect(() => {
        const el = elementRef.current;
        if (!el) return;

        if (status === 'entering' || status === 'exiting') {
            // Force reflow to trigger transition
            el.style.opacity = status === 'entering' ? '0' : '1';
            void el.offsetHeight; // Force reflow
            el.style.opacity = status === 'entering' ? '1' : '0';
        }
    }, [status]);

    useEffect(() => {
        const el = elementRef.current;
        if (!el) return;

        let handleTransitionEnd: ((e: TransitionEvent) => void) | null = null;

        if (status === 'entering') {
            handleTransitionEnd = (e: TransitionEvent) => {
                if (e.propertyName === 'opacity') {
                    setStatus('entered');
                    onEntered?.();
                }
            };
            el.addEventListener('transitionend', handleTransitionEnd);
        } else if (status === 'exiting') {
            handleTransitionEnd = (e: TransitionEvent) => {
                if (e.propertyName === 'opacity') {
                    setStatus('exited');
                    onExited?.();
                    if (unmountOnExit) {
                        setShouldRender(false);
                    }
                }
            };
            el.addEventListener('transitionend', handleTransitionEnd);
        }

        return () => {
            if (handleTransitionEnd) {
                el.removeEventListener('transitionend', handleTransitionEnd);
            }
        };
    }, [status, onEntered, onExited, unmountOnExit]);

    if (!children || !shouldRender) {
        return <></>;
    }

    const childProps = (children as any).props || {};
    const childRef = childProps.ref;

    return cloneElement(children, {
        ...childProps,
        ref: mergeRefs(elementRef, childRef),
        style: {
            ...childProps.style,
            transition: `opacity ${timeout}ms ease-in-out`,
            opacity: (status === 'entered' || status === 'exiting') ? '1' : '0',
        },
    });
});
Fade.displayName = 'Fade';