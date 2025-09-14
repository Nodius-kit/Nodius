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

        // Step 1: fade out current
        setVisibleIndex(-1);

        // Step 2: after fade-out, switch child and fade-in
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
                    <div style={{ width: "100%", height: "100%", pointerEvents: index === visibleIndex ? 'inherit':'none', ...(extraCss ?? {}) }}>{
                        index === displayedIndex ? child : null
                    }</div>
                </Fade>
            ))}
        </>
    );
});
