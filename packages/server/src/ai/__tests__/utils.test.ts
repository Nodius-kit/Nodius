/**
 * Tests for AI utility functions:
 * - createNodeConfigEmbeddingText: builds the text we send to the embedding model
 *   for each NodeTypeConfig primitive (semantic search input)
 * - hasNodeConfigContentChanged: gates re-embedding to semantic field changes
 */

import { describe, it, expect } from "vitest";
import {
    createNodeConfigEmbeddingText,
    hasNodeConfigContentChanged,
    truncate,
    summarizeHandles,
} from "../utils.js";
import type { NodeTypeConfig } from "@nodius/utils";

// ─── Helper to build a minimal NodeTypeConfig ────────────────────────

function makeConfig(overrides: Partial<NodeTypeConfig> = {}): NodeTypeConfig {
    return {
        _key: "primitive-key",
        workspace: "test",
        version: 1,
        displayName: "Primitive",
        description: "",
        category: "default",
        alwaysRendered: false,
        content: { type: "text", tag: "span", name: "label", identifier: "r", css: [], domEvents: [], content: { en: "Primitive" } },
        node: {
            type: "primitive-key",
            posX: 0,
            posY: 0,
            process: "",
            handles: {
                L: { position: "separate", point: [{ id: "0", type: "in", accept: "any" }] },
            },
            size: { width: 200, height: 100 },
        },
        border: { radius: 0, width: 0, type: "solid", normal: { color: "#000" }, hover: { color: "#000" } },
        icon: "Square",
        createdTime: 0,
        lastUpdatedTime: 0,
        ...overrides,
    };
}

// ─── createNodeConfigEmbeddingText ───────────────────────────────────

describe("createNodeConfigEmbeddingText", () => {
    it("includes displayName", () => {
        const text = createNodeConfigEmbeddingText(makeConfig({ displayName: "API Call" }));
        expect(text).toContain("name: API Call");
    });

    it("includes description", () => {
        const text = createNodeConfigEmbeddingText(makeConfig({ description: "Makes an HTTP request" }));
        expect(text).toContain("description: Makes an HTTP request");
    });

    it("includes category", () => {
        const text = createNodeConfigEmbeddingText(makeConfig({ category: "data" }));
        expect(text).toContain("category: data");
    });

    it("includes handles", () => {
        const config = makeConfig({
            node: {
                type: "x",
                posX: 0,
                posY: 0,
                process: "",
                handles: {
                    L: { position: "separate", point: [{ id: "0", type: "in", accept: "any" }] },
                    R: { position: "separate", point: [{ id: "0", type: "out", accept: "any", display: "ok" }] },
                },
                size: { width: 100, height: 100 },
            },
        });
        const text = createNodeConfigEmbeddingText(config);
        expect(text).toContain("L:in(any)");
        expect(text).toContain("R:out(any):ok");
    });

    it("omits empty description and category lines", () => {
        const text = createNodeConfigEmbeddingText(makeConfig({ description: "", category: "" }));
        expect(text).not.toContain("description:");
        expect(text).not.toContain("category:");
    });

    it("returns non-empty string for a typical primitive", () => {
        const text = createNodeConfigEmbeddingText(makeConfig({
            displayName: "Filter",
            description: "Filters data based on a condition",
            category: "transform",
        }));
        expect(text.length).toBeGreaterThan(0);
        expect(text).toContain("name: Filter");
        expect(text).toContain("description:");
        expect(text).toContain("category: transform");
    });
});

// ─── hasNodeConfigContentChanged ─────────────────────────────────────

describe("hasNodeConfigContentChanged", () => {
    it("returns true when original is undefined (first save)", () => {
        expect(hasNodeConfigContentChanged(undefined, makeConfig())).toBe(true);
    });

    it("returns false for identical configs", () => {
        const config = makeConfig();
        expect(hasNodeConfigContentChanged(config, { ...config })).toBe(false);
    });

    it("returns false for icon-only change (cosmetic)", () => {
        const original = makeConfig({ icon: "Square" });
        const changed = makeConfig({ icon: "Star" });
        expect(hasNodeConfigContentChanged(original, changed)).toBe(false);
    });

    it("returns false for border-only change (cosmetic)", () => {
        const original = makeConfig();
        const changed = makeConfig({
            border: { radius: 99, width: 5, type: "dashed", normal: { color: "#fff" }, hover: { color: "#aaa" } },
        });
        expect(hasNodeConfigContentChanged(original, changed)).toBe(false);
    });

    it("returns true for displayName change", () => {
        const original = makeConfig({ displayName: "A" });
        const changed = makeConfig({ displayName: "B" });
        expect(hasNodeConfigContentChanged(original, changed)).toBe(true);
    });

    it("returns true for description change", () => {
        const original = makeConfig({ description: "old" });
        const changed = makeConfig({ description: "new" });
        expect(hasNodeConfigContentChanged(original, changed)).toBe(true);
    });

    it("returns true for category change", () => {
        const original = makeConfig({ category: "data" });
        const changed = makeConfig({ category: "transform" });
        expect(hasNodeConfigContentChanged(original, changed)).toBe(true);
    });

    it("returns true when handles change", () => {
        const original = makeConfig();
        const changed = makeConfig({
            node: {
                ...makeConfig().node,
                handles: {
                    R: { position: "separate", point: [{ id: "out1", type: "out", accept: "*" }] },
                },
            },
        });
        expect(hasNodeConfigContentChanged(original, changed)).toBe(true);
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
