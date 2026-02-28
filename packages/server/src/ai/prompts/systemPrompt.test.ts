import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildContextSummary } from "./systemPrompt.js";
import type { GraphRAGContext } from "../types.js";

function makeContext(overrides?: Partial<GraphRAGContext>): GraphRAGContext {
    return {
        graph: {
            _key: "g1",
            name: "Test Graph",
            description: "A test workflow",
            sheets: { "0": "main", "1": "secondary" },
        },
        relevantNodes: [
            {
                _key: "n1",
                type: "starter",
                sheet: "0",
                sheetName: "main",
                process: "console.log('hello');",
                handles: [],
            },
        ],
        relevantEdges: [
            {
                source: "n1",
                sourceHandle: "0",
                target: "n2",
                targetHandle: "0",
                label: "next",
            },
        ],
        nodeTypeConfigs: [
            {
                _key: "api-call",
                displayName: "API Call",
                description: "Makes an HTTP request",
                category: "data",
                icon: "Globe",
                handlesSummary: "L:in(any), R:out(any)",
            },
        ],
        ...overrides,
    };
}

describe("buildSystemPrompt()", () => {
    it("contains the graph name", () => {
        const prompt = buildSystemPrompt(makeContext());
        expect(prompt).toContain("Test Graph");
    });

    it("contains the sheets", () => {
        const prompt = buildSystemPrompt(makeContext());
        expect(prompt).toContain("main");
        expect(prompt).toContain("secondary");
    });

    it("contains custom NodeTypeConfig info", () => {
        const prompt = buildSystemPrompt(makeContext());
        expect(prompt).toContain("API Call");
        expect(prompt).toContain("Makes an HTTP request");
        expect(prompt).toContain("L:in(any), R:out(any)");
    });

    it("viewer role produces LECTURE SEULE", () => {
        const prompt = buildSystemPrompt(makeContext(), "viewer");
        expect(prompt).toContain("LECTURE SEULE");
    });

    it("editor role produces proposer des modifications", () => {
        const prompt = buildSystemPrompt(makeContext(), "editor");
        expect(prompt).toContain("proposer des modifications");
    });
});

describe("buildContextSummary()", () => {
    it("lists relevant nodes in TOON format", () => {
        const summary = buildContextSummary(makeContext());
        expect(summary).toContain("NODES PERTINENTS");
        // TOON tabular format: header row then data rows
        expect(summary).toContain("n1");
        expect(summary).toContain("starter");
    });

    it("lists relevant edges in TOON format", () => {
        const summary = buildContextSummary(makeContext());
        expect(summary).toContain("EDGES PERTINENTES");
        // TOON encodes from/to as comma-separated values
        expect(summary).toContain("n1:0");
        expect(summary).toContain("n2:0");
        expect(summary).toContain("next");
    });

    it("returns empty string when no nodes/edges", () => {
        const summary = buildContextSummary(makeContext({ relevantNodes: [], relevantEdges: [] }));
        expect(summary).toBe("");
    });
});
