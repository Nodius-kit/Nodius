/**
 * @file codeEditorVariableDefinitions.ts
 * @description Centralized variable definitions for CodeEditorModal context panel
 * @module schema/editor
 *
 * This file provides reusable variable definitions for the code editor's context panel.
 * It includes:
 * - Math utility functions (ABS, EXP, CEILING, etc.)
 * - String manipulation functions (LEN, LEFT, LOWER, etc.)
 * - Date/Time functions (DATEADD, DATEDIFF, etc.)
 * - Common variables (htmlObject, globalStorage, etc.)
 * - Workflow-specific variables (node, nodeMap, etc.)
 */

import { VariableDefinition } from "../../hooks/contexts/ProjectContext";

// ============================================================================
// MATH FUNCTIONS (from src/process/workflow/utilsFunction.ts)
// ============================================================================

export const mathFunctionDefinitions: VariableDefinition[] = [
    { name: "ABS", type: "(value: number) => number", description: "Returns the absolute value of a number (always positive)" },
    { name: "EXP", type: "(exponent: number) => number", description: "Returns e (Euler's number ≈2.718) raised to the power of the given exponent" },
    { name: "CEILING", type: "(value: number) => number", description: "Rounds up to the smallest integer greater than or equal to the value" },
    { name: "FLOOR", type: "(value: number) => number", description: "Rounds down to the largest integer less than or equal to the value" },
    { name: "LN", type: "(value: number) => number", description: "Returns the natural logarithm (base e) of a number" },
    { name: "LOG", type: "(value: number) => number", description: "Returns the base-10 logarithm of a number" },
    { name: "POWER", type: "(base: number, exponent: number) => number", description: "Returns base raised to the power of exponent (base^exponent)" },
    { name: "ROUND", type: "(value: number, precision: number) => number", description: "Rounds a number to the specified number of decimal places" },
    { name: "SIGN", type: "(value: number) => number", description: "Returns 1 if positive, -1 if negative, 0 if zero" },
    { name: "SQUARE", type: "(value: number) => number", description: "Returns the square of a number (value^2)" },
    { name: "SQRT", type: "(value: number) => number", description: "Returns the square root of a number" },
];

// ============================================================================
// STRING FUNCTIONS (from src/process/workflow/utilsFunction.ts)
// ============================================================================

export const stringFunctionDefinitions: VariableDefinition[] = [
    { name: "CODEPOINT", type: "(str: string) => number", description: "Returns the Unicode code point of the first character in a string, or -1 if empty" },
    { name: "FINDSTRING", type: "(haystack: string, needle: string, startIndex?: number) => number", description: "Finds the position of a substring within a string, returns index or -1 if not found" },
    { name: "HEX", type: "(value: number) => string", description: "Converts a number to its hexadecimal (base-16) string representation in uppercase" },
    { name: "LEN", type: "(str: string) => number", description: "Returns the length (number of characters) of a string" },
    { name: "LEFT", type: "(str: string, length: number) => string", description: "Returns the first N characters from the beginning of a string" },
    { name: "LOWER", type: "(str: string) => string", description: "Converts all characters in a string to lowercase" },
    { name: "LTRIM", type: "(str: string) => string", description: "Removes whitespace from the beginning (left side) of a string" },
    { name: "REPLACE", type: "(str: string, search: string, replacement: string) => string", description: "Replaces all occurrences of a substring with a replacement string using regex" },
    { name: "REPLACEALL", type: "(str: string, search: string, replacement: string) => string", description: "Replaces all occurrences of a substring with a replacement string using split/join" },
    { name: "REVERSE", type: "(str: string) => string", description: "Reverses the order of characters in a string" },
    { name: "RIGHT", type: "(str: string, length: number) => string", description: "Returns the last N characters from the end of a string" },
    { name: "RTRIM", type: "(str: string) => string", description: "Removes whitespace from the end (right side) of a string" },
    { name: "SUBSTRING", type: "(str: string, start: number, length: number) => string", description: "Extracts a substring starting at the specified index for the given length" },
    { name: "TRIM", type: "(str: string) => string", description: "Removes whitespace from both the beginning and end of a string" },
    { name: "UPPER", type: "(str: string) => string", description: "Converts all characters in a string to uppercase" },
];

// ============================================================================
// DATE/TIME FUNCTIONS (from src/process/workflow/utilsFunction.ts)
// ============================================================================

export const dateFunctionDefinitions: VariableDefinition[] = [
    { name: "DATEADD", type: "(date: Date, interval: string, amount: number) => Date", description: "Adds a time interval to a date. Interval types: 'year', 'month', 'day', 'hour', 'minute', 'second'" },
    { name: "DATEDIFF", type: "(date1: Date, date2: Date, interval: string) => number", description: "Calculates the difference between two dates in the specified interval unit (year/month/day/hour/minute/second)" },
    { name: "DATEPART", type: "(date: Date, part: string) => number", description: "Extracts a specific part from a date. Parts: 'year', 'month' (1-12), 'day', 'hour', 'minute', 'second'" },
    { name: "DAY", type: "(date: Date) => number", description: "Returns the day of the month (1-31) from a date" },
    { name: "GETDATE", type: "() => Date", description: "Returns the current date and time in local timezone" },
    { name: "GETUTCDATE", type: "() => Date", description: "Returns the current date and time in UTC timezone" },
    { name: "MONTH", type: "(date: Date) => number", description: "Returns the month (1-12) from a date" },
    { name: "YEAR", type: "(date: Date) => number", description: "Returns the year from a date" },
    { name: "MINUTE", type: "(date: Date) => number", description: "Returns the minutes (0-59) from a date" },
    { name: "SECONDE", type: "(date: Date) => number", description: "Returns the seconds (0-59) from a date" },
];

// ============================================================================
// UTILITY FUNCTIONS (from src/process/workflow/utilsFunction.ts)
// ============================================================================

export const utilityFunctionDefinitions: VariableDefinition[] = [
    { name: "ISNULL", type: "(value: any) => boolean", description: "Checks if a value is null or undefined, returns true if either" },
    { name: "MONTHIDTONAME", type: "(month: string, upper?: boolean) => string", description: "Converts month number (1-12) to localized month name. Supports 'en' and 'fr' languages. Optional upper parameter capitalizes first letter" },
    { name: "FORMATNUMBER", type: "(value: number, decimal?: number, sign?: boolean, color?: boolean) => string", description: "Formats numbers with K/M/B suffixes (e.g., 1500 → '1.5K'). Options: decimal places, +/- sign prefix, color-coded HTML (blue positive, red negative)" },
];

// ============================================================================
// ALL STANDARD FUNCTIONS COMBINED
// ============================================================================

/**
 * All utility functions from utilsFunction.ts
 * Use this when you need all standard functions available
 */
export const standardFunctionDefinitions: VariableDefinition[] = [
    ...mathFunctionDefinitions,
    ...stringFunctionDefinitions,
    ...dateFunctionDefinitions,
    ...utilityFunctionDefinitions,
];

// ============================================================================
// HTML RENDER CONTEXT VARIABLES (from src/process/html/HtmlRender.tsx)
// ============================================================================

/**
 * Common variables available in HTML render contexts
 * Used in EventsEditor and ContentEditor
 */
export const htmlRenderContextDefinitions: VariableDefinition[] = [
    { name: "htmlObject", type: "HtmlObject", description: "HTML object definition - union type (HtmlDiv | HtmlText | HtmlList | HtmlInner | HtmlArray | HtmlIcon) with properties: identifier, id?, tag, css, domEvents, name, attribute" },
    { name: "globalStorage", type: "Record<string, any>", description: "Global storage object shared across all HTML elements in the render context, persists between re-renders" },
    { name: "element", type: "HTMLElement", description: "The current DOM HTMLElement being rendered or interacted with" },
    { name: "modalManager", type: "object", description: "Manager for creating and controlling modal popups/dialogs" },
    { name: "entryData", type: "any", description: "Initial data passed to the workflow when execution started" },
    { name: "deepCopy", type: "<T>(obj: T) => T", description: "Creates a deep clone of an object, recursively copying all nested properties and arrays" },
    { name: "deepEqual", type: "(a: any, b: any) => boolean", description: "Performs deep equality comparison between two objects, recursively comparing all nested properties" },
    { name: "renderElementWithId", type: "(id: string) => void", description: "Triggers re-render of an element by its HTML id attribute" },
    { name: "renderElementWithIdentifier", type: "(identifier: string) => void", description: "Triggers re-render of an element by its unique identifier property" },
    { name: "renderElement", type: "() => void", description: "Triggers re-render of the current element and its children" },
];

// ============================================================================
// GRAPH RENDER CONTEXT VARIABLES (from src/client/schema/SchemaDisplay.tsx)
// ============================================================================

/**
 * Extra variables available in graph render contexts
 * Used in SchemaDisplay for node rendering and interaction
 * Available via getExtraRenderGraphVariable()
 */
export const graphRenderContextDefinitions: VariableDefinition[] = [
    { name: "getNode", type: "(nodeId: string) => Node<any> | undefined", description: "Retrieves a node by its ID, returns a deep copy of the node or undefined if not found" },
    { name: "nodeId", type: "string", description: "The unique identifier (_key) of the current node being rendered" },
    { name: "updateNode", type: "(newNode: Node<any>) => Promise<boolean>", description: "Updates the current node by generating instructions to match the new state, returns true if successful" },
    { name: "InstructionBuilder", type: "typeof InstructionBuilder", description: "Class for building instruction objects to modify graph state via path-based operations" },
    { name: "deletePointId", type: "(nodeId: string, pointId: string) => Promise<boolean>", description: "Deletes a handle point from a node and all connected edges, returns true if successful" },
    { name: "generateUniqueHandlePointId", type: "(nodeId: string) => string", description: "Generates a unique handle point ID for the specified node" },
    { name: "updateGraph", type: "(instructions: GraphInstruction[]) => Promise<UpdateGraphResponse>", description: "Applies instruction-based state changes to the graph, sends updates to server and other clients" },
    { name: "gpuMotor", type: "GraphicalMotor", description: "WebGPU motor instance for rendering the graph, provides methods for coordinate transformation and scene management" },
    { name: "initiateNewHtmlRender", type: "(config: HtmlRenderConfig) => htmlRenderContext | undefined", description: "Creates a new HTML render context for a node with specified configuration" },
    { name: "getHtmlRenderWithId", type: "(nodeId: string, renderId: string) => htmlRenderContext | undefined", description: "Retrieves an existing HTML render context by node ID and render ID" },
    { name: "getHtmlRenderOfNode", type: "(nodeId: string) => htmlRenderContext[]", description: "Gets all HTML render contexts associated with a specific node" },
    { name: "getAllHtmlRender", type: "() => htmlRenderContext[]", description: "Returns all HTML render contexts across all nodes" },
    { name: "removeHtmlRender", type: "(nodeId: string, renderId: string) => void", description: "Removes and cleans up an HTML render context by node ID and render ID" },
    { name: "openHtmlEditor", type: "(context: htmlRenderContext, path: string[]) => void", description: "Opens the HTML editor modal for editing HTML content at the specified path" },
    { name: "currentEntryDataType", type: "DataTypeClass | undefined", description: "The current entry data type definition for the workflow, if an entry type node is connected" },
    { name: "HtmlRender", type: "typeof HtmlRender", description: "Class for rendering HtmlObject structures into DOM elements with event handling and update support" },
    { name: "container", type: "HTMLElement", description: "The DOM container element for the current node" },
];

/**
 * Variables available in DOM event handlers
 * Used in EventsEditor for event handlers (onClick, onChange, etc.)
 */
export const domEventContextDefinitions: VariableDefinition[] = [
    { name: "event", type: "Event", description: "DOM Event object" },
    ...htmlRenderContextDefinitions,
];

// ============================================================================
// WORKFLOW CONTEXT VARIABLES (from src/process/workflow/WorkflowWorker.ts)
// ============================================================================

/**
 * Variables available in workflow node execution context
 * Used in LeftPanelMenu for node.process editing
 */
export const workflowContextDefinitions: VariableDefinition[] = [
    { name: "node", type: "Node<any>", description: "Current node being executed with properties: _key (unique ID), graphKey, type, sheet, size {width, height, dynamic?}, posX, posY, process (code), handles (input/output points), data (custom node data)" },
    { name: "nodeMap", type: "Map<string, Node<any>>", description: "Map of all nodes in the current sheet, indexed by node._key" },
    { name: "edgeMap", type: "Map<string, Edge[]>", description: "Map of all edges indexed by 'source-{nodeKey}' and 'target-{nodeKey}' for efficient lookup. Edge properties: _key, source, sourceHandle, target, targetHandle, label?" },
    { name: "entryData", type: "any", description: "Initial input data passed to the workflow when execution started (typically from entry node)" },
    { name: "nodeTypeConfig", type: "Record<NodeType, NodeTypeConfig>", description: "Configuration dictionary of all available node types with their templates, borders, content (HtmlObject), and default node structure" },
    { name: "incoming", type: "incomingWorkflowNode", description: "Data received from the previous node that triggered this execution: { data: any, pointId: string (input handle ID), node?: Node<any> (reference to sender) }" },
    { name: "global", type: "Record<string, any>", description: "Global workflow storage shared across all nodes during execution, persists throughout the workflow lifecycle" },
    { name: "parseString", type: "(content: string) => Promise<any>", description: "Parses template strings with {{expression}} syntax, evaluates expressions with access to workflow variables (incoming, node, entryData, global, utility functions)" },
    { name: "initHtml", type: "(html: HtmlObject, id?: string, containerSelector?: string) => void", description: "Initializes HTML rendering for the current node with the given HtmlObject structure" },
    { name: "yieldData", type: "() => void", description: "Yields current global data immediately without waiting for workflow completion" },
    { name: "updateHtml", type: "(instructions: Instruction[], id?: string) => void", description: "Updates previously initialized HTML render using instruction-based state changes" },
    { name: "log", type: "(message: string, data?: any) => void", description: "Logs a message to the workflow execution console with optional data payload" },
    { name: "next", type: "(pointId: string, data?: any) => Promise<any[]>", description: "Executes all nodes connected to the specified output point ID, passes data to them, returns array of results from all parallel branches" },
    { name: "branch", type: "(targetNodeId: string, incomingPointId: string, data?: any) => Promise<any>", description: "Directly jumps to a specific node by its _key, bypassing normal edge connections, useful for dynamic routing" },
    { name: "continueAndDelay", type: "(pointId: string, immediateData: any, delayedCallback: () => Promise<any>) => Promise<void>", description: "Continues execution immediately with initial data, then re-executes the same path later when delayed callback completes with new data" },
];

// ============================================================================
// PRESET COMBINATIONS
// ============================================================================

/**
 * Complete variable definitions for DOM event handlers
 * Includes: event, HTML context, and all standard functions
 */
export const domEventEditorDefinitions: VariableDefinition[] = [
    ...domEventContextDefinitions,
    ...standardFunctionDefinitions,
];

/**
 * Complete variable definitions for HTML content editing
 * Includes: HTML context and all standard functions (no event)
 */
export const htmlContentEditorDefinitions: VariableDefinition[] = [
    ...htmlRenderContextDefinitions,
    ...standardFunctionDefinitions,
];

/**
 * Complete variable definitions for workflow node logic
 * Includes: workflow context and all standard functions
 */
export const workflowNodeEditorDefinitions: VariableDefinition[] = [
    ...workflowContextDefinitions,
    ...standardFunctionDefinitions,
];

/**
 * Complete variable definitions for graph render context
 * Includes: graph context, HTML context, and all standard functions
 * Used in SchemaDisplay for node rendering and DOM event handling
 */
export const graphRenderEditorDefinitions: VariableDefinition[] = [
    ...domEventContextDefinitions,
    ...graphRenderContextDefinitions,
    ...standardFunctionDefinitions,
];
