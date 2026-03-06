import { describe, it, expect } from "vitest";
import { computeAutoLayout, type LayoutResult } from "../tools/autoLayout.js";
import type { Node, Edge } from "@nodius/utils";

// ─── Helpers ─────────────────────────────────────────────────────────

function makeNode(key: string, opts: Partial<Node<unknown>> = {}): Node<unknown> {
    return {
        _key: key,
        graphKey: "g1",
        type: opts.type ?? "default",
        typeVersion: 1,
        sheet: "0",
        size: opts.size ?? { width: 200, height: 100 },
        posX: opts.posX ?? 0,
        posY: opts.posY ?? 0,
        handles: opts.handles ?? {
            L: { position: "separate", point: [{ id: "in0", type: "in", accept: "any" }] },
            R: { position: "separate", point: [{ id: "out0", type: "out", accept: "any" }] },
        },
    };
}

function makeEdge(key: string, source: string, target: string, sourceHandle = "out0", targetHandle = "in0"): Edge {
    return {
        _key: key,
        graphKey: "g1",
        sheet: "0",
        source,
        target,
        sourceHandle,
        targetHandle,
    };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("computeAutoLayout", () => {
    it("returns empty array for empty input", () => {
        const result = computeAutoLayout([], []);
        expect(result).toEqual([]);
    });

    it("returns positions for a single node", () => {
        const nodes = [makeNode("a")];
        const result = computeAutoLayout(nodes, []);

        expect(result).toHaveLength(1);
        expect(result[0].nodeKey).toBe("a");
        expect(typeof result[0].posX).toBe("number");
        expect(typeof result[0].posY).toBe("number");
    });

    it("returns positions for a linear chain (A → B → C)", () => {
        const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
        const edges = [
            makeEdge("e1", "a", "b"),
            makeEdge("e2", "b", "c"),
        ];
        const result = computeAutoLayout(nodes, edges);

        expect(result).toHaveLength(3);

        const posMap = new Map(result.map(r => [r.nodeKey, r]));
        const a = posMap.get("a")!;
        const b = posMap.get("b")!;
        const c = posMap.get("c")!;

        // Default strategy is LR (horizontal), so a.posX < b.posX < c.posX
        expect(a.posX).toBeLessThan(b.posX);
        expect(b.posX).toBeLessThan(c.posX);
    });

    it("vertical strategy produces TB layout (Y increasing)", () => {
        const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
        const edges = [
            makeEdge("e1", "a", "b"),
            makeEdge("e2", "b", "c"),
        ];
        const result = computeAutoLayout(nodes, edges, "vertical");

        const posMap = new Map(result.map(r => [r.nodeKey, r]));
        const a = posMap.get("a")!;
        const b = posMap.get("b")!;
        const c = posMap.get("c")!;

        // TB layout: a.posY < b.posY < c.posY
        expect(a.posY).toBeLessThan(b.posY);
        expect(b.posY).toBeLessThan(c.posY);
    });

    it("handles branching graph (A → B, A → C)", () => {
        const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
        const edges = [
            makeEdge("e1", "a", "b"),
            makeEdge("e2", "a", "c"),
        ];
        const result = computeAutoLayout(nodes, edges);

        expect(result).toHaveLength(3);
        const posMap = new Map(result.map(r => [r.nodeKey, r]));
        const a = posMap.get("a")!;
        const b = posMap.get("b")!;
        const c = posMap.get("c")!;

        // A should be before B and C in horizontal
        expect(a.posX).toBeLessThan(b.posX);
        expect(a.posX).toBeLessThan(c.posX);
        // B and C should be at different Y positions (same layer, different order)
        expect(b.posY).not.toBe(c.posY);
    });

    it("filters edges to only include edges between provided nodes", () => {
        const nodes = [makeNode("a"), makeNode("b")];
        const edges = [
            makeEdge("e1", "a", "b"),
            makeEdge("e2", "b", "external_node"), // should be filtered out
        ];
        const result = computeAutoLayout(nodes, edges);

        expect(result).toHaveLength(2);
    });

    it("handles nodes without handles", () => {
        const node = makeNode("a", { handles: {} });
        const result = computeAutoLayout([node], []);

        expect(result).toHaveLength(1);
        expect(result[0].nodeKey).toBe("a");
    });

    it("handles nodes with multiple handles per side", () => {
        const node = makeNode("a", {
            handles: {
                R: {
                    position: "separate",
                    point: [
                        { id: "out0", type: "out", accept: "any" },
                        { id: "out1", type: "out", accept: "any" },
                    ],
                },
                L: {
                    position: "separate",
                    point: [
                        { id: "in0", type: "in", accept: "any" },
                    ],
                },
            },
        });
        const result = computeAutoLayout([node], []);

        expect(result).toHaveLength(1);
    });

    it("handles fix position mode handles", () => {
        const node = makeNode("a", {
            handles: {
                R: {
                    position: "fix",
                    point: [
                        { id: "out0", type: "out", accept: "any", offset: 50 },
                    ],
                },
            },
        });
        const result = computeAutoLayout([node], []);
        expect(result).toHaveLength(1);
    });

    it("handles middle (0) side handles", () => {
        const node = makeNode("a", {
            handles: {
                "0": {
                    position: "separate",
                    point: [
                        { id: "out0", type: "out", accept: "any" },
                        { id: "in0", type: "in", accept: "any" },
                    ],
                },
            },
        });
        const result = computeAutoLayout([node], []);
        expect(result).toHaveLength(1);
    });

    it("returns rounded integer positions", () => {
        const nodes = [makeNode("a"), makeNode("b")];
        const edges = [makeEdge("e1", "a", "b")];
        const result = computeAutoLayout(nodes, edges);

        for (const r of result) {
            expect(r.posX).toBe(Math.round(r.posX));
            expect(r.posY).toBe(Math.round(r.posY));
        }
    });

    it("handles a diamond graph (A → B, A → C, B → D, C → D)", () => {
        const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
        const edges = [
            makeEdge("e1", "a", "b"),
            makeEdge("e2", "a", "c"),
            makeEdge("e3", "b", "d"),
            makeEdge("e4", "c", "d"),
        ];
        const result = computeAutoLayout(nodes, edges);

        expect(result).toHaveLength(4);
        const posMap = new Map(result.map(r => [r.nodeKey, r]));

        // LR: a before b/c, b/c before d
        expect(posMap.get("a")!.posX).toBeLessThan(posMap.get("b")!.posX);
        expect(posMap.get("a")!.posX).toBeLessThan(posMap.get("c")!.posX);
        expect(posMap.get("b")!.posX).toBeLessThan(posMap.get("d")!.posX);
        expect(posMap.get("c")!.posX).toBeLessThan(posMap.get("d")!.posX);
    });

    it("tree strategy behaves like vertical", () => {
        const nodes = [makeNode("a"), makeNode("b")];
        const edges = [makeEdge("e1", "a", "b")];

        const vertical = computeAutoLayout(nodes, edges, "vertical");
        const tree = computeAutoLayout(nodes, edges, "tree");

        // Both should produce TB layout
        const vMap = new Map(vertical.map(r => [r.nodeKey, r]));
        const tMap = new Map(tree.map(r => [r.nodeKey, r]));

        expect(vMap.get("a")!.posY).toBeLessThan(vMap.get("b")!.posY);
        expect(tMap.get("a")!.posY).toBeLessThan(tMap.get("b")!.posY);
    });
});
