/**
 * Integration tests for the code patching pipeline.
 * Tests the full flow: LLM sends processPatches → agent resolves → diff produced.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseProposedAction } from "../tools/writeTools.js";
import { applyPatches, computeLineDiff } from "../tools/codePatch.js";
import { isCodeString, isCodeValue, isKnownCodeField } from "../tools/codeDetector.js";
import type { ConfigureNodeTypePayload, CodeDiffInfo } from "../types.js";

// ─── Simulated NodeTypeConfig process code ──────────────────────────

const EXISTING_PROCESS_CODE = `// Fetch NBA stats from API
const url = node.data.apiUrl || "https://api.nba.com/stats";
const headers = { "Authorization": "Bearer " + global.apiKey };

const response = await fetch(url, { headers });
const data = await response.json();

if (data.error) {
  log("API error: " + data.error);
  branch("error", { message: data.error });
} else {
  log("Fetched " + data.results.length + " records");
  next(data);
}`;

// ─── Test: parseProposedAction with processPatches ──────────────────

describe("Code Patch Integration", () => {
    it("parseProposedAction preserves processPatches in payload", () => {
        const args = {
            mode: "update",
            typeKey: "nba-fetch",
            displayName: "NBA Fetch",
            processPatches: [
                { search: "const response = await fetch(url, { headers });", replace: "const response = await fetch(url, { headers, method: 'POST' });" },
            ],
            reason: "Switch to POST method",
        };

        const action = parseProposedAction("propose_configure_node_type", args);
        expect(action.type).toBe("configure_node_type");
        const payload = action.payload as ConfigureNodeTypePayload;
        expect(payload.processPatches).toBeDefined();
        expect(payload.processPatches).toHaveLength(1);
        expect(payload.processPatches![0].search).toContain("await fetch(url");
        // process should be undefined since patches are used instead
        expect(payload.process).toBeUndefined();
    });

    it("applyPatches resolves patches correctly on real code", () => {
        const patches = [
            {
                search: `const response = await fetch(url, { headers });`,
                replace: `const response = await fetch(url, {\n  headers,\n  method: "POST",\n  body: JSON.stringify(incoming),\n});`,
            },
            {
                search: `log("Fetched " + data.results.length + " records");`,
                replace: `log("Fetched " + data.results.length + " records");\n  global.lastFetchTime = Date.now();`,
            },
        ];

        const result = applyPatches(EXISTING_PROCESS_CODE, patches);

        // Verify patches were applied
        expect(result).toContain('method: "POST"');
        expect(result).toContain("body: JSON.stringify(incoming)");
        expect(result).toContain("global.lastFetchTime = Date.now()");

        // Verify original code preserved
        expect(result).toContain("// Fetch NBA stats from API");
        expect(result).toContain('branch("error"');
        expect(result).toContain("next(data)");
    });

    it("computeLineDiff shows added/removed lines for patched code", () => {
        const modified = applyPatches(EXISTING_PROCESS_CODE, [
            {
                search: `const response = await fetch(url, { headers });`,
                replace: `const response = await fetch(url, {\n  headers,\n  method: "POST",\n});`,
            },
        ]);

        const diff = computeLineDiff(EXISTING_PROCESS_CODE, modified);
        const added = diff.filter(l => l.type === "added");
        const removed = diff.filter(l => l.type === "removed");

        // One line removed (the old fetch)
        expect(removed.some(l => l.content.includes("await fetch(url, { headers })"))).toBe(true);
        // Multiple lines added (the new fetch with options)
        expect(added.some(l => l.content.includes('method: "POST"'))).toBe(true);

        // Unchanged lines are preserved
        const unchanged = diff.filter(l => l.type === "unchanged");
        expect(unchanged.some(l => l.content.includes("// Fetch NBA stats"))).toBe(true);
    });

    it("full pipeline: patches → apply → diff → CodeDiffInfo", () => {
        const patches = [
            {
                search: `log("API error: " + data.error);`,
                replace: `log("API error: " + data.error);\n    global.errorCount = (global.errorCount || 0) + 1;`,
            },
        ];

        // Step 1: Apply patches
        const modified = applyPatches(EXISTING_PROCESS_CODE, patches);

        // Step 2: Compute diff
        const diff = computeLineDiff(EXISTING_PROCESS_CODE, modified);

        // Step 3: Build CodeDiffInfo
        const codeDiff: CodeDiffInfo = {
            field: "process",
            original: EXISTING_PROCESS_CODE,
            modified,
            patches,
        };

        // Verify
        expect(codeDiff.field).toBe("process");
        expect(codeDiff.original).toBe(EXISTING_PROCESS_CODE);
        expect(codeDiff.modified).toContain("global.errorCount");
        expect(codeDiff.patches).toHaveLength(1);

        // Diff should show the addition
        const addedLines = diff.filter(l => l.type === "added");
        expect(addedLines.some(l => l.content.includes("global.errorCount"))).toBe(true);
    });

    it("handles empty process code (new node type getting first process)", () => {
        const originalProcess = "";
        const patches = [
            { search: "", replace: "const data = incoming;\nnext(data);" },
        ];

        const modified = applyPatches(originalProcess, patches);
        expect(modified).toBe("const data = incoming;\nnext(data);");

        const diff = computeLineDiff(originalProcess, modified);
        const added = diff.filter(l => l.type === "added");
        expect(added.length).toBeGreaterThanOrEqual(2);
        expect(added.some(l => l.content.includes("incoming"))).toBe(true);
        expect(added.some(l => l.content.includes("next"))).toBe(true);
    });

    it("detects process code as code even with known field", () => {
        // Empty process should be detected as code via known field
        expect(isKnownCodeField("configure_node_type", "process")).toBe(true);
        expect(isCodeValue("", "configure_node_type", "process")).toBe(true);

        // Non-empty process should be detected via heuristics
        expect(isCodeString(EXISTING_PROCESS_CODE)).toBe(true);
    });

    it("patch failure does not corrupt original code", () => {
        const patches = [
            { search: "nonexistent code", replace: "new code" },
        ];

        expect(() => applyPatches(EXISTING_PROCESS_CODE, patches)).toThrow("search string not found");
        // Original is unchanged (no mutation)
        expect(EXISTING_PROCESS_CODE).toContain("// Fetch NBA stats from API");
    });

    it("multiple patches on same code region apply correctly", () => {
        // First patch modifies a line, second patch modifies the result of the first
        const patches = [
            { search: "next(data);", replace: "next({ ...data, processed: true });" },
            { search: "processed: true", replace: "processed: true, timestamp: Date.now()" },
        ];

        const result = applyPatches(EXISTING_PROCESS_CODE, patches);
        expect(result).toContain("processed: true, timestamp: Date.now()");
    });

    it("deletion patch produces correct diff", () => {
        const patches = [
            {
                search: `const headers = { "Authorization": "Bearer " + global.apiKey };\n\n`,
                replace: "",
            },
            {
                search: "await fetch(url, { headers })",
                replace: "await fetch(url)",
            },
        ];

        const modified = applyPatches(EXISTING_PROCESS_CODE, patches);
        const diff = computeLineDiff(EXISTING_PROCESS_CODE, modified);

        // Headers line should be removed
        const removed = diff.filter(l => l.type === "removed");
        expect(removed.some(l => l.content.includes("Authorization"))).toBe(true);

        // No headers in modified
        expect(modified).not.toContain("Authorization");
        expect(modified).toContain("await fetch(url)");
    });

    it("parseProposedAction with both process and processPatches keeps patches", () => {
        // If both are provided, processPatches takes precedence (the prompt instructs this)
        const args = {
            mode: "update",
            typeKey: "test-type",
            displayName: "Test",
            process: "full replacement code",
            processPatches: [
                { search: "old", replace: "new" },
            ],
            reason: "test",
        };

        const action = parseProposedAction("propose_configure_node_type", args);
        const payload = action.payload as ConfigureNodeTypePayload;
        // Both should be preserved — the preprocessing step will decide which to use
        expect(payload.process).toBe("full replacement code");
        expect(payload.processPatches).toHaveLength(1);
    });
});
