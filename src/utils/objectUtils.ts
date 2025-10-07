import { ReactElement } from "react";

export function deepCopy<T>(obj: T): T {
    /*
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
    return copy as T;*/
    return structuredClone(obj);
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


// Utility: strips unknown keys
export const pickKeys = <T extends object>(obj: any, allowed: (keyof T)[]): T => {
    const result: Partial<T> = {};
    for (const key of allowed) {
        if (key in obj) {
            result[key] = obj[key];
        }
    }
    return result as T;
}


export const forwardMouseEvents = (sourceEl: HTMLElement, targetEl: HTMLElement)=>  {
    const events = ["wheel", "mouseup", "mousemove", "mousedown"] as const;

    events.forEach(eventType => {
        sourceEl.addEventListener(eventType, (e: Event) => {
            let newEvent: Event;

            if (e.type === "wheel" && e instanceof WheelEvent) {
                newEvent = new WheelEvent("wheel", {
                    bubbles: true,
                    cancelable: true,
                    view: e.view,
                    deltaX: e.deltaX,
                    deltaY: e.deltaY,
                    deltaZ: e.deltaZ,
                    deltaMode: e.deltaMode,
                    screenX: e.screenX,
                    screenY: e.screenY,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    ctrlKey: e.ctrlKey,
                    altKey: e.altKey,
                    shiftKey: e.shiftKey,
                    metaKey: e.metaKey,
                    button: e.button,
                    buttons: e.buttons,
                    relatedTarget: targetEl,
                });
            } else if (e instanceof MouseEvent) {
                newEvent = new MouseEvent(e.type, {
                    bubbles: true,
                    cancelable: true,
                    view: e.view,
                    detail: e.detail,
                    screenX: e.screenX,
                    screenY: e.screenY,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    ctrlKey: e.ctrlKey,
                    altKey: e.altKey,
                    shiftKey: e.shiftKey,
                    metaKey: e.metaKey,
                    button: e.button,
                    buttons: e.buttons,
                    relatedTarget: targetEl,
                });
            } else {
                return;
            }

            targetEl.dispatchEvent(newEvent);
        });
    });
}

/**
 *
 * Extends the global Array interface to include a `mapOrElse` method.
 * This method is particularly useful in React for rendering lists
 * or returning a fallback element if the array is empty.
 */

/**
 * Extend the global Array<T> interface by declaring a new method `mapOrElse`.
 * This method either maps each item in the array to a ReactElement (or string)
 * if the array is non-empty, or returns a single ReactElement (or string)
 * if the array is empty.
 */
declare global {
    interface Array<T> {
        /**
         * If the array is non-empty, applies `callbackfn` to every element and returns
         * an array of ReactElements or strings. If the array is empty, returns
         * the result of `elseFn()` (a single ReactElement or string).
         *
         * @param callbackfn - The function called for each element in a non-empty array.
         * @param elseFn - The function returning a single ReactElement or string if the array is empty.
         * @returns An array of mapped results, or a single fallback element/string if empty.
         */
        mapOrElse(
            callbackfn: (value: T, index: number, array: T[]) => ReactElement | string,
            elseFn: () => ReactElement | string
        ): (ReactElement | string)[] | ReactElement | string;
    }
}

/**
 * Only define `mapOrElse` if it isn't already present on the Array prototype.
 * This guards against potential redefinition if this file is imported multiple times.
 */
if (!Array.prototype.mapOrElse) {
    Array.prototype.mapOrElse = function <T, U>(
        this: T[],
        callbackfn: (value: T, index: number, array: T[]) => U,
        elseFn: () => U
    ): U[] | U {
        // If the array is empty, return a single fallback value
        if (this.length === 0) {
            return elseFn();
        }
        // Otherwise, map each element with callbackfn
        return this.map(callbackfn);
    };
}


export const disableTextSelection = () => {
    (document.body.style as any).userSelect = 'none';
    (document.body.style as any).webkitUserSelect = 'none';
    (document.body.style as any).mozUserSelect = 'none';
    (document.body.style as any).msUserSelect = 'none';
}

// Re-enable text selection
export const enableTextSelection = ()=>  {
    (document.body.style as any).userSelect = 'text';
    (document.body.style as any).webkitUserSelect = 'text';
    (document.body.style as any).mozUserSelect = 'text';
    (document.body.style as any).msUserSelect = 'text';
}

export interface Rect {
    x:number,
    y:number,
    width:number,
    height:number,
}

export const documentHaveActiveElement = () => {
    const active = document.activeElement as HTMLElement;

    const isTyping =
        active?.tagName === "INPUT" ||
        active?.tagName === "TEXTAREA" ||
        active?.isContentEditable;

    const selection = window.getSelection();
    const hasSelection = selection && selection.toString().length > 0;

    // If typing OR selecting text, don’t block shortcuts
    if (isTyping || hasSelection) {
        return true;
    }
    return false;
}

export const travelObject = (
    obj: any,
    callback: (o: Record<string, any>) => boolean
): boolean => {
    // Only process non-null objects
    if (obj && typeof obj === "object") {
        if (!callback(obj)) {
            return false;
        }

        if (Array.isArray(obj)) {
            for (const item of obj) {
                if (!travelObject(item, callback)) {
                    return false;
                }
            }
        } else {
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const value = obj[key];
                    if (typeof value === "object" && value !== null) {
                        if (!travelObject(value, callback)) {
                            return false;
                        }
                    }
                }
            }
        }
    }

    return true;
};
