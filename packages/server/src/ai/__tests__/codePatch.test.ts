import { describe, it, expect } from "vitest";
import { applyPatches, computeLineDiff, type CodePatch } from "../tools/codePatch.js";

describe("applyPatches()", () => {
    it("applies a single search/replace patch", () => {
        const original = `const x = 1;\nconst y = 2;\nreturn x + y;`;
        const patches: CodePatch[] = [
            { search: "const y = 2;", replace: "const y = 10;" },
        ];
        const result = applyPatches(original, patches);
        expect(result).toBe("const x = 1;\nconst y = 10;\nreturn x + y;");
    });

    it("applies multiple patches sequentially", () => {
        const original = `function process() {\n  log("start");\n  next();\n}`;
        const patches: CodePatch[] = [
            { search: `log("start");`, replace: `log("processing data...");` },
            { search: "next();", replace: "next({ done: true });" },
        ];
        const result = applyPatches(original, patches);
        expect(result).toContain(`log("processing data...");`);
        expect(result).toContain("next({ done: true });");
    });

    it("handles deletion (empty replace)", () => {
        const original = `const debug = true;\nconsole.log("debug");\nreturn data;`;
        const patches: CodePatch[] = [
            { search: `console.log("debug");\n`, replace: "" },
        ];
        const result = applyPatches(original, patches);
        expect(result).toBe(`const debug = true;\nreturn data;`);
    });

    it("handles insertion by including context in search", () => {
        const original = `function process() {\n  next();\n}`;
        const patches: CodePatch[] = [
            {
                search: "function process() {\n  next();",
                replace: "function process() {\n  log('starting');\n  next();",
            },
        ];
        const result = applyPatches(original, patches);
        expect(result).toBe("function process() {\n  log('starting');\n  next();\n}");
    });

    it("throws when search string is not found", () => {
        const original = "const x = 1;";
        const patches: CodePatch[] = [
            { search: "const y = 2;", replace: "const y = 3;" },
        ];
        expect(() => applyPatches(original, patches)).toThrow("search string not found");
    });

    it("handles empty original with empty search (insert at beginning)", () => {
        const patches: CodePatch[] = [
            { search: "", replace: "const x = 1;\nreturn x;" },
        ];
        const result = applyPatches("", patches);
        expect(result).toBe("const x = 1;\nreturn x;");
    });

    it("handles empty search on non-empty code (append)", () => {
        const original = "const x = 1;";
        const patches: CodePatch[] = [
            { search: "", replace: "\nconst y = 2;" },
        ];
        const result = applyPatches(original, patches);
        expect(result).toBe("const x = 1;\nconst y = 2;");
    });

    it("applies patches in order (second patch sees result of first)", () => {
        const original = "a b c";
        const patches: CodePatch[] = [
            { search: "b", replace: "B" },
            { search: "a B c", replace: "X Y Z" },
        ];
        const result = applyPatches(original, patches);
        expect(result).toBe("X Y Z");
    });

    it("handles multiline search/replace correctly", () => {
        const original = [
            "const data = node.data;",
            "if (data.url) {",
            "  const res = await fetch(data.url);",
            "  const json = await res.json();",
            "  next(json);",
            "}",
        ].join("\n");

        const patches: CodePatch[] = [
            {
                search: "  const res = await fetch(data.url);\n  const json = await res.json();",
                replace: "  const res = await fetch(data.url, { headers: data.headers });\n  const json = await res.json();\n  log('Fetched ' + json.length + ' items');",
            },
        ];

        const result = applyPatches(original, patches);
        expect(result).toContain("{ headers: data.headers }");
        expect(result).toContain("log('Fetched '");
        expect(result).toContain("next(json);");
    });

    it("handles realistic Nodius process code patch", () => {
        const original = [
            "// Fetch API data",
            "const url = node.data.apiUrl;",
            "const response = await fetch(url);",
            "const data = await response.json();",
            "",
            "if (data.error) {",
            "  branch('error', { message: data.error });",
            "} else {",
            "  next(data);",
            "}",
        ].join("\n");

        const patches: CodePatch[] = [
            {
                search: "const response = await fetch(url);",
                replace: "const response = await fetch(url, {\n  method: 'POST',\n  body: JSON.stringify(incoming),\n});",
            },
            {
                search: "  next(data);",
                replace: "  global.lastFetch = Date.now();\n  next(data);",
            },
        ];

        const result = applyPatches(original, patches);
        expect(result).toContain("method: 'POST'");
        expect(result).toContain("body: JSON.stringify(incoming)");
        expect(result).toContain("global.lastFetch = Date.now();");
        // Original code preserved
        expect(result).toContain("// Fetch API data");
        expect(result).toContain("branch('error'");
    });
});

describe("computeLineDiff()", () => {
    it("returns all unchanged for identical strings", () => {
        const text = "line1\nline2\nline3";
        const diff = computeLineDiff(text, text);
        expect(diff.every(l => l.type === "unchanged")).toBe(true);
        expect(diff).toHaveLength(3);
    });

    it("detects added lines", () => {
        const original = "line1\nline3";
        const modified = "line1\nline2\nline3";
        const diff = computeLineDiff(original, modified);
        const added = diff.filter(l => l.type === "added");
        expect(added).toHaveLength(1);
        expect(added[0].content).toBe("line2");
    });

    it("detects removed lines", () => {
        const original = "line1\nline2\nline3";
        const modified = "line1\nline3";
        const diff = computeLineDiff(original, modified);
        const removed = diff.filter(l => l.type === "removed");
        expect(removed).toHaveLength(1);
        expect(removed[0].content).toBe("line2");
    });

    it("detects modifications as remove + add", () => {
        const original = "const x = 1;";
        const modified = "const x = 42;";
        const diff = computeLineDiff(original, modified);
        expect(diff.filter(l => l.type === "removed")).toHaveLength(1);
        expect(diff.filter(l => l.type === "added")).toHaveLength(1);
    });

    it("handles empty original", () => {
        const diff = computeLineDiff("", "line1\nline2");
        const added = diff.filter(l => l.type === "added");
        expect(added.length).toBeGreaterThanOrEqual(1);
    });

    it("handles empty modified", () => {
        const diff = computeLineDiff("line1\nline2", "");
        const removed = diff.filter(l => l.type === "removed");
        expect(removed.length).toBeGreaterThanOrEqual(1);
    });

    it("preserves line order in diff output", () => {
        const original = "a\nb\nc\nd";
        const modified = "a\nX\nc\nY";
        const diff = computeLineDiff(original, modified);
        const contents = diff.map(l => l.content);
        // 'a' should come before 'c' in the output
        expect(contents.indexOf("a")).toBeLessThan(contents.indexOf("c"));
    });

    it("computes diff for realistic code change", () => {
        const original = [
            "const url = node.data.apiUrl;",
            "const response = await fetch(url);",
            "const data = await response.json();",
            "next(data);",
        ].join("\n");

        const modified = [
            "const url = node.data.apiUrl;",
            "const response = await fetch(url, {",
            "  method: 'POST',",
            "  body: JSON.stringify(incoming),",
            "});",
            "const data = await response.json();",
            "log('Fetched data');",
            "next(data);",
        ].join("\n");

        const diff = computeLineDiff(original, modified);
        const removed = diff.filter(l => l.type === "removed");
        const added = diff.filter(l => l.type === "added");

        // The simple fetch line should be removed
        expect(removed.some(l => l.content === "const response = await fetch(url);")).toBe(true);
        // New lines should be added
        expect(added.some(l => l.content.includes("method: 'POST'"))).toBe(true);
        expect(added.some(l => l.content.includes("log('Fetched data')"))).toBe(true);
    });
});
