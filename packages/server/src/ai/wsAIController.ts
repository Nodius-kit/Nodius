/**
 * WebSocket controller for AI streaming.
 *
 * Handles `ai:*` message types, delegated from WebSocketManager.
 * Creates AIAgent instances, manages streaming sessions with AbortController,
 * and sends chunked responses back through WebSocket.
 */

import { z } from "zod";
import type WebSocket from "ws";
import { AIAgent } from "./aiAgent.js";
import { MemoryAwareDataSource } from "./data/memoryAwareDataSource.js";
import { createLLMProviderFromConfig, createEmbeddingProviderFromConfig } from "./providers/providerFactory.js";
import type { LLMProvider } from "./providers/llmProvider.js";
import type { EmbeddingProvider } from "./providers/embeddingProvider.js";
import { getAIConfig } from "./config/aiConfig.js";
import { threadStore, defaultMetadata, type AIThread, type AIContextType } from "./threadStore.js";
import type { StreamCallbacks } from "./types.js";
import type { MemoryGraphProvider } from "./data/memoryAwareDataSource.js";
import type { AuthenticatedClient } from "../cluster/webSocketManager.js";
import { logLLMError, logClientDisconnect, logMalformedJSON, debugAI } from "./aiLogger.js";
import { classifyLLMError, type ClassifiedError } from "./errorClassifier.js";
import { getPricing } from "./tokenTracker.js";
import { convertAction } from "./tools/actionConverter.js";
import { parseProposedAction, isWriteTool } from "./tools/writeTools.js";
import { parseHomeProposedAction, isHomeWriteTool } from "./tools/homeTools.js";
import { computeAutoLayout } from "./tools/autoLayout.js";
import { InstructionBuilder } from "@nodius/utils";
import { ensureCollection, createUniqueToken } from "../utils/arangoUtils.js";

// ─── Zod schemas for incoming messages ───────────────────────────────

const AIChatSchema = z.object({
    type: z.literal("ai:chat"),
    _id: z.number(),
    graphKey: z.string().min(1),
    message: z.string().min(1),
    threadId: z.string().optional(),
    contextType: z.enum(["graph", "nodeConfig", "htmlClass", "home"]).optional(),
}).strict();

const AIResumeSchema = z.object({
    type: z.literal("ai:resume"),
    _id: z.number(),
    threadId: z.string().min(1),
    approved: z.boolean(),
    feedback: z.string().optional(),
}).strict();

const AIInterruptSchema = z.object({
    type: z.literal("ai:interrupt"),
    _id: z.number(),
    threadId: z.string().min(1),
}).strict();

// ─── Usage accumulator ───────────────────────────────────────────────

interface UsageAccumulator {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    toolCallCount: number;
}

/** Compute cost from accumulated usage and provider pricing. */
function computeCost(acc: UsageAccumulator, provider: string): number {
    const pricing = getPricing(provider);
    return (acc.promptTokens / 1_000_000) * pricing.inputPerMillion
         + (acc.completionTokens / 1_000_000) * pricing.outputPerMillion;
}

// ─── Controller ──────────────────────────────────────────────────────

export class WsAIController {
    private llmProvider: LLMProvider | null;
    private embeddingProvider: EmbeddingProvider | null;
    /** Active streaming sessions by request _id — used for interrupt/abort. */
    private activeSessions = new Map<number, AbortController>();
    /** Reverse mapping: WebSocket → set of active session _ids (for disconnect cleanup). */
    private wsSessions = new Map<WebSocket, Set<number>>();
    private initialized = false;
    private memoryProvider: MemoryGraphProvider | null = null;

    constructor() {
        const config = getAIConfig();
        this.llmProvider = createLLMProviderFromConfig();
        this.embeddingProvider = createEmbeddingProviderFromConfig();
        if (this.embeddingProvider) {
            console.log(`AI: Embedding provider: ${this.embeddingProvider.getModelName()} (dim=${this.embeddingProvider.getDimension()})`);
        } else {
            console.log("AI: No embedding provider (vector search disabled, using token search)");
        }
        if (config.debug) {
            console.log("AI: Debug mode enabled (AI_DEBUG=true)");
        }
    }

    /**
     * Initialize thread store and capture the memory provider.
     * @param memoryProvider - The WebSocketManager instance (implements MemoryGraphProvider)
     */
    async init(memoryProvider?: MemoryGraphProvider): Promise<void> {
        if (this.initialized) return;
        if (memoryProvider) this.memoryProvider = memoryProvider;
        await threadStore.init();
        this.initialized = true;
    }

    canHandle(type: string): boolean {
        return type.startsWith("ai:");
    }

    async handle(ws: WebSocket, message: Record<string, unknown>, authClient: AuthenticatedClient): Promise<void> {
        // Lazy init if not already done
        if (!this.initialized) await this.init();

        const type = message.type as string;

        switch (type) {
            case "ai:chat":
                return this.handleChat(ws, message, authClient);
            case "ai:resume":
                return this.handleResume(ws, message, authClient);
            case "ai:interrupt":
                return this.handleInterrupt(ws, message);
            default:
                this.send(ws, { type: "ai:error", _id: (message._id as number) ?? 0, error: `Unknown AI message type: ${type}` });
        }
    }

    // ─── Handlers ───────────────────────────────────────────────────

    private async handleChat(ws: WebSocket, raw: Record<string, unknown>, authClient: AuthenticatedClient): Promise<void> {
        const parsed = AIChatSchema.safeParse(raw);
        if (!parsed.success) {
            this.send(ws, { type: "ai:error", _id: (raw._id as number) ?? 0, error: "Invalid ai:chat message", details: parsed.error.issues });
            return;
        }

        const { _id, graphKey, message, threadId, contextType: rawContextType } = parsed.data;
        const contextType: AIContextType = rawContextType ?? "graph";

        if (!this.llmProvider) {
            this.send(ws, { type: "ai:error", _id, error: "AI is not configured. No LLM API key found." });
            return;
        }

        // Derive auth from authenticated WebSocket client
        const workspace = authClient.workspaces[0] ?? authClient.userId;
        const role: "viewer" | "editor" | "admin" = authClient.roles.includes("admin")
            ? "admin"
            : authClient.roles.includes("viewer")
                ? "viewer"
                : "editor";
        const userId = authClient.userId;

        // Find, load (thread roaming), or create thread
        let thread: AIThread | null = null;

        if (threadId) {
            // Try cache first
            thread = await threadStore.get(threadId);
            // Try DB fallback (thread roaming from another cluster server)
            if (!thread) {
                const dataSource = this.createDataSource(workspace);
                thread = await threadStore.loadThread(threadId, dataSource, this.llmProvider, role, this.embeddingProvider);
            }
            if (thread && (thread.graphKey !== graphKey || thread.workspace !== workspace)) {
                this.send(ws, { type: "ai:error", _id, error: "Thread does not belong to this graph/workspace" });
                return;
            }
        }

        if (!thread) {
            const newThreadId = threadId || await threadStore.generateThreadId();
            const dataSource = this.createDataSource(workspace);
            const agent = new AIAgent({
                graphKey,
                dataSource,
                role,
                llmProvider: this.llmProvider,
                embeddingProvider: this.embeddingProvider,
                workspace,
            });

            thread = {
                threadId: newThreadId,
                graphKey,
                workspace,
                userId,
                contextType,
                agent,
                metadata: defaultMetadata(),
                createdTime: Date.now(),
                lastUpdatedTime: Date.now(),
            };
            await threadStore.set(thread);
        }

        thread.lastUpdatedTime = Date.now();

        // Set up abort controller
        const abort = new AbortController();
        this.activeSessions.set(_id, abort);
        this.trackSession(ws, _id);

        // Usage accumulator
        const usageAcc: UsageAccumulator = { promptTokens: 0, completionTokens: 0, totalTokens: 0, toolCallCount: 0 };
        const callbacks = this.buildCallbacks(ws, _id, thread.threadId, abort.signal, usageAcc);

        try {
            debugAI("ws_chat", { threadId: thread.threadId, graphKey, messageLength: message.length });
            await thread.agent.chatStream(message, callbacks);
            // Persist conversation after completion
            await threadStore.save(thread.threadId);
            // Persist accumulated usage metadata
            await threadStore.updateMetadata(thread.threadId, {
                promptTokens: usageAcc.promptTokens,
                completionTokens: usageAcc.completionTokens,
                totalTokens: usageAcc.totalTokens,
                cost: computeCost(usageAcc, this.llmProvider!.getProviderName()),
                toolCallCount: usageAcc.toolCallCount,
                provider: this.llmProvider!.getProviderName(),
                model: this.llmProvider!.getModel(),
            });
            await threadStore.save(thread.threadId);
        } catch (err) {
            if (!abort.signal.aborted) {
                this.handleStreamError(ws, _id, err, thread.threadId);
            }
        } finally {
            this.activeSessions.delete(_id);
            this.untrackSession(ws, _id);
        }
    }

    private async handleResume(ws: WebSocket, raw: Record<string, unknown>, authClient: AuthenticatedClient): Promise<void> {
        const parsed = AIResumeSchema.safeParse(raw);
        if (!parsed.success) {
            this.send(ws, { type: "ai:error", _id: (raw._id as number) ?? 0, error: "Invalid ai:resume message", details: parsed.error.issues });
            return;
        }

        const { _id, threadId, approved, feedback } = parsed.data;

        // Derive auth from authenticated WebSocket client
        const workspace = authClient.workspaces[0] ?? authClient.userId;
        const role: "viewer" | "editor" | "admin" = authClient.roles.includes("admin")
            ? "admin"
            : authClient.roles.includes("viewer")
                ? "viewer"
                : "editor";

        // Try cache, then DB (thread roaming)
        let thread = await threadStore.get(threadId);
        if (!thread && this.llmProvider) {
            const dataSource = this.createDataSource(workspace);
            thread = await threadStore.loadThread(threadId, dataSource, this.llmProvider, role, this.embeddingProvider);
        }
        if (!thread) {
            this.send(ws, { type: "ai:error", _id, error: "Thread not found" });
            return;
        }

        if (!thread.agent.hasPendingInterrupt()) {
            this.send(ws, { type: "ai:error", _id, error: "No pending action to approve/reject" });
            return;
        }

        thread.lastUpdatedTime = Date.now();

        const abort = new AbortController();
        this.activeSessions.set(_id, abort);
        this.trackSession(ws, _id);

        // Usage accumulator
        const usageAcc: UsageAccumulator = { promptTokens: 0, completionTokens: 0, totalTokens: 0, toolCallCount: 0 };
        const callbacks = this.buildCallbacks(ws, _id, threadId, abort.signal, usageAcc);

        try {
            debugAI("ws_resume", { threadId, approved });

            // If approved and HITL, compute mutations and send to client BEFORE resuming LLM
            if (approved) {
                await this.convertAndSendAction(ws, _id, thread, workspace);
            }

            await thread.agent.resumeConversationStream(approved, callbacks, feedback);
            // Persist conversation after completion
            await threadStore.save(threadId);
            // Persist accumulated usage metadata
            if (this.llmProvider) {
                await threadStore.updateMetadata(threadId, {
                    promptTokens: usageAcc.promptTokens,
                    completionTokens: usageAcc.completionTokens,
                    totalTokens: usageAcc.totalTokens,
                    cost: computeCost(usageAcc, this.llmProvider.getProviderName()),
                    toolCallCount: usageAcc.toolCallCount,
                    provider: this.llmProvider.getProviderName(),
                    model: this.llmProvider.getModel(),
                });
                await threadStore.save(threadId);
            }
        } catch (err) {
            if (!abort.signal.aborted) {
                this.handleStreamError(ws, _id, err, threadId);
            }
        } finally {
            this.activeSessions.delete(_id);
            this.untrackSession(ws, _id);
        }
    }

    private handleInterrupt(_ws: WebSocket, raw: Record<string, unknown>): void {
        const parsed = AIInterruptSchema.safeParse(raw);
        if (!parsed.success) return;

        // Find and abort the active session matching this thread
        // We look for any active session and abort it
        for (const [sessionId, abort] of this.activeSessions) {
            abort.abort();
            this.activeSessions.delete(sessionId);
        }
    }

    // ─── HITL Action Conversion ─────────────────────────────────────

    /**
     * Convert an approved HITL action into mutations and send to the client.
     * Called BEFORE resuming the LLM stream so the client can apply changes first.
     */
    private async convertAndSendAction(ws: WebSocket, _id: number, thread: AIThread, workspace: string): Promise<void> {
        const interrupt = thread.agent.getPendingInterrupt();
        if (!interrupt || interrupt.kind !== "hitl") return;

        const { toolName, args } = interrupt;

        try {
            const proposedAction = isHomeWriteTool(toolName)
                ? parseHomeProposedAction(toolName, args)
                : parseProposedAction(toolName, args);

            // create_graph is handled client-side in AIInterruptModal
            if (proposedAction.type === "create_graph") return;

            const dataSource = this.createDataSource(workspace);
            const configs = await dataSource.getNodeConfigs(thread.graphKey);
            const result = await convertAction(proposedAction, thread.graphKey, "0", configs);

            // Expand reorganize_layout: fetch nodes/edges, compute layout, generate move instructions
            if (result.nodeKeysToReorganize.length > 0) {
                const nodes = await dataSource.getNodes(thread.graphKey);
                const edges = await dataSource.getEdges(thread.graphKey);
                const targetNodes = nodes.filter(n => result.nodeKeysToReorganize.includes(n._key));
                const strategy = proposedAction.type === "reorganize_layout"
                    ? proposedAction.payload.strategy
                    : undefined;
                const layoutResult = computeAutoLayout(targetNodes, edges, strategy);

                for (const pos of layoutResult) {
                    const targetNode = targetNodes.find(n => n._key === pos.nodeKey);
                    const sheetId = targetNode?.sheet ?? result.sheetId;
                    result.instructions.push(
                        { i: new InstructionBuilder().key("posX").set(pos.posX), sheetId, nodeId: pos.nodeKey, animatePos: true },
                        { i: new InstructionBuilder().key("posY").set(pos.posY), sheetId, nodeId: pos.nodeKey, animatePos: true },
                    );
                }
            }

            // Save nodeConfigsToUpsert directly to DB
            if (result.nodeConfigsToUpsert.length > 0) {
                await this.saveNodeConfigs(result.nodeConfigsToUpsert, workspace);
            }

            // Send mutations to client for application via sync pipeline
            const hasChanges = result.instructions.length > 0
                || result.nodesToCreate.length > 0
                || result.edgesToCreate.length > 0
                || result.nodeKeysToDelete.length > 0
                || result.edgeKeysToDelete.length > 0;

            if (hasChanges) {
                this.send(ws, {
                    type: "ai:apply_action",
                    _id,
                    action: {
                        instructions: result.instructions,
                        nodesToCreate: result.nodesToCreate,
                        edgesToCreate: result.edgesToCreate,
                        nodeKeysToDelete: result.nodeKeysToDelete,
                        edgeKeysToDelete: result.edgeKeysToDelete,
                        sheetId: result.sheetId,
                    },
                });
            }

            debugAI("action_sent", {
                type: proposedAction.type,
                instructions: result.instructions.length,
                creates: result.nodesToCreate.length + result.edgesToCreate.length,
                deletes: result.nodeKeysToDelete.length + result.edgeKeysToDelete.length,
                configs: result.nodeConfigsToUpsert.length,
            });
        } catch (err) {
            debugAI("action_conversion_error", { error: String(err) });
        }
    }

    /**
     * Persist nodeTypeConfigs to ArangoDB (for configure_node_type actions).
     */
    private async saveNodeConfigs(configs: any[], workspace: string): Promise<void> {
        const collection = await ensureCollection("nodius_node_configs") as any;
        for (const config of configs) {
            config.workspace = workspace;
            if (!config._key) {
                config._key = await createUniqueToken(collection);
                config.node.type = config._key;
            }
            try {
                await collection.save(config, { overwriteMode: "replace" });
            } catch {
                // If save fails (e.g. duplicate), try update
                try {
                    await collection.update(config._key, config);
                } catch (err) {
                    debugAI("nodeconfig_save_error", { key: config._key, error: String(err) });
                }
            }
        }
    }

    // ─── Disconnect handling ────────────────────────────────────────

    /**
     * Called by WebSocketManager when a client disconnects.
     * Aborts all active AI streaming sessions for this client to save tokens.
     */
    onClientDisconnect(ws: WebSocket): void {
        const sessionIds = this.wsSessions.get(ws);
        if (!sessionIds || sessionIds.size === 0) {
            this.wsSessions.delete(ws);
            return;
        }

        for (const sessionId of sessionIds) {
            const abort = this.activeSessions.get(sessionId);
            if (abort) {
                logClientDisconnect({ sessionId });
                abort.abort();
                this.activeSessions.delete(sessionId);
            }
        }
        this.wsSessions.delete(ws);
    }

    /** Track a session for a given WebSocket (for disconnect cleanup). */
    private trackSession(ws: WebSocket, sessionId: number): void {
        let set = this.wsSessions.get(ws);
        if (!set) {
            set = new Set();
            this.wsSessions.set(ws, set);
        }
        set.add(sessionId);
    }

    /** Untrack a session when it completes or is aborted. */
    private untrackSession(ws: WebSocket, sessionId: number): void {
        const set = this.wsSessions.get(ws);
        if (set) {
            set.delete(sessionId);
            if (set.size === 0) this.wsSessions.delete(ws);
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────

    private buildCallbacks(ws: WebSocket, _id: number, threadId: string, signal: AbortSignal, usageAcc: UsageAccumulator): StreamCallbacks {
        return {
            signal,
            onToken: (token: string) => {
                if (signal.aborted) return;
                this.send(ws, { type: "ai:token", _id, token });
            },
            onToolStart: (toolCallId: string, toolName: string) => {
                if (signal.aborted) return;
                debugAI("ws_tool_start", { threadId, toolCallId, toolName });
                usageAcc.toolCallCount++;
                this.send(ws, { type: "ai:tool_start", _id, toolCallId, toolName });
            },
            onToolResult: (toolCallId: string, result: string) => {
                if (signal.aborted) return;
                debugAI("ws_tool_result", { threadId, toolCallId, resultLen: result.length });
                this.send(ws, { type: "ai:tool_result", _id, toolCallId, result });
            },
            onUsage: (usage) => {
                if (signal.aborted) return;
                debugAI("ws_usage", { threadId, ...usage });
                // Accumulate usage
                usageAcc.promptTokens += usage.promptTokens;
                usageAcc.completionTokens += usage.completionTokens;
                usageAcc.totalTokens += usage.totalTokens;
                this.send(ws, { type: "ai:usage", _id, usage });
            },
            onToolLimit: (info) => {
                if (signal.aborted) return;
                debugAI("ws_tool_limit", { threadId, ...info });
                this.send(ws, { type: "ai:tool_limit", _id, ...info });
            },
            onComplete: (fullText: string) => {
                if (signal.aborted) return;
                debugAI("ws_complete", { threadId, textLength: fullText.length });
                this.send(ws, { type: "ai:complete", _id, threadId, fullText });
            },
            onError: (error: Error) => {
                if (signal.aborted) return;
                this.send(ws, { type: "ai:error", _id, error: error.message });
            },
        };
    }

    /** Create a MemoryAwareDataSource that reads live graph state when available. */
    private createDataSource(workspace: string): MemoryAwareDataSource {
        return new MemoryAwareDataSource(workspace, this.memoryProvider);
    }

    /**
     * Classify an LLM error and send a user-friendly ai:error message.
     */
    private handleStreamError(ws: WebSocket, _id: number, err: unknown, threadId?: string): void {
        const classified = classifyLLMError(err);

        logLLMError({
            provider: classified.provider ?? "unknown",
            model: classified.model ?? "unknown",
            error: classified.originalError,
            statusCode: classified.statusCode,
            sessionId: _id,
            threadId,
        });

        this.send(ws, {
            type: "ai:error",
            _id,
            error: classified.userMessage,
            code: classified.code,
            retryable: classified.retryable,
        });
    }

    private send(ws: WebSocket, data: Record<string, unknown>): void {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(data));
        }
    }
}
