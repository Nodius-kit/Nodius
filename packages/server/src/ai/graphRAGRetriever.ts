import type { Edge, Node, NodeTypeConfig } from "@nodius/utils";
import type { GraphDataSource, GraphRAGContext, RelevantNode, RelevantEdge, NodeTypeConfigSummary } from "./types.js";
import type { EmbeddingProvider } from "./providers/embeddingProvider.js";
import { truncate, summarizeHandles } from "./utils.js";
import { debugAI } from "./aiLogger.js";

export interface GraphRAGOptions {
    maxNodes?: number;
    maxDepth?: number;
    truncateProcess?: number;
    truncateData?: number;
    /** Cache TTL in ms. Default 120000 (2 min). Set to 0 to disable. */
    cacheTTLMs?: number;
}

const DEFAULT_OPTIONS: Required<GraphRAGOptions> = {
    maxNodes: 20,
    maxDepth: 2,
    truncateProcess: 500,
    truncateData: 200,
    cacheTTLMs: 120_000,
};

/**
 * GraphRAG Retriever — assembles a compact context for the LLM
 * from a user query + graph data source.
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
     * 1. Search nodes matching the query
     * 2. Expand neighborhood around top results
     * 3. Collect edges between found nodes
     * 4. Gather referenced NodeTypeConfigs
     * 5. Assemble into compact context
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

        // Step 0: Generate embedding for the query (if provider available)
        let queryEmbedding: number[] | undefined;
        if (this.embeddingProvider && query.trim().length > 0) {
            try {
                queryEmbedding = await this.embeddingProvider.generateEmbedding(query);
                debugAI("rag_embedding", { queryLength: query.length, dim: queryEmbedding.length });
            } catch (err) {
                console.warn("AI: Embedding generation failed, using token search:", err);
            }
        }

        // Step 1: Search nodes (fallback to all nodes if search returns nothing)
        let searchResults = await this.dataSource.searchNodes(graphKey, query, this.options.maxNodes, queryEmbedding);
        if (searchResults.length === 0) {
            searchResults = await this.dataSource.getNodes(graphKey);
            searchResults = searchResults.slice(0, this.options.maxNodes);
        }

        // Step 2: Expand neighborhood for top results (max 5 seed nodes)
        const seedNodes = searchResults.slice(0, 5);
        const expandedNodeKeys = new Set<string>(searchResults.map(n => n._key));
        const expandedEdges: Edge[] = [];

        for (const seed of seedNodes) {
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

        // Step 3: Fetch all found nodes
        const allNodes: Node<unknown>[] = [];
        for (const key of expandedNodeKeys) {
            if (allNodes.length >= this.options.maxNodes) break;
            const node = await this.dataSource.getNodeByKey(graphKey, key);
            if (node) allNodes.push(node);
        }

        // Step 4: Filter edges to only those between found nodes
        const nodeKeySet = new Set(allNodes.map(n => n._key));
        const uniqueEdges = new Map<string, Edge>();
        for (const e of expandedEdges) {
            if (nodeKeySet.has(e.source) && nodeKeySet.has(e.target)) {
                uniqueEdges.set(e._key, e);
            }
        }

        // Step 5: Collect referenced NodeTypeConfigs
        const configs = await this.dataSource.getNodeConfigs(graphKey);
        const usedTypes = new Set(allNodes.map(n => n.type));
        const relevantConfigs = configs.filter(c => usedTypes.has(c._key));

        // Step 6: Assemble context
        const result: GraphRAGContext = {
            graph: {
                _key: graph._key,
                name: graph.name,
                description: graph.description,
                sheets: graph.sheets,
                metadata: graph.metadata,
            },
            relevantNodes: allNodes.map(n => this.nodeToRelevant(n, graph.sheets, relevantConfigs)),
            relevantEdges: [...uniqueEdges.values()].map(e => this.edgeToRelevant(e)),
            nodeTypeConfigs: relevantConfigs.map(c => this.configToSummary(c)),
        };

        debugAI("rag_retrieve", { graphKey, query, nodeCount: allNodes.length, cacheHit: false });

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
            process: truncate(node.process, this.options.truncateProcess),
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

