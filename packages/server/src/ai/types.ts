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
    process: string;
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
    sheet: string;
    posX: number;
    posY: number;
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

export type ProposedAction =
    | { type: "create_node"; payload: CreateNodePayload }
    | { type: "delete_node"; payload: { nodeKey: string } }
    | { type: "update_node"; payload: { nodeKey: string; changes: Record<string, unknown> } }
    | { type: "create_edge"; payload: CreateEdgePayload }
    | { type: "delete_edge"; payload: { edgeKey: string } }
    | { type: "move_node"; payload: { nodeKey: string; posX: number; posY: number } }
    | { type: "batch"; payload: { actions: ProposedAction[] } };

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

export interface GraphDataSource {
    getGraph(graphKey: string): Promise<GraphRAGContext["graph"] | null>;
    getNodes(graphKey: string, sheetId?: string): Promise<Node<unknown>[]>;
    getEdges(graphKey: string, sheetId?: string): Promise<Edge[]>;
    getNodeByKey(graphKey: string, nodeKey: string): Promise<Node<unknown> | null>;
    getNodeConfigs(graphKey: string): Promise<NodeTypeConfig[]>;
    searchNodes(graphKey: string, query: string, maxResults?: number, queryEmbedding?: number[]): Promise<Node<unknown>[]>;
    getNeighborhood(graphKey: string, nodeKey: string, maxDepth?: number, direction?: "inbound" | "outbound" | "any"): Promise<{ nodes: Node<unknown>[]; edges: Edge[] }>;
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
