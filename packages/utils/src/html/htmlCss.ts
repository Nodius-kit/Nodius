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

// Track parent classes added to ancestor elements for cleanup
const parentClassesMap = new WeakMap<HTMLElement, Map<HTMLElement, string[]>>();

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
    return `nodius-css-${classCounter++}`;
}

function normalizeValue(value: string): string {
    // Handle !important without space: "red!important" → "red !important"
    return value.replace(/([^ ])!important/gi, '$1 !important');
}

function rulesToString(rules: string[][]): string {
    return rules.map(([key, value]) => `${key}: ${normalizeValue(value)}`).join('; ');
}

interface ParsedSelector {
    selector: string;
    parentDepth: number; // How many :parent levels (0 = current element)
}

function parseSelector(selector: string, className: string): ParsedSelector {
    // Handle HTML entity decoding if necessary
    let decodedSelector = selector.replace(/&lt;/g, '<')
                                  .replace(/&gt;/g, '>')
                                  .replace(/&amp;/g, '&')
                                  .replace(/&quot;/g, '"')
                                  .replace(/&#39;/g, "'");

    // Count and remove :parent pseudo-selectors
    // Matches &:parent, &:parent:parent, etc.
    let parentDepth = 0;
    const parentPattern = /:parent/g;
    const matches = decodedSelector.match(parentPattern);
    if (matches) {
        parentDepth = matches.length;
        // Remove all :parent from the selector
        decodedSelector = decodedSelector.replace(parentPattern, '');
    }

    // Replace & with the actual class name
    // This handles &, &:hover, &.other-class, & > child, etc.
    const finalSelector = decodedSelector.replace(/&/g, `.${className}`);

    return { selector: finalSelector, parentDepth };
}

function getAncestor(el: HTMLElement, depth: number): HTMLElement | null {
    let current: HTMLElement | null = el;
    for (let i = 0; i < depth && current; i++) {
        current = current.parentElement;
    }
    return current;
}

export function applyCSSBlocks(el: HTMLElement, blocks: CSSBlock[]): void {
    const sheet = ensureStyleSheet();

    // Track classes added to ancestor elements for this element
    const ancestorClasses = new Map<HTMLElement, string[]>();

    // Process each CSS block
    for (const block of blocks) {
        // Generate a class name for this block
        const className = generateClassName();

        const { selector: finalSelector, parentDepth } = parseSelector(block.selector, className);
        const cssText = rulesToString(block.rules);

        // Determine target element based on parent depth
        const targetEl = parentDepth > 0 ? getAncestor(el, parentDepth) : el;

        if (!targetEl) {
            console.warn(`Cannot find ancestor at depth ${parentDepth} for selector: ${block.selector}`);
            continue;
        }

        // Add the class to the target element
        targetEl.classList.add(className);

        // Track parent classes for cleanup
        if (parentDepth > 0) {
            if (!ancestorClasses.has(targetEl)) {
                ancestorClasses.set(targetEl, []);
            }
            ancestorClasses.get(targetEl)!.push(className);
        }

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

    // Store ancestor classes map for cleanup
    if (ancestorClasses.size > 0) {
        parentClassesMap.set(el, ancestorClasses);
    }
}

export function removeCSSBlocks(el: HTMLElement, blocks: CSSBlock[]): void {
    // Remove all dynamically added classes from the element
    const classesToRemove = Array.from(el.classList).filter(cls => cls.startsWith('nodius-css-'));
    classesToRemove.forEach(cls => el.classList.remove(cls));

    // Remove classes added to ancestor elements via :parent
    const ancestorClasses = parentClassesMap.get(el);
    if (ancestorClasses) {
        for (const [ancestorEl, classes] of ancestorClasses) {
            classes.forEach(cls => ancestorEl.classList.remove(cls));
        }
        parentClassesMap.delete(el);
    }
}