import { useEffect, useRef } from "react";

/**
 * Create a dynamic CSS class from input styles.
 *
 * @param css - CSS string (supports :hover, :focus, etc.)
 * @returns A generated class name you can apply to an element.
 */
export function useDynamicClass(css: string): string {
    const classNameRef = useRef(
        "cls-" + Math.random().toString(36).substring(2, 9)
    );

    useEffect(() => {
        const styleTag = document.createElement("style");
        styleTag.setAttribute("data-dynamic-class", classNameRef.current);
        styleTag.innerHTML = css.replace(/&/g, "." + classNameRef.current);
        document.head.appendChild(styleTag);

        return () => {
            styleTag.remove();
        };
    }, [css]);

    return classNameRef.current;
}
