import { describe, it, expect } from "vitest";
import { isCodeString, isKnownCodeField, isCodeValue } from "../tools/codeDetector.js";

describe("isCodeString()", () => {
    it("detects basic JavaScript with function declarations", () => {
        expect(isCodeString("function hello() { return 42; }")).toBe(true);
    });

    it("detects arrow functions", () => {
        expect(isCodeString("const fn = () => { console.log('test'); }")).toBe(true);
    });

    it("detects async/await code", () => {
        expect(isCodeString(`
            async function fetchData() {
                const res = await fetch(url);
                const data = await res.json();
                return data;
            }
        `)).toBe(true);
    });

    it("detects Nodius workflow process code", () => {
        expect(isCodeString(`
            const data = node.data;
            if (incoming && incoming.length > 0) {
                global.result = incoming[0];
            }
            next({ processed: true });
        `)).toBe(true);
    });

    it("detects code with conditionals and loops", () => {
        expect(isCodeString(`
            for (let i = 0; i < items.length; i++) {
                if (items[i].active === true) {
                    results.push(items[i]);
                }
            }
        `)).toBe(true);
    });

    it("detects code with method calls", () => {
        expect(isCodeString("console.log(JSON.stringify({ key: value }));")).toBe(true);
    });

    it("detects code with strict equality and logical operators", () => {
        expect(isCodeString("if (a === b && c !== d || e) { return true; }")).toBe(true);
    });

    it("returns false for empty strings", () => {
        expect(isCodeString("")).toBe(false);
    });

    it("returns false for very short strings", () => {
        expect(isCodeString("hi")).toBe(false);
    });

    it("returns false for plain text", () => {
        expect(isCodeString("This is a simple description of the node.")).toBe(false);
    });

    it("returns false for prose-like content", () => {
        expect(isCodeString("The workflow processes data from the API and filters active items.")).toBe(false);
    });

    it("returns false for single words", () => {
        expect(isCodeString("filter")).toBe(false);
    });

    it("returns false for simple key=value", () => {
        expect(isCodeString("name")).toBe(false);
    });

    it("detects code with import/export", () => {
        expect(isCodeString("import { something } from './module';")).toBe(true);
    });

    it("detects code with class definition", () => {
        expect(isCodeString("class MyHandler { constructor() { this.data = {}; } }")).toBe(true);
    });

    it("detects code with try/catch", () => {
        expect(isCodeString(`
            try {
                const result = JSON.parse(input);
            } catch (err) {
                log('Parse error: ' + err.message);
            }
        `)).toBe(true);
    });

    it("detects code with optional chaining and nullish coalescing", () => {
        expect(isCodeString("const value = obj?.nested?.prop ?? 'default';")).toBe(true);
    });

    it("detects code with spread operator", () => {
        expect(isCodeString("const merged = { ...defaults, ...incoming };")).toBe(true);
    });

    it("detects HTML-related process code", () => {
        expect(isCodeString(`
            const render = getHtmlRenderWithId(node._key, "main");
            initHtml(node.data, "main", ".container");
            HtmlRender.update(render);
        `)).toBe(true);
    });

    it("detects branch/next workflow code", () => {
        expect(isCodeString(`
            if (node.data.condition) {
                branch("success", { result: true });
            } else {
                branch("error", { result: false });
            }
        `)).toBe(true);
    });
});

describe("isKnownCodeField()", () => {
    it("returns true for 'process' in configure_node_type context", () => {
        expect(isKnownCodeField("configure_node_type", "process")).toBe(true);
    });

    it("returns false for unknown fields", () => {
        expect(isKnownCodeField("configure_node_type", "description")).toBe(false);
    });

    it("returns false for unknown contexts", () => {
        expect(isKnownCodeField("unknown_context", "process")).toBe(false);
    });
});

describe("isCodeValue()", () => {
    it("returns true for known code field even with empty string", () => {
        expect(isCodeValue("", "configure_node_type", "process")).toBe(true);
    });

    it("returns true for known code field with non-code content", () => {
        expect(isCodeValue("hello", "configure_node_type", "process")).toBe(true);
    });

    it("returns true for heuristic code detection without context", () => {
        expect(isCodeValue("function test() { return 42; }")).toBe(true);
    });

    it("returns false for non-code without context", () => {
        expect(isCodeValue("Just a description")).toBe(false);
    });
});
