/**
 * @file editorCompletions.ts
 * @description Custom autocompletion definitions for CodeMirror editor
 * @module client/component/code
 *
 * Provides custom completion items for common browser APIs and utilities.
 * These completions enhance the developer experience by providing:
 * - Type information
 * - Helpful descriptions
 * - Function signatures
 * - Proper categorization
 */

import { Completion } from '@codemirror/autocomplete';

/**
 * Browser Window API completions
 * Includes common window properties, methods, and utilities
 */
export const windowCompletions: Completion[] = [
    {
        label: "window",
        type: "variable",
        info: "The global window object representing the browser window",
        detail: "Global object",
        boost: 99
    },
    {
        label: "window.location",
        type: "property",
        info: "Information about the current URL",
        detail: "Location",
        boost: 90
    },
    {
        label: "window.localStorage",
        type: "property",
        info: "Access to browser's local storage",
        detail: "Storage",
        boost: 90
    },
    {
        label: "window.sessionStorage",
        type: "property",
        info: "Access to browser's session storage",
        detail: "Storage",
        boost: 90
    },
    {
        label: "window.console",
        type: "property",
        info: "Browser console for logging",
        detail: "Console",
        boost: 90
    },
    {
        label: "window.alert()",
        type: "function",
        info: "Display an alert dialog",
        detail: "(message: string) => void",
        boost: 85
    },
    {
        label: "window.confirm()",
        type: "function",
        info: "Display a confirmation dialog",
        detail: "(message: string) => boolean",
        boost: 85
    },
    {
        label: "window.prompt()",
        type: "function",
        info: "Display a prompt dialog",
        detail: "(message: string, default?: string) => string | null",
        boost: 85
    },
    {
        label: "window.setTimeout()",
        type: "function",
        info: "Execute code after a delay",
        detail: "(callback: Function, ms: number) => number",
        boost: 85
    },
    {
        label: "window.setInterval()",
        type: "function",
        info: "Execute code repeatedly at intervals",
        detail: "(callback: Function, ms: number) => number",
        boost: 85
    },
    {
        label: "window.clearTimeout()",
        type: "function",
        info: "Cancel a timeout",
        detail: "(id: number) => void",
        boost: 85
    },
    {
        label: "window.clearInterval()",
        type: "function",
        info: "Cancel an interval",
        detail: "(id: number) => void",
        boost: 85
    },
    {
        label: "window.requestAnimationFrame()",
        type: "function",
        info: "Request the browser to call a function before the next repaint",
        detail: "(callback: FrameRequestCallback) => number",
        boost: 85
    },
    {
        label: "window.cancelAnimationFrame()",
        type: "function",
        info: "Cancel an animation frame request",
        detail: "(id: number) => void",
        boost: 85
    },
    {
        label: "window.addEventListener()",
        type: "function",
        info: "Add an event listener to the window",
        detail: "(type: string, listener: EventListener) => void",
        boost: 85
    },
    {
        label: "window.removeEventListener()",
        type: "function",
        info: "Remove an event listener from the window",
        detail: "(type: string, listener: EventListener) => void",
        boost: 85
    },
    {
        label: "window.fetch()",
        type: "function",
        info: "Make an HTTP request",
        detail: "(url: string, options?: RequestInit) => Promise<Response>",
        boost: 90
    },
    {
        label: "window.open()",
        type: "function",
        info: "Open a new browser window or tab",
        detail: "(url?: string, target?: string, features?: string) => Window | null",
        boost: 80
    },
    {
        label: "window.close()",
        type: "function",
        info: "Close the current window",
        detail: "() => void",
        boost: 75
    },
    {
        label: "window.innerWidth",
        type: "property",
        info: "The interior width of the window in pixels",
        detail: "number",
        boost: 85
    },
    {
        label: "window.innerHeight",
        type: "property",
        info: "The interior height of the window in pixels",
        detail: "number",
        boost: 85
    },
    {
        label: "window.scrollTo()",
        type: "function",
        info: "Scroll to a particular set of coordinates",
        detail: "(x: number, y: number) => void",
        boost: 80
    },
    {
        label: "window.scrollBy()",
        type: "function",
        info: "Scroll the document by a given amount",
        detail: "(x: number, y: number) => void",
        boost: 80
    }
];

/**
 * Browser Document API completions
 * Includes common document properties, methods, and DOM manipulation
 */
export const documentCompletions: Completion[] = [
    {
        label: "document",
        type: "variable",
        info: "The document object representing the HTML document",
        detail: "DOM API",
        boost: 99
    },
    {
        label: "document.getElementById()",
        type: "function",
        info: "Get element by its ID",
        detail: "(id: string) => HTMLElement | null",
        boost: 95
    },
    {
        label: "document.querySelector()",
        type: "function",
        info: "Get first element matching CSS selector",
        detail: "(selector: string) => Element | null",
        boost: 95
    },
    {
        label: "document.querySelectorAll()",
        type: "function",
        info: "Get all elements matching CSS selector",
        detail: "(selector: string) => NodeListOf<Element>",
        boost: 95
    },
    {
        label: "document.getElementsByClassName()",
        type: "function",
        info: "Get elements by class name",
        detail: "(className: string) => HTMLCollectionOf<Element>",
        boost: 85
    },
    {
        label: "document.getElementsByTagName()",
        type: "function",
        info: "Get elements by tag name",
        detail: "(tagName: string) => HTMLCollectionOf<Element>",
        boost: 85
    },
    {
        label: "document.getElementsByName()",
        type: "function",
        info: "Get elements by name attribute",
        detail: "(name: string) => NodeListOf<Element>",
        boost: 80
    },
    {
        label: "document.createElement()",
        type: "function",
        info: "Create a new HTML element",
        detail: "(tagName: string, options?: ElementCreationOptions) => HTMLElement",
        boost: 95
    },
    {
        label: "document.createTextNode()",
        type: "function",
        info: "Create a new text node",
        detail: "(text: string) => Text",
        boost: 85
    },
    {
        label: "document.createDocumentFragment()",
        type: "function",
        info: "Create a new document fragment",
        detail: "() => DocumentFragment",
        boost: 80
    },
    {
        label: "document.addEventListener()",
        type: "function",
        info: "Add an event listener to the document",
        detail: "(type: string, listener: EventListener) => void",
        boost: 85
    },
    {
        label: "document.removeEventListener()",
        type: "function",
        info: "Remove an event listener from the document",
        detail: "(type: string, listener: EventListener) => void",
        boost: 85
    },
    {
        label: "document.body",
        type: "property",
        info: "The document's body element",
        detail: "HTMLBodyElement",
        boost: 90
    },
    {
        label: "document.head",
        type: "property",
        info: "The document's head element",
        detail: "HTMLHeadElement",
        boost: 85
    },
    {
        label: "document.title",
        type: "property",
        info: "The document's title",
        detail: "string",
        boost: 85
    },
    {
        label: "document.documentElement",
        type: "property",
        info: "The root element of the document (usually <html>)",
        detail: "HTMLElement",
        boost: 80
    },
    {
        label: "document.activeElement",
        type: "property",
        info: "The element that currently has focus",
        detail: "Element | null",
        boost: 80
    },
    {
        label: "document.readyState",
        type: "property",
        info: "The loading state of the document",
        detail: "'loading' | 'interactive' | 'complete'",
        boost: 80
    }
];

/**
 * Console API completions
 * Includes common console methods for debugging
 */
export const consoleCompletions: Completion[] = [
    {
        label: "console",
        type: "variable",
        info: "Browser console for logging and debugging",
        detail: "Console",
        boost: 95
    },
    {
        label: "console.log()",
        type: "function",
        info: "Log a message to the console",
        detail: "(...data: any[]) => void",
        boost: 95
    },
    {
        label: "console.error()",
        type: "function",
        info: "Log an error message to the console",
        detail: "(...data: any[]) => void",
        boost: 90
    },
    {
        label: "console.warn()",
        type: "function",
        info: "Log a warning message to the console",
        detail: "(...data: any[]) => void",
        boost: 90
    },
    {
        label: "console.info()",
        type: "function",
        info: "Log an info message to the console",
        detail: "(...data: any[]) => void",
        boost: 85
    },
    {
        label: "console.debug()",
        type: "function",
        info: "Log a debug message to the console",
        detail: "(...data: any[]) => void",
        boost: 85
    },
    {
        label: "console.table()",
        type: "function",
        info: "Display data as a table in the console",
        detail: "(data: any) => void",
        boost: 85
    },
    {
        label: "console.clear()",
        type: "function",
        info: "Clear the console",
        detail: "() => void",
        boost: 80
    },
    {
        label: "console.time()",
        type: "function",
        info: "Start a timer for performance measurement",
        detail: "(label?: string) => void",
        boost: 80
    },
    {
        label: "console.timeEnd()",
        type: "function",
        info: "Stop a timer and log the elapsed time",
        detail: "(label?: string) => void",
        boost: 80
    },
    {
        label: "console.assert()",
        type: "function",
        info: "Log an error if assertion is false",
        detail: "(condition: boolean, ...data: any[]) => void",
        boost: 80
    },
    {
        label: "console.count()",
        type: "function",
        info: "Log the number of times count() has been called",
        detail: "(label?: string) => void",
        boost: 75
    },
    {
        label: "console.group()",
        type: "function",
        info: "Create a new inline group in the console",
        detail: "(label?: string) => void",
        boost: 75
    },
    {
        label: "console.groupEnd()",
        type: "function",
        info: "Exit the current inline group",
        detail: "() => void",
        boost: 75
    }
];

/**
 * JavaScript built-in globals completions
 * Includes common global functions and objects
 */
export const jsGlobalsCompletions: Completion[] = [
    {
        label: "setTimeout()",
        type: "function",
        info: "Execute code after a delay",
        detail: "(callback: Function, ms: number) => number",
        boost: 90
    },
    {
        label: "setInterval()",
        type: "function",
        info: "Execute code repeatedly at intervals",
        detail: "(callback: Function, ms: number) => number",
        boost: 90
    },
    {
        label: "clearTimeout()",
        type: "function",
        info: "Cancel a timeout",
        detail: "(id: number) => void",
        boost: 85
    },
    {
        label: "clearInterval()",
        type: "function",
        info: "Cancel an interval",
        detail: "(id: number) => void",
        boost: 85
    },
    {
        label: "fetch()",
        type: "function",
        info: "Make an HTTP request",
        detail: "(url: string, options?: RequestInit) => Promise<Response>",
        boost: 95
    },
    {
        label: "Promise",
        type: "class",
        info: "Represents the eventual completion or failure of an asynchronous operation",
        detail: "Promise<T>",
        boost: 90
    },
    {
        label: "Array",
        type: "class",
        info: "JavaScript Array constructor",
        detail: "Array<T>",
        boost: 85
    },
    {
        label: "Object",
        type: "class",
        info: "JavaScript Object constructor",
        detail: "Object",
        boost: 85
    },
    {
        label: "JSON.parse()",
        type: "function",
        info: "Parse a JSON string",
        detail: "(text: string) => any",
        boost: 90
    },
    {
        label: "JSON.stringify()",
        type: "function",
        info: "Convert a value to a JSON string",
        detail: "(value: any, replacer?: any, space?: string | number) => string",
        boost: 90
    },
    {
        label: "Math.random()",
        type: "function",
        info: "Generate a random number between 0 and 1",
        detail: "() => number",
        boost: 85
    },
    {
        label: "Math.floor()",
        type: "function",
        info: "Round down to the nearest integer",
        detail: "(x: number) => number",
        boost: 85
    },
    {
        label: "Math.ceil()",
        type: "function",
        info: "Round up to the nearest integer",
        detail: "(x: number) => number",
        boost: 85
    },
    {
        label: "Math.round()",
        type: "function",
        info: "Round to the nearest integer",
        detail: "(x: number) => number",
        boost: 85
    },
    {
        label: "Math.abs()",
        type: "function",
        info: "Get the absolute value of a number",
        detail: "(x: number) => number",
        boost: 80
    },
    {
        label: "Math.max()",
        type: "function",
        info: "Get the largest of zero or more numbers",
        detail: "(...values: number[]) => number",
        boost: 80
    },
    {
        label: "Math.min()",
        type: "function",
        info: "Get the smallest of zero or more numbers",
        detail: "(...values: number[]) => number",
        boost: 80
    },
    {
        label: "parseInt()",
        type: "function",
        info: "Parse a string and return an integer",
        detail: "(string: string, radix?: number) => number",
        boost: 85
    },
    {
        label: "parseFloat()",
        type: "function",
        info: "Parse a string and return a floating point number",
        detail: "(string: string) => number",
        boost: 85
    },
    {
        label: "isNaN()",
        type: "function",
        info: "Determine whether a value is NaN",
        detail: "(value: any) => boolean",
        boost: 80
    },
    {
        label: "isFinite()",
        type: "function",
        info: "Determine whether a value is a finite number",
        detail: "(value: any) => boolean",
        boost: 75
    }
];

/**
 * Array methods completions
 * Common array manipulation methods
 */
export const arrayMethodsCompletions: Completion[] = [
    {
        label: "map()",
        type: "method",
        info: "Create a new array with the results of calling a function on every element",
        detail: "<T, U>(callback: (value: T, index: number, array: T[]) => U) => U[]",
        boost: 95
    },
    {
        label: "filter()",
        type: "method",
        info: "Create a new array with elements that pass the test",
        detail: "<T>(callback: (value: T, index: number, array: T[]) => boolean) => T[]",
        boost: 95
    },
    {
        label: "reduce()",
        type: "method",
        info: "Reduce array to a single value by executing a reducer function",
        detail: "<T, U>(callback: (acc: U, value: T, index: number, array: T[]) => U, initialValue: U) => U",
        boost: 90
    },
    {
        label: "forEach()",
        type: "method",
        info: "Execute a function for each array element",
        detail: "<T>(callback: (value: T, index: number, array: T[]) => void) => void",
        boost: 95
    },
    {
        label: "find()",
        type: "method",
        info: "Return the first element that satisfies the test",
        detail: "<T>(callback: (value: T, index: number, array: T[]) => boolean) => T | undefined",
        boost: 90
    },
    {
        label: "findIndex()",
        type: "method",
        info: "Return the index of the first element that satisfies the test",
        detail: "<T>(callback: (value: T, index: number, array: T[]) => boolean) => number",
        boost: 85
    },
    {
        label: "some()",
        type: "method",
        info: "Test whether at least one element passes the test",
        detail: "<T>(callback: (value: T, index: number, array: T[]) => boolean) => boolean",
        boost: 85
    },
    {
        label: "every()",
        type: "method",
        info: "Test whether all elements pass the test",
        detail: "<T>(callback: (value: T, index: number, array: T[]) => boolean) => boolean",
        boost: 85
    },
    {
        label: "includes()",
        type: "method",
        info: "Determine whether an array includes a certain value",
        detail: "<T>(searchElement: T, fromIndex?: number) => boolean",
        boost: 90
    },
    {
        label: "indexOf()",
        type: "method",
        info: "Return the first index at which a given element can be found",
        detail: "<T>(searchElement: T, fromIndex?: number) => number",
        boost: 85
    },
    {
        label: "lastIndexOf()",
        type: "method",
        info: "Return the last index at which a given element can be found",
        detail: "<T>(searchElement: T, fromIndex?: number) => number",
        boost: 80
    },
    {
        label: "push()",
        type: "method",
        info: "Add one or more elements to the end of an array",
        detail: "<T>(...items: T[]) => number",
        boost: 90
    },
    {
        label: "pop()",
        type: "method",
        info: "Remove the last element from an array",
        detail: "<T>() => T | undefined",
        boost: 85
    },
    {
        label: "shift()",
        type: "method",
        info: "Remove the first element from an array",
        detail: "<T>() => T | undefined",
        boost: 85
    },
    {
        label: "unshift()",
        type: "method",
        info: "Add one or more elements to the beginning of an array",
        detail: "<T>(...items: T[]) => number",
        boost: 85
    },
    {
        label: "slice()",
        type: "method",
        info: "Return a shallow copy of a portion of an array",
        detail: "<T>(start?: number, end?: number) => T[]",
        boost: 90
    },
    {
        label: "splice()",
        type: "method",
        info: "Change the contents of an array by removing or replacing elements",
        detail: "<T>(start: number, deleteCount?: number, ...items: T[]) => T[]",
        boost: 85
    },
    {
        label: "concat()",
        type: "method",
        info: "Merge two or more arrays",
        detail: "<T>(...items: (T | T[])[]) => T[]",
        boost: 85
    },
    {
        label: "join()",
        type: "method",
        info: "Join all elements of an array into a string",
        detail: "(separator?: string) => string",
        boost: 85
    },
    {
        label: "reverse()",
        type: "method",
        info: "Reverse the order of elements in an array",
        detail: "<T>() => T[]",
        boost: 80
    },
    {
        label: "sort()",
        type: "method",
        info: "Sort the elements of an array",
        detail: "<T>(compareFn?: (a: T, b: T) => number) => T[]",
        boost: 85
    },
    {
        label: "flat()",
        type: "method",
        info: "Create a new array with all sub-array elements concatenated",
        detail: "(depth?: number) => any[]",
        boost: 80
    },
    {
        label: "flatMap()",
        type: "method",
        info: "Map each element using a mapping function, then flatten the result",
        detail: "<T, U>(callback: (value: T, index: number, array: T[]) => U | U[]) => U[]",
        boost: 80
    }
];

/**
 * String methods completions
 * Common string manipulation methods
 */
export const stringMethodsCompletions: Completion[] = [
    {
        label: "split()",
        type: "method",
        info: "Split a string into an array of substrings",
        detail: "(separator: string | RegExp, limit?: number) => string[]",
        boost: 95
    },
    {
        label: "substring()",
        type: "method",
        info: "Extract characters between two indices",
        detail: "(start: number, end?: number) => string",
        boost: 90
    },
    {
        label: "slice()",
        type: "method",
        info: "Extract a section of a string",
        detail: "(start: number, end?: number) => string",
        boost: 90
    },
    {
        label: "trim()",
        type: "method",
        info: "Remove whitespace from both ends of a string",
        detail: "() => string",
        boost: 90
    },
    {
        label: "trimStart()",
        type: "method",
        info: "Remove whitespace from the beginning of a string",
        detail: "() => string",
        boost: 85
    },
    {
        label: "trimEnd()",
        type: "method",
        info: "Remove whitespace from the end of a string",
        detail: "() => string",
        boost: 85
    },
    {
        label: "toLowerCase()",
        type: "method",
        info: "Convert a string to lowercase",
        detail: "() => string",
        boost: 90
    },
    {
        label: "toUpperCase()",
        type: "method",
        info: "Convert a string to uppercase",
        detail: "() => string",
        boost: 90
    },
    {
        label: "replace()",
        type: "method",
        info: "Replace text in a string using a pattern",
        detail: "(searchValue: string | RegExp, replaceValue: string | Function) => string",
        boost: 90
    },
    {
        label: "replaceAll()",
        type: "method",
        info: "Replace all occurrences of a pattern in a string",
        detail: "(searchValue: string | RegExp, replaceValue: string | Function) => string",
        boost: 90
    },
    {
        label: "match()",
        type: "method",
        info: "Match a string against a regular expression",
        detail: "(regexp: RegExp) => RegExpMatchArray | null",
        boost: 85
    },
    {
        label: "matchAll()",
        type: "method",
        info: "Return an iterator of all matches of a regexp",
        detail: "(regexp: RegExp) => IterableIterator<RegExpMatchArray>",
        boost: 80
    },
    {
        label: "search()",
        type: "method",
        info: "Search for a match in a string",
        detail: "(regexp: RegExp) => number",
        boost: 85
    },
    {
        label: "indexOf()",
        type: "method",
        info: "Return the index of the first occurrence of a value",
        detail: "(searchValue: string, fromIndex?: number) => number",
        boost: 90
    },
    {
        label: "lastIndexOf()",
        type: "method",
        info: "Return the index of the last occurrence of a value",
        detail: "(searchValue: string, fromIndex?: number) => number",
        boost: 85
    },
    {
        label: "includes()",
        type: "method",
        info: "Determine whether a string contains a certain substring",
        detail: "(searchString: string, position?: number) => boolean",
        boost: 90
    },
    {
        label: "startsWith()",
        type: "method",
        info: "Determine whether a string begins with the characters of a specified string",
        detail: "(searchString: string, position?: number) => boolean",
        boost: 90
    },
    {
        label: "endsWith()",
        type: "method",
        info: "Determine whether a string ends with the characters of a specified string",
        detail: "(searchString: string, length?: number) => boolean",
        boost: 90
    },
    {
        label: "charAt()",
        type: "method",
        info: "Return the character at a specified index",
        detail: "(index: number) => string",
        boost: 85
    },
    {
        label: "charCodeAt()",
        type: "method",
        info: "Return the Unicode of the character at a specified index",
        detail: "(index: number) => number",
        boost: 80
    },
    {
        label: "concat()",
        type: "method",
        info: "Concatenate two or more strings",
        detail: "(...strings: string[]) => string",
        boost: 85
    },
    {
        label: "repeat()",
        type: "method",
        info: "Return a new string with a specified number of copies",
        detail: "(count: number) => string",
        boost: 85
    },
    {
        label: "padStart()",
        type: "method",
        info: "Pad the start of a string with another string",
        detail: "(targetLength: number, padString?: string) => string",
        boost: 80
    },
    {
        label: "padEnd()",
        type: "method",
        info: "Pad the end of a string with another string",
        detail: "(targetLength: number, padString?: string) => string",
        boost: 80
    }
];

/**
 * Object methods completions
 * Common Object static methods
 */
export const objectMethodsCompletions: Completion[] = [
    {
        label: "Object.keys()",
        type: "function",
        info: "Return an array of an object's property names",
        detail: "(obj: object) => string[]",
        boost: 95
    },
    {
        label: "Object.values()",
        type: "function",
        info: "Return an array of an object's property values",
        detail: "(obj: object) => any[]",
        boost: 95
    },
    {
        label: "Object.entries()",
        type: "function",
        info: "Return an array of an object's [key, value] pairs",
        detail: "(obj: object) => [string, any][]",
        boost: 95
    },
    {
        label: "Object.assign()",
        type: "function",
        info: "Copy properties from one or more source objects to a target object",
        detail: "(target: object, ...sources: object[]) => object",
        boost: 90
    },
    {
        label: "Object.freeze()",
        type: "function",
        info: "Freeze an object to prevent modifications",
        detail: "<T>(obj: T) => T",
        boost: 85
    },
    {
        label: "Object.seal()",
        type: "function",
        info: "Seal an object to prevent adding new properties",
        detail: "<T>(obj: T) => T",
        boost: 80
    },
    {
        label: "Object.create()",
        type: "function",
        info: "Create a new object with the specified prototype",
        detail: "(proto: object | null, propertiesObject?: PropertyDescriptorMap) => any",
        boost: 85
    },
    {
        label: "Object.defineProperty()",
        type: "function",
        info: "Define a new property directly on an object",
        detail: "(obj: object, prop: string, descriptor: PropertyDescriptor) => object",
        boost: 80
    },
    {
        label: "Object.defineProperties()",
        type: "function",
        info: "Define multiple properties on an object",
        detail: "(obj: object, props: PropertyDescriptorMap) => object",
        boost: 80
    },
    {
        label: "Object.getOwnPropertyNames()",
        type: "function",
        info: "Return an array of all properties found directly on an object",
        detail: "(obj: object) => string[]",
        boost: 80
    },
    {
        label: "Object.hasOwn()",
        type: "function",
        info: "Check if an object has a property as its own",
        detail: "(obj: object, prop: string) => boolean",
        boost: 85
    },
    {
        label: "Object.is()",
        type: "function",
        info: "Determine whether two values are the same value",
        detail: "(value1: any, value2: any) => boolean",
        boost: 80
    }
];

/**
 * Promise methods completions
 * Common Promise static methods and instance methods
 */
export const promiseMethodsCompletions: Completion[] = [
    {
        label: "Promise.resolve()",
        type: "function",
        info: "Return a Promise that resolves with the given value",
        detail: "<T>(value?: T) => Promise<T>",
        boost: 90
    },
    {
        label: "Promise.reject()",
        type: "function",
        info: "Return a Promise that rejects with the given reason",
        detail: "(reason?: any) => Promise<never>",
        boost: 90
    },
    {
        label: "Promise.all()",
        type: "function",
        info: "Wait for all promises to resolve or any to reject",
        detail: "<T>(promises: Promise<T>[]) => Promise<T[]>",
        boost: 95
    },
    {
        label: "Promise.allSettled()",
        type: "function",
        info: "Wait for all promises to settle (resolve or reject)",
        detail: "<T>(promises: Promise<T>[]) => Promise<PromiseSettledResult<T>[]>",
        boost: 85
    },
    {
        label: "Promise.race()",
        type: "function",
        info: "Return a promise that settles as soon as any promise settles",
        detail: "<T>(promises: Promise<T>[]) => Promise<T>",
        boost: 85
    },
    {
        label: "Promise.any()",
        type: "function",
        info: "Return a promise that resolves as soon as any promise resolves",
        detail: "<T>(promises: Promise<T>[]) => Promise<T>",
        boost: 85
    },
    {
        label: "then()",
        type: "method",
        info: "Attach callbacks for promise resolution and/or rejection",
        detail: "<T, R>(onFulfilled?: (value: T) => R, onRejected?: (reason: any) => R) => Promise<R>",
        boost: 95
    },
    {
        label: "catch()",
        type: "method",
        info: "Attach a callback for promise rejection",
        detail: "<T>(onRejected: (reason: any) => T) => Promise<T>",
        boost: 95
    },
    {
        label: "finally()",
        type: "method",
        info: "Attach a callback that is executed when the promise is settled",
        detail: "(onFinally: () => void) => Promise<T>",
        boost: 90
    }
];

/**
 * Event-related completions
 * Common event types and methods
 */
export const eventCompletions: Completion[] = [
    {
        label: "addEventListener()",
        type: "method",
        info: "Register an event handler on the target",
        detail: "(type: string, listener: EventListener, options?: AddEventListenerOptions) => void",
        boost: 95
    },
    {
        label: "removeEventListener()",
        type: "method",
        info: "Remove an event handler from the target",
        detail: "(type: string, listener: EventListener, options?: EventListenerOptions) => void",
        boost: 90
    },
    {
        label: "dispatchEvent()",
        type: "method",
        info: "Dispatch an event to the target",
        detail: "(event: Event) => boolean",
        boost: 85
    },
    {
        label: "preventDefault()",
        type: "method",
        info: "Prevent the default action of the event",
        detail: "() => void",
        boost: 90
    },
    {
        label: "stopPropagation()",
        type: "method",
        info: "Stop the event from propagating",
        detail: "() => void",
        boost: 90
    },
    {
        label: "stopImmediatePropagation()",
        type: "method",
        info: "Prevent other listeners of the same event from being called",
        detail: "() => void",
        boost: 85
    },
    {
        label: "event.target",
        type: "property",
        info: "The element that triggered the event",
        detail: "EventTarget",
        boost: 95
    },
    {
        label: "event.currentTarget",
        type: "property",
        info: "The element to which the event handler is attached",
        detail: "EventTarget",
        boost: 90
    },
    {
        label: "event.type",
        type: "property",
        info: "The type of event",
        detail: "string",
        boost: 85
    },
    {
        label: "event.bubbles",
        type: "property",
        info: "Whether the event bubbles up through the DOM",
        detail: "boolean",
        boost: 80
    },
    {
        label: "event.cancelable",
        type: "property",
        info: "Whether the event can be canceled",
        detail: "boolean",
        boost: 80
    }
];

/**
 * DOM Element methods completions
 * Common methods available on HTML elements
 */
export const elementMethodsCompletions: Completion[] = [
    {
        label: "appendChild()",
        type: "method",
        info: "Add a node to the end of the list of children",
        detail: "(node: Node) => Node",
        boost: 90
    },
    {
        label: "removeChild()",
        type: "method",
        info: "Remove a child node from the DOM",
        detail: "(child: Node) => Node",
        boost: 85
    },
    {
        label: "replaceChild()",
        type: "method",
        info: "Replace a child node with a new node",
        detail: "(newChild: Node, oldChild: Node) => Node",
        boost: 80
    },
    {
        label: "insertBefore()",
        type: "method",
        info: "Insert a node before a reference node",
        detail: "(newNode: Node, referenceNode: Node | null) => Node",
        boost: 85
    },
    {
        label: "cloneNode()",
        type: "method",
        info: "Clone a node and optionally all of its descendants",
        detail: "(deep?: boolean) => Node",
        boost: 85
    },
    {
        label: "getAttribute()",
        type: "method",
        info: "Get the value of an attribute",
        detail: "(name: string) => string | null",
        boost: 90
    },
    {
        label: "setAttribute()",
        type: "method",
        info: "Set the value of an attribute",
        detail: "(name: string, value: string) => void",
        boost: 90
    },
    {
        label: "removeAttribute()",
        type: "method",
        info: "Remove an attribute from an element",
        detail: "(name: string) => void",
        boost: 85
    },
    {
        label: "hasAttribute()",
        type: "method",
        info: "Check if an element has a specified attribute",
        detail: "(name: string) => boolean",
        boost: 85
    },
    {
        label: "classList.add()",
        type: "method",
        info: "Add one or more class names to an element",
        detail: "(...tokens: string[]) => void",
        boost: 95
    },
    {
        label: "classList.remove()",
        type: "method",
        info: "Remove one or more class names from an element",
        detail: "(...tokens: string[]) => void",
        boost: 95
    },
    {
        label: "classList.toggle()",
        type: "method",
        info: "Toggle a class name on an element",
        detail: "(token: string, force?: boolean) => boolean",
        boost: 90
    },
    {
        label: "classList.contains()",
        type: "method",
        info: "Check if an element has a specified class",
        detail: "(token: string) => boolean",
        boost: 90
    },
    {
        label: "getBoundingClientRect()",
        type: "method",
        info: "Get the size and position of an element relative to the viewport",
        detail: "() => DOMRect",
        boost: 85
    },
    {
        label: "scrollIntoView()",
        type: "method",
        info: "Scroll the element into the visible area",
        detail: "(options?: ScrollIntoViewOptions) => void",
        boost: 85
    },
    {
        label: "focus()",
        type: "method",
        info: "Give focus to an element",
        detail: "(options?: FocusOptions) => void",
        boost: 85
    },
    {
        label: "blur()",
        type: "method",
        info: "Remove focus from an element",
        detail: "() => void",
        boost: 80
    },
    {
        label: "closest()",
        type: "method",
        info: "Find the closest ancestor element that matches a selector",
        detail: "(selector: string) => Element | null",
        boost: 85
    },
    {
        label: "matches()",
        type: "method",
        info: "Check if an element matches a CSS selector",
        detail: "(selector: string) => boolean",
        boost: 85
    },
    {
        label: "innerHTML",
        type: "property",
        info: "Get or set the HTML content of an element",
        detail: "string",
        boost: 90
    },
    {
        label: "textContent",
        type: "property",
        info: "Get or set the text content of an element",
        detail: "string",
        boost: 90
    },
    {
        label: "style",
        type: "property",
        info: "Access the inline style of an element",
        detail: "CSSStyleDeclaration",
        boost: 90
    },
    {
        label: "className",
        type: "property",
        info: "Get or set the class attribute of an element",
        detail: "string",
        boost: 85
    },
    {
        label: "id",
        type: "property",
        info: "Get or set the id attribute of an element",
        detail: "string",
        boost: 85
    }
];

/**
 * Async/Await completions
 * Keywords and patterns for asynchronous code
 */
export const asyncCompletions: Completion[] = [
    {
        label: "async",
        type: "keyword",
        info: "Declare an asynchronous function",
        detail: "keyword",
        boost: 95
    },
    {
        label: "await",
        type: "keyword",
        info: "Wait for a promise to resolve",
        detail: "keyword",
        boost: 95
    },
    {
        label: "try",
        type: "keyword",
        info: "Define a block of code to test for errors",
        detail: "keyword",
        boost: 90
    },
    {
        label: "catch",
        type: "keyword",
        info: "Define a block of code to handle errors",
        detail: "keyword",
        boost: 90
    },
    {
        label: "finally",
        type: "keyword",
        info: "Define a block of code to execute regardless of the result",
        detail: "keyword",
        boost: 85
    },
    {
        label: "throw",
        type: "keyword",
        info: "Throw an exception",
        detail: "keyword",
        boost: 85
    }
];

/**
 * All custom completions combined
 * Export this as the default list to use in the editor
 */
export const allCustomCompletions: Completion[] = [
    ...windowCompletions,
    ...documentCompletions,
    ...consoleCompletions,
    ...jsGlobalsCompletions,
    ...arrayMethodsCompletions,
    ...stringMethodsCompletions,
    ...objectMethodsCompletions,
    ...promiseMethodsCompletions,
    ...eventCompletions,
    ...elementMethodsCompletions,
    ...asyncCompletions
];

/**
 * Get completions by category
 * Useful for context-specific autocompletion
 */
export const getCompletionsByCategory = (
    category: 'window' | 'document' | 'console' | 'globals' | 'array' | 'string' | 'object' | 'promise' | 'event' | 'element' | 'async' | 'all'
): Completion[] => {
    switch (category) {
        case 'window':
            return windowCompletions;
        case 'document':
            return documentCompletions;
        case 'console':
            return consoleCompletions;
        case 'globals':
            return jsGlobalsCompletions;
        case 'array':
            return arrayMethodsCompletions;
        case 'string':
            return stringMethodsCompletions;
        case 'object':
            return objectMethodsCompletions;
        case 'promise':
            return promiseMethodsCompletions;
        case 'event':
            return eventCompletions;
        case 'element':
            return elementMethodsCompletions;
        case 'async':
            return asyncCompletions;
        case 'all':
        default:
            return allCustomCompletions;
    }
};
