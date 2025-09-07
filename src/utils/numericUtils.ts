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

export function deepCopy<T>(obj: T): T {
    // Check if the object is null or not an object
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
        const copy: any[] = [];
        for (const element of obj) {
            copy.push(deepCopy(element));
        }
        return copy as unknown as T;
    }

    // Handle objects
    const copy: { [key: string]: any } = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            copy[key] = deepCopy((obj as { [key: string]: any })[key]);
        }
    }
    return copy as T;
}

/**
 * Deeply checks if two objects (dictionaries) are equal.
 * @param obj1 - The first object to compare.
 * @param obj2 - The second object to compare.
 * @returns - True if the objects are equal, false otherwise.
 */
/**
 * Deeply checks if two objects (dictionaries) are equal, with an optional exclusion filter.
 * @param obj1 - The first object to compare.
 * @param obj2 - The second object to compare.
 * @param excludedPaths - An optional array of string paths (e.g., "customer.elements") to exclude from comparison.
 * @param currentPath - Used internally for recursion to track the current path being checked.
 * @returns - True if the objects are equal, false otherwise.
 */
export const deepEqual = (obj1: any, obj2: any, excludedPaths?: string[], currentPath = ''): boolean => {
    // Helper function to format the current path with the new key
    const formatPath = (key: string) => currentPath ? `${currentPath}.${key}` : key;

    // Check if both values are strictly equal
    if (obj1 === obj2) return true;

    // Check if either value is null or not an object (and also not arrays)
    if ((typeof obj1 !== 'object' || obj1 === null) || (typeof obj2 !== 'object' || obj2 === null)) {
        return false;
    }

    // Check if both values are arrays
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
        if (obj1.length !== obj2.length) return false;
        for (let i = 0; i < obj1.length; i++) {
            if (!deepEqual(obj1[i], obj2[i], excludedPaths, formatPath(String(i)))) return false;
        }
        return true;
    }

    // Check if one is an array and the other is not
    if (Array.isArray(obj1) !== Array.isArray(obj2)) {
        return false;
    }

    // Get the keys of both objects
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    // Check if the objects have the same number of keys
    if (keys1.length !== keys2.length) return false;

    // Check if all keys in obj1 exist in obj2 and their corresponding values are equal
    for (const key of keys1) {
        const newPath = formatPath(key);

        // If excludedPaths is defined and the current path is in the exclusion list, skip it
        if (excludedPaths && excludedPaths.includes(newPath)) {
            continue;
        }

        if (!keys2.includes(key)) return false;
        if (!deepEqual(obj1[key], obj2[key], excludedPaths, newPath)) return false;
    }

    return true;
};

/**
 * Inserts an element into an array at the specified index.
 * @param arr - The array to insert into.
 * @param index - The index at which to insert the element.
 * @param element - The element to insert.
 * @returns A new array with the element inserted at the specified index.
 */
export const insertAtIndex = <T>(arr: T[], index: number, element: T): T[] => {
    return [...arr.slice(0, index), element, ...arr.slice(index)];
};