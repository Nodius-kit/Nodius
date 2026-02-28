import { describe, it, expect, beforeAll } from "vitest";
import { getReadToolDefinitions, createReadToolExecutor, SearchNodesSchema, ExploreNeighborhoodSchema, ReadNodeDetailSchema, ReadNodeConfigSchema, ListNodeEdgesSchema } from "./readTools.js";
import { MockGraphDataSource, MOCK_GRAPH_KEY } from "../../../test-ai/mock-data.js";

const ds = new MockGraphDataSource();
const exec = createReadToolExecutor(ds, MOCK_GRAPH_KEY);

describe("getReadToolDefinitions()", () => {
    it("returns 7 tools", () => {
        const tools = getReadToolDefinitions();
        expect(tools).toHaveLength(7);
    });

    it("each tool has type function and a function.name", () => {
        const tools = getReadToolDefinitions();
        for (const tool of tools) {
            expect(tool.type).toBe("function");
            expect(tool.function.name).toBeTruthy();
        }
    });
});

describe("read_graph_overview", () => {
    it("returns name, sheets, and stats", async () => {
        const result = JSON.parse(await exec("read_graph_overview", { graphKey: MOCK_GRAPH_KEY }));
        expect(result.name).toBe("NBA Stats Pipeline");
        expect(result.sheets).toBeInstanceOf(Array);
        expect(result.sheets.length).toBeGreaterThan(0);
        // Check that each sheet has nodeCount
        for (const s of result.sheets) {
            expect(s).toHaveProperty("nodeCount");
            expect(s).toHaveProperty("edgeCount");
        }
    });
});

describe("search_nodes", () => {
    it("filters by query", async () => {
        const result = JSON.parse(await exec("search_nodes", { query: "fetch" }));
        expect(result.length).toBeGreaterThan(0);
        const keys = result.map((n: { _key: string }) => n._key);
        expect(keys).toContain("fetch-api");
    });

    it("filters by sheetId", async () => {
        const result = JSON.parse(await exec("search_nodes", { query: "sort", sheetId: "1" }));
        expect(result.length).toBeGreaterThan(0);
        for (const n of result) {
            expect(n.sheet).toBe("1");
        }
    });
});

describe("explore_neighborhood", () => {
    it("returns nodes and edges", async () => {
        const result = JSON.parse(await exec("explore_neighborhood", { nodeKey: "fetch-api" }));
        expect(result.nodes).toBeInstanceOf(Array);
        expect(result.edges).toBeInstanceOf(Array);
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.edges.length).toBeGreaterThan(0);
    });

    it("direction outbound does not return inbound-only neighbors", async () => {
        const result = JSON.parse(await exec("explore_neighborhood", { nodeKey: "fetch-api", direction: "outbound", maxDepth: 1 }));
        // outbound from fetch-api goes to filter-active and error-handler
        const nodeKeys = result.nodes.map((n: { _key: string }) => n._key);
        expect(nodeKeys).toContain("filter-active");
        expect(nodeKeys).toContain("error-handler");
        // root is only connected inbound to fetch-api, so should not appear
        expect(nodeKeys).not.toContain("root");
    });
});

describe("read_node_detail", () => {
    it("returns complete node details", async () => {
        const result = JSON.parse(await exec("read_node_detail", { nodeKey: "fetch-api" }));
        expect(result._key).toBe("fetch-api");
        expect(result.type).toBe("api-call");
        expect(result.process).toContain("fetch");
        expect(result.handles).toBeInstanceOf(Array);
        expect(result).toHaveProperty("posX");
        expect(result).toHaveProperty("posY");
    });

    it("returns error for nonexistent node", async () => {
        const result = JSON.parse(await exec("read_node_detail", { nodeKey: "nonexistent" }));
        expect(result.error).toContain("not found");
    });
});

describe("read_node_config", () => {
    it("returns config details", async () => {
        const result = JSON.parse(await exec("read_node_config", { typeKey: "api-call" }));
        expect(result._key).toBe("api-call");
        expect(result.displayName).toBe("API Call");
        expect(result.description).toContain("HTTP");
    });

    it("returns error for nonexistent config", async () => {
        const result = JSON.parse(await exec("read_node_config", { typeKey: "nonexistent-type" }));
        expect(result.error).toContain("not found");
    });
});

describe("list_available_node_types", () => {
    it("contains built-in and custom types", async () => {
        const result = JSON.parse(await exec("list_available_node_types", {}));
        const keys = result.map((t: { _key: string }) => t._key);
        // Built-in
        expect(keys).toContain("starter");
        expect(keys).toContain("return");
        expect(keys).toContain("html");
        expect(keys).toContain("entryType");
        // Custom from mock
        expect(keys).toContain("api-call");
        expect(keys).toContain("filter");
    });
});

describe("list_node_edges", () => {
    it("filters by direction", async () => {
        const outbound = JSON.parse(await exec("list_node_edges", { nodeKey: "fetch-api", direction: "outbound" }));
        for (const e of outbound) {
            expect(e.source).toBe("fetch-api");
        }

        const inbound = JSON.parse(await exec("list_node_edges", { nodeKey: "fetch-api", direction: "inbound" }));
        for (const e of inbound) {
            expect(e.target).toBe("fetch-api");
        }
    });

    it("returns all edges with direction any", async () => {
        const result = JSON.parse(await exec("list_node_edges", { nodeKey: "fetch-api", direction: "any" }));
        // fetch-api has e1 (inbound from root), e2 (outbound to filter), e3 (outbound to error)
        expect(result.length).toBe(3);
    });
});

describe("unknown tool", () => {
    it("returns error for unknown tool name", async () => {
        const result = JSON.parse(await exec("unknown_tool", {}));
        expect(result.error).toContain("Unknown tool");
    });
});

describe("Zod schemas validate args", () => {
    it("SearchNodesSchema requires query", () => {
        expect(() => SearchNodesSchema.parse({})).toThrow();
        expect(() => SearchNodesSchema.parse({ query: "test" })).not.toThrow();
    });

    it("ExploreNeighborhoodSchema requires nodeKey", () => {
        expect(() => ExploreNeighborhoodSchema.parse({})).toThrow();
        expect(() => ExploreNeighborhoodSchema.parse({ nodeKey: "abc" })).not.toThrow();
    });

    it("ReadNodeDetailSchema requires nodeKey", () => {
        expect(() => ReadNodeDetailSchema.parse({})).toThrow();
    });

    it("ReadNodeConfigSchema requires typeKey", () => {
        expect(() => ReadNodeConfigSchema.parse({})).toThrow();
    });

    it("ListNodeEdgesSchema requires nodeKey", () => {
        expect(() => ListNodeEdgesSchema.parse({})).toThrow();
    });
});
