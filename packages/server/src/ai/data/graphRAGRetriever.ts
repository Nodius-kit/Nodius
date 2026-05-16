import type { Edge, Node, NodeTypeConfig } from "@nodius/utils";
import type { GraphDataSource, GraphRAGContext, RelevantNode, RelevantEdge, NodeTypeConfigSummary } from "../types.js";
import type { EmbeddingProvider } from "../providers/embeddingProvider.js";
import { truncate, summarizeHandles } from "../utils.js";
import { debugAI } from "../aiLogger.js";

export interface GraphRAGOptions {
    maxNodes?: number;
    maxConfigs?: number;
    maxDepth?: number;
    truncateData?: number;
    /** Cache TTL in ms. Default 120000 (2 min). Set to 0 to disable. */
    cacheTTLMs?: number;
}

const DEFAULT_OPTIONS: Required<GraphRAGOptions> = {
    maxNodes: 20,
    maxConfigs: 12,
    maxDepth: 2,
    truncateData: 2000,
    cacheTTLMs: 120_000,
};

/**
 * GraphRAG Retriever — assembles a compact context for the LLM
 * from a user query + graph data source.
 *
 * Semantic search runs on **NodeTypeConfig primitives** (the catalog of
 * available node types), not on instances. The retriever then materialises
 * instances of the matched primitives from the user's graph and expands
 * their neighbourhood. This lets the assistant recommend a primitive even
 * when the user hasn't placed one yet.
 */
export class GraphRAGRetriever {
    private dataSource: GraphDataSource;
    private options: Required<GraphRAGOptions>;
    private embeddingProvider: EmbeddingProvider | null;
    private cache = new Map<string, { context: GraphRAGContext; timestamp: number }>();

    constructor(
        dataSource: GraphDataSource,
        options?: GraphRAGOptions,
        embeddingProvider?: EmbeddingProvider | null,
    ) {
        this.dataSource = dataSource;
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.embeddingProvider = embeddingProvider ?? null;
    }

    /**
     * Build the full GraphRAG context from a user query.
     * 1. Embed the query (when an embedding provider is available)
     * 2. Semantic-search NodeTypeConfig primitives → top-N relevant types
     * 3. Token-search instances by query (independent of primitives)
     * 4. Materialise instances whose `type` matches a relevant primitive
     * 5. Expand BFS neighbourhood around the seed instances
     * 6. Keep edges between found instances
     * 7. Assemble compact context (relevant primitives + relevant instances)
     */
    async retrieve(graphKey: string, query: string): Promise<GraphRAGContext> {
        // Check cache
        if (this.options.cacheTTLMs > 0) {
            const cacheKey = `${graphKey}:${query}`;
            const cached = this.cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.options.cacheTTLMs) {
                debugAI("rag_retrieve", { graphKey, query, cacheHit: true });
                return cached.context;
            }
        }

        const graph = await this.dataSource.getGraph(graphKey);
        if (!graph) {
            throw new Error(`Graph not found: ${graphKey}`);
        }

        // Step 1: Generate embedding for the query (if provider available)
        let queryEmbedding: number[] | undefined;
        if (this.embeddingProvider && query.trim().length > 0) {
            try {
                queryEmbedding = await this.embeddingProvider.generateEmbedding(query);
                debugAI("rag_embedding", { queryLength: query.length, dim: queryEmbedding.length });
            } catch (err) {
                console.warn("AI: Embedding generation failed, using token search:", err);
            }
        }

        // Step 2: Semantic search on primitives (the catalog of node types)
        const relevantPrimitives = await this.dataSource.searchNodeConfigs(
            query,
            this.options.maxConfigs,
            queryEmbedding,
        );
        const relevantPrimitiveKeys = new Set(relevantPrimitives.map(c => c._key));

        // Step 3: Token-search instances by query (find user nodes named/data-matching)
        const tokenMatchedInstances = await this.dataSource.searchNodes(
            graphKey,
            query,
            this.options.maxNodes,
        );

        // Step 4: Materialise instances of relevant primitives from the graph
        const allInstances = await this.dataSource.getNodes(graphKey);
        const primitiveInstances = allInstances.filter(n => relevantPrimitiveKeys.has(n.type));

        // Merge candidate seeds: token matches first (most specific), then
        // primitive-driven instances. Deduplicate by _key, cap at maxNodes.
        const seedMap = new Map<string, Node<unknown>>();
        for (const n of tokenMatchedInstances) seedMap.set(n._key, n);
        for (const n of primitiveInstances) {
            if (seedMap.size >= this.options.maxNodes) break;
            if (!seedMap.has(n._key)) seedMap.set(n._key, n);
        }

        // Fallback: if nothing matched at all (no relevant primitive instances
        // and no token hits), seed with whatever the graph has.
        if (seedMap.size === 0) {
            for (const n of allInstances.slice(0, this.options.maxNodes)) {
                seedMap.set(n._key, n);
            }
        }

        const seedNodes = [...seedMap.values()];

        // Step 5: Expand neighbourhood for the first few seeds
        const expandedNodeKeys = new Set<string>(seedNodes.map(n => n._key));
        const expandedEdges: Edge[] = [];

        for (const seed of seedNodes.slice(0, 5)) {
            const neighborhood = await this.dataSource.getNeighborhood(
                graphKey,
                seed._key,
                this.options.maxDepth,
                "any",
            );
            for (const n of neighborhood.nodes) {
                expandedNodeKeys.add(n._key);
            }
            expandedEdges.push(...neighborhood.edges);
        }

        // Fetch every unique node (cap at maxNodes)
        const allNodes: Node<unknown>[] = [];
        for (const key of expandedNodeKeys) {
            if (allNodes.length >= this.options.maxNodes) break;
            const node = await this.dataSource.getNodeByKey(graphKey, key);
            if (node) allNodes.push(node);
        }

        // Step 6: Keep only edges whose endpoints are both in our node set
        const nodeKeySet = new Set(allNodes.map(n => n._key));
        const uniqueEdges = new Map<string, Edge>();
        for (const e of expandedEdges) {
            if (nodeKeySet.has(e.source) && nodeKeySet.has(e.target)) {
                uniqueEdges.set(e._key, e);
            }
        }

        // Step 7: Final config set = semantically-relevant primitives ∪
        // primitives actually used by the instances we kept. The union is
        // important: the LLM needs the spec for any type it sees in
        // relevantNodes, even when that type wasn't a top semantic match.
        const usedTypes = new Set(allNodes.map(n => n.type));
        const configsByKey = new Map<string, NodeTypeConfig>();
        for (const c of relevantPrimitives) configsByKey.set(c._key, c);
        if (usedTypes.size > 0) {
            const missingTypes = [...usedTypes].filter(t => !configsByKey.has(t));
            if (missingTypes.length > 0) {
                const extraConfigs = await this.dataSource.getNodeConfigs(graphKey);
                for (const c of extraConfigs) {
                    if (missingTypes.includes(c._key)) configsByKey.set(c._key, c);
                }
            }
        }
        const finalConfigs = [...configsByKey.values()];

        // Assemble context
        const result: GraphRAGContext = {
            graph: {
                _key: graph._key,
                name: graph.name,
                description: graph.description,
                sheets: graph.sheets,
                metadata: graph.metadata,
            },
            relevantNodes: allNodes.map(n => this.nodeToRelevant(n, graph.sheets, finalConfigs)),
            relevantEdges: [...uniqueEdges.values()].map(e => this.edgeToRelevant(e)),
            nodeTypeConfigs: finalConfigs.map(c => this.configToSummary(c)),
        };

        debugAI("rag_retrieve", {
            graphKey,
            query,
            nodeCount: allNodes.length,
            primitiveCount: finalConfigs.length,
            cacheHit: false,
        });

        // Store in cache
        if (this.options.cacheTTLMs > 0) {
            this.cache.set(`${graphKey}:${query}`, { context: result, timestamp: Date.now() });
        }

        return result;
    }

    /** Clear the RAG cache. If graphKey is provided, only clear entries for that graph. */
    clearCache(graphKey?: string): void {
        if (!graphKey) {
            this.cache.clear();
            return;
        }
        for (const key of this.cache.keys()) {
            if (key.startsWith(`${graphKey}:`)) {
                this.cache.delete(key);
            }
        }
    }

    /** Get the number of entries in the cache. */
    getCacheSize(): number {
        return this.cache.size;
    }

    private nodeToRelevant(node: Node<unknown>, sheets: Record<string, string>, configs: NodeTypeConfig[]): RelevantNode {
        const config = configs.find(c => c._key === node.type);
        return {
            _key: node._key,
            type: node.type,
            typeName: config?.displayName,
            sheet: node.sheet,
            sheetName: sheets[node.sheet] ?? node.sheet,
            handles: summarizeHandles(node.handles as Record<string, { position: string; point: Array<{ id: string; type: "in" | "out"; accept: string; display?: string }> }>),
            dataSummary: node.data ? truncate(JSON.stringify(node.data), this.options.truncateData) : undefined,
        };
    }

    private edgeToRelevant(edge: Edge): RelevantEdge {
        return {
            source: edge.source,
            sourceHandle: edge.sourceHandle,
            target: edge.target,
            targetHandle: edge.targetHandle,
            label: edge.label,
        };
    }

    private configToSummary(config: NodeTypeConfig): NodeTypeConfigSummary {
        const handles = config.node?.handles;
        let handlesSummary = "";
        if (handles) {
            const parts: string[] = [];
            for (const [side, group] of Object.entries(handles)) {
                for (const p of (group as { point: Array<{ type: string; accept: string }> }).point ?? []) {
                    parts.push(`${side}:${p.type}(${p.accept})`);
                }
            }
            handlesSummary = parts.join(", ");
        }

        return {
            _key: config._key,
            displayName: config.displayName,
            description: config.description,
            category: config.category,
            icon: config.icon,
            handlesSummary,
        };
    }
}
