/**
 * Memory-Aware Data Source for the AI module.
 *
 * Wraps ArangoGraphDataSource with an in-memory overlay from WebSocketManager.
 * When a graph is actively managed in memory (users are connected), reads from
 * the live nodeMap/edgeMap which contain unsaved modifications.
 * Falls back to ArangoDB when the graph is not in memory.
 *
 * This solves the 30-second sync gap: the auto-save runs every 30s, so ArangoDB
 * may be up to 30s behind. The AI must see the exact current state.
 */

import type { Edge, Node, NodeTypeConfig } from "@nodius/utils";
import type { GraphDataSource, GraphRAGContext } from "./types.js";
import { ArangoGraphDataSource } from "./arangoDataSource.js";

// ─── Types ──────────────────────────────────────────────────────────

/** Minimal interface for reading in-memory graph state from WebSocketManager. */
export interface MemoryGraphProvider {
    getManagedGraphSheets(graphKey: string): Record<string, {
        nodeMap: Map<string, Node<any>>;
        edgeMap: Map<string, Edge[]>;
    }> | undefined;
}

// ─── Implementation ─────────────────────────────────────────────────

export class MemoryAwareDataSource implements GraphDataSource {
    private arango: ArangoGraphDataSource;
    private memoryProvider: MemoryGraphProvider | null;

    constructor(workspace: string, memoryProvider: MemoryGraphProvider | null) {
        this.arango = new ArangoGraphDataSource(workspace);
        this.memoryProvider = memoryProvider;
    }

    // ─── Graph metadata (always from ArangoDB) ──────────────────────

    async getGraph(graphKey: string): Promise<GraphRAGContext["graph"] | null> {
        return this.arango.getGraph(graphKey);
    }

    // ─── NodeConfigs (always from ArangoDB, not per-graph) ──────────

    async getNodeConfigs(graphKey: string): Promise<NodeTypeConfig[]> {
        return this.arango.getNodeConfigs(graphKey);
    }

    // ─── Nodes ──────────────────────────────────────────────────────

    async getNodes(graphKey: string, sheetId?: string): Promise<Node<unknown>[]> {
        const memSheets = this.getMemorySheets(graphKey);
        if (!memSheets) return this.arango.getNodes(graphKey, sheetId);

        const nodes: Node<unknown>[] = [];
        for (const [sid, sheet] of Object.entries(memSheets)) {
            if (sheetId && sid !== sheetId) continue;
            for (const node of sheet.nodeMap.values()) {
                nodes.push(node);
            }
        }
        return nodes;
    }

    // ─── Edges ──────────────────────────────────────────────────────

    async getEdges(graphKey: string, sheetId?: string): Promise<Edge[]> {
        const memSheets = this.getMemorySheets(graphKey);
        if (!memSheets) return this.arango.getEdges(graphKey, sheetId);

        // edgeMap is keyed as "source-{nodeId}" and "target-{nodeId}",
        // so each edge appears twice. Deduplicate by _key.
        const seen = new Set<string>();
        const edges: Edge[] = [];
        for (const [sid, sheet] of Object.entries(memSheets)) {
            if (sheetId && sid !== sheetId) continue;
            for (const edgeList of sheet.edgeMap.values()) {
                for (const edge of edgeList) {
                    if (!seen.has(edge._key)) {
                        seen.add(edge._key);
                        edges.push(edge);
                    }
                }
            }
        }
        return edges;
    }

    // ─── Single node lookup ─────────────────────────────────────────

    async getNodeByKey(graphKey: string, nodeKey: string): Promise<Node<unknown> | null> {
        const memSheets = this.getMemorySheets(graphKey);
        if (!memSheets) return this.arango.getNodeByKey(graphKey, nodeKey);

        for (const sheet of Object.values(memSheets)) {
            const node = sheet.nodeMap.get(nodeKey);
            if (node) return node;
        }
        return null;
    }

    // ─── Search ─────────────────────────────────────────────────────

    async searchNodes(graphKey: string, query: string, maxResults = 10, queryEmbedding?: number[]): Promise<Node<unknown>[]> {
        const memSheets = this.getMemorySheets(graphKey);
        if (!memSheets) return this.arango.searchNodes(graphKey, query, maxResults, queryEmbedding);

        // In-memory token-based search (same logic as ArangoDB but on live data)
        const q = query.toLowerCase().trim();
        const allNodes = await this.getNodes(graphKey);

        if (q.length <= 2) {
            return allNodes.slice(0, maxResults);
        }

        const tokens = q.split(/\s+/).filter(t => t.length > 2);

        const scored = allNodes.map(node => {
            const searchText = [
                node._key,
                node.type,
                node.process || "",
                JSON.stringify(node.data ?? ""),
            ].join(" ").toLowerCase();

            const score = tokens.reduce((s, token) =>
                s + (searchText.includes(token) ? 1 : 0), 0);

            return { node, score };
        });

        return scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults)
            .map(s => s.node);
    }

    // ─── Neighborhood ───────────────────────────────────────────────

    async getNeighborhood(
        graphKey: string,
        nodeKey: string,
        maxDepth = 2,
        direction: "inbound" | "outbound" | "any" = "any",
    ): Promise<{ nodes: Node<unknown>[]; edges: Edge[] }> {
        const memSheets = this.getMemorySheets(graphKey);
        if (!memSheets) return this.arango.getNeighborhood(graphKey, nodeKey, maxDepth, direction);

        // In-memory BFS traversal
        const allNodes = new Map<string, Node<unknown>>();
        const allEdges: Edge[] = [];
        const seen = new Set<string>();

        // Collect all edges flat (deduplicated)
        for (const sheet of Object.values(memSheets)) {
            for (const node of sheet.nodeMap.values()) {
                allNodes.set(node._key, node);
            }
            for (const edgeList of sheet.edgeMap.values()) {
                for (const edge of edgeList) {
                    if (!seen.has(edge._key)) {
                        seen.add(edge._key);
                        allEdges.push(edge);
                    }
                }
            }
        }

        // BFS
        const visited = new Set<string>();
        const resultNodes: Node<unknown>[] = [];
        const resultEdges: Edge[] = [];
        let frontier = [nodeKey];
        visited.add(nodeKey);

        const startNode = allNodes.get(nodeKey);
        if (startNode) resultNodes.push(startNode);

        for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
            const nextFrontier: string[] = [];

            for (const currentKey of frontier) {
                for (const edge of allEdges) {
                    let neighborKey: string | null = null;

                    if (direction === "outbound" || direction === "any") {
                        if (edge.source === currentKey) {
                            neighborKey = edge.target;
                        }
                    }
                    if (direction === "inbound" || direction === "any") {
                        if (edge.target === currentKey) {
                            neighborKey = edge.source;
                        }
                    }

                    if (neighborKey && !visited.has(neighborKey)) {
                        visited.add(neighborKey);
                        nextFrontier.push(neighborKey);

                        const neighborNode = allNodes.get(neighborKey);
                        if (neighborNode) resultNodes.push(neighborNode);
                    }

                    // Collect edge if either end is the current node
                    if (edge.source === currentKey || edge.target === currentKey) {
                        if (!resultEdges.some(e => e._key === edge._key)) {
                            resultEdges.push(edge);
                        }
                    }
                }
            }

            frontier = nextFrontier;
        }

        return { nodes: resultNodes, edges: resultEdges };
    }

    // ─── Private ────────────────────────────────────────────────────

    private getMemorySheets(graphKey: string): Record<string, {
        nodeMap: Map<string, Node<any>>;
        edgeMap: Map<string, Edge[]>;
    }> | undefined {
        return this.memoryProvider?.getManagedGraphSheets(graphKey) ?? undefined;
    }
}
