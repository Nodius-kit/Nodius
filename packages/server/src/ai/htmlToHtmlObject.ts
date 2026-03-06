/**
 * Converts raw HTML string into Nodius HtmlObject tree structure.
 *
 * Parses HTML using node-html-parser, extracts global <style> rules,
 * maps inline styles + class styles into CSSBlock[], and recursively
 * builds the HtmlObject tree (block, text, list, image, link, icon).
 */

import { parse, HTMLElement, NodeType } from "node-html-parser";
import type { Node as HtmlParserNode } from "node-html-parser";
import type { HtmlObject, HtmlBase, CSSBlock, HTMLDomEvent } from "@nodius/utils";

interface ConvertOptions {
    defaultLanguage?: string;
    identifierPrefix?: string;
}

// ─── Utilities ──────────────────────────────────────────────────────

const generateIdentifier = (prefix: string, existingIds: Set<string>): string => {
    let id: string;
    do {
        id = prefix + Math.random().toString(36).substring(2, 6);
    } while (existingIds.has(id));
    existingIds.add(id);
    return id;
};

const parseInlineStyle = (styleString: string): string[][] => {
    if (!styleString) return [];
    return styleString.split(";")
        .filter(rule => rule.trim() !== "")
        .map(rule => {
            const [prop, ...val] = rule.split(":");
            return [prop.trim(), val.join(":").trim()];
        })
        .filter(([prop, val]) => prop && val);
};

const parseGlobalStyles = (root: HTMLElement): Record<string, string[][]> => {
    const styleTags = root.querySelectorAll("style");
    const classRules: Record<string, string[][]> = {};

    for (const styleTag of styleTags) {
        const cssText = styleTag.textContent;
        const ruleRegex = /\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}/g;
        let match;

        while ((match = ruleRegex.exec(cssText)) !== null) {
            const className = match[1];
            const rulesText = match[2];
            const parsed = parseInlineStyle(rulesText);
            if (classRules[className]) {
                classRules[className].push(...parsed);
            } else {
                classRules[className] = parsed;
            }
        }
        styleTag.remove();
    }

    return classRules;
};

const formatName = (node: HTMLElement): string => {
    if (node.id) return node.id;
    const firstClass = node.classList.values().next().value;
    if (firstClass) return firstClass;
    return node.rawTagName.charAt(0).toUpperCase() + node.rawTagName.slice(1).toLowerCase();
};

/** Tags whose content should be treated as text when all children are text nodes. */
const TEXT_ONLY_TAGS = new Set([
    "span", "p", "h1", "h2", "h3", "h4", "h5", "h6",
    "label", "strong", "em", "b", "i", "u", "small", "mark",
]);

type DomEventEntry = HTMLDomEvent<keyof HTMLElementEventMap>;

// ─── Main ───────────────────────────────────────────────────────────

export function htmlToHtmlObject(
    html: string,
    options: ConvertOptions = {},
): HtmlObject {
    const { defaultLanguage = "en", identifierPrefix = "" } = options;
    const existingIds = new Set<string>();

    const root = parse(html);
    const globalClassStyles = parseGlobalStyles(root);

    function convertNode(node: HtmlParserNode): HtmlObject | null {
        // ── Text node ──
        if (node.nodeType === NodeType.TEXT_NODE) {
            const text = node.textContent.trim();
            if (!text) return null;
            return {
                identifier: generateIdentifier(identifierPrefix, existingIds),
                tag: "span",
                name: "Text",
                type: "text",
                css: [],
                domEvents: [],
                content: { [defaultLanguage]: text },
            };
        }

        // Only process element nodes
        if (node.nodeType !== NodeType.ELEMENT_NODE) return null;

        const el = node as HTMLElement;
        const tag = el.rawTagName.toLowerCase();

        // ── Build base properties ──
        const css: CSSBlock[] = [];
        const domEvents: DomEventEntry[] = [];
        const attribute: Record<string, string> = {};

        for (const [key, value] of Object.entries(el.attributes)) {
            if (key === "id" || key === "class") continue;

            if (key === "style") {
                const rules = parseInlineStyle(value);
                if (rules.length > 0) {
                    css.push({ selector: "&", rules });
                }
                continue;
            }

            if (key.startsWith("on")) {
                domEvents.push({ name: key.substring(2) as keyof HTMLElementEventMap, call: value });
                continue;
            }

            if (key.startsWith("data-event-")) {
                domEvents.push({ name: key.substring(11) as keyof HTMLElementEventMap, call: value });
                continue;
            }

            attribute[key] = value;
        }

        // Merge global class styles
        for (const cls of el.classList.values()) {
            if (globalClassStyles[cls]) {
                css.push({ selector: "&", rules: globalClassStyles[cls] });
            }
        }

        const base: HtmlBase = {
            identifier: generateIdentifier(identifierPrefix, existingIds),
            tag,
            name: formatName(el),
            css,
            domEvents,
            ...(el.id ? { id: el.id } : {}),
            ...(Object.keys(attribute).length > 0 ? { attribute } : {}),
        };

        // ── Special tags ──

        if (tag === "img") {
            return {
                ...base,
                type: "image",
                content: [el.attributes.alt || "", el.attributes.src || ""],
            };
        }

        if (tag === "a") {
            const url = el.attributes.href || "#";
            const textContent = el.textContent || "";
            return {
                ...base,
                type: "link",
                content: { url, text: { [defaultLanguage]: textContent } },
            };
        }

        if (tag === "i" && Array.from(el.classList.values()).some(c => c.toLowerCase().includes("lucide"))) {
            const iconName = Array.from(el.classList.values()).find(c => c !== "lucide") || "circle";
            return { ...base, type: "icon", content: iconName };
        }

        // ── Children ──
        const rawChildren: HtmlObject[] = [];
        for (const child of el.childNodes) {
            const converted = convertNode(child);
            if (converted) rawChildren.push(converted);
        }

        // Text-only elements: collapse children text into a single text node
        const isTextOnly = TEXT_ONLY_TAGS.has(tag) && rawChildren.every(c => c.type === "text");
        if (isTextOnly) {
            return {
                ...base,
                type: "text",
                content: { [defaultLanguage]: el.innerHTML },
            };
        }

        if (rawChildren.length === 0) {
            return { ...base, type: "block", content: undefined };
        }

        if (rawChildren.length === 1) {
            return { ...base, type: "block", content: rawChildren[0] };
        }

        return { ...base, type: "list", content: rawChildren };
    }

    // Root — node-html-parser returns an abstract container
    const parsedRootChildren: HtmlObject[] = [];
    for (const child of root.childNodes) {
        const converted = convertNode(child);
        if (converted) parsedRootChildren.push(converted);
    }

    if (parsedRootChildren.length === 1) {
        return parsedRootChildren[0];
    }

    return {
        identifier: generateIdentifier(identifierPrefix, existingIds),
        tag: "div",
        name: "RootContainer",
        type: "list",
        css: [],
        domEvents: [],
        content: parsedRootChildren,
    };
}
