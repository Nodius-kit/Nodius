/**
 * @file HtmlCss.ts
 * @description Dynamic CSS management with caching and runtime style injection
 * @module html
 *
 * Provides runtime CSS generation and management:
 * - CSSBlock: CSS selector and rules structure
 * - applyCSSBlocks: Apply CSS blocks to DOM elements
 * - removeCSSBlocks: Clean up dynamically added CSS
 * - Caching system: Deduplicates identical CSS rules
 *
 * Key features:
 * - Dynamic style sheet creation and management
 * - Automatic class name generation (css-*)
 * - Selector parsing with & replacement (SCSS-like syntax)
 * - CSS caching to prevent duplicate rules
 * - HTML entity decoding for selectors
 * - Error handling for invalid CSS rules
 */

export interface CSSBlock {
    selector: string;
    rules: string[][]; // Each element is [cssProperty, cssValue]
}

// Cache to deduplicate identical rule sets
const cssCache = new Map<string, string>();
let classCounter = 0;

// Ensure we have a <style> tag in the document
function ensureStyleSheet(): CSSStyleSheet {
    let styleTag = document.getElementById("dynamic-css") as HTMLStyleElement;
    if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.id = "dynamic-css";
        document.head.appendChild(styleTag);
    }
    return styleTag.sheet as CSSStyleSheet;
}

function generateClassName(): string {
    return `css-${classCounter++}`;
}

function rulesToString(rules: string[][]): string {
    return rules.map(([key, value]) => `${key}: ${value}`).join('; ');
}

function parseSelector(selector: string, className: string): string {
    // Handle HTML entity decoding if necessary
    const decodedSelector = selector.replace(/&amp;/g, '&');

    // Replace & with the actual class name
    // This handles &, &:hover, &.other-class, & > child, etc.
    return decodedSelector.replace(/&/g, `.${className}`);
}

export function applyCSSBlocks(el: HTMLElement, blocks: CSSBlock[]): void {
    const sheet = ensureStyleSheet();

    // Generate a single class name for this element
    const className = generateClassName();

    // Add the class to the element
    el.classList.add(className);

    // Process each CSS block
    for (const block of blocks) {
        const finalSelector = parseSelector(block.selector, className);
        const cssText = rulesToString(block.rules);

        // Create cache key based on the final selector and rules
        const cacheKey = `${finalSelector}|${cssText}`;

        // Skip if we've already added this exact rule
        if (cssCache.has(cacheKey)) {
            continue;
        }

        // Build and insert the CSS rule
        const rule = `${finalSelector} { ${cssText} }`;

        try {
            sheet.insertRule(rule, sheet.cssRules.length);
            cssCache.set(cacheKey, className);
        } catch (error) {
            console.error(`Failed to insert CSS rule: ${rule}`, error);
        }
    }
}

export function removeCSSBlocks(el: HTMLElement, blocks: CSSBlock[]): void {
    // Remove all dynamically added classes
    const classesToRemove = Array.from(el.classList).filter(cls => cls.startsWith('css-'));
    classesToRemove.forEach(cls => el.classList.remove(cls));


}