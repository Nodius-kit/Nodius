import { describe, it, expect } from "vitest";
import {
    getWriteToolDefinitions,
    isWriteTool,
    parseProposedAction,
    ProposeCreateNodeSchema,
    ProposeCreateEdgeSchema,
    ProposeDeleteNodeSchema,
} from "./writeTools.js";

describe("getWriteToolDefinitions()", () => {
    it("returns 3 tools", () => {
        const tools = getWriteToolDefinitions();
        expect(tools).toHaveLength(3);
    });

    it("each tool has type function and a propose_* name", () => {
        const tools = getWriteToolDefinitions();
        for (const tool of tools) {
            expect(tool.type).toBe("function");
            expect(tool.function.name).toMatch(/^propose_/);
        }
    });

    it("contains propose_create_node, propose_create_edge, propose_delete_node", () => {
        const tools = getWriteToolDefinitions();
        const names = tools.map(t => t.function.name);
        expect(names).toContain("propose_create_node");
        expect(names).toContain("propose_create_edge");
        expect(names).toContain("propose_delete_node");
    });
});

describe("isWriteTool()", () => {
    it("returns true for propose_* tools", () => {
        expect(isWriteTool("propose_create_node")).toBe(true);
        expect(isWriteTool("propose_create_edge")).toBe(true);
        expect(isWriteTool("propose_delete_node")).toBe(true);
    });

    it("returns false for read tools", () => {
        expect(isWriteTool("search_nodes")).toBe(false);
        expect(isWriteTool("read_graph_overview")).toBe(false);
        expect(isWriteTool("list_node_edges")).toBe(false);
    });
});

describe("ProposeCreateNodeSchema", () => {
    it("validates a correct create node payload", () => {
        const result = ProposeCreateNodeSchema.parse({
            typeKey: "filter",
            sheet: "0",
            posX: 500,
            posY: 300,
            reason: "Need a filter node to process data",
        });
        expect(result.typeKey).toBe("filter");
        expect(result.posX).toBe(500);
        expect(result.process).toBe(""); // default
    });

    it("accepts optional handles and data", () => {
        const result = ProposeCreateNodeSchema.parse({
            typeKey: "api-call",
            sheet: "0",
            posX: 100,
            posY: 200,
            process: "await fetch(url);",
            handles: {
                L: { position: "separate", point: [{ id: "0", type: "in", accept: "any" }] },
                R: { position: "separate", point: [{ id: "0", type: "out", accept: "any" }] },
            },
            data: { url: "https://example.com" },
            reason: "New API endpoint",
        });
        expect(result.handles!.L.point).toHaveLength(1);
        expect(result.data!.url).toBe("https://example.com");
    });

    it("rejects missing required fields", () => {
        expect(() => ProposeCreateNodeSchema.parse({ typeKey: "filter" })).toThrow();
        expect(() => ProposeCreateNodeSchema.parse({ sheet: "0", posX: 0, posY: 0 })).toThrow();
    });
});

describe("ProposeCreateEdgeSchema", () => {
    it("validates a correct create edge payload", () => {
        const result = ProposeCreateEdgeSchema.parse({
            sourceKey: "fetch-api",
            sourceHandle: "0",
            targetKey: "filter-active",
            targetHandle: "0",
            sheet: "0",
            reason: "Connect output to filter",
        });
        expect(result.sourceKey).toBe("fetch-api");
        expect(result.label).toBeUndefined();
    });

    it("accepts optional label", () => {
        const result = ProposeCreateEdgeSchema.parse({
            sourceKey: "a",
            sourceHandle: "0",
            targetKey: "b",
            targetHandle: "0",
            sheet: "0",
            label: "success",
            reason: "Main flow",
        });
        expect(result.label).toBe("success");
    });

    it("rejects missing required fields", () => {
        expect(() => ProposeCreateEdgeSchema.parse({ sourceKey: "a" })).toThrow();
    });
});

describe("ProposeDeleteNodeSchema", () => {
    it("validates a correct delete node payload", () => {
        const result = ProposeDeleteNodeSchema.parse({
            nodeKey: "error-handler",
            reason: "No longer needed",
        });
        expect(result.nodeKey).toBe("error-handler");
    });

    it("rejects missing reason", () => {
        expect(() => ProposeDeleteNodeSchema.parse({ nodeKey: "x" })).toThrow();
    });
});

describe("parseProposedAction()", () => {
    it("parses propose_create_node into a create_node action", () => {
        const action = parseProposedAction("propose_create_node", {
            typeKey: "filter",
            sheet: "0",
            posX: 500,
            posY: 300,
            reason: "test",
        });
        expect(action.type).toBe("create_node");
        expect(action.payload).toEqual({
            typeKey: "filter",
            sheet: "0",
            posX: 500,
            posY: 300,
            data: undefined,
        });
    });

    it("parses propose_create_edge into a create_edge action", () => {
        const action = parseProposedAction("propose_create_edge", {
            sourceKey: "a",
            sourceHandle: "0",
            targetKey: "b",
            targetHandle: "1",
            sheet: "0",
            label: "ok",
            reason: "test",
        });
        expect(action.type).toBe("create_edge");
        expect(action.payload).toEqual({
            sourceKey: "a",
            sourceHandle: "0",
            targetKey: "b",
            targetHandle: "1",
            sheet: "0",
            label: "ok",
        });
    });

    it("parses propose_delete_node into a delete_node action", () => {
        const action = parseProposedAction("propose_delete_node", {
            nodeKey: "xyz",
            reason: "cleanup",
        });
        expect(action.type).toBe("delete_node");
        expect(action.payload).toEqual({ nodeKey: "xyz" });
    });

    it("throws for unknown write tool", () => {
        expect(() => parseProposedAction("propose_unknown", {})).toThrow("Unknown write tool");
    });
});
