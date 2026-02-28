/**
 * Shared utilities for the AI module.
 */

import type { Node } from "@nodius/utils";
import type { HandleSummary } from "./types.js";

/**
 * Truncate a string to a maximum length, appending "..." if truncated.
 */
export function truncate(str: string, maxLen: number): string {
    if (!str) return "";
    return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}

// ─── Embedding helpers ───────────────────────────────────────────────

/** Maximum characters for embedding input text. */
const EMBEDDING_TEXT_MAX_LEN = 8000;

/**
 * Build a plain-text representation of a node for embedding generation.
 * Concatenates type, process code, and data into a single string.
 * Truncated to EMBEDDING_TEXT_MAX_LEN to stay within model token limits.
 */
export function createNodeEmbeddingText(node: Node<unknown>): string {
    const parts: string[] = [];

    // Node type (e.g. "html", "starter", custom types)
    if (node.type) {
        parts.push(`type: ${node.type}`);
    }

    // Process code (JavaScript executed by the workflow engine)
    if (node.process && node.process.trim().length > 0) {
        parts.push(`process: ${node.process.trim()}`);
    }

    // Data payload (arbitrary JSON attached to the node)
    if (node.data !== undefined && node.data !== null) {
        const dataStr = typeof node.data === "string" ? node.data : JSON.stringify(node.data);
        if (dataStr.length > 0 && dataStr !== "{}") {
            parts.push(`data: ${dataStr}`);
        }
    }

    const text = parts.join("\n");
    return text.length > EMBEDDING_TEXT_MAX_LEN
        ? text.slice(0, EMBEDDING_TEXT_MAX_LEN)
        : text;
}

/**
 * Determine if a node's *content* has changed compared to its original version.
 * Returns false for position-only or size-only moves (posX, posY, size).
 * Used to avoid regenerating embeddings when a node is just dragged around.
 */
export function hasNodeContentChanged(original: Node<unknown>, current: Node<unknown>): boolean {
    // Compare the fields that affect semantic meaning
    if (original.type !== current.type) return true;
    if (original.process !== current.process) return true;
    if (JSON.stringify(original.data) !== JSON.stringify(current.data)) return true;
    if (JSON.stringify(original.handles) !== JSON.stringify(current.handles)) return true;
    return false;
}

// ─── LLM context helpers ─────────────────────────────────────────────

/**
 * Summarize a node's handles into a compact array for LLM context.
 */
export function summarizeHandles(
    handles: Record<string, { position: string; point: Array<{ id: string; type: string; accept: string; display?: string }> }> | undefined,
): HandleSummary[] {
    if (!handles) return [];
    return Object.entries(handles).map(([side, group]) => ({
        side,
        points: (group.point ?? []).map(p => ({
            id: p.id,
            type: p.type as "in" | "out",
            accept: p.accept,
            display: p.display,
        })),
    }));
}
