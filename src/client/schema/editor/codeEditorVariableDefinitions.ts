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
    { name: "ABS", type: "(value: number) => number", description: "Returns absolute value (see utilsFunction.ts)" },
    { name: "EXP", type: "(exponent: number) => number", description: "Returns e^exponent (see utilsFunction.ts)" },
    { name: "CEILING", type: "(value: number) => number", description: "Rounds up to nearest integer (see utilsFunction.ts)" },
    { name: "FLOOR", type: "(value: number) => number", description: "Rounds down to nearest integer (see utilsFunction.ts)" },
    { name: "LN", type: "(value: number) => number", description: "Natural logarithm (see utilsFunction.ts)" },
    { name: "LOG", type: "(value: number) => number", description: "Base-10 logarithm (see utilsFunction.ts)" },
    { name: "POWER", type: "(base: number, exponent: number) => number", description: "Power function (see utilsFunction.ts)" },
    { name: "ROUND", type: "(value: number, precision: number) => number", description: "Rounds to decimal places (see utilsFunction.ts)" },
    { name: "SIGN", type: "(value: number) => number", description: "Returns sign of number (see utilsFunction.ts)" },
    { name: "SQUARE", type: "(value: number) => number", description: "Returns square of number (see utilsFunction.ts)" },
    { name: "SQRT", type: "(value: number) => number", description: "Returns square root (see utilsFunction.ts)" },
];

// ============================================================================
// STRING FUNCTIONS (from src/process/workflow/utilsFunction.ts)
// ============================================================================

export const stringFunctionDefinitions: VariableDefinition[] = [
    { name: "CODEPOINT", type: "(str: string) => number", description: "Unicode code point of first char (see utilsFunction.ts)" },
    { name: "FINDSTRING", type: "(haystack: string, needle: string, startIndex?: number) => number", description: "Find substring position (see utilsFunction.ts)" },
    { name: "HEX", type: "(value: number) => string", description: "Convert to hexadecimal (see utilsFunction.ts)" },
    { name: "LEN", type: "(str: string) => number", description: "String length (see utilsFunction.ts)" },
    { name: "LEFT", type: "(str: string, length: number) => string", description: "First N characters (see utilsFunction.ts)" },
    { name: "LOWER", type: "(str: string) => string", description: "Convert to lowercase (see utilsFunction.ts)" },
    { name: "LTRIM", type: "(str: string) => string", description: "Trim left whitespace (see utilsFunction.ts)" },
    { name: "REPLACE", type: "(str: string, search: string, replacement: string) => string", description: "Replace substring (see utilsFunction.ts)" },
    { name: "REPLACEALL", type: "(str: string, search: string, replacement: string) => string", description: "Replace all occurrences (see utilsFunction.ts)" },
    { name: "REVERSE", type: "(str: string) => string", description: "Reverse string (see utilsFunction.ts)" },
    { name: "RIGHT", type: "(str: string, length: number) => string", description: "Last N characters (see utilsFunction.ts)" },
    { name: "RTRIM", type: "(str: string) => string", description: "Trim right whitespace (see utilsFunction.ts)" },
    { name: "SUBSTRING", type: "(str: string, start: number, length: number) => string", description: "Extract substring (see utilsFunction.ts)" },
    { name: "TRIM", type: "(str: string) => string", description: "Trim whitespace (see utilsFunction.ts)" },
    { name: "UPPER", type: "(str: string) => string", description: "Convert to uppercase (see utilsFunction.ts)" },
];

// ============================================================================
// DATE/TIME FUNCTIONS (from src/process/workflow/utilsFunction.ts)
// ============================================================================

export const dateFunctionDefinitions: VariableDefinition[] = [
    { name: "DATEADD", type: "(date: Date, interval: string, amount: number) => Date", description: "Add interval to date (see utilsFunction.ts)" },
    { name: "DATEDIFF", type: "(date1: Date, date2: Date, interval: string) => number", description: "Difference between dates (see utilsFunction.ts)" },
    { name: "DATEPART", type: "(date: Date, part: string) => number", description: "Extract date part (see utilsFunction.ts)" },
    { name: "DAY", type: "(date: Date) => number", description: "Get day of month (see utilsFunction.ts)" },
    { name: "GETDATE", type: "() => Date", description: "Current date and time (see utilsFunction.ts)" },
    { name: "GETUTCDATE", type: "() => Date", description: "Current UTC date and time (see utilsFunction.ts)" },
    { name: "MONTH", type: "(date: Date) => number", description: "Get month (1-12) (see utilsFunction.ts)" },
    { name: "YEAR", type: "(date: Date) => number", description: "Get year (see utilsFunction.ts)" },
    { name: "MINUTE", type: "(date: Date) => number", description: "Get minutes (see utilsFunction.ts)" },
    { name: "SECONDE", type: "(date: Date) => number", description: "Get seconds (see utilsFunction.ts)" },
];

// ============================================================================
// UTILITY FUNCTIONS (from src/process/workflow/utilsFunction.ts)
// ============================================================================

export const utilityFunctionDefinitions: VariableDefinition[] = [
    { name: "ISNULL", type: "(value: any) => boolean", description: "Check if value is null/undefined (see utilsFunction.ts)" },
    { name: "MONTHIDTONAME", type: "(month: string, upper?: boolean) => string", description: "Convert month number to name (see utilsFunction.ts)" },
    { name: "FORMATNUMBER", type: "(value: number, decimal?: number, sign?: boolean, color?: boolean) => string", description: "Format number with suffixes (see utilsFunction.ts)" },
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
    { name: "htmlObject", type: "HtmlObject", description: "The HTML object definition (see src/utils/html/htmlType.ts)" },
    { name: "globalStorage", type: "Record<string, any>", description: "Global storage accessible across all elements (see HtmlRender.tsx)" },
    { name: "element", type: "HTMLElement", description: "The current HTML element" },
    { name: "modalManager", type: "object", description: "Modal manager for creating popups" },
    { name: "entryData", type: "any", description: "Entry data from workflow execution" },
    { name: "deepCopy", type: "<T>(obj: T) => T", description: "Deep copy utility function (see src/utils/objectUtils.ts)" },
    { name: "deepEqual", type: "(a: any, b: any) => boolean", description: "Deep equality comparison function (see src/utils/objectUtils.ts)" },
    { name: "renderElementWithId", type: "(id: string) => void", description: "Re-render element by HTML id (see HtmlRender.tsx)" },
    { name: "renderElementWithIdentifier", type: "(identifier: string) => void", description: "Re-render element by identifier (see HtmlRender.tsx)" },
    { name: "renderElement", type: "() => void", description: "Re-render the current element (see HtmlRender.tsx)" },
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
    { name: "node", type: "Node<any>", description: "Current node being executed (see src/utils/graph/graphType.ts)" },
    { name: "nodeMap", type: "Map<string, Node<any>>", description: "Map of all nodes in the sheet (see WorkflowWorker.ts)" },
    { name: "edgeMap", type: "Map<string, Edge[]>", description: "Map of all edges in the sheet (see WorkflowWorker.ts)" },
    { name: "entryData", type: "any", description: "Entry data from workflow execution (see WorkflowWorker.ts)" },
    { name: "nodeTypeConfig", type: "Record<NodeType, NodeTypeConfig>", description: "Configuration of all node types (see WorkflowWorker.ts)" },
    { name: "incoming", type: "incomingWorkflowNode", description: "Data from previous node: { pointId, data, node } (see WorkflowWorker.ts)" },
    { name: "global", type: "Record<string, any>", description: "Global workflow data shared across all nodes (see WorkflowWorker.ts)" },
    { name: "parseString", type: "(content: string) => Promise<any>", description: "Parse string with variable interpolation (see WorkflowWorker.ts)" },
    { name: "initHtml", type: "Function", description: "Initialize HTML render for the node (see WorkflowWorker.ts)" },
    { name: "yieldData", type: "Function", description: "Yield data from workflow execution (see WorkflowWorker.ts)" },
    { name: "updateHtml", type: "Function", description: "Update HTML render (see WorkflowWorker.ts)" },
    { name: "log", type: "(message: string, data?: any) => void", description: "Log message to workflow console (see WorkflowWorker.ts)" },
    { name: "next", type: "(pointId: string, data?: any) => Promise<any[]>", description: "Execute next connected nodes (see WorkflowWorker.ts)" },
    { name: "branch", type: "(targetNodeId: string, incomingPointId: string, data?: any) => Promise<any>", description: "Branch to specific node (see WorkflowWorker.ts)" },
    { name: "delay", type: "(delayedCallback: () => Promise<any>) => Promise<void>", description: "Delay execution until callback completes (see WorkflowWorker.ts)" },
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
