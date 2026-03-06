import type { Edge, Node, NodeTypeConfig, Graph, handleSide, NodePoint } from "@nodius/utils";

// ─── GraphRAG Context (sent to LLM) ────────────────────────────────

export interface HandleSummary {
    side: string;
    points: Array<{
        id: string;
        type: "in" | "out";
        accept: string;
        display?: string;
    }>;
}

export interface RelevantNode {
    _key: string;
    type: string;
    typeName?: string;
    sheet: string;
    sheetName: string;
    handles: HandleSummary[];
    dataSummary?: string;
}

export interface RelevantEdge {
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
    label?: string;
}

export interface NodeTypeConfigSummary {
    _key: string;
    displayName: string;
    description: string;
    category: string;
    icon?: string;
    handlesSummary: string;
}

export interface GraphRAGContext {
    graph: {
        _key: string;
        name: string;
        description?: string;
        sheets: Record<string, string>;
        metadata?: Record<string, unknown>;
    };
    relevantNodes: RelevantNode[];
    relevantEdges: RelevantEdge[];
    nodeTypeConfigs: NodeTypeConfigSummary[];
}

// ─── Proposed Actions (Human-in-the-Loop) ───────────────────────────

export interface CreateNodePayload {
    typeKey: string;
    sheet?: string;
    posX?: number;
    posY?: number;
    data?: unknown;
}

export interface CreateEdgePayload {
    sourceKey: string;
    sourceHandle: string;
    targetKey: string;
    targetHandle: string;
    sheet: string;
    label?: string;
}

export interface EdgeConnectionPayload {
    direction: "in" | "out";
    handleId: string;
    targetNodeKey: string;
    targetHandleId: string;
    label?: string;
}

export interface CreateNodeWithEdgesPayload {
    typeKey: string;
    sheet?: string;
    posX?: number;
    posY?: number;
    data?: unknown;
    edges: EdgeConnectionPayload[];
}

export interface ConfigureNodeTypePayload {
    mode: "create" | "update";
    typeKey?: string;
    displayName: string;
    description?: string;
    category?: string;
    icon?: string;
    process?: string;
    border?: {
        radius?: number;
        width?: number;
        type?: string;
        normalColor?: string;
        hoverColor?: string;
    };
    handles?: Record<string, {
        position: "separate" | "fix";
        point: Array<{
            id: string;
            type: "in" | "out";
            accept: string;
            display?: string;
        }>;
    }>;
    size?: { width: number; height: number; dynamic?: boolean };
    content?: unknown;
}

export interface ReorganizeLayoutPayload {
    nodeKeys: string[];
    strategy?: string;
}

export interface CreateGraphPayload {
    name: string;
    type: "graph" | "htmlClass";
    description?: string;
}

export type ProposedAction =
    | { type: "create_node"; payload: CreateNodePayload }
    | { type: "delete_node"; payload: { nodeKey: string } }
    | { type: "update_node"; payload: { nodeKey: string; changes: Record<string, unknown> } }
    | { type: "create_edge"; payload: CreateEdgePayload }
    | { type: "delete_edge"; payload: { edgeKey: string } }
    | { type: "move_node"; payload: { nodeKey: string; posX: number; posY: number } }
    | { type: "batch"; payload: { actions: ProposedAction[] } }
    | { type: "create_node_with_edges"; payload: CreateNodeWithEdgesPayload }
    | { type: "configure_node_type"; payload: ConfigureNodeTypePayload }
    | { type: "reorganize_layout"; payload: ReorganizeLayoutPayload }
    | { type: "create_graph"; payload: CreateGraphPayload };

// ─── AI Chat Messages ───────────────────────────────────────────────

export interface AIChatMessage {
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    toolCallId?: string;
    toolCalls?: AIToolCall[];
}

export interface AIToolCall {
    id: string;
    name: string;
    arguments: string;
}

// ─── Tool definitions ───────────────────────────────────────────────

export interface AIToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

// ─── Data source interface (for mock / real implementations) ────────

export interface GraphSummary {
    _key: string;
    name: string;
    category: string;
    workspace: string;
    nodeCount?: number;
    sheetCount?: number;
    createdTime?: number;
    lastUpdatedTime?: number;
    htmlKeyLinked?: string;
}

export interface HtmlClassSummary {
    _key: string;
    name: string;
    description?: string;
    category: string;
    workspace: string;
    graphKeyLinked: string;
    createdTime?: number;
    lastUpdatedTime?: number;
}

export interface GraphDataSource {
    getGraph(graphKey: string): Promise<GraphRAGContext["graph"] | null>;
    getNodes(graphKey: string, sheetId?: string): Promise<Node<unknown>[]>;
    getEdges(graphKey: string, sheetId?: string): Promise<Edge[]>;
    getNodeByKey(graphKey: string, nodeKey: string): Promise<Node<unknown> | null>;
    getNodeConfigs(graphKey: string): Promise<NodeTypeConfig[]>;
    searchNodes(graphKey: string, query: string, maxResults?: number, queryEmbedding?: number[]): Promise<Node<unknown>[]>;
    getNeighborhood(graphKey: string, nodeKey: string, maxDepth?: number, direction?: "inbound" | "outbound" | "any"): Promise<{ nodes: Node<unknown>[]; edges: Edge[] }>;
    /** List all workflow graphs for a workspace. Used by Home assistant. */
    listGraphs?(workspace: string): Promise<GraphSummary[]>;
    /** List all HTML classes for a workspace. Used by Home assistant. */
    listHtmlClasses?(workspace: string): Promise<HtmlClassSummary[]>;
}

// ─── LLM Streaming ──────────────────────────────────────────────────

export interface LLMStreamChunk {
    type: "token" | "tool_call_start" | "tool_call_done" | "usage" | "done";
    token?: string;
    toolCall?: { id: string; name: string; arguments: string };
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface StreamCallbacks {
    onToken: (token: string) => void;
    onToolStart: (toolCallId: string, toolName: string) => void;
    onToolResult: (toolCallId: string, result: string) => void;
    onComplete: (fullText: string) => void;
    onError: (error: Error) => void;
    /** Called with token usage after each LLM call completes. */
    onUsage?: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void;
    /** Called when tool round limit is reached, asking user whether to continue. */
    onToolLimit?: (info: { roundsUsed: number; maxExtended: number }) => void;
    /** AbortSignal from the session's AbortController — used to cancel LLM streams. */
    signal?: AbortSignal;
}

/** Extended data source with mutation capabilities (for HITL write tools). */
export interface MutableGraphDataSource extends GraphDataSource {
    createNode(graphKey: string, node: Omit<Node<unknown>, "_key" | "graphKey" | "typeVersion">): Promise<Node<unknown>>;
    deleteNode(graphKey: string, nodeKey: string): Promise<boolean>;
    createEdge(graphKey: string, edge: Omit<Edge, "_key" | "graphKey">): Promise<Edge>;
    deleteEdge(graphKey: string, edgeKey: string): Promise<boolean>;
}
