/**
 * @file renderMessageContent.tsx
 * @description Lightweight markdown renderer for AI chat messages.
 *
 * Supports:
 * - Code blocks (```), headers (#), lists (- / 1.), bold, italic, inline code
 * - Client Actions: {{action:params}} syntax for interactive elements
 *
 * Client Action syntax (distinct from LLM tool calls):
 *   {{node:key}}                   — Clickable node ref (zoom + select)
 *   {{select:key1,key2,...}}       — Select multiple nodes
 *   {{fitArea:minX,minY,maxX,maxY}} — Zoom camera to area
 *   {{sheet:sheetKey}}             — Switch active sheet
 *   {{graph:graphKey}}             — Link to open another graph
 *   {{link:url|label}}             — External hyperlink
 *
 * No external dependencies (no react-markdown).
 */

import React, { memo } from "react";
import { useDynamicClass } from "../../hooks/useDynamicClass";
import { MapPin, MousePointerClick, Crosshair, Maximize2, Layers, Network, ExternalLink, FileCode, Settings } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────

export interface ClientActionHandlers {
    /** Zoom to a node and select it. */
    onNodeClick?: (nodeKey: string) => void;
    /** Select multiple nodes. */
    onSelectNodes?: (nodeKeys: string[]) => void;
    /** Select multiple nodes AND zoom camera to fit them all. */
    onHighlightNodes?: (nodeKeys: string[]) => void;
    /** Fit camera to a bounding area. */
    onFitArea?: (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => void;
    /** Switch the active sheet. */
    onChangeSheet?: (sheetKey: string) => void;
    /** Open another graph. */
    onOpenGraph?: (graphKey: string) => void;
    /** Open an HTML class. */
    onOpenHtml?: (htmlKey: string) => void;
    /** Open a node config. */
    onOpenNodeConfig?: (configKey: string) => void;
}

export interface RenderOptions extends ClientActionHandlers {
    /** Map of nodeKey → display name (resolved client-side from nodeTypeConfig). */
    nodeDisplayNames?: Map<string, string>;
    /** Map of sheetKey → display name. */
    sheetDisplayNames?: Map<string, string>;
    /** Map of graphKey → display name. */
    graphDisplayNames?: Map<string, string>;
    /** Map of htmlKey → display name. */
    htmlDisplayNames?: Map<string, string>;
    /** Map of configKey → display name. */
    nodeConfigDisplayNames?: Map<string, string>;
}

// ─── Action Components ──────────────────────────────────────────────

const actionLinkStyle = `
    & {
        color: var(--nodius-primary-main);
        cursor: pointer;
        font-weight: 500;
        text-decoration: none;
        border-bottom: 1px dotted var(--nodius-primary-main);
        display: inline-flex;
        align-items: center;
        gap: 3px;
    }
    &:hover {
        border-bottom-style: solid;
        opacity: 0.85;
    }
`;

const NodeRefLink = memo(({ nodeKey, displayName, onClick }: {
    nodeKey: string;
    displayName: string;
    onClick?: (key: string) => void;
}) => {
    const cls = useDynamicClass(actionLinkStyle);
    return (
        <span className={cls} onClick={() => onClick?.(nodeKey)} title={`Zoom to node: ${nodeKey}`}>
            <MapPin size={11} />{displayName}
        </span>
    );
});
NodeRefLink.displayName = "NodeRefLink";

const SelectNodesLink = memo(({ nodeKeys, displayNames, onClick }: {
    nodeKeys: string[];
    displayNames: Map<string, string>;
    onClick?: (keys: string[]) => void;
}) => {
    const cls = useDynamicClass(actionLinkStyle);
    const label = nodeKeys.length <= 2
        ? nodeKeys.map(k => displayNames.get(k) ?? k).join(", ")
        : `${nodeKeys.length} nodes`;
    return (
        <span className={cls} onClick={() => onClick?.(nodeKeys)} title={`Select: ${nodeKeys.join(", ")}`}>
            <MousePointerClick size={11} />{label}
        </span>
    );
});
SelectNodesLink.displayName = "SelectNodesLink";

const HighlightNodesLink = memo(({ nodeKeys, displayNames, onClick }: {
    nodeKeys: string[];
    displayNames: Map<string, string>;
    onClick?: (keys: string[]) => void;
}) => {
    const cls = useDynamicClass(actionLinkStyle);
    const label = nodeKeys.length <= 2
        ? nodeKeys.map(k => displayNames.get(k) ?? k).join(", ")
        : `${nodeKeys.length} nodes`;
    return (
        <span className={cls} onClick={() => onClick?.(nodeKeys)} title={`Highlight & zoom: ${nodeKeys.join(", ")}`}>
            <Crosshair size={11} />{label}
        </span>
    );
});
HighlightNodesLink.displayName = "HighlightNodesLink";

const FitAreaLink = memo(({ bounds, onClick }: {
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    onClick?: (b: typeof bounds) => void;
}) => {
    const cls = useDynamicClass(actionLinkStyle);
    return (
        <span className={cls} onClick={() => onClick?.(bounds)} title="Zoom to this area">
            <Maximize2 size={11} />View area
        </span>
    );
});
FitAreaLink.displayName = "FitAreaLink";

const SheetLink = memo(({ sheetKey, displayName, onClick }: {
    sheetKey: string;
    displayName: string;
    onClick?: (key: string) => void;
}) => {
    const cls = useDynamicClass(actionLinkStyle);
    return (
        <span className={cls} onClick={() => onClick?.(sheetKey)} title={`Switch to sheet: ${sheetKey}`}>
            <Layers size={11} />{displayName}
        </span>
    );
});
SheetLink.displayName = "SheetLink";

const GraphLink = memo(({ graphKey, displayName, onClick }: {
    graphKey: string;
    displayName: string;
    onClick?: (key: string) => void;
}) => {
    const cls = useDynamicClass(actionLinkStyle);
    return (
        <span className={cls} onClick={() => onClick?.(graphKey)} title={`Open graph: ${graphKey}`}>
            <Network size={11} />{displayName}
        </span>
    );
});
GraphLink.displayName = "GraphLink";

const HtmlLink = memo(({ htmlKey, displayName, onClick }: {
    htmlKey: string;
    displayName: string;
    onClick?: (key: string) => void;
}) => {
    const cls = useDynamicClass(actionLinkStyle);
    return (
        <span className={cls} onClick={() => onClick?.(htmlKey)} title={`Open HTML class: ${htmlKey}`}>
            <FileCode size={11} />{displayName}
        </span>
    );
});
HtmlLink.displayName = "HtmlLink";

const NodeConfigLink = memo(({ configKey, displayName, onClick }: {
    configKey: string;
    displayName: string;
    onClick?: (key: string) => void;
}) => {
    const cls = useDynamicClass(actionLinkStyle);
    return (
        <span className={cls} onClick={() => onClick?.(configKey)} title={`Open node config: ${configKey}`}>
            <Settings size={11} />{displayName}
        </span>
    );
});
NodeConfigLink.displayName = "NodeConfigLink";

const ExternalLinkComp = memo(({ url, label }: { url: string; label: string }) => {
    const cls = useDynamicClass(actionLinkStyle);
    return (
        <a className={cls} href={url} target="_blank" rel="noopener noreferrer" title={url}>
            <ExternalLink size={11} />{label}
        </a>
    );
});
ExternalLinkComp.displayName = "ExternalLinkComp";

// ─── CodeBlock ───────────────────────────────────────────────────────

const CodeBlock = memo(({ code, language }: { code: string; language?: string }) => {
    const codeClass = useDynamicClass(`
        & {
            background: var(--nodius-grey-100);
            border: 1px solid var(--nodius-grey-300);
            border-radius: 6px;
            padding: 10px 12px;
            overflow-x: auto;
            font-family: monospace;
            font-size: 12px;
            line-height: 1.5;
            white-space: pre;
            margin: 6px 0;
        }
    `);

    return (
        <pre className={codeClass} data-language={language || undefined}>
            <code>{code}</code>
        </pre>
    );
});
CodeBlock.displayName = "CodeBlock";

// ─── Inline parsing ─────────────────────────────────────────────────

/**
 * Parse a {{action:params}} token into a React element.
 * Returns null if the action is unknown or params are invalid.
 */
function renderAction(action: string, params: string, key: string, options?: RenderOptions): React.JSX.Element | null {
    switch (action) {
        case "node": {
            const nodeKey = params.trim();
            if (!nodeKey) return null;
            const displayName = options?.nodeDisplayNames?.get(nodeKey) ?? nodeKey;
            return <NodeRefLink key={key} nodeKey={nodeKey} displayName={displayName} onClick={options?.onNodeClick} />;
        }
        case "select": {
            const keys = params.split(",").map(k => k.trim()).filter(Boolean);
            if (keys.length === 0) return null;
            return <SelectNodesLink key={key} nodeKeys={keys} displayNames={options?.nodeDisplayNames ?? new Map()} onClick={options?.onSelectNodes} />;
        }
        case "highlight": {
            const keys = params.split(",").map(k => k.trim()).filter(Boolean);
            if (keys.length === 0) return null;
            return <HighlightNodesLink key={key} nodeKeys={keys} displayNames={options?.nodeDisplayNames ?? new Map()} onClick={options?.onHighlightNodes} />;
        }
        case "fitArea": {
            const nums = params.split(",").map(s => parseFloat(s.trim()));
            if (nums.length !== 4 || nums.some(isNaN)) return null;
            const [minX, minY, maxX, maxY] = nums;
            return <FitAreaLink key={key} bounds={{ minX, minY, maxX, maxY }} onClick={options?.onFitArea} />;
        }
        case "sheet": {
            const sheetKey = params.trim();
            if (!sheetKey) return null;
            const displayName = options?.sheetDisplayNames?.get(sheetKey) ?? sheetKey;
            return <SheetLink key={key} sheetKey={sheetKey} displayName={displayName} onClick={options?.onChangeSheet} />;
        }
        case "graph": {
            const graphKey = params.trim();
            if (!graphKey) return null;
            const displayName = options?.graphDisplayNames?.get(graphKey) ?? graphKey;
            return <GraphLink key={key} graphKey={graphKey} displayName={displayName} onClick={options?.onOpenGraph} />;
        }
        case "html": {
            const htmlKey = params.trim();
            if (!htmlKey) return null;
            const displayName = options?.htmlDisplayNames?.get(htmlKey) ?? htmlKey;
            return <HtmlLink key={key} htmlKey={htmlKey} displayName={displayName} onClick={options?.onOpenHtml} />;
        }
        case "nodeConfig": {
            const configKey = params.trim();
            if (!configKey) return null;
            const displayName = options?.nodeConfigDisplayNames?.get(configKey) ?? configKey;
            return <NodeConfigLink key={key} configKey={configKey} displayName={displayName} onClick={options?.onOpenNodeConfig} />;
        }
        case "link": {
            const pipeIdx = params.indexOf("|");
            if (pipeIdx === -1) return <ExternalLinkComp key={key} url={params.trim()} label={params.trim()} />;
            const url = params.slice(0, pipeIdx).trim();
            const label = params.slice(pipeIdx + 1).trim() || url;
            return <ExternalLinkComp key={key} url={url} label={label} />;
        }
        default:
            return null;
    }
}

/**
 * Parse inline markdown: `code`, **bold**, *italic*, {{action:params}}
 * Order matters: code > action > bold > italic to avoid conflicts.
 */
function parseInline(text: string, options?: RenderOptions): (string | React.JSX.Element)[] {
    // Combined regex: inline code | client action | bold | italic
    const regex = /(`[^`]+`)|(\{\{(\w+):([^}]*)\}\})|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
    const parts: (string | React.JSX.Element)[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let keyCounter = 0;

    while ((match = regex.exec(text)) !== null) {
        // Push text before match
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        const key = `il_${keyCounter++}`;

        if (match[1]) {
            // Inline code: `code`
            const code = match[1].slice(1, -1);
            parts.push(
                <code key={key} style={{
                    background: "var(--nodius-grey-100)",
                    padding: "1px 5px",
                    borderRadius: 4,
                    fontFamily: "monospace",
                    fontSize: "0.9em",
                }}>
                    {code}
                </code>
            );
        } else if (match[2] && match[3] && match[4] !== undefined) {
            // Client action: {{action:params}}
            const actionEl = renderAction(match[3], match[4], key, options);
            if (actionEl) {
                parts.push(actionEl);
            } else {
                // Unknown action — render as-is
                parts.push(match[2]);
            }
        } else if (match[5]) {
            // Bold: **text** — recursively parse inner content for nested actions/formatting
            parts.push(<strong key={key}>{parseInline(match[5].slice(2, -2), options)}</strong>);
        } else if (match[6]) {
            // Italic: *text* — recursively parse inner content for nested actions/formatting
            parts.push(<em key={key}>{parseInline(match[6].slice(1, -1), options)}</em>);
        }

        lastIndex = match.index + match[0].length;
    }

    // Push remaining text
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : [text];
}

// ─── Block-level parsing ─────────────────────────────────────────────

interface Block {
    type: "code" | "header" | "list-item-ul" | "list-item-ol" | "paragraph";
    content: string;
    level?: number;
    language?: string;
}

function parseBlocks(text: string): Block[] {
    const lines = text.split("\n");
    const blocks: Block[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Code block: ```
        if (line.trimStart().startsWith("```")) {
            const language = line.trimStart().slice(3).trim() || undefined;
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
                codeLines.push(lines[i]);
                i++;
            }
            blocks.push({ type: "code", content: codeLines.join("\n"), language });
            i++; // skip closing ```
            continue;
        }

        // Header: # ## ###
        const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
        if (headerMatch) {
            blocks.push({ type: "header", content: headerMatch[2], level: headerMatch[1].length });
            i++;
            continue;
        }

        // Unordered list: - or *
        if (/^\s*[-*]\s+/.test(line)) {
            blocks.push({ type: "list-item-ul", content: line.replace(/^\s*[-*]\s+/, "") });
            i++;
            continue;
        }

        // Ordered list: 1. 2. etc
        const olMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
        if (olMatch) {
            blocks.push({ type: "list-item-ol", content: olMatch[2], level: parseInt(olMatch[1]) });
            i++;
            continue;
        }

        // Empty line — skip
        if (line.trim() === "") {
            i++;
            continue;
        }

        // Regular paragraph
        blocks.push({ type: "paragraph", content: line });
        i++;
    }

    return blocks;
}

// ─── Main render function ────────────────────────────────────────────

export function renderMessageContent(content: string, options?: RenderOptions): React.JSX.Element {
    const blocks = parseBlocks(content);
    const elements: React.JSX.Element[] = [];
    let keyCounter = 0;

    let i = 0;
    while (i < blocks.length) {
        const block = blocks[i];
        const key = `blk_${keyCounter++}`;

        switch (block.type) {
            case "code":
                elements.push(<CodeBlock key={key} code={block.content} language={block.language} />);
                break;

            case "header": {
                const sizes = ["1.2em", "1.1em", "1em"];
                const size = sizes[(block.level ?? 1) - 1] || "1em";
                elements.push(
                    <div key={key} style={{ fontWeight: 700, fontSize: size, margin: "8px 0 4px" }}>
                        {parseInline(block.content, options)}
                    </div>
                );
                break;
            }

            case "list-item-ul": {
                const items: Block[] = [];
                while (i < blocks.length && blocks[i].type === "list-item-ul") {
                    items.push(blocks[i]);
                    i++;
                }
                elements.push(
                    <ul key={key} style={{ margin: "4px 0", paddingLeft: 20 }}>
                        {items.map((item, idx) => (
                            <li key={idx} style={{ marginBottom: 2 }}>{parseInline(item.content, options)}</li>
                        ))}
                    </ul>
                );
                continue;
            }

            case "list-item-ol": {
                const items: Block[] = [];
                while (i < blocks.length && blocks[i].type === "list-item-ol") {
                    items.push(blocks[i]);
                    i++;
                }
                elements.push(
                    <ol key={key} style={{ margin: "4px 0", paddingLeft: 20 }}>
                        {items.map((item, idx) => (
                            <li key={idx} style={{ marginBottom: 2 }}>{parseInline(item.content, options)}</li>
                        ))}
                    </ol>
                );
                continue;
            }

            case "paragraph":
                elements.push(
                    <div key={key} style={{ margin: "2px 0" }}>
                        {parseInline(block.content, options)}
                    </div>
                );
                break;
        }

        i++;
    }

    return <>{elements}</>;
}
