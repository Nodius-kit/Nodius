/**
 * Shared utilities for the AI module.
 */

import { deepEqual, type NodeTypeConfig } from "@nodius/utils";
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
const EMBEDDING_TEXT_MAX_LEN = 15000;

/**
 * Build a plain-text representation of a NodeTypeConfig (primitive) for
 * embedding generation. The RAG semantic search runs on these vectors so the
 * LLM can suggest a node *type* even when no instance of it exists in the
 * user's graph yet.
 */
export function createNodeConfigEmbeddingText(config: NodeTypeConfig): string {
    const parts: string[] = [];

    if (config.displayName) parts.push(`name: ${config.displayName}`);
    if (config.category) parts.push(`category: ${config.category}`);
    if (config.description) parts.push(`description: ${config.description}`);

    const handlesSummary = summarizeConfigHandles(config);
    if (handlesSummary) parts.push(`handles: ${handlesSummary}`);

    const text = parts.join("\n");
    return text.length > EMBEDDING_TEXT_MAX_LEN
        ? text.slice(0, EMBEDDING_TEXT_MAX_LEN)
        : text;
}

/**
 * Decide whether an updated NodeTypeConfig needs a fresh embedding. Skips
 * re-embedding when only fields irrelevant to semantic meaning changed
 * (icon, border colors, sizes, timestamps).
 */
export function hasNodeConfigContentChanged(
    original: NodeTypeConfig | undefined,
    current: NodeTypeConfig,
): boolean {
    if (!original) return true;
    if (original.displayName !== current.displayName) return true;
    if ((original.description ?? "") !== (current.description ?? "")) return true;
    if ((original.category ?? "") !== (current.category ?? "")) return true;
    if (!deepEqual(original.node?.handles, current.node?.handles)) return true;
    return false;
}

function summarizeConfigHandles(config: NodeTypeConfig): string {
    const handles = config.node?.handles;
    if (!handles) return "";
    const parts: string[] = [];
    for (const [side, group] of Object.entries(handles)) {
        const points = (group as { point?: Array<{ type: string; accept: string; display?: string }> }).point ?? [];
        for (const p of points) {
            const display = p.display ? `:${p.display}` : "";
            parts.push(`${side}:${p.type}(${p.accept})${display}`);
        }
    }
    return parts.join(", ");
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
