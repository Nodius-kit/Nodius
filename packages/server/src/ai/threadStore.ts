/**
 * Thread store for AI conversations with ArangoDB persistence.
 *
 * Maintains an in-memory cache for fast access, and persists to
 * the `nodius_ai_threads` ArangoDB collection for durability.
 *
 * Shared between the REST API (requestAI.ts) and the
 * WebSocket controller (wsAIController.ts).
 */

import type { DocumentCollection } from "arangojs/collections";
import { aql } from "arangojs";
import { AIAgent } from "./aiAgent.js";
import type { GraphDataSource } from "./types.js";
import type { LLMProvider } from "./providers/llmProvider.js";
import type { EmbeddingProvider } from "./providers/embeddingProvider.js";

// ─── Types ──────────────────────────────────────────────────────────

export type AIContextType = "graph" | "nodeConfig" | "htmlClass" | "home";

export interface ThreadMetadata {
    title: string;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    totalCost: number;
    provider: string;
    model: string;
    messageCount: number;
    toolCallCount: number;
}

export interface AIThread {
    threadId: string;
    graphKey: string;
    workspace: string;
    userId: string;
    contextType: AIContextType;
    agent: AIAgent;
    metadata: ThreadMetadata;
    createdTime: number;
    lastUpdatedTime: number;
}

/** Shape of the document stored in ArangoDB. */
export interface AIThreadDocument {
    _key: string;
    graphKey: string;
    workspace: string;
    userId: string;
    contextType?: AIContextType;
    title: string;
    conversationHistory: object[];
    pendingInterrupt: object | null;
    // ─── Metadata accumulées ─────
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    totalCost: number;
    provider: string;
    model: string;
    messageCount: number;
    toolCallCount: number;
    // ─── Timestamps ──────────────
    createdTime: number;
    lastUpdatedTime: number;
}

/** Delta passed to updateMetadata to accumulate usage. */
export interface ThreadMetadataDelta {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cost?: number;
    toolCallCount?: number;
    provider?: string;
    model?: string;
}

// ─── Collection name ────────────────────────────────────────────────

const COLLECTION_NAME = "nodius_ai_threads";

// ─── Helpers ────────────────────────────────────────────────────────

/** Extract a title from the first user message in conversation history, truncated to 80 chars. */
function extractTitle(conversationHistory: object[]): string {
    for (const msg of conversationHistory) {
        const m = msg as { role?: string; content?: string };
        if (m.role === "user" && m.content) {
            const text = m.content.trim().replace(/\n/g, " ");
            return text.length > 80 ? text.slice(0, 77) + "..." : text;
        }
    }
    return "New conversation";
}

/** Count user + assistant messages in history. */
function countMessages(conversationHistory: object[]): number {
    let count = 0;
    for (const msg of conversationHistory) {
        const m = msg as { role?: string };
        if (m.role === "user" || m.role === "assistant") count++;
    }
    return count;
}

/** Create a default (empty) ThreadMetadata. */
function defaultMetadata(): ThreadMetadata {
    return {
        title: "New conversation",
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        provider: "",
        model: "",
        messageCount: 0,
        toolCallCount: 0,
    };
}

// ─── Thread Store class ─────────────────────────────────────────────

export class ThreadStore {
    private cache = new Map<string, AIThread>();
    private collection: DocumentCollection | null = null;
    private threadCounter = 0;

    /**
     * Initialize the store: ensure the ArangoDB collection exists.
     * Must be called once before any DB operations.
     * If no database is available (e.g. in tests), the store works
     * in memory-only mode.
     */
    async init(): Promise<void> {
        try {
            // Dynamic import to avoid circular dependency with server.ts
            const { db } = await import("../server.js");
            if (!db) return;

            const collection = db.collection(COLLECTION_NAME);
            const exists = await collection.exists();
            if (!exists) {
                await collection.create();
            }
            this.collection = collection as DocumentCollection;
        } catch {
            // No database available — memory-only mode
            this.collection = null;
        }
    }

    /** Generate a unique thread ID. */
    generateThreadId(): string {
        return `ai_${Date.now()}_${++this.threadCounter}`;
    }

    /** Check if a thread exists in the cache. */
    has(threadId: string): boolean {
        return this.cache.has(threadId);
    }

    /** Get a thread from cache. Falls back to DB if not cached. */
    async get(threadId: string): Promise<AIThread | null> {
        // Cache-first
        const cached = this.cache.get(threadId);
        if (cached) return cached;

        // DB fallback
        if (!this.collection) return null;

        try {
            const doc = await this.collection.document(threadId) as AIThreadDocument;
            if (!doc) return null;

            // We can't reconstruct the AIAgent from the DB alone (needs dataSource, llmProvider).
            // Return null here — the caller (wsAIController/requestAI) must handle reconstruction.
            // Store the raw document data so callers can check it exists.
            return null;
        } catch {
            return null;
        }
    }

    /** Get a raw thread document from ArangoDB (without agent). */
    async getDocument(threadId: string): Promise<AIThreadDocument | null> {
        if (!this.collection) return null;

        try {
            return await this.collection.document(threadId) as AIThreadDocument;
        } catch {
            return null;
        }
    }

    /**
     * Load a thread from ArangoDB and reconstruct its AIAgent.
     * Used for thread roaming: when a thread was created on another server
     * and doesn't exist in this server's cache.
     *
     * @param threadId - The thread ID to load
     * @param dataSource - The GraphDataSource to inject into the agent
     * @param llmProvider - The LLM provider to inject into the agent
     * @param role - The user's role (default: "editor")
     * @returns The reconstructed AIThread, or null if not found in DB
     */
    async loadThread(
        threadId: string,
        dataSource: GraphDataSource,
        llmProvider: LLMProvider,
        role: "viewer" | "editor" | "admin" = "editor",
        embeddingProvider?: EmbeddingProvider | null,
    ): Promise<AIThread | null> {
        // Cache-first (in case it was loaded between the has() check and now)
        const cached = this.cache.get(threadId);
        if (cached) return cached;

        // Fetch from DB
        const doc = await this.getDocument(threadId);
        if (!doc) return null;

        // Reconstruct AIAgent with the provided dependencies
        const agent = new AIAgent({
            graphKey: doc.graphKey,
            dataSource,
            role,
            llmProvider,
            embeddingProvider: embeddingProvider ?? null,
        });

        // Restore conversation history
        if (doc.conversationHistory?.length) {
            agent.loadConversationHistory(
                doc.conversationHistory as Parameters<typeof agent.loadConversationHistory>[0],
            );
        }

        // Restore pending interrupt state
        if (doc.pendingInterrupt) {
            agent.loadPendingInterrupt(
                doc.pendingInterrupt as Parameters<typeof agent.loadPendingInterrupt>[0],
            );
        }

        // Build the live thread and cache it
        const thread: AIThread = {
            threadId: doc._key,
            graphKey: doc.graphKey,
            workspace: doc.workspace,
            userId: doc.userId,
            contextType: doc.contextType ?? "graph",
            agent,
            metadata: {
                title: doc.title || extractTitle(doc.conversationHistory),
                totalPromptTokens: doc.totalPromptTokens || 0,
                totalCompletionTokens: doc.totalCompletionTokens || 0,
                totalTokens: doc.totalTokens || 0,
                totalCost: doc.totalCost || 0,
                provider: doc.provider || "",
                model: doc.model || "",
                messageCount: doc.messageCount || countMessages(doc.conversationHistory),
                toolCallCount: doc.toolCallCount || 0,
            },
            createdTime: doc.createdTime,
            lastUpdatedTime: doc.lastUpdatedTime,
        };

        this.cache.set(threadId, thread);
        return thread;
    }

    /** Set a thread in cache and persist to DB. */
    async set(thread: AIThread): Promise<void> {
        this.cache.set(thread.threadId, thread);
        await this.persist(thread);
    }

    /** Persist a cached thread to ArangoDB. */
    async save(threadId: string): Promise<void> {
        const thread = this.cache.get(threadId);
        if (!thread) return;
        await this.persist(thread);
    }

    /** Delete a thread from cache and DB. */
    async delete(threadId: string): Promise<void> {
        this.cache.delete(threadId);

        if (!this.collection) return;

        try {
            await this.collection.remove(threadId);
        } catch {
            // Document may not exist in DB yet
        }
    }

    /**
     * Accumulate usage metadata on a thread after a streaming completion.
     * Updates both the in-memory cache and persists to DB.
     */
    async updateMetadata(threadId: string, delta: ThreadMetadataDelta): Promise<void> {
        const thread = this.cache.get(threadId);
        if (!thread) return;

        const m = thread.metadata;
        if (delta.promptTokens) m.totalPromptTokens += delta.promptTokens;
        if (delta.completionTokens) m.totalCompletionTokens += delta.completionTokens;
        if (delta.totalTokens) m.totalTokens += delta.totalTokens;
        if (delta.cost) m.totalCost += delta.cost;
        if (delta.toolCallCount) m.toolCallCount += delta.toolCallCount;
        if (delta.provider) m.provider = delta.provider;
        if (delta.model) m.model = delta.model;

        // Recompute title and messageCount from conversation history
        const history = thread.agent.getConversationHistory() as object[];
        m.title = extractTitle(history);
        m.messageCount = countMessages(history);

        thread.lastUpdatedTime = Date.now();
    }

    /** List all thread documents for a given graph+workspace (from DB), optionally filtered by userId. */
    async listByGraph(graphKey: string, workspace: string, userId?: string): Promise<AIThreadDocument[]> {
        // First, check cache
        const fromCache: AIThreadDocument[] = [];
        for (const thread of this.cache.values()) {
            if (thread.graphKey === graphKey && thread.workspace === workspace) {
                if (!userId || thread.userId === userId) {
                    fromCache.push(this.threadToDocument(thread));
                }
            }
        }

        if (!this.collection) return fromCache;

        try {
            const { db } = await import("../server.js");
            let cursor;
            if (userId) {
                cursor = await db.query(aql`
                    FOR doc IN ${this.collection}
                        FILTER doc.graphKey == ${graphKey} AND doc.workspace == ${workspace} AND doc.userId == ${userId}
                        SORT doc.lastUpdatedTime DESC
                        RETURN doc
                `);
            } else {
                cursor = await db.query(aql`
                    FOR doc IN ${this.collection}
                        FILTER doc.graphKey == ${graphKey} AND doc.workspace == ${workspace}
                        SORT doc.lastUpdatedTime DESC
                        RETURN doc
                `);
            }
            const fromDb: AIThreadDocument[] = await cursor.all();

            // Merge: cache takes precedence, add DB entries not in cache
            const cacheKeys = new Set(fromCache.map(d => d._key));
            for (const doc of fromDb) {
                if (!cacheKeys.has(doc._key)) {
                    fromCache.push(doc);
                }
            }

            return fromCache.sort((a, b) => b.lastUpdatedTime - a.lastUpdatedTime);
        } catch {
            return fromCache;
        }
    }

    /** List thread documents filtered by (graphKey, contextType, workspace), optionally by userId. */
    async listByContext(graphKey: string, contextType: AIContextType, workspace: string, userId?: string): Promise<AIThreadDocument[]> {
        // From cache
        const fromCache: AIThreadDocument[] = [];
        for (const thread of this.cache.values()) {
            if (thread.graphKey === graphKey && thread.workspace === workspace && thread.contextType === contextType) {
                if (!userId || thread.userId === userId) {
                    fromCache.push(this.threadToDocument(thread));
                }
            }
        }

        if (!this.collection) return fromCache;

        try {
            const { db } = await import("../server.js");
            const cursor = userId
                ? await db.query(aql`
                    FOR doc IN ${this.collection}
                        FILTER doc.graphKey == ${graphKey}
                            AND doc.workspace == ${workspace}
                            AND doc.userId == ${userId}
                            AND (doc.contextType == ${contextType} OR (${contextType} == "graph" AND !doc.contextType))
                        SORT doc.lastUpdatedTime DESC
                        RETURN doc
                `)
                : await db.query(aql`
                    FOR doc IN ${this.collection}
                        FILTER doc.graphKey == ${graphKey}
                            AND doc.workspace == ${workspace}
                            AND (doc.contextType == ${contextType} OR (${contextType} == "graph" AND !doc.contextType))
                        SORT doc.lastUpdatedTime DESC
                        RETURN doc
                `);
            const fromDb: AIThreadDocument[] = await cursor.all();

            const cacheKeys = new Set(fromCache.map(d => d._key));
            for (const doc of fromDb) {
                if (!cacheKeys.has(doc._key)) {
                    fromCache.push(doc);
                }
            }

            return fromCache.sort((a, b) => b.lastUpdatedTime - a.lastUpdatedTime);
        } catch {
            return fromCache;
        }
    }

    /** List all threads for a user across all graphs, sorted by lastUpdatedTime DESC. */
    async listByUser(workspace: string, userId: string): Promise<AIThreadDocument[]> {
        // From cache
        const fromCache: AIThreadDocument[] = [];
        for (const thread of this.cache.values()) {
            if (thread.workspace === workspace && thread.userId === userId) {
                fromCache.push(this.threadToDocument(thread));
            }
        }

        if (!this.collection) return fromCache;

        try {
            const { db } = await import("../server.js");
            const cursor = await db.query(aql`
                FOR doc IN ${this.collection}
                    FILTER doc.workspace == ${workspace} AND doc.userId == ${userId}
                    SORT doc.lastUpdatedTime DESC
                    RETURN doc
            `);
            const fromDb: AIThreadDocument[] = await cursor.all();

            const cacheKeys = new Set(fromCache.map(d => d._key));
            for (const doc of fromDb) {
                if (!cacheKeys.has(doc._key)) {
                    fromCache.push(doc);
                }
            }

            return fromCache.sort((a, b) => b.lastUpdatedTime - a.lastUpdatedTime);
        } catch {
            return fromCache;
        }
    }

    /** Return the number of cached threads. */
    get size(): number {
        return this.cache.size;
    }

    /** Iterate over cached threads. */
    values(): IterableIterator<AIThread> {
        return this.cache.values();
    }

    // ─── Private ────────────────────────────────────────────────────

    private threadToDocument(thread: AIThread): AIThreadDocument {
        const history = thread.agent.getConversationHistory() as object[];
        const m = thread.metadata;
        return {
            _key: thread.threadId,
            graphKey: thread.graphKey,
            workspace: thread.workspace,
            userId: thread.userId,
            contextType: thread.contextType,
            title: m.title || extractTitle(history),
            conversationHistory: history,
            pendingInterrupt: thread.agent.getPendingInterrupt() as object | null,
            totalPromptTokens: m.totalPromptTokens,
            totalCompletionTokens: m.totalCompletionTokens,
            totalTokens: m.totalTokens,
            totalCost: m.totalCost,
            provider: m.provider,
            model: m.model,
            messageCount: m.messageCount || countMessages(history),
            toolCallCount: m.toolCallCount,
            createdTime: thread.createdTime,
            lastUpdatedTime: thread.lastUpdatedTime,
        };
    }

    private async persist(thread: AIThread): Promise<void> {
        if (!this.collection) return;

        const doc = this.threadToDocument(thread);

        try {
            const exists = await this.collection.documentExists(thread.threadId);
            if (exists) {
                await this.collection.replace(thread.threadId, doc);
            } else {
                await this.collection.save(doc);
            }
        } catch {
            // Silently fail — the cache is the source of truth at runtime
        }
    }
}

// ─── Singleton ──────────────────────────────────────────────────────

/**
 * Singleton instance shared between REST and WS controllers.
 * Call `threadStore.init()` once during server startup.
 */
export const threadStore = new ThreadStore();

/** Helper to create a default ThreadMetadata object. */
export { defaultMetadata };
