/**
 * @file useDynamicClass.ts
 * @description Dynamic CSS class generation hook for runtime styling
 * @module client/hooks
 *
 * Generates unique CSS classes from CSS strings at runtime and injects them into the DOM.
 * Supports advanced CSS features like pseudo-classes, pseudo-elements, and nested selectors.
 *
 * Features:
 * - **Runtime CSS**: Create styles dynamically without CSS files
 * - **Unique Class Names**: Auto-generated class names prevent conflicts
 * - **SCSS-like Syntax**: Use "&" as placeholder for the generated class
 * - **Pseudo-Classes**: Full support for :hover, :focus, :active, etc.
 * - **Auto-Cleanup**: Removes <style> tag when component unmounts
 * - **Re-rendering**: Updates styles when css parameter changes
 *
 * Implementation:
 * - Generates random class name using Math.random()
 * - Creates <style> tag with data-dynamic-class attribute
 * - Replaces "&" in CSS string with actual class name
 * - Appends to document.head
 * - Cleanup on unmount prevents memory leaks
 *
 * Use Cases:
 * - Theme-aware components with computed colors
 * - Dynamic styling based on props
 * - Inline styles with pseudo-class support
 * - Component libraries without static CSS
 *
 * @example
 * const buttonClass = useDynamicClass(`
 *   & {
 *     background: ${Theme.state.primary};
 *     padding: 10px;
 *   }
 *   &:hover {
 *     background: ${Theme.state.primaryDark};
 *   }
 * `);
 * return <button className={buttonClass}>Click me</button>
 */

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
