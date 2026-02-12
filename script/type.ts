/**
 * Root interface representing the entire JSON file structure.
 */
export interface NbaGraph {
    /** Timestamp of the file creation or last save */
    date: number;
    /** Version number of the data structure */
    version: number;
    /** Collection of sheets (pages/canvases), indexed by sheet ID */
    sheets: Record<string, Sheet>;
}

/**
 * Represents a single sheet or canvas in the graph.
 */
export interface Sheet {
    id: string;
    version: number;
    /** Timestamp of the last edit */
    lastEdited: number;
    /** User ID who performed the last edit (can be number or string) */
    lastEditedUser: number | string;
    /** Name of the sheet (e.g., "Main") */
    name: string;
    /** Configuration parameters for the sheet */
    params: SheetParams;
    /** * Dictionary of nodes contained in the sheet.
     * Key is the unique Node ID.
     */
    nodes: Record<string, GraphNode>;
    /** * Dictionary of edges.
     * Keys are often connection identifiers (e.g., "source:NodeID:HandleID"),
     * and values are arrays of edges corresponding to that connection.
     */
    edges: Record<string, GraphEdge[]>;
}

/**
 * Parameters mainly related to auto-layout configuration.
 */
export interface SheetParams {
    layout: {
        enable: boolean;
        algorithm: string;
        spec: {
            direction: "RIGHT" | "LEFT" | "TOP" | "BOTTOM" | string;
        };
    };
}

/**
 * Represents a node in the graph.
 */
export interface GraphNode {
    id: string;
    /** The type of the node determines the structure of 'data' */
    type: NodeType;
    /** X and Y coordinates of the node */
    position: {
        x: number;
        y: number;
    };
    /** Measured dimensions of the node */
    measured?: {
        width: number;
        height: number;
    };
    /** Dimensions explicitly set */
    width?: number;
    height?: number;
    /** UI state flags */
    selected?: boolean;
    dragging?: boolean;
    resizing?: boolean;
    /** Specific data payload for the node */
    data: NodeData;
    /** ID of the parent node if nested (e.g., inside a subflow) */
    parentId?: string;
    /** Extent setting for child nodes (e.g., "parent") */
    extent?: string;
}

/**
 * Union of possible node types identified in the JSON.
 */
export type NodeType =
    | "portalNode"
    | "sentenceNode"
    | "sectionNode"
    | "multiplexerNode"
    | "switchNode"
    | "viewerNode"
    | "subflowNode"
    | "noteNode" // Assuming generic note type existence
    | string;    // Allow for other custom types

/**
 * Payload data for a node. Contains optional fields depending on NodeType.
 */
export interface NodeData {
    /** Identifier for portal nodes */
    portal?: string;
    /** Localized content for sentence nodes */
    sentence?: LocalizedContent;
    /** Localized content for section nodes */
    section?: LocalizedContent;
    /** Configuration for connection handles */
    handles?: HandleGroup[];
    /** Conditions used in switch or multiplexer nodes */
    conditions?: NodeCondition[];

    // Specific to section/sentence nodes
    hidePrefix?: boolean;
    hidePrefixType?: string;
    hidePrefixTypeSub?: string;
    spanClass?: LocalizedString;
    spanStyle?: LocalizedString;
    bold?: boolean;
    italic?: boolean;
    undeline?: boolean; // Note: typo in JSON 'undeline' instead of 'underline' kept for fidelity
    link?: boolean;
    listeLink?: string[];
    opinion?: boolean;

    // Specific to subflow or loop nodes
    opened?: boolean;
    iteration?: string | number[];
    perimeter?: string;
    while?: string;
    addIteration?: boolean;

    // Specific to viewer or legacy nodes
    minimified?: boolean;
    label?: string;
    value?: string;
    borderColor?: string;
    border?: string;
}

/**
 * Represents localized text (HTML or plain).
 */
export interface LocalizedContent {
    fr: string;
    en: string;
}

/**
 * Represents localized string values (e.g., class names).
 */
export interface LocalizedString {
    fr: string;
    en: string;
}

/**
 * A group of handles located on a specific side of a node.
 */
export interface HandleGroup {
    /** Position of the handle group (left, right, top, bottom) */
    position: "left" | "right" | "top" | "bottom";
    /** List of individual handles in this group */
    handles: NodeHandle[];
    /** Indicates if handles can be added dynamically */
    evolutif?: boolean;
}

/**
 * A single connection handle on a node.
 */
export interface NodeHandle {
    id: string;
    type: "source" | "target";
    label?: string;
    hiddenDisplay?: boolean;
}

/**
 * Logical condition for flow control nodes.
 */
export interface NodeCondition {
    /** Expression string (e.g., "value == 1") */
    value: string;
}

/**
 * Represents a connection line between two nodes.
 */
export interface GraphEdge {
    id: string;
    /** ID of the source node */
    source: string;
    /** ID of the specific handle on the source node */
    sourceHandle: string;
    /** ID of the target node */
    target: string;
    /** ID of the specific handle on the target node */
    targetHandle: string;
    /** Type of the edge (e.g., "normalEdge") */
    type: string;
    /** UI state */
    selected?: boolean;
    /** Visual marker at the end of the edge (e.g., arrow) */
    markerEnd?: {
        type: string;
        width?: number;
        height?: number;
    };
}