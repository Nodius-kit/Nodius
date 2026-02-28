/**
 * Tests for AI utility functions: createNodeEmbeddingText, hasNodeContentChanged.
 */

import { describe, it, expect } from "vitest";
import { createNodeEmbeddingText, hasNodeContentChanged, truncate, summarizeHandles } from "./utils.js";
import type { Node } from "@nodius/utils";

// ─── Helper to build a minimal Node ──────────────────────────────────

function makeNode(overrides: Partial<Node<any>> = {}): Node<any> {
    return {
        _key: "n1",
        graphKey: "g1",
        type: "html",
        typeVersion: 1,
        sheet: "main",
        size: { width: 200, height: 100 },
        posX: 0,
        posY: 0,
        process: "",
        handles: {},
        ...overrides,
    };
}

// ─── createNodeEmbeddingText ─────────────────────────────────────────

describe("createNodeEmbeddingText", () => {
    it("includes node type", () => {
        const text = createNodeEmbeddingText(makeNode({ type: "starter" }));
        expect(text).toContain("type: starter");
    });

    it("includes process code", () => {
        const text = createNodeEmbeddingText(makeNode({ process: "next(node.data);" }));
        expect(text).toContain("process: next(node.data);");
    });

    it("includes data as JSON", () => {
        const text = createNodeEmbeddingText(makeNode({ data: { name: "test", value: 42 } }));
        expect(text).toContain("data:");
        expect(text).toContain('"name"');
        expect(text).toContain('"test"');
    });

    it("includes string data directly", () => {
        const text = createNodeEmbeddingText(makeNode({ data: "hello world" }));
        expect(text).toContain("data: hello world");
    });

    it("skips empty process", () => {
        const text = createNodeEmbeddingText(makeNode({ process: "" }));
        expect(text).not.toContain("process:");
    });

    it("skips whitespace-only process", () => {
        const text = createNodeEmbeddingText(makeNode({ process: "   " }));
        expect(text).not.toContain("process:");
    });

    it("skips undefined data", () => {
        const text = createNodeEmbeddingText(makeNode({ data: undefined }));
        expect(text).not.toContain("data:");
    });

    it("skips null data", () => {
        const text = createNodeEmbeddingText(makeNode({ data: null }));
        expect(text).not.toContain("data:");
    });

    it("skips empty object data", () => {
        const text = createNodeEmbeddingText(makeNode({ data: {} }));
        expect(text).not.toContain("data:");
    });

    it("truncates at 8000 characters", () => {
        const longProcess = "x".repeat(10000);
        const text = createNodeEmbeddingText(makeNode({ process: longProcess }));
        expect(text.length).toBeLessThanOrEqual(8000);
    });

    it("returns non-empty string for a typical node", () => {
        const text = createNodeEmbeddingText(makeNode({
            type: "html",
            process: "const result = node.data.x + node.data.y;\nnext(result);",
            data: { x: 10, y: 20 },
        }));
        expect(text.length).toBeGreaterThan(0);
        expect(text).toContain("type: html");
        expect(text).toContain("process:");
        expect(text).toContain("data:");
    });
});

// ─── hasNodeContentChanged ───────────────────────────────────────────

describe("hasNodeContentChanged", () => {
    it("returns false for identical nodes", () => {
        const node = makeNode();
        expect(hasNodeContentChanged(node, { ...node })).toBe(false);
    });

    it("returns false for position-only change", () => {
        const original = makeNode({ posX: 0, posY: 0 });
        const moved = makeNode({ posX: 500, posY: 300 });
        expect(hasNodeContentChanged(original, moved)).toBe(false);
    });

    it("returns false for size-only change", () => {
        const original = makeNode({ size: { width: 200, height: 100 } });
        const resized = makeNode({ size: { width: 400, height: 200 } });
        expect(hasNodeContentChanged(original, resized)).toBe(false);
    });

    it("returns false for position + size change (drag & resize)", () => {
        const original = makeNode({ posX: 0, posY: 0, size: { width: 200, height: 100 } });
        const changed = makeNode({ posX: 100, posY: 200, size: { width: 300, height: 150 } });
        expect(hasNodeContentChanged(original, changed)).toBe(false);
    });

    it("returns true for type change", () => {
        const original = makeNode({ type: "html" });
        const changed = makeNode({ type: "starter" });
        expect(hasNodeContentChanged(original, changed)).toBe(true);
    });

    it("returns true for process change", () => {
        const original = makeNode({ process: "next();" });
        const changed = makeNode({ process: "next(node.data);" });
        expect(hasNodeContentChanged(original, changed)).toBe(true);
    });

    it("returns true for data change", () => {
        const original = makeNode({ data: { value: 1 } });
        const changed = makeNode({ data: { value: 2 } });
        expect(hasNodeContentChanged(original, changed)).toBe(true);
    });

    it("returns true for handles change", () => {
        const original = makeNode({ handles: {} });
        const changed = makeNode({
            handles: {
                R: { position: "separate", point: [{ id: "out1", type: "out", accept: "*" }] },
            },
        });
        expect(hasNodeContentChanged(original, changed)).toBe(true);
    });

    it("returns true for data added to node that had none", () => {
        const original = makeNode({ data: undefined });
        const changed = makeNode({ data: { name: "test" } });
        expect(hasNodeContentChanged(original, changed)).toBe(true);
    });
});

// ─── Existing utility functions ──────────────────────────────────────

describe("truncate", () => {
    it("returns empty string for falsy input", () => {
        expect(truncate("", 10)).toBe("");
    });

    it("does not truncate short strings", () => {
        expect(truncate("hello", 10)).toBe("hello");
    });

    it("truncates long strings with ellipsis", () => {
        expect(truncate("hello world", 5)).toBe("hello...");
    });
});

describe("summarizeHandles", () => {
    it("returns empty array for undefined handles", () => {
        expect(summarizeHandles(undefined)).toEqual([]);
    });

    it("summarizes handles correctly", () => {
        const handles = {
            R: {
                position: "separate",
                point: [{ id: "out1", type: "out", accept: "*", display: "Output" }],
            },
        };
        const result = summarizeHandles(handles as any);
        expect(result).toHaveLength(1);
        expect(result[0].side).toBe("R");
        expect(result[0].points[0].id).toBe("out1");
        expect(result[0].points[0].display).toBe("Output");
    });
});
