/**
 * Mock data representing a real Nodius graph for testing.
 * This simulates what would come from ArangoDB without needing a live database.
 */

import type { Edge, Node, NodeTypeConfig } from "@nodius/utils";
import type { MutableGraphDataSource, GraphRAGContext } from "../src/ai/types.js";

// ─── Mock Graph ─────────────────────────────────────────────────────

const MOCK_GRAPH_KEY = "testgraph001";

const mockGraph: GraphRAGContext["graph"] = {
    _key: MOCK_GRAPH_KEY,
    name: "NBA Stats Pipeline",
    description: "A workflow that fetches NBA player stats, processes them, and displays results",
    sheets: {
        "0": "main",
        "1": "data-processing",
    },
};

// ─── Mock Nodes ─────────────────────────────────────────────────────

const mockNodes: Node<unknown>[] = [
    {
        _key: "root",
        graphKey: MOCK_GRAPH_KEY,
        type: "starter",
        typeVersion: 1,
        sheet: "0",
        size: { width: 150, height: 150, dynamic: true },
        posX: 100,
        posY: 300,
        process: "",
        handles: {
            "0": {
                position: "fix",
                point: [{ id: "1", type: "in", accept: "entryType" }],
            },
            "R": {
                position: "separate",
                point: [{ id: "0", type: "out", accept: "any" }],
            },
        },
    },
    {
        _key: "fetch-api",
        graphKey: MOCK_GRAPH_KEY,
        type: "api-call",
        typeVersion: 1,
        sheet: "0",
        size: { width: 250, height: 180 },
        posX: 400,
        posY: 280,
        process: `
const response = await fetch("https://api.sportsdata.io/v3/nba/scores/json/Players");
const players = await response.json();
node.data.result = players.slice(0, 50);
next();
        `,
        handles: {
            "L": {
                position: "separate",
                point: [{ id: "0", type: "in", accept: "any" }],
            },
            "R": {
                position: "separate",
                point: [
                    { id: "0", type: "out", accept: "any", display: "success" },
                    { id: "1", type: "out", accept: "any", display: "error" },
                ],
            },
        },
        data: {
            url: "https://api.sportsdata.io/v3/nba/scores/json/Players",
            method: "GET",
            headers: { "Ocp-Apim-Subscription-Key": "{{API_KEY}}" },
        },
    },
    {
        _key: "filter-active",
        graphKey: MOCK_GRAPH_KEY,
        type: "filter",
        typeVersion: 1,
        sheet: "0",
        size: { width: 250, height: 150 },
        posX: 750,
        posY: 280,
        process: `
const players = incoming[0].data.result;
node.data.result = players.filter(p => p.Status === "Active");
log("Filtered to " + node.data.result.length + " active players");
next();
        `,
        handles: {
            "L": {
                position: "separate",
                point: [{ id: "0", type: "in", accept: "any" }],
            },
            "R": {
                position: "separate",
                point: [{ id: "0", type: "out", accept: "any" }],
            },
        },
    },
    {
        _key: "sort-stats",
        graphKey: MOCK_GRAPH_KEY,
        type: "transform",
        typeVersion: 1,
        sheet: "1",
        size: { width: 250, height: 150 },
        posX: 200,
        posY: 200,
        process: `
const players = incoming[0].data.result;
node.data.result = players.sort((a, b) => b.Points - a.Points);
next();
        `,
        handles: {
            "L": {
                position: "separate",
                point: [{ id: "0", type: "in", accept: "any" }],
            },
            "R": {
                position: "separate",
                point: [{ id: "0", type: "out", accept: "any" }],
            },
        },
    },
    {
        _key: "display-html",
        graphKey: MOCK_GRAPH_KEY,
        type: "html",
        typeVersion: 1,
        sheet: "0",
        size: { width: 640, height: 360, dynamic: true },
        posX: 1100,
        posY: 200,
        process: `
let htmlObject = node;
const pathOfRender = ["data"];
for(const path of pathOfRender) {
    htmlObject = htmlObject[path];
}
initHtml(htmlObject, "main", "[mainRender]");
        `,
        handles: {
            "0": {
                position: "fix",
                point: [
                    { id: "0", type: "out", accept: "event[]" },
                    { id: "1", type: "in", accept: "entryType" },
                ],
            },
        },
        data: {
            type: "list",
            tag: "div",
            name: "container",
            identifier: "overlayRoot",
            content: [],
            css: [{ selector: "&", rules: [["height", "100%"], ["width", "100%"]] }],
            domEvents: [],
        },
    },
    {
        _key: "return",
        graphKey: MOCK_GRAPH_KEY,
        type: "return",
        typeVersion: 1,
        sheet: "0",
        size: { width: 150, height: 150, dynamic: true },
        posX: 1500,
        posY: 300,
        process: "",
        handles: {
            "L": {
                position: "separate",
                point: [{ id: "0", type: "in", accept: "any" }],
            },
        },
    },
    {
        _key: "error-handler",
        graphKey: MOCK_GRAPH_KEY,
        type: "log-node",
        typeVersion: 1,
        sheet: "0",
        size: { width: 200, height: 120 },
        posX: 500,
        posY: 550,
        process: `
log("Error occurred: " + JSON.stringify(incoming[0].data));
        `,
        handles: {
            "L": {
                position: "separate",
                point: [{ id: "0", type: "in", accept: "any" }],
            },
        },
    },
    {
        _key: "entry-form",
        graphKey: MOCK_GRAPH_KEY,
        type: "entryType",
        typeVersion: 1,
        sheet: "0",
        size: { width: 200, height: 150 },
        posX: 50,
        posY: 150,
        process: "",
        handles: {
            "0": {
                position: "fix",
                point: [{ id: "0", type: "out", accept: "entryType" }],
            },
        },
        data: {
            fixedValue: { playerName: "LeBron James", season: "2024" },
        },
    },
    {
        _key: "disconnected-note",
        graphKey: MOCK_GRAPH_KEY,
        type: "log-node",
        typeVersion: 1,
        sheet: "1",
        size: { width: 180, height: 100 },
        posX: 600,
        posY: 400,
        process: `log("This node is not connected to anything");`,
        handles: {
            "L": {
                position: "separate",
                point: [{ id: "0", type: "in", accept: "any" }],
            },
        },
    },
];

// ─── Mock Edges ─────────────────────────────────────────────────────

const mockEdges: Edge[] = [
    {
        _key: "e1",
        graphKey: MOCK_GRAPH_KEY,
        sheet: "0",
        source: "root",
        sourceHandle: "0",
        target: "fetch-api",
        targetHandle: "0",
    },
    {
        _key: "e2",
        graphKey: MOCK_GRAPH_KEY,
        sheet: "0",
        source: "fetch-api",
        sourceHandle: "0",
        target: "filter-active",
        targetHandle: "0",
        label: "success",
    },
    {
        _key: "e3",
        graphKey: MOCK_GRAPH_KEY,
        sheet: "0",
        source: "fetch-api",
        sourceHandle: "1",
        target: "error-handler",
        targetHandle: "0",
        label: "error",
    },
    {
        _key: "e4",
        graphKey: MOCK_GRAPH_KEY,
        sheet: "0",
        source: "filter-active",
        sourceHandle: "0",
        target: "display-html",
        targetHandle: "1",
    },
    {
        _key: "e5",
        graphKey: MOCK_GRAPH_KEY,
        sheet: "0",
        source: "display-html",
        sourceHandle: "0",
        target: "return",
        targetHandle: "0",
    },
    {
        _key: "e6",
        graphKey: MOCK_GRAPH_KEY,
        sheet: "0",
        source: "entry-form",
        sourceHandle: "0",
        target: "root",
        targetHandle: "1",
        label: "entryType",
    },
];

// ─── Mock NodeTypeConfigs ───────────────────────────────────────────

const mockNodeTypeConfigs: NodeTypeConfig[] = [
    {
        _key: "api-call",
        workspace: "test",
        version: 1,
        displayName: "API Call",
        description: "Makes an HTTP request to an external API",
        category: "data",
        alwaysRendered: false,
        content: { type: "text", tag: "span", name: "label", identifier: "r1", css: [], domEvents: [], content: { en: "API Call" } },
        node: {
            type: "api-call",
            posX: 0,
            posY: 0,
            process: "",
            handles: {
                "L": { position: "separate", point: [{ id: "0", type: "in", accept: "any" }] },
                "R": { position: "separate", point: [{ id: "0", type: "out", accept: "any" }, { id: "1", type: "out", accept: "any" }] },
            },
            size: { width: 250, height: 180 },
        },
        border: { radius: 10, width: 1, type: "solid", normal: { color: "#4caf50" }, hover: { color: "#81c784" } },
        icon: "Globe",
        createdTime: Date.now(),
        lastUpdatedTime: Date.now(),
    },
    {
        _key: "filter",
        workspace: "test",
        version: 1,
        displayName: "Filter",
        description: "Filters data based on a condition",
        category: "transform",
        alwaysRendered: false,
        content: { type: "text", tag: "span", name: "label", identifier: "r2", css: [], domEvents: [], content: { en: "Filter" } },
        node: {
            type: "filter",
            posX: 0,
            posY: 0,
            process: "",
            handles: {
                "L": { position: "separate", point: [{ id: "0", type: "in", accept: "any" }] },
                "R": { position: "separate", point: [{ id: "0", type: "out", accept: "any" }] },
            },
            size: { width: 250, height: 150 },
        },
        border: { radius: 10, width: 1, type: "solid", normal: { color: "#ff9800" }, hover: { color: "#ffb74d" } },
        icon: "Filter",
        createdTime: Date.now(),
        lastUpdatedTime: Date.now(),
    },
    {
        _key: "transform",
        workspace: "test",
        version: 1,
        displayName: "Transform",
        description: "Transforms/maps data from one format to another",
        category: "transform",
        alwaysRendered: false,
        content: { type: "text", tag: "span", name: "label", identifier: "r3", css: [], domEvents: [], content: { en: "Transform" } },
        node: {
            type: "transform",
            posX: 0,
            posY: 0,
            process: "",
            handles: {
                "L": { position: "separate", point: [{ id: "0", type: "in", accept: "any" }] },
                "R": { position: "separate", point: [{ id: "0", type: "out", accept: "any" }] },
            },
            size: { width: 250, height: 150 },
        },
        border: { radius: 10, width: 1, type: "solid", normal: { color: "#2196f3" }, hover: { color: "#64b5f6" } },
        icon: "Shuffle",
        createdTime: Date.now(),
        lastUpdatedTime: Date.now(),
    },
    {
        _key: "log-node",
        workspace: "test",
        version: 1,
        displayName: "Logger",
        description: "Logs data for debugging purposes",
        category: "debug",
        alwaysRendered: false,
        content: { type: "text", tag: "span", name: "label", identifier: "r4", css: [], domEvents: [], content: { en: "Logger" } },
        node: {
            type: "log-node",
            posX: 0,
            posY: 0,
            process: "",
            handles: {
                "L": { position: "separate", point: [{ id: "0", type: "in", accept: "any" }] },
            },
            size: { width: 200, height: 120 },
        },
        border: { radius: 10, width: 1, type: "solid", normal: { color: "#9e9e9e" }, hover: { color: "#bdbdbd" } },
        icon: "Terminal",
        createdTime: Date.now(),
        lastUpdatedTime: Date.now(),
    },
];

// ─── Mock GraphDataSource ───────────────────────────────────────────

export class MockGraphDataSource implements MutableGraphDataSource {
    /** Mutable copies for testing writes. Reset with resetMutations(). */
    private mutableNodes: Node<unknown>[] = [...mockNodes];
    private mutableEdges: Edge[] = [...mockEdges];
    private autoKeyCounter = 100;

    async getGraph(graphKey: string) {
        return graphKey === MOCK_GRAPH_KEY ? mockGraph : null;
    }

    async getNodes(graphKey: string, sheetId?: string) {
        let nodes = this.mutableNodes.filter(n => n.graphKey === graphKey);
        if (sheetId) nodes = nodes.filter(n => n.sheet === sheetId);
        return nodes;
    }

    async getEdges(graphKey: string, sheetId?: string) {
        let edges = this.mutableEdges.filter(e => e.graphKey === graphKey);
        if (sheetId) edges = edges.filter(e => e.sheet === sheetId);
        return edges;
    }

    async getNodeByKey(graphKey: string, nodeKey: string) {
        return this.mutableNodes.find(n => n.graphKey === graphKey && n._key === nodeKey) ?? null;
    }

    async getNodeConfigs(_graphKey: string) {
        return mockNodeTypeConfigs;
    }

    async searchNodes(graphKey: string, query: string, maxResults = 10, _queryEmbedding?: number[]) {
        const graphNodes = this.mutableNodes.filter(n => n.graphKey === graphKey);

        // Empty or very short query → return all nodes (simulates BM25 on whole collection)
        const q = query.toLowerCase().trim();
        if (q.length <= 2) {
            return graphNodes.slice(0, maxResults);
        }

        // Tokenize the query for multi-word matching
        const tokens = q.split(/\s+/).filter(t => t.length > 2);

        const scored = graphNodes.map(n => {
            // Match on node fields
            const text = [
                n._key,
                n.type,
                n.process,
                n.data ? JSON.stringify(n.data) : "",
                // Also match against the nodeTypeConfig displayName/description
                mockNodeTypeConfigs.find(c => c._key === n.type)?.displayName ?? "",
                mockNodeTypeConfigs.find(c => c._key === n.type)?.description ?? "",
            ].join(" ").toLowerCase();

            const score = tokens.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
            return { node: n, score };
        });

        return scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(s => s.node)
            .slice(0, maxResults);
    }

    async getNeighborhood(graphKey: string, nodeKey: string, maxDepth = 2, direction: "inbound" | "outbound" | "any" = "any") {
        const visited = new Set<string>();
        const foundNodes: Node<unknown>[] = [];
        const foundEdges: Edge[] = [];

        const queue: Array<{ key: string; depth: number }> = [{ key: nodeKey, depth: 0 }];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current.key) || current.depth > maxDepth) continue;
            visited.add(current.key);

            const node = this.mutableNodes.find(n => n.graphKey === graphKey && n._key === current.key);
            if (node) foundNodes.push(node);

            // Find connected edges
            const edges = this.mutableEdges.filter(e => {
                if (e.graphKey !== graphKey) return false;
                if (direction === "outbound") return e.source === current.key;
                if (direction === "inbound") return e.target === current.key;
                return e.source === current.key || e.target === current.key;
            });

            for (const edge of edges) {
                foundEdges.push(edge);
                const nextKey = edge.source === current.key ? edge.target : edge.source;
                if (!visited.has(nextKey)) {
                    queue.push({ key: nextKey, depth: current.depth + 1 });
                }
            }
        }

        return { nodes: foundNodes, edges: foundEdges };
    }

    // ─── Mutation methods (MutableGraphDataSource) ───────────────────

    async createNode(graphKey: string, node: Omit<Node<unknown>, "_key" | "graphKey" | "typeVersion">): Promise<Node<unknown>> {
        const newNode: Node<unknown> = {
            _key: `node_${this.autoKeyCounter++}`,
            graphKey,
            typeVersion: 1,
            ...node,
        };
        this.mutableNodes.push(newNode);
        return newNode;
    }

    async deleteNode(graphKey: string, nodeKey: string): Promise<boolean> {
        const idx = this.mutableNodes.findIndex(n => n.graphKey === graphKey && n._key === nodeKey);
        if (idx === -1) return false;
        this.mutableNodes.splice(idx, 1);
        // Also delete connected edges
        this.mutableEdges = this.mutableEdges.filter(e =>
            !(e.graphKey === graphKey && (e.source === nodeKey || e.target === nodeKey)),
        );
        return true;
    }

    async createEdge(graphKey: string, edge: Omit<Edge, "_key" | "graphKey">): Promise<Edge> {
        const newEdge: Edge = {
            _key: `edge_${this.autoKeyCounter++}`,
            graphKey,
            ...edge,
        };
        this.mutableEdges.push(newEdge);
        return newEdge;
    }

    async deleteEdge(graphKey: string, edgeKey: string): Promise<boolean> {
        const idx = this.mutableEdges.findIndex(e => e.graphKey === graphKey && e._key === edgeKey);
        if (idx === -1) return false;
        this.mutableEdges.splice(idx, 1);
        return true;
    }

    // ─── Test helpers ────────────────────────────────────────────────

    /** Reset mutable state back to initial mock data. */
    resetMutations(): void {
        this.mutableNodes = [...mockNodes];
        this.mutableEdges = [...mockEdges];
        this.autoKeyCounter = 100;
    }

    /** Get current node count (for assertions). */
    getNodeCount(): number {
        return this.mutableNodes.length;
    }

    /** Get current edge count (for assertions). */
    getEdgeCount(): number {
        return this.mutableEdges.length;
    }
}

export { MOCK_GRAPH_KEY, mockGraph, mockNodes, mockEdges, mockNodeTypeConfigs };
