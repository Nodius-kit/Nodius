/**
 * @file HtmlRenderUtility.ts
 * @description Global utility functions for HTML template expressions
 * @module process/html
 *
 * Provides utility functions accessible in HTML template expressions:
 * - LEN: Get length of arrays
 *
 * Key features:
 * - Automatically injected into global window scope
 * - Type-safe helper functions for common operations
 * - Used in workflow expressions and templates
 *
 * @example
 * // In HTML template:
 * // <div>Items: ${LEN(myArray)}</div>
 */

const LEN = (object: any): number => {
    if (Array.isArray(object)) {
        return object.length;
    }
    return 0;
};


export const HtmlUtility = {
    "LEN": LEN,
}

// Inject utilities into global scope for template access
Object.entries(HtmlUtility).forEach(([key, value]) => {
    (window as any)[key] = value;
});