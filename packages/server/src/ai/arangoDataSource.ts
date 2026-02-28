/**
 * ArangoDB implementation of GraphDataSource.
 *
 * Translates the abstract data source interface into real AQL queries
 * against the Nodius collections (nodius_graphs, nodius_nodes, nodius_edges,
 * nodius_node_config).
 *
 * Handles composite key conversion: ArangoDB stores `{graphKey}-{localKey}`,
 * but the AI module works with localKeys only (like the client does).
 */

import { aql } from "arangojs";
import { cleanNode, cleanEdge } from "@nodius/utils";
import type { Edge, Node, NodeTypeConfig } from "@nodius/utils";
import type { GraphDataSource, GraphRAGContext } from "./types.js";
import { db } from "../server.js";

export class ArangoGraphDataSource implements GraphDataSource {
    private workspace: string;

    constructor(workspace: string) {
        this.workspace = workspace;
        console.trace();
        console.log("aaa", this.workspace);
    }

    async getGraph(graphKey: string): Promise<GraphRAGContext["graph"] | null> {
        const cursor = await db.query(aql`
            FOR g IN nodius_graphs
                FILTER g._key == ${graphKey}
                    AND g.workspace == ${this.workspace}
                RETURN g
        `);
        const graph = await cursor.next();
        if (!graph) return null;

        return {
            _key: graph._key,
            name: graph.name,
            description: graph.description,
            sheets: graph.sheetsList ?? {},
            metadata: graph.metadata,
        };
    }

    async getNodes(graphKey: string, sheetId?: string): Promise<Node<unknown>[]> {
        let cursor;
        if (sheetId) {
            cursor = await db.query(aql`
                FOR n IN nodius_nodes
                    FILTER n.graphKey == ${graphKey} AND n.sheet == ${sheetId}
                    RETURN n
            `);
        } else {
            cursor = await db.query(aql`
                FOR n IN nodius_nodes
                    FILTER n.graphKey == ${graphKey}
                    RETURN n
            `);
        }
        const nodes = await cursor.all();
        return nodes.map((n) => this.toLocalNode(n, graphKey));
    }

    async getEdges(graphKey: string, sheetId?: string): Promise<Edge[]> {
        let cursor;
        if (sheetId) {
            cursor = await db.query(aql`
                FOR e IN nodius_edges
                    FILTER e.graphKey == ${graphKey} AND e.sheet == ${sheetId}
                    RETURN e
            `);
        } else {
            cursor = await db.query(aql`
                FOR e IN nodius_edges
                    FILTER e.graphKey == ${graphKey}
                    RETURN e
            `);
        }
        const edges = await cursor.all();
        return edges.map((e) => this.toLocalEdge(e, graphKey));
    }

    async getNodeByKey(graphKey: string, nodeKey: string): Promise<Node<unknown> | null> {
        const compositeKey = `${graphKey}-${nodeKey}`;
        const cursor = await db.query(aql`
            FOR n IN nodius_nodes
                FILTER n._key == ${compositeKey}
                    AND n.graphKey == ${graphKey}
                RETURN n
        `);
        const node = await cursor.next();
        if (!node) return null;
        return this.toLocalNode(node, graphKey);
    }

    async getNodeConfigs(graphKey: string): Promise<NodeTypeConfig[]> {
        const cursor = await db.query(aql`
            FOR c IN nodius_node_config
                FILTER c.workspace == ${this.workspace}
                RETURN c
        `);
        return await cursor.all();
    }

    private static vectorIndexEnsured = false;

    static async ensureVectorIndex(dimension: number = 1536): Promise<void> {
        if (ArangoGraphDataSource.vectorIndexEnsured) return;
        try {
            const collection = db.collection("nodius_nodes");
            await collection.ensureIndex({
                type: "inverted",
                fields: [{ name: "embedding" }],
            } as any);
            ArangoGraphDataSource.vectorIndexEnsured = true;
        } catch (err) {
            // Silently fail — COSINE_SIMILARITY works without a dedicated index
            console.warn("AI: Failed to create vector index (non-critical):", err);
        }
    }

    async searchNodes(graphKey: string, query: string, maxResults = 10, queryEmbedding?: number[]): Promise<Node<unknown>[]> {
        // Vector search branch: use COSINE_SIMILARITY when embedding is provided
        if (queryEmbedding?.length) {
            try {
                await ArangoGraphDataSource.ensureVectorIndex(queryEmbedding.length);
                const cursor = await db.query(aql`
                    FOR n IN nodius_nodes
                        FILTER n.graphKey == ${graphKey}
                        FILTER n.embedding != null
                        LET score = COSINE_SIMILARITY(n.embedding, ${queryEmbedding})
                        FILTER score > 0.3
                        SORT score DESC
                        LIMIT ${maxResults}
                        RETURN n
                `);
                const nodes = await cursor.all();
                if (nodes.length > 0) {
                    return nodes.map((n) => this.toLocalNode(n, graphKey));
                }
                // No results with embeddings → fall through to token search
            } catch (err) {
                console.warn("AI: Vector search failed, falling back to token search:", err);
            }
        }

        const q = query.toLowerCase().trim();

        // Short/empty query: return all nodes
        if (q.length <= 2) {
            const cursor = await db.query(aql`
                FOR n IN nodius_nodes
                    FILTER n.graphKey == ${graphKey}
                    LIMIT ${maxResults}
                    RETURN n
            `);
            const nodes = await cursor.all();
            return nodes.map((n) => this.toLocalNode(n, graphKey));
        }

        // Token-based text search across node fields
        // Uses LIKE for each token against a concatenated text representation
        const tokens = q.split(/\s+/).filter(t => t.length > 2);

        const cursor = await db.query(aql`
            LET configs = (
                FOR c IN nodius_node_config
                    FILTER c.workspace == ${this.workspace}
                    RETURN { _key: c._key, displayName: c.displayName, description: c.description }
            )
            FOR n IN nodius_nodes
                FILTER n.graphKey == ${graphKey}
                LET configMatch = FIRST(FOR c IN configs FILTER c._key == n.type RETURN c)
                LET searchText = LOWER(CONCAT_SEPARATOR(" ",
                    n._key,
                    n.type,
                    n.process || "",
                    TO_STRING(n.data || ""),
                    configMatch.displayName || "",
                    configMatch.description || ""
                ))
                LET score = LENGTH(
                    FOR token IN ${tokens}
                        FILTER CONTAINS(searchText, token)
                        RETURN 1
                )
                FILTER score > 0
                SORT score DESC
                LIMIT ${maxResults}
                RETURN n
        `);
        const nodes = await cursor.all();
        return nodes.map((n) => this.toLocalNode(n, graphKey));
    }

    async getNeighborhood(
        graphKey: string,
        nodeKey: string,
        maxDepth = 2,
        direction: "inbound" | "outbound" | "any" = "any",
    ): Promise<{ nodes: Node<unknown>[]; edges: Edge[] }> {
        const compositeKey = `${graphKey}-${nodeKey}`;
        const startId = `nodius_nodes/${compositeKey}`;

        // AQL does not allow parameterized direction, so we branch
        const query = direction === "inbound"
            ? aql`
                LET startNode = DOCUMENT(${startId})
                FILTER startNode != null AND startNode.graphKey == ${graphKey}
                LET traversal = (
                    FOR v, e IN 1..${maxDepth} INBOUND ${startId} nodius_edges
                        OPTIONS { bfs: true, uniqueVertices: "global" }
                        FILTER v.graphKey == ${graphKey}
                        RETURN { node: v, edge: e }
                )
                RETURN { nodes: APPEND([startNode], traversal[*].node), edges: traversal[*].edge }
            `
            : direction === "outbound"
            ? aql`
                LET startNode = DOCUMENT(${startId})
                FILTER startNode != null AND startNode.graphKey == ${graphKey}
                LET traversal = (
                    FOR v, e IN 1..${maxDepth} OUTBOUND ${startId} nodius_edges
                        OPTIONS { bfs: true, uniqueVertices: "global" }
                        FILTER v.graphKey == ${graphKey}
                        RETURN { node: v, edge: e }
                )
                RETURN { nodes: APPEND([startNode], traversal[*].node), edges: traversal[*].edge }
            `
            : aql`
                LET startNode = DOCUMENT(${startId})
                FILTER startNode != null AND startNode.graphKey == ${graphKey}
                LET traversal = (
                    FOR v, e IN 1..${maxDepth} ANY ${startId} nodius_edges
                        OPTIONS { bfs: true, uniqueVertices: "global" }
                        FILTER v.graphKey == ${graphKey}
                        RETURN { node: v, edge: e }
                )
                RETURN { nodes: APPEND([startNode], traversal[*].node), edges: traversal[*].edge }
            `;

        const cursor = await db.query(query);
        const result = await cursor.next();
        if (!result) return { nodes: [], edges: [] };

        const rawNodes = (result.nodes || []) as Record<string, unknown>[];
        const rawEdges = (result.edges || []) as Record<string, unknown>[];
        const nodes = rawNodes
            .filter((n) => n != null)
            .map((n) => this.toLocalNode(n, graphKey));
        const edges = rawEdges
            .filter((e) => e != null)
            .map((e) => this.toLocalEdge(e, graphKey));

        return { nodes, edges };
    }

    // ─── Private helpers ─────────────────────────────────────────────

    /**
     * Convert an ArangoDB node to local format:
     * - Strips ArangoDB metadata via cleanNode()
     * - Converts composite _key to localKey
     */
    private toLocalNode(doc: Record<string, unknown>, graphKey: string): Node<unknown> {
        const node = cleanNode(doc);
        // Convert composite key "{graphKey}-{localKey}" → "{localKey}"
        if (node._key && node._key.startsWith(`${graphKey}-`)) {
            node._key = node._key.substring(graphKey.length + 1);
        }
        return node;
    }

    /**
     * Convert an ArangoDB edge to local format:
     * - Strips ArangoDB metadata via cleanEdge()
     * - Converts composite _key, source, target to localKeys
     */
    private toLocalEdge(doc: Record<string, unknown>, graphKey: string): Edge {
        const edge = cleanEdge(doc);
        const prefix = `${graphKey}-`;
        if (edge._key && edge._key.startsWith(prefix)) {
            edge._key = edge._key.substring(prefix.length);
        }
        // source/target may already be localKeys from cleanEdge,
        // but if they still have the composite prefix, strip it
        if (edge.source && edge.source.startsWith(prefix)) {
            edge.source = edge.source.substring(prefix.length);
        }
        if (edge.target && edge.target.startsWith(prefix)) {
            edge.target = edge.target.substring(prefix.length);
        }
        return edge;
    }
}
