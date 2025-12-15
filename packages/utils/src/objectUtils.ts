/**
 * @file objectUtils.ts
 * @description Object manipulation utilities for deep operations
 * @module utils
 *
 * Provides utilities for deep object operations:
 * - deepCopy: Create deep clone of objects using structuredClone
 * - deepEqual: Deep equality comparison with path exclusion
 * - pickKeys: Type-safe key selection from objects
 * - travelObject: Recursive object traversal with callbacks
 * - Text selection utilities: Enable/disable text selection
 *
 * Key features:
 * - structuredClone for efficient deep copying
 * - Configurable path exclusion in equality checks
 * - Type-safe object key picking
 * - Recursive traversal with early exit
 * - DOM text selection control
 */


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
    return copy as T;;
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


/**
 * Converts a `Map` to a plain object (dictionary).
 *
 * @param map - The `Map` to be converted to a plain object (dictionary).
 *              It is of type `any`, meaning it can accept any input, but it expects a `Map`.
 * @returns A plain object (dictionary) created from the key-value pairs in the `Map`.
 *          The resulting object will have keys and values corresponding to those in the `Map`.
 */
export const mapToDict = (map: any):any => Object.fromEntries(map);

/**
 * Converts a plain object (dictionary) back into a `Map`.
 *
 * @param dic - The dictionary (plain object) to be converted into a `Map`.
 *              It is of type `any`, meaning it can accept any input, but it expects a plain object.
 * @returns A `Map` created from the key-value pairs in the dictionary.
 *          The resulting `Map` will have the same keys and values as the original plain object.
 */
export const dictToMap = (dic: any):any => new Map(Object.entries(dic));



export interface TextChangeInfo {
    insert:string,
    from:number,
    to?:number
}
export function getTextChanges(base: string, newText: string): TextChangeInfo[] {
    const n = base.length;
    const m = newText.length;
    const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (base[i - 1] === newText[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    const ops: { type: 'match' | 'insert' | 'delete'; char: string }[] = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && base[i - 1] === newText[j - 1]) {
            ops.push({ type: 'match', char: base[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            ops.push({ type: 'insert', char: newText[j - 1] });
            j--;
        } else if (i > 0) {
            ops.push({ type: 'delete', char: base[i - 1] });
            i--;
        }
    }
    ops.reverse();

    const changes: TextChangeInfo[] = [];
    let pos = 0;
    let delStart: number | null = null;
    let insertBuf = '';

    const flush = () => {
        if (insertBuf || delStart !== null) {
            const from = delStart !== null ? delStart : pos;
            const to = delStart !== null ? pos : undefined;
            changes.push({ insert: insertBuf, from, to });
        }
        delStart = null;
        insertBuf = '';
    };

    for (const op of ops) {
        if (op.type === 'match') {
            flush();
            pos++;
        } else if (op.type === 'insert') {
            insertBuf += op.char;
        } else if (op.type === 'delete') {
            if (insertBuf) {
                // Flush pending insert before starting delete
                changes.push({ insert: insertBuf, from: pos, to: undefined });
                insertBuf = '';
            }
            if (delStart === null) {
                delStart = pos;
            }
            pos++;
        }
    }
    flush();

    return changes;
}

export function applyTextChanges(base: string, changes: TextChangeInfo[]): string {
    // Sort changes by 'from' to ensure correct order
    const sortedChanges = [...changes].sort((a, b) => a.from - b.from);

    let result = '';
    let pos = 0;

    for (const change of sortedChanges) {
        // Append unchanged part
        result += base.slice(pos, change.from);

        // Append the insertion
        result += change.insert;

        // Update position: if 'to' is defined, skip to 'to'; else, stay at 'from'
        pos = change.to !== undefined ? change.to : change.from;
    }

    // Append the remaining part after the last change
    result += base.slice(pos);

    return result;
}

/**
 * Represents a 2D point in world or screen coordinates
 */
export interface Point {
    x: number;
    y: number;
}

export interface Rect { x: number; y: number; width: number; height: number }
