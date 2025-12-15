
/**
 *
 * Extends the global Array interface to include a `mapOrElse` method.
 * This method is particularly useful in React for rendering lists
 * or returning a fallback element if the array is empty.
 */

import {ReactElement} from "react";

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