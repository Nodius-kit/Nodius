/**
 * REST API endpoints for the AI assistant.
 *
 * Endpoints:
 *   POST /api/ai/chat    — Send a message to the AI (creates or continues a thread)
 *   POST /api/ai/resume  — Approve or reject a proposed action (HITL)
 *   POST /api/ai/threads — List AI threads (optionally filtered by graphKey)
 *   GET  /api/ai/thread/:threadId/messages — Get conversation history for a thread
 *   DELETE /api/ai/thread/:threadId — Delete a thread
 *
 * Each thread holds an AIAgent instance with its conversation history.
 * Threads are persisted to ArangoDB via ThreadStore (with in-memory cache).
 */

import { z } from "zod";
import type { Request, Response } from "../http/HttpServer.js";
import type { HttpServer } from "../http/HttpServer.js";
import { AIAgent } from "../ai/aiAgent.js";
import { MemoryAwareDataSource } from "../ai/memoryAwareDataSource.js";
import { createLLMProviderFromConfig, createEmbeddingProviderFromConfig } from "../ai/providers/providerFactory.js";
import type { LLMProvider } from "../ai/providers/llmProvider.js";
import type { EmbeddingProvider } from "../ai/providers/embeddingProvider.js";
import type { AgentResult } from "../ai/aiAgent.js";
import { threadStore, defaultMetadata, type AIThread, type AIContextType } from "../ai/threadStore.js";

// ─── Request body schemas ───────────────────────────────────────────

const ChatBodySchema = z.object({
    graphKey: z.string().min(1),
    message: z.string().min(1),
    threadId: z.string().optional(),
    contextType: z.enum(["graph", "nodeConfig", "htmlClass", "home"]).optional(),
}).strict();

const ResumeBodySchema = z.object({
    threadId: z.string().min(1),
    approved: z.boolean(),
    feedback: z.string().optional(),
}).strict();

const ThreadsBodySchema = z.object({
    graphKey: z.string().optional(),
    contextType: z.enum(["graph", "nodeConfig", "htmlClass", "home"]).optional(),
}).strict();

// ─── Request handler ────────────────────────────────────────────────

export class RequestAI {
    public static init(app: HttpServer) {
        // Create providers from unified config
        const llmProvider: LLMProvider | null = createLLMProviderFromConfig();
        const embeddingProvider: EmbeddingProvider | null = createEmbeddingProviderFromConfig();

        if (llmProvider) {
            console.log(`AI: Using ${llmProvider.getProviderName()} (${llmProvider.getModel()})`);
        } else {
            console.log("AI: No LLM API key detected. Set DEEPSEEK_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY to enable AI features.");
        }
        if (embeddingProvider) {
            console.log(`AI: Embedding provider: ${embeddingProvider.getModelName()} (dim=${embeddingProvider.getDimension()})`);
        }

        // Initialize thread store (async, fire-and-forget — cache works immediately)
        threadStore.init().catch(err => {
            console.error("AI: Failed to initialize thread store:", err);
        });

        /** Create a MemoryAwareDataSource that reads live graph state when available. */
        const createDataSource = async (workspace: string): Promise<MemoryAwareDataSource> => {
            let memoryProvider = null;
            try {
                const { webSocketManager } = await import("../server.js");
                if (webSocketManager) memoryProvider = webSocketManager;
            } catch { /* no WS manager available */ }
            return new MemoryAwareDataSource(workspace, memoryProvider);
        };

        // ─── POST /api/ai/chat ──────────────────────────────────────

        app.post("/api/ai/chat", async (req: Request, res: Response) => {
            try {
                const user = (req as any).user;
                if (!user) {
                    return res.status(401).json({ error: "Not authenticated" });
                }

                if (!llmProvider) {
                    return res.status(503).json({ error: "AI is not configured. No LLM API key found." });
                }

                const parsed = ChatBodySchema.safeParse(req.body);
                if (!parsed.success) {
                    return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
                }
                const { graphKey, message, threadId, contextType: rawContextType } = parsed.data;
                const contextType: AIContextType = rawContextType ?? "graph";

                const workspace = user.workspaces?.[0] ?? user.userId ?? "default";
                const userId = user.userId ?? user.username;
                const role = user.roles?.includes("admin") ? "admin" : user.roles?.includes("viewer") ? "viewer" : "editor";

                // Find, load (thread roaming), or create thread
                let thread: AIThread | null = null;

                if (threadId) {
                    // Try cache first
                    thread = await threadStore.get(threadId);
                    // Try DB fallback (thread roaming from another cluster server)
                    if (!thread) {
                        const dataSource = await createDataSource(workspace);
                        thread = await threadStore.loadThread(threadId, dataSource, llmProvider, role, embeddingProvider);
                    }
                    if (thread && (thread.graphKey !== graphKey || thread.workspace !== workspace)) {
                        return res.status(403).json({ error: "Thread does not belong to this graph/workspace" });
                    }
                }

                if (!thread) {
                    const newThreadId = threadId || await threadStore.generateThreadId();
                    const dataSource = await createDataSource(workspace);
                    const agent = new AIAgent({
                        graphKey,
                        dataSource,
                        role,
                        llmProvider,
                        embeddingProvider,
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

                // Process the message
                thread.lastUpdatedTime = Date.now();
                const result: AgentResult = await thread.agent.chat(message);

                // Persist after completion
                await threadStore.save(thread.threadId);

                return res.status(200).json({
                    threadId: thread.threadId,
                    ...formatAgentResult(result),
                });
            } catch (err: any) {
                console.error("AI chat error:", err);
                return res.status(500).json({ error: err.message ?? "Internal error" });
            }
        });

        // ─── POST /api/ai/resume ────────────────────────────────────

        app.post("/api/ai/resume", async (req: Request, res: Response) => {
            try {
                const user = (req as any).user;
                if (!user) {
                    return res.status(401).json({ error: "Not authenticated" });
                }

                const parsed = ResumeBodySchema.safeParse(req.body);
                if (!parsed.success) {
                    return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
                }
                const { threadId, approved, feedback } = parsed.data;

                const workspace = user.workspaces?.[0] ?? user.userId ?? "default";
                const role = user.roles?.includes("admin") ? "admin" : user.roles?.includes("viewer") ? "viewer" : "editor";

                // Try cache, then DB (thread roaming)
                let thread = await threadStore.get(threadId);
                if (!thread && llmProvider) {
                    const dataSource = await createDataSource(workspace);
                    thread = await threadStore.loadThread(threadId, dataSource, llmProvider, role, embeddingProvider);
                }
                if (!thread) {
                    return res.status(404).json({ error: "Thread not found" });
                }

                if (!thread.agent.hasPendingInterrupt()) {
                    return res.status(409).json({ error: "No pending action to approve/reject" });
                }

                thread.lastUpdatedTime = Date.now();
                const result: AgentResult = await thread.agent.resumeConversation(approved, feedback);

                // Persist after completion
                await threadStore.save(thread.threadId);

                return res.status(200).json({
                    threadId: thread.threadId,
                    ...formatAgentResult(result),
                });
            } catch (err: any) {
                console.error("AI resume error:", err);
                return res.status(500).json({ error: err.message ?? "Internal error" });
            }
        });

        // ─── POST /api/ai/threads ────────────────────────────────────

        app.post("/api/ai/threads", async (req: Request, res: Response) => {
            try {
                const user = (req as any).user;
                if (!user) {
                    return res.status(401).json({ error: "Not authenticated" });
                }

                const parsed = ThreadsBodySchema.safeParse(req.body);
                if (!parsed.success) {
                    return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
                }
                const { graphKey, contextType } = parsed.data;

                const workspace = user.workspaces?.[0] ?? user.userId ?? "default";
                const userId = user.userId ?? user.username;

                // Filter by context if both graphKey and contextType provided
                let allDocs;
                if (graphKey && contextType) {
                    allDocs = await threadStore.listByContext(graphKey, contextType, workspace, userId);
                } else if (graphKey) {
                    allDocs = await threadStore.listByGraph(graphKey, workspace, userId);
                } else {
                    allDocs = await threadStore.listByUser(workspace, userId);
                }

                const threads = allDocs.map(doc => ({
                    threadId: doc._key,
                    graphKey: doc.graphKey,
                    contextType: doc.contextType ?? "graph",
                    title: doc.title || "New conversation",
                    totalTokens: doc.totalTokens || 0,
                    totalCost: doc.totalCost || 0,
                    provider: doc.provider || "",
                    model: doc.model || "",
                    messageCount: doc.messageCount || 0,
                    toolCallCount: doc.toolCallCount || 0,
                    createdTime: doc.createdTime,
                    lastUpdatedTime: doc.lastUpdatedTime,
                    hasPendingAction: doc.pendingInterrupt !== null,
                }));

                return res.status(200).json({ threads });
            } catch (err: any) {
                console.error("AI threads error:", err);
                return res.status(500).json({ error: err.message ?? "Internal error" });
            }
        });

        // ─── GET /api/ai/thread/:threadId/messages ──────────────────

        app.get("/api/ai/thread/:threadId/messages", async (req: Request, res: Response) => {
            try {
                const user = (req as any).user;
                if (!user) {
                    return res.status(401).json({ error: "Not authenticated" });
                }

                const threadId = req.params?.threadId;
                if (!threadId) {
                    return res.status(400).json({ error: "Missing threadId parameter" });
                }

                const userId = user.userId ?? user.username;

                // Try to get from cache first (has full agent)
                const cached = await threadStore.get(threadId);
                if (cached) {
                    if (cached.userId !== userId) {
                        return res.status(403).json({ error: "Not authorized to view this thread" });
                    }
                    return res.status(200).json({
                        threadId,
                        conversationHistory: cached.agent.getConversationHistory(),
                    });
                }

                // Fallback to raw document
                const doc = await threadStore.getDocument(threadId);
                if (!doc) {
                    return res.status(404).json({ error: "Thread not found" });
                }
                if (doc.userId !== userId) {
                    return res.status(403).json({ error: "Not authorized to view this thread" });
                }

                return res.status(200).json({
                    threadId,
                    conversationHistory: doc.conversationHistory,
                });
            } catch (err: any) {
                console.error("AI thread messages error:", err);
                return res.status(500).json({ error: err.message ?? "Internal error" });
            }
        });

        // ─── DELETE /api/ai/thread/:threadId ─────────────────────────

        app.delete("/api/ai/thread/:threadId", async (req: Request, res: Response) => {
            try {
                const user = (req as any).user;
                if (!user) {
                    return res.status(401).json({ error: "Not authenticated" });
                }

                const threadId = req.params?.threadId;
                if (!threadId) {
                    return res.status(400).json({ error: "Missing threadId parameter" });
                }

                const workspace = user.workspaces?.[0] ?? user.userId ?? "default";

                // Try cache, then DB (thread may only exist on another server)
                let thread = await threadStore.get(threadId);
                if (!thread && llmProvider) {
                    const dataSource = await createDataSource(workspace);
                    thread = await threadStore.loadThread(threadId, dataSource, llmProvider, "editor", embeddingProvider);
                }
                if (!thread) {
                    // Try direct DB delete even without reconstruction
                    const doc = await threadStore.getDocument(threadId);
                    if (!doc) {
                        return res.status(404).json({ error: "Thread not found" });
                    }
                    if (doc.workspace !== workspace) {
                        return res.status(403).json({ error: "Not authorized to delete this thread" });
                    }
                    await threadStore.delete(threadId);
                    return res.status(200).json({ deleted: true });
                }

                if (thread.workspace !== workspace) {
                    return res.status(403).json({ error: "Not authorized to delete this thread" });
                }

                thread.agent.reset();
                await threadStore.delete(threadId);

                return res.status(200).json({ deleted: true });
            } catch (err: any) {
                console.error("AI delete thread error:", err);
                return res.status(500).json({ error: err.message ?? "Internal error" });
            }
        });
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatAgentResult(result: AgentResult) {
    if (result.type === "message") {
        return {
            type: "message" as const,
            message: result.message,
            toolCalls: result.toolCalls.map(tc => ({
                name: tc.name,
                args: tc.args,
                result: safeJsonParse(tc.result),
            })),
        };
    }

    // type === "interrupt"
    return {
        type: "interrupt" as const,
        message: result.message,
        proposedAction: result.proposedAction,
        toolCall: result.toolCall,
        toolCalls: result.toolCalls.map(tc => ({
            name: tc.name,
            args: tc.args,
            result: safeJsonParse(tc.result),
        })),
    };
}

function safeJsonParse(str: string): unknown {
    try {
        return JSON.parse(str);
    } catch {
        return str;
    }
}
