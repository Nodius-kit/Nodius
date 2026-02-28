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
import { MemoryAwareDataSource } from "./memoryAwareDataSource.js";
import { createLLMProviderFromConfig, createEmbeddingProviderFromConfig } from "./providers/providerFactory.js";
import type { LLMProvider } from "./providers/llmProvider.js";
import type { EmbeddingProvider } from "./providers/embeddingProvider.js";
import { getAIConfig } from "./config/aiConfig.js";
import { threadStore, type AIThread } from "./threadStore.js";
import type { StreamCallbacks } from "./types.js";
import type { MemoryGraphProvider } from "./memoryAwareDataSource.js";
import { AuthManager } from "../auth/AuthManager.js";
import { logLLMError, logClientDisconnect, logMalformedJSON, debugAI } from "./aiLogger.js";
import { classifyLLMError, type ClassifiedError } from "./errorClassifier.js";

// ─── Zod schemas for incoming messages ───────────────────────────────

const AIChatSchema = z.object({
    type: z.literal("ai:chat"),
    _id: z.number(),
    graphKey: z.string().min(1),
    message: z.string().min(1),
    threadId: z.string().optional(),
    token: z.string().optional(),
}).strict();

const AIResumeSchema = z.object({
    type: z.literal("ai:resume"),
    _id: z.number(),
    threadId: z.string().min(1),
    approved: z.boolean(),
    feedback: z.string().optional(),
    token: z.string().optional(),
}).strict();

const AIInterruptSchema = z.object({
    type: z.literal("ai:interrupt"),
    _id: z.number(),
    threadId: z.string().min(1),
    token: z.string().optional(),
}).strict();

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

    async handle(ws: WebSocket, message: Record<string, unknown>, workspace: string): Promise<void> {
        // Lazy init if not already done
        if (!this.initialized) await this.init();

        const type = message.type as string;

        switch (type) {
            case "ai:chat":
                return this.handleChat(ws, message, workspace);
            case "ai:resume":
                return this.handleResume(ws, message, workspace);
            case "ai:interrupt":
                return this.handleInterrupt(ws, message);
            default:
                this.send(ws, { type: "ai:error", _id: (message._id as number) ?? 0, error: `Unknown AI message type: ${type}` });
        }
    }

    // ─── Handlers ───────────────────────────────────────────────────

    private async handleChat(ws: WebSocket, raw: Record<string, unknown>, workspace: string): Promise<void> {
        const parsed = AIChatSchema.safeParse(raw);
        if (!parsed.success) {
            this.send(ws, { type: "ai:error", _id: (raw._id as number) ?? 0, error: "Invalid ai:chat message", details: parsed.error.issues });
            return;
        }

        const { _id, graphKey, message, threadId, token } = parsed.data;

        if (!this.llmProvider) {
            this.send(ws, { type: "ai:error", _id, error: "AI is not configured. No LLM API key found." });
            return;
        }

        // Authenticate via JWT token (falls back to provided workspace if no token)
        let auth: { workspace: string; role: "viewer" | "editor" | "admin"; userId: string };
        try {
            auth = await this.authenticateToken(token, workspace);
        } catch (err) {
            this.send(ws, { type: "ai:error", _id, error: err instanceof Error ? err.message : "Authentication failed" });
            return;
        }
        console.log(auth);

        // Find, load (thread roaming), or create thread
        let thread: AIThread | null = null;

        if (threadId) {
            // Try cache first
            thread = await threadStore.get(threadId);
            // Try DB fallback (thread roaming from another cluster server)
            if (!thread) {
                const dataSource = this.createDataSource(auth.workspace);
                thread = await threadStore.loadThread(threadId, dataSource, this.llmProvider, auth.role, this.embeddingProvider);
            }
            if (thread && (thread.graphKey !== graphKey || thread.workspace !== auth.workspace)) {
                this.send(ws, { type: "ai:error", _id, error: "Thread does not belong to this graph/workspace" });
                return;
            }
        }

        if (!thread) {
            const newThreadId = threadId || threadStore.generateThreadId();
            const dataSource = this.createDataSource(auth.workspace);
            const agent = new AIAgent({
                graphKey,
                dataSource,
                role: auth.role,
                llmProvider: this.llmProvider,
                embeddingProvider: this.embeddingProvider,
            });

            thread = {
                threadId: newThreadId,
                graphKey,
                workspace: auth.workspace,
                userId: auth.userId,
                agent,
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

        const callbacks = this.buildCallbacks(ws, _id, thread.threadId, abort.signal);

        try {
            debugAI("ws_chat", { threadId: thread.threadId, graphKey, messageLength: message.length });
            await thread.agent.chatStream(message, callbacks);
            // Persist conversation after completion
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

    private async handleResume(ws: WebSocket, raw: Record<string, unknown>, workspace: string): Promise<void> {
        const parsed = AIResumeSchema.safeParse(raw);
        if (!parsed.success) {
            this.send(ws, { type: "ai:error", _id: (raw._id as number) ?? 0, error: "Invalid ai:resume message", details: parsed.error.issues });
            return;
        }

        const { _id, threadId, approved, feedback, token } = parsed.data;

        // Authenticate via JWT token
        let auth: { workspace: string; role: "viewer" | "editor" | "admin"; userId: string };
        try {
            auth = await this.authenticateToken(token, workspace);
        } catch (err) {
            this.send(ws, { type: "ai:error", _id, error: err instanceof Error ? err.message : "Authentication failed" });
            return;
        }

        // Try cache, then DB (thread roaming)
        let thread = await threadStore.get(threadId);
        if (!thread && this.llmProvider) {
            const dataSource = this.createDataSource(auth.workspace);
            thread = await threadStore.loadThread(threadId, dataSource, this.llmProvider, auth.role, this.embeddingProvider);
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

        const callbacks = this.buildCallbacks(ws, _id, threadId, abort.signal);

        try {
            debugAI("ws_resume", { threadId, approved });
            await thread.agent.resumeConversationStream(approved, callbacks, feedback);
            // Persist conversation after completion
            await threadStore.save(threadId);
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

    // ─── Auth ─────────────────────────────────────────────────────

    /**
     * Validate a JWT token and extract user information.
     * Falls back to the provided workspace if no token is given.
     */
    private async authenticateToken(
        token: string | undefined,
        fallbackWorkspace: string,
    ): Promise<{ workspace: string; role: "viewer" | "editor" | "admin"; userId: string }> {
        if (!token) {
            return { workspace: fallbackWorkspace, role: "editor", userId: "ws-user" };
        }

        try {
            const authManager = AuthManager.getInstance();
            if (!authManager.isInitialized()) {
                return { workspace: fallbackWorkspace, role: "editor", userId: "ws-user" };
            }

            const validation = await authManager.getProvider().validateToken(token);
            if (!validation.valid || !validation.user) {
                throw new Error(validation.error ?? "Invalid token");
            }

            const user = validation.user;
            const workspace = (user as any).workspace ?? user.userId ?? "default";
            const role = user.roles?.includes("admin")
                ? "admin" as const
                : user.roles?.includes("viewer")
                    ? "viewer" as const
                    : "editor" as const;

            return { workspace, role, userId: user.userId ?? user.username };
        } catch (err) {
            throw new Error(err instanceof Error ? err.message : "Token validation failed");
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

    private buildCallbacks(ws: WebSocket, _id: number, threadId: string, signal: AbortSignal): StreamCallbacks {
        return {
            signal,
            onToken: (token: string) => {
                if (signal.aborted) return;
                this.send(ws, { type: "ai:token", _id, token });
            },
            onToolStart: (toolCallId: string, toolName: string) => {
                if (signal.aborted) return;
                this.send(ws, { type: "ai:tool_start", _id, toolCallId, toolName });
            },
            onToolResult: (toolCallId: string, result: string) => {
                if (signal.aborted) return;
                this.send(ws, { type: "ai:tool_result", _id, toolCallId, result });
            },
            onComplete: (fullText: string) => {
                if (signal.aborted) return;
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
