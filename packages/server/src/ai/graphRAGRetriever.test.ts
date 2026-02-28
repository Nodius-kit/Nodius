import { describe, it, expect, vi } from "vitest";
import { GraphRAGRetriever } from "./graphRAGRetriever.js";
import { MockGraphDataSource, MOCK_GRAPH_KEY } from "../../test-ai/mock-data.js";
import type { EmbeddingProvider } from "./embeddingProvider.js";

const ds = new MockGraphDataSource();

/** Create a mock embedding provider. */
function createMockEmbeddingProvider(embedding?: number[]): EmbeddingProvider {
    return {
        generateEmbedding: vi.fn(async () => embedding ?? new Array(1536).fill(0.1)),
        getDimension: () => 1536,
        getModelName: () => "mock-embedding",
    };
}

/** Create a mock embedding provider that throws. */
function createFailingEmbeddingProvider(): EmbeddingProvider {
    return {
        generateEmbedding: vi.fn(async () => { throw new Error("Embedding API error"); }),
        getDimension: () => 1536,
        getModelName: () => "mock-failing",
    };
}

describe("GraphRAGRetriever", () => {
    describe("retrieve()", () => {
        it("returns a valid GraphRAGContext", async () => {
            const retriever = new GraphRAGRetriever(ds);
            const ctx = await retriever.retrieve(MOCK_GRAPH_KEY, "NBA workflow");
            expect(ctx.graph._key).toBe(MOCK_GRAPH_KEY);
            expect(ctx.graph.name).toBe("NBA Stats Pipeline");
            expect(ctx.relevantNodes).toBeInstanceOf(Array);
            expect(ctx.relevantEdges).toBeInstanceOf(Array);
            expect(ctx.nodeTypeConfigs).toBeInstanceOf(Array);
        });

        it("contains relevant nodes for the query", async () => {
            const retriever = new GraphRAGRetriever(ds);
            const ctx = await retriever.retrieve(MOCK_GRAPH_KEY, "fetch api");
            const keys = ctx.relevantNodes.map(n => n._key);
            expect(keys).toContain("fetch-api");
        });

        it("contains edges between found nodes", async () => {
            const retriever = new GraphRAGRetriever(ds);
            const ctx = await retriever.retrieve(MOCK_GRAPH_KEY, "fetch api");
            expect(ctx.relevantEdges.length).toBeGreaterThan(0);
            // All edges should have source and target from relevantNodes
            const nodeKeys = new Set(ctx.relevantNodes.map(n => n._key));
            for (const e of ctx.relevantEdges) {
                expect(nodeKeys.has(e.source)).toBe(true);
                expect(nodeKeys.has(e.target)).toBe(true);
            }
        });

        it("contains referenced NodeTypeConfigs", async () => {
            const retriever = new GraphRAGRetriever(ds);
            const ctx = await retriever.retrieve(MOCK_GRAPH_KEY, "fetch api");
            // fetch-api is type "api-call", so the config should be present
            const configKeys = ctx.nodeTypeConfigs.map(c => c._key);
            expect(configKeys).toContain("api-call");
        });

        it("fallback: query with no results returns all nodes", async () => {
            const retriever = new GraphRAGRetriever(ds);
            // a query that won't match anything specific but is > 2 chars
            const ctx = await retriever.retrieve(MOCK_GRAPH_KEY, "zzzznotfound");
            // Should fallback to all nodes
            expect(ctx.relevantNodes.length).toBeGreaterThan(0);
        });

        it("respects maxNodes", async () => {
            const retriever = new GraphRAGRetriever(ds, { maxNodes: 3 });
            const ctx = await retriever.retrieve(MOCK_GRAPH_KEY, "NBA");
            expect(ctx.relevantNodes.length).toBeLessThanOrEqual(3);
        });

        it("respects maxDepth", async () => {
            const retriever = new GraphRAGRetriever(ds, { maxDepth: 0 });
            const ctx = await retriever.retrieve(MOCK_GRAPH_KEY, "root");
            // With maxDepth=0, only the seed node(s) themselves + search results
            // The neighborhood expansion won't add extra nodes
            expect(ctx.relevantNodes.length).toBeGreaterThan(0);
        });

        it("throws for nonexistent graph", async () => {
            const retriever = new GraphRAGRetriever(ds);
            await expect(retriever.retrieve("nonexistent", "test")).rejects.toThrow("Graph not found");
        });

        it("truncates process and data", async () => {
            const retriever = new GraphRAGRetriever(ds, { truncateProcess: 20, truncateData: 10 });
            const ctx = await retriever.retrieve(MOCK_GRAPH_KEY, "fetch api");
            const fetchNode = ctx.relevantNodes.find(n => n._key === "fetch-api");
            expect(fetchNode).toBeDefined();
            // process is longer than 20 chars, should be truncated
            if (fetchNode!.process.length > 0) {
                expect(fetchNode!.process.length).toBeLessThanOrEqual(23); // 20 + "..."
            }
        });

        it("resolves sheetNames correctly", async () => {
            const retriever = new GraphRAGRetriever(ds);
            const ctx = await retriever.retrieve(MOCK_GRAPH_KEY, "NBA");
            for (const n of ctx.relevantNodes) {
                if (n.sheet === "0") expect(n.sheetName).toBe("main");
                if (n.sheet === "1") expect(n.sheetName).toBe("data-processing");
            }
        });
    });

    describe("with embeddingProvider", () => {
        it("calls generateEmbedding when provider is set", async () => {
            const embProvider = createMockEmbeddingProvider();
            const retriever = new GraphRAGRetriever(ds, undefined, embProvider);
            await retriever.retrieve(MOCK_GRAPH_KEY, "fetch api");
            expect(embProvider.generateEmbedding).toHaveBeenCalledWith("fetch api");
        });

        it("does not call generateEmbedding when provider is null", async () => {
            const retriever = new GraphRAGRetriever(ds, undefined, null);
            const ctx = await retriever.retrieve(MOCK_GRAPH_KEY, "fetch api");
            expect(ctx.relevantNodes.length).toBeGreaterThan(0);
        });

        it("does not crash when embedding generation fails", async () => {
            const embProvider = createFailingEmbeddingProvider();
            const retriever = new GraphRAGRetriever(ds, undefined, embProvider);
            const ctx = await retriever.retrieve(MOCK_GRAPH_KEY, "fetch api");
            // Should fall through to token search
            expect(ctx.relevantNodes.length).toBeGreaterThan(0);
            expect(embProvider.generateEmbedding).toHaveBeenCalled();
        });

        it("does not generate embedding for empty query", async () => {
            const embProvider = createMockEmbeddingProvider();
            const retriever = new GraphRAGRetriever(ds, undefined, embProvider);
            await retriever.retrieve(MOCK_GRAPH_KEY, "  ");
            expect(embProvider.generateEmbedding).not.toHaveBeenCalled();
        });
    });

    describe("TTL cache", () => {
        it("cache hit returns the same reference object", async () => {
            const retriever = new GraphRAGRetriever(ds, { cacheTTLMs: 60_000 });
            const ctx1 = await retriever.retrieve(MOCK_GRAPH_KEY, "fetch api");
            const ctx2 = await retriever.retrieve(MOCK_GRAPH_KEY, "fetch api");
            expect(ctx1).toBe(ctx2); // same reference
            expect(retriever.getCacheSize()).toBe(1);
        });

        it("cache miss after expiration returns a different object", async () => {
            const retriever = new GraphRAGRetriever(ds, { cacheTTLMs: 1 });
            const ctx1 = await retriever.retrieve(MOCK_GRAPH_KEY, "fetch api");
            // Wait for TTL to expire
            await new Promise(r => setTimeout(r, 5));
            const ctx2 = await retriever.retrieve(MOCK_GRAPH_KEY, "fetch api");
            expect(ctx1).not.toBe(ctx2); // different reference
        });

        it("clearCache() forces a new retrieve", async () => {
            const retriever = new GraphRAGRetriever(ds, { cacheTTLMs: 60_000 });
            const ctx1 = await retriever.retrieve(MOCK_GRAPH_KEY, "NBA");
            expect(retriever.getCacheSize()).toBe(1);
            retriever.clearCache();
            expect(retriever.getCacheSize()).toBe(0);
            const ctx2 = await retriever.retrieve(MOCK_GRAPH_KEY, "NBA");
            expect(ctx1).not.toBe(ctx2);
        });

        it("clearCache(graphKey) only clears entries for that graph", async () => {
            // We only have one mock graph, but we can still test the selective clear
            const retriever = new GraphRAGRetriever(ds, { cacheTTLMs: 60_000 });
            await retriever.retrieve(MOCK_GRAPH_KEY, "query1");
            await retriever.retrieve(MOCK_GRAPH_KEY, "query2");
            expect(retriever.getCacheSize()).toBe(2);
            // Clear a non-existent graph — should not remove anything
            retriever.clearCache("other-graph");
            expect(retriever.getCacheSize()).toBe(2);
            // Clear the real graph
            retriever.clearCache(MOCK_GRAPH_KEY);
            expect(retriever.getCacheSize()).toBe(0);
        });

        it("different queries produce different cache entries", async () => {
            const retriever = new GraphRAGRetriever(ds, { cacheTTLMs: 60_000 });
            await retriever.retrieve(MOCK_GRAPH_KEY, "fetch api");
            await retriever.retrieve(MOCK_GRAPH_KEY, "NBA stats");
            expect(retriever.getCacheSize()).toBe(2);
        });

        it("cacheTTLMs: 0 disables the cache", async () => {
            const retriever = new GraphRAGRetriever(ds, { cacheTTLMs: 0 });
            const ctx1 = await retriever.retrieve(MOCK_GRAPH_KEY, "fetch api");
            const ctx2 = await retriever.retrieve(MOCK_GRAPH_KEY, "fetch api");
            expect(ctx1).not.toBe(ctx2); // different references
            expect(retriever.getCacheSize()).toBe(0);
        });
    });
});
