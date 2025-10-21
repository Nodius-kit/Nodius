/**
 * @file numericUtils.ts
 * @description Numeric and geometric utility functions for coordinate calculations
 * @module utils
 *
 * Provides utilities for coordinate and bounds checking:
 * - isPointInRect: Check if point is within rectangle bounds
 * - isXInRect: Check if x-coordinate is within horizontal bounds
 * - isYInRect: Check if y-coordinate is within vertical bounds
 *
 * Key features:
 * - DOMRect boundary checking
 * - Coordinate validation for UI interactions
 * - Used for drag-and-drop, hover detection, etc.
 */

/**
 * Checks if a point (x, y) is inside a DOMRect.
 * @param x - The x-coordinate of the point.
 * @param y - The y-coordinate of the point.
 * @param rect - The DOMRect to check against.
 * @returns True if the point is inside the DOMRect, false otherwise.
 */
export const isPointInRect = (x: number, y: number, rect: DOMRect): boolean => {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
};

/**
 * Checks if an x-coordinate is within the horizontal bounds of a DOMRect.
 * @param x - The x-coordinate to check.
 * @param rect - The DOMRect to check against.
 * @returns True if the x-coordinate is within the DOMRect's width, false otherwise.
 */
export const isXInRect = (x: number, rect: DOMRect): boolean => {
    return x >= rect.left && x <= rect.right;
};

/**
 * Checks if a y-coordinate is within the vertical bounds of a DOMRect.
 * @param y - The y-coordinate to check.
 * @param rect - The DOMRect to check against.
 * @returns True if the y-coordinate is within the DOMRect's height, false otherwise.
 */
export const isYInRect = (y: number, rect: DOMRect): boolean => {
    return y >= rect.top && y <= rect.bottom;
};