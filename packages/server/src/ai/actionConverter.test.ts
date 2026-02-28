import { describe, it, expect } from "vitest";
import { convertAction, type ActionConversionResult } from "./actionConverter.js";
import type { ProposedAction } from "./types.js";
import { OpType } from "@nodius/utils";

const GRAPH_KEY = "testgraph001";
const DEFAULT_SHEET = "0";

describe("convertAction", () => {
    // ─── move_node ──────────────────────────────────────────────────

    it("move_node → 2 GraphInstructions with SET posX/posY and animatePos", () => {
        const action: ProposedAction = {
            type: "move_node",
            payload: { nodeKey: "node1", posX: 300, posY: 400 },
        };

        const result = convertAction(action, GRAPH_KEY, DEFAULT_SHEET);

        expect(result.instructions).toHaveLength(2);

        // posX instruction
        const posXInstr = result.instructions[0];
        expect(posXInstr.i.o).toBe(OpType.SET);
        expect(posXInstr.i.p).toEqual(["posX"]);
        expect(posXInstr.i.v).toBe(300);
        expect(posXInstr.nodeId).toBe("node1");
        expect(posXInstr.animatePos).toBe(true);
        expect(posXInstr.sheetId).toBe(DEFAULT_SHEET);

        // posY instruction
        const posYInstr = result.instructions[1];
        expect(posYInstr.i.o).toBe(OpType.SET);
        expect(posYInstr.i.p).toEqual(["posY"]);
        expect(posYInstr.i.v).toBe(400);
        expect(posYInstr.nodeId).toBe("node1");
        expect(posYInstr.animatePos).toBe(true);

        // No creates or deletes
        expect(result.nodesToCreate).toHaveLength(0);
        expect(result.edgesToCreate).toHaveLength(0);
        expect(result.nodeKeysToDelete).toHaveLength(0);
        expect(result.edgeKeysToDelete).toHaveLength(0);
    });

    // ─── update_node ────────────────────────────────────────────────

    it("update_node → GraphInstructions for each change", () => {
        const action: ProposedAction = {
            type: "update_node",
            payload: {
                nodeKey: "node2",
                changes: { process: "console.log('hello')", label: "My Node" },
            },
        };

        const result = convertAction(action, GRAPH_KEY, DEFAULT_SHEET);

        expect(result.instructions).toHaveLength(2);

        const processInstr = result.instructions[0];
        expect(processInstr.i.o).toBe(OpType.SET);
        expect(processInstr.i.p).toEqual(["process"]);
        expect(processInstr.i.v).toBe("console.log('hello')");
        expect(processInstr.nodeId).toBe("node2");
        expect(processInstr.triggerHtmlRender).toBe(true);

        const labelInstr = result.instructions[1];
        expect(labelInstr.i.o).toBe(OpType.SET);
        expect(labelInstr.i.p).toEqual(["label"]);
        expect(labelInstr.i.v).toBe("My Node");
    });

    it("update_node handles data.* nested paths correctly", () => {
        const action: ProposedAction = {
            type: "update_node",
            payload: {
                nodeKey: "node3",
                changes: { "data.url": "https://api.example.com", "data.config.timeout": 5000 },
            },
        };

        const result = convertAction(action, GRAPH_KEY, DEFAULT_SHEET);

        expect(result.instructions).toHaveLength(2);

        const urlInstr = result.instructions[0];
        expect(urlInstr.i.p).toEqual(["data", "url"]);
        expect(urlInstr.i.v).toBe("https://api.example.com");

        const timeoutInstr = result.instructions[1];
        expect(timeoutInstr.i.p).toEqual(["data", "config", "timeout"]);
        expect(timeoutInstr.i.v).toBe(5000);
    });

    // ─── create_node ────────────────────────────────────────────────

    it("create_node → 1 Node in nodesToCreate with correct fields", () => {
        const action: ProposedAction = {
            type: "create_node",
            payload: { typeKey: "api-call", sheet: "0", posX: 500, posY: 200, data: { url: "https://example.com" } },
        };

        const result = convertAction(action, GRAPH_KEY, DEFAULT_SHEET);

        expect(result.nodesToCreate).toHaveLength(1);
        expect(result.instructions).toHaveLength(0);

        const node = result.nodesToCreate[0];
        expect(node._key).toMatch(/^ai_/);
        expect(node.graphKey).toBe(GRAPH_KEY);
        expect(node.sheet).toBe("0");
        expect(node.type).toBe("api-call");
        expect(node.typeVersion).toBe(1);
        expect(node.posX).toBe(500);
        expect(node.posY).toBe(200);
        expect(node.size).toEqual({ width: 200, height: 100 });
        expect(node.process).toBe("");
        expect(node.handles).toEqual({});
        expect(node.data).toEqual({ url: "https://example.com" });
    });

    it("create_node defaults data to {} when not provided", () => {
        const action: ProposedAction = {
            type: "create_node",
            payload: { typeKey: "starter", sheet: "1", posX: 0, posY: 0 },
        };

        const result = convertAction(action, GRAPH_KEY, DEFAULT_SHEET);
        expect(result.nodesToCreate[0].data).toEqual({});
    });

    // ─── create_edge ────────────────────────────────────────────────

    it("create_edge → 1 Edge in edgesToCreate", () => {
        const action: ProposedAction = {
            type: "create_edge",
            payload: {
                sourceKey: "node1",
                sourceHandle: "0",
                targetKey: "node2",
                targetHandle: "1",
                sheet: "0",
                label: "next",
            },
        };

        const result = convertAction(action, GRAPH_KEY, DEFAULT_SHEET);

        expect(result.edgesToCreate).toHaveLength(1);
        expect(result.instructions).toHaveLength(0);

        const edge = result.edgesToCreate[0];
        expect(edge._key).toMatch(/^ai_/);
        expect(edge.graphKey).toBe(GRAPH_KEY);
        expect(edge.sheet).toBe("0");
        expect(edge.source).toBe("node1");
        expect(edge.sourceHandle).toBe("0");
        expect(edge.target).toBe("node2");
        expect(edge.targetHandle).toBe("1");
        expect(edge.label).toBe("next");
    });

    // ─── delete_node ────────────────────────────────────────────────

    it("delete_node → nodeKeysToDelete contains the key", () => {
        const action: ProposedAction = {
            type: "delete_node",
            payload: { nodeKey: "node-to-remove" },
        };

        const result = convertAction(action, GRAPH_KEY, DEFAULT_SHEET);

        expect(result.nodeKeysToDelete).toEqual(["node-to-remove"]);
        expect(result.instructions).toHaveLength(0);
        expect(result.nodesToCreate).toHaveLength(0);
        expect(result.edgesToCreate).toHaveLength(0);
        expect(result.edgeKeysToDelete).toHaveLength(0);
    });

    // ─── delete_edge ────────────────────────────────────────────────

    it("delete_edge → edgeKeysToDelete contains the key", () => {
        const action: ProposedAction = {
            type: "delete_edge",
            payload: { edgeKey: "edge-to-remove" },
        };

        const result = convertAction(action, GRAPH_KEY, DEFAULT_SHEET);

        expect(result.edgeKeysToDelete).toEqual(["edge-to-remove"]);
        expect(result.instructions).toHaveLength(0);
        expect(result.nodesToCreate).toHaveLength(0);
        expect(result.edgesToCreate).toHaveLength(0);
        expect(result.nodeKeysToDelete).toHaveLength(0);
    });

    // ─── batch ──────────────────────────────────────────────────────

    it("batch merges results from sub-actions", () => {
        const action: ProposedAction = {
            type: "batch",
            payload: {
                actions: [
                    { type: "create_node", payload: { typeKey: "starter", sheet: "0", posX: 0, posY: 0 } },
                    { type: "create_edge", payload: { sourceKey: "a", sourceHandle: "0", targetKey: "b", targetHandle: "1", sheet: "0" } },
                    { type: "move_node", payload: { nodeKey: "node1", posX: 100, posY: 200 } },
                    { type: "delete_node", payload: { nodeKey: "old-node" } },
                    { type: "delete_edge", payload: { edgeKey: "old-edge" } },
                ],
            },
        };

        const result = convertAction(action, GRAPH_KEY, DEFAULT_SHEET);

        expect(result.nodesToCreate).toHaveLength(1);
        expect(result.edgesToCreate).toHaveLength(1);
        expect(result.instructions).toHaveLength(2); // move_node generates 2 instructions
        expect(result.nodeKeysToDelete).toEqual(["old-node"]);
        expect(result.edgeKeysToDelete).toEqual(["old-edge"]);
    });

    // ─── Purity ─────────────────────────────────────────────────────

    it("is pure — no side effects, deterministic structure", () => {
        const action: ProposedAction = {
            type: "move_node",
            payload: { nodeKey: "n1", posX: 10, posY: 20 },
        };

        const r1 = convertAction(action, GRAPH_KEY, DEFAULT_SHEET);
        const r2 = convertAction(action, GRAPH_KEY, DEFAULT_SHEET);

        // Same structure (though not identical objects)
        expect(r1.instructions).toHaveLength(r2.instructions.length);
        expect(r1.instructions[0].i.o).toBe(r2.instructions[0].i.o);
        expect(r1.instructions[0].i.v).toBe(r2.instructions[0].i.v);
    });

    // ─── Default sheetId ────────────────────────────────────────────

    it("uses defaultSheetId for actions without sheet field", () => {
        const action: ProposedAction = {
            type: "delete_node",
            payload: { nodeKey: "x" },
        };

        const result = convertAction(action, GRAPH_KEY, "custom-sheet");
        expect(result.sheetId).toBe("custom-sheet");
    });

    it("uses action sheet for create_node/create_edge", () => {
        const action: ProposedAction = {
            type: "create_node",
            payload: { typeKey: "t", sheet: "sheet-2", posX: 0, posY: 0 },
        };

        const result = convertAction(action, GRAPH_KEY, DEFAULT_SHEET);
        expect(result.sheetId).toBe("sheet-2");
    });
});
