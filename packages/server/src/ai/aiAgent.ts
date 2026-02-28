import type OpenAI from "openai";
import { getReadToolDefinitions, createReadToolExecutor } from "./tools/readTools.js";
import { getWriteToolDefinitions, isWriteTool, parseProposedAction } from "./tools/writeTools.js";
import { GraphRAGRetriever } from "./graphRAGRetriever.js";
import { buildSystemPrompt, buildContextSummary } from "./prompts/systemPrompt.js";
import type { GraphDataSource, GraphRAGContext, ProposedAction, StreamCallbacks, LLMStreamChunk } from "./types.js";
import type { LLMProvider, LLMToolCall } from "./providers/llmProvider.js";
import type { EmbeddingProvider } from "./providers/embeddingProvider.js";
import { getTokenTracker } from "./tokenTracker.js";
import { logMalformedJSON, debugAI } from "./aiLogger.js";

export interface AIAgentOptions {
    graphKey: string;
    dataSource: GraphDataSource;
    role?: "viewer" | "editor" | "admin";
    maxToolRounds?: number;
    /** LLM provider for chat completions. */
    llmProvider: LLMProvider;
    /** Optional embedding provider for vector search. Falls back to token search if null. */
    embeddingProvider?: EmbeddingProvider | null;
}

export interface ToolCallEntry {
    name: string;
    args: Record<string, unknown>;
    result: string;
}

export interface AgentResponse {
    type: "message";
    message: string;
    toolCalls: ToolCallEntry[];
    context?: GraphRAGContext;
}

export interface AgentInterrupt {
    type: "interrupt";
    /** The proposed action parsed from the tool call. */
    proposedAction: ProposedAction;
    /** Raw tool call info (name, args, reason). */
    toolCall: { id: string; name: string; args: Record<string, unknown> };
    /** Explanation from the LLM (content before the tool call, if any). */
    message: string;
    toolCalls: ToolCallEntry[];
    context?: GraphRAGContext;
}

export type AgentResult = AgentResponse | AgentInterrupt;

/**
 * AI Agent with tool calling loop and Human-in-the-Loop interrupts.
 *
 * Flow:
 * 1. Retrieves graph context via GraphRAG
 * 2. Builds system prompt with context
 * 3. Runs tool calling loop:
 *    - Read tools: executed immediately, results fed back to LLM
 *    - Write tools (propose_*): execution STOPS, returns AgentInterrupt
 * 4. Client approves/rejects → resumeConversation() continues the loop
 */
export class AIAgent {
    private graphKey: string;
    private dataSource: GraphDataSource;
    private role: "viewer" | "editor" | "admin";
    private maxToolRounds: number;
    private conversationHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    private retriever: GraphRAGRetriever;
    private llmProvider: LLMProvider;

    /** Pending interrupt state — set when a propose_* tool is detected. */
    private pendingInterrupt: {
        toolCallId: string;
        toolName: string;
        args: Record<string, unknown>;
        context: GraphRAGContext;
        toolCallLog: ToolCallEntry[];
        remainingToolCalls: LLMToolCall[];
    } | null = null;

    constructor(options: AIAgentOptions) {
        this.graphKey = options.graphKey;
        this.dataSource = options.dataSource;
        this.role = options.role ?? "editor";
        this.maxToolRounds = options.maxToolRounds ?? 5;
        this.llmProvider = options.llmProvider;
        this.retriever = new GraphRAGRetriever(this.dataSource, undefined, options.embeddingProvider ?? null);
    }

    /**
     * Process a user message through the full RAG + tool calling pipeline.
     */
    async chat(userMessage: string): Promise<AgentResult> {
        debugAI("agent_chat_start", { graphKey: this.graphKey, messageLength: userMessage.length });

        // Step 1: Retrieve context via GraphRAG
        const context = await this.retriever.retrieve(this.graphKey, userMessage);

        // Step 2: Build system prompt (only on first message or refresh)
        if (this.conversationHistory.length === 0) {
            this.conversationHistory.push({
                role: "system",
                content: buildSystemPrompt(context, this.role),
            });
        }

        // Step 3: Add context summary + user message
        const contextSummary = buildContextSummary(context);
        if (contextSummary) {
            this.conversationHistory.push({
                role: "system",
                content: `[Contexte RAG pour cette question]\n${contextSummary}`,
            });
        }

        this.conversationHistory.push({
            role: "user",
            content: userMessage,
        });

        // Step 4: Run the tool calling loop
        return this.runToolLoop(context);
    }

    /**
     * Resume the conversation after the user has approved or rejected a proposed action.
     *
     * @param approved Whether the user approved the proposed action.
     * @param resultMessage A message describing what happened (e.g. "Node created" or "Action rejected by user").
     */
    async resumeConversation(approved: boolean, resultMessage?: string): Promise<AgentResult> {
        if (!this.pendingInterrupt) {
            throw new Error("No pending interrupt to resume. Call chat() first.");
        }

        // After HITL action, the graph may have changed — invalidate RAG cache
        this.retriever.clearCache();

        const { toolCallId, toolName, args, context, toolCallLog, remainingToolCalls } = this.pendingInterrupt;
        this.pendingInterrupt = null;

        // Build the tool result message
        const toolResult = approved
            ? JSON.stringify({ status: "approved", message: resultMessage ?? "Action approuvee et executee." })
            : JSON.stringify({ status: "rejected", message: resultMessage ?? "Action refusee par l'utilisateur." });

        // Log this tool call
        toolCallLog.push({ name: toolName, args, result: toolResult });

        // Add the tool result to conversation history
        this.conversationHistory.push({
            role: "tool",
            tool_call_id: toolCallId,
            content: toolResult,
        });

        // Process any remaining tool calls from the same LLM response
        const executeReadTool = createReadToolExecutor(this.dataSource, this.graphKey);
        for (const tc of remainingToolCalls) {
            if (tc.type !== "function") continue;

            let tcArgs: Record<string, unknown>;
            try {
                tcArgs = JSON.parse(tc.function.arguments);
            } catch {
                logMalformedJSON({ raw: tc.function.arguments, context: `resumeConversation tool=${tc.function.name}` });
                const errorResult = JSON.stringify({ error: "Invalid JSON in tool arguments", raw: tc.function.arguments });
                toolCallLog.push({ name: tc.function.name, args: {}, result: errorResult });
                this.conversationHistory.push({ role: "tool", tool_call_id: tc.id, content: errorResult });
                continue;
            }

            if (isWriteTool(tc.function.name)) {
                // Another propose_* in the same batch — interrupt again
                const proposedAction = parseProposedAction(tc.function.name, tcArgs);
                this.pendingInterrupt = {
                    toolCallId: tc.id,
                    toolName: tc.function.name,
                    args: tcArgs,
                    context,
                    toolCallLog: [...toolCallLog],
                    remainingToolCalls: remainingToolCalls.slice(remainingToolCalls.indexOf(tc) + 1),
                };
                return {
                    type: "interrupt",
                    proposedAction,
                    toolCall: { id: tc.id, name: tc.function.name, args: tcArgs },
                    message: "",
                    toolCalls: [...toolCallLog],
                    context,
                };
            }

            const result = await executeReadTool(tc.function.name, tcArgs);
            toolCallLog.push({ name: tc.function.name, args: tcArgs, result });
            this.conversationHistory.push({
                role: "tool",
                tool_call_id: tc.id,
                content: result,
            });
        }

        // Continue the tool calling loop
        return this.runToolLoop(context, toolCallLog);
    }

    /**
     * Check whether the agent is waiting for user approval.
     */
    hasPendingInterrupt(): boolean {
        return this.pendingInterrupt !== null;
    }

    /**
     * Reset conversation history and any pending interrupt.
     */
    reset(): void {
        this.conversationHistory = [];
        this.pendingInterrupt = null;
    }

    /** Returns the serializable conversation history. */
    getConversationHistory(): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        return this.conversationHistory;
    }

    /** Loads a previously saved conversation history. */
    loadConversationHistory(history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): void {
        this.conversationHistory = history;
    }

    /** Returns the serializable pending interrupt state (or null). */
    getPendingInterrupt() {
        return this.pendingInterrupt;
    }

    /** Restores pending interrupt state from a previously saved snapshot. */
    loadPendingInterrupt(interrupt: typeof this.pendingInterrupt): void {
        this.pendingInterrupt = interrupt;
    }

    // ─── Streaming ──────────────────────────────────────────────────

    /**
     * Process a user message with token-by-token streaming.
     * Requires an LLMProvider that supports streamCompletionWithTools.
     */
    async chatStream(userMessage: string, callbacks: StreamCallbacks): Promise<void> {
        try {
            // Step 1: Retrieve context via GraphRAG
            const context = await this.retriever.retrieve(this.graphKey, userMessage);

            // Step 2: Build system prompt (only on first message)
            if (this.conversationHistory.length === 0) {
                this.conversationHistory.push({
                    role: "system",
                    content: buildSystemPrompt(context, this.role),
                });
            }

            // Step 3: Add context summary + user message
            const contextSummary = buildContextSummary(context);
            if (contextSummary) {
                this.conversationHistory.push({
                    role: "system",
                    content: `[Contexte RAG pour cette question]\n${contextSummary}`,
                });
            }

            this.conversationHistory.push({ role: "user", content: userMessage });

            // Step 4: Run the streaming tool loop
            await this.runStreamToolLoop(callbacks);
        } catch (err) {
            callbacks.onError(err instanceof Error ? err : new Error(String(err)));
        }
    }

    /**
     * Resume a streaming conversation after HITL approval/rejection.
     */
    async resumeConversationStream(
        approved: boolean,
        callbacks: StreamCallbacks,
        resultMessage?: string,
    ): Promise<void> {
        if (!this.pendingInterrupt) {
            callbacks.onError(new Error("No pending interrupt to resume."));
            return;
        }

        try {
            // After HITL action, the graph may have changed — invalidate RAG cache
            this.retriever.clearCache();

            const { toolCallId, toolName, args } = this.pendingInterrupt;
            this.pendingInterrupt = null;

            const toolResult = approved
                ? JSON.stringify({ status: "approved", message: resultMessage ?? "Action approuvee et executee." })
                : JSON.stringify({ status: "rejected", message: resultMessage ?? "Action refusee par l'utilisateur." });

            this.conversationHistory.push({
                role: "tool",
                tool_call_id: toolCallId,
                content: toolResult,
            });

            await this.runStreamToolLoop(callbacks);
        } catch (err) {
            callbacks.onError(err instanceof Error ? err : new Error(String(err)));
        }
    }

    // ─── Private ─────────────────────────────────────────────────────

    private getTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
        const tools = [...getReadToolDefinitions()];
        if (this.role === "editor" || this.role === "admin") {
            tools.push(...getWriteToolDefinitions());
        }
        return tools;
    }

    private async runToolLoop(context: GraphRAGContext, existingLog?: ToolCallEntry[]): Promise<AgentResult> {
        const tools = this.getTools();
        const executeReadTool = createReadToolExecutor(this.dataSource, this.graphKey);
        const toolCallLog: ToolCallEntry[] = existingLog ?? [];

        for (let round = 0; round < this.maxToolRounds; round++) {
            const toolCalls = await this.callLLM(tools);

            if (!toolCalls) break;

            // If no tool calls, we got the final answer from the LLM
            if (toolCalls.length === 0) {
                const lastMsg = this.conversationHistory[this.conversationHistory.length - 1];
                return {
                    type: "message",
                    message: (lastMsg as { content: string }).content ?? "",
                    toolCalls: toolCallLog,
                    context,
                };
            }

            // Process each tool call
            for (let i = 0; i < toolCalls.length; i++) {
                const tc = toolCalls[i];
                if (tc.type !== "function") continue;

                let args: Record<string, unknown>;
                try {
                    args = JSON.parse(tc.function.arguments);
                } catch {
                    logMalformedJSON({ raw: tc.function.arguments, context: `runToolLoop tool=${tc.function.name}` });
                    const errorResult = JSON.stringify({ error: "Invalid JSON in tool arguments", raw: tc.function.arguments });
                    toolCallLog.push({ name: tc.function.name, args: {}, result: errorResult });
                    this.conversationHistory.push({ role: "tool", tool_call_id: tc.id, content: errorResult });
                    continue;
                }

                // HITL: if it's a propose_* tool, interrupt
                if (isWriteTool(tc.function.name)) {
                    debugAI("hitl_interrupt", { toolName: tc.function.name, actionType: args.action ?? "unknown" });
                    const proposedAction = parseProposedAction(tc.function.name, args);

                    // Save state for resumeConversation()
                    this.pendingInterrupt = {
                        toolCallId: tc.id,
                        toolName: tc.function.name,
                        args,
                        context,
                        toolCallLog: [...toolCallLog],
                        remainingToolCalls: toolCalls.slice(i + 1),
                    };

                    // Extract any content the LLM said alongside the tool call
                    const lastAssistant = this.conversationHistory[this.conversationHistory.length - 1];
                    const assistantMsg = (lastAssistant as { content?: string | null }).content ?? "";

                    return {
                        type: "interrupt",
                        proposedAction,
                        toolCall: { id: tc.id, name: tc.function.name, args },
                        message: assistantMsg,
                        toolCalls: toolCallLog,
                        context,
                    };
                }

                // Regular read tool — execute immediately
                debugAI("tool_execute", { toolName: tc.function.name });
                const result = await executeReadTool(tc.function.name, args);
                debugAI("tool_result", { toolName: tc.function.name, resultLen: result.length });
                toolCallLog.push({ name: tc.function.name, args, result });

                this.conversationHistory.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    content: result,
                });
            }
        }

        // Exhausted tool rounds — get a final answer without tools
        const llmResponse = await this.llmProvider.chatCompletion(this.conversationHistory);
        const finalMessage = llmResponse.message.content ?? "Je n'ai pas pu completer l'analyse.";

        this.conversationHistory.push({
            role: "assistant",
            content: finalMessage,
        });

        return {
            type: "message",
            message: finalMessage,
            toolCalls: toolCallLog,
            context,
        };
    }

    /**
     * Call the LLM and push the assistant message into history.
     * Returns the tool calls array, or empty array if it's a final text answer, or null if no message.
     */
    private async callLLM(tools: OpenAI.Chat.Completions.ChatCompletionTool[]): Promise<LLMToolCall[] | null> {
        const llmResponse = await this.llmProvider.chatCompletionWithTools(this.conversationHistory, tools);
        if (!llmResponse.message) return null;

        this.conversationHistory.push({
            role: "assistant",
            content: llmResponse.message.content,
            tool_calls: llmResponse.message.tool_calls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] | undefined,
        } as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam);

        return llmResponse.message.tool_calls ?? [];
    }

    /**
     * Streaming tool loop: iterates LLM calls + tool executions with callbacks.
     */
    private async runStreamToolLoop(callbacks: StreamCallbacks): Promise<void> {
        const tools = this.getTools();
        const executeReadTool = createReadToolExecutor(this.dataSource, this.graphKey);

        for (let round = 0; round < this.maxToolRounds; round++) {
            const { text, toolCalls, usage } = await this.streamOneLLMCall(tools, callbacks);

            // Record usage in token tracker
            if (usage) {
                getTokenTracker().record(
                    { prompt_tokens: usage.promptTokens, completion_tokens: usage.completionTokens, total_tokens: usage.totalTokens },
                    this.llmProvider!.getModel(),
                    "stream",
                );
            }

            // No tool calls → final answer
            if (toolCalls.length === 0) {
                this.conversationHistory.push({ role: "assistant", content: text });
                callbacks.onComplete(text);
                return;
            }

            // Push assistant message with tool calls into history
            this.conversationHistory.push({
                role: "assistant",
                content: text || null,
                tool_calls: toolCalls.map(tc => ({
                    id: tc.id,
                    type: "function" as const,
                    function: { name: tc.name, arguments: tc.arguments },
                })),
            } as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam);

            // Execute each tool call
            for (const tc of toolCalls) {
                let args: Record<string, unknown>;
                try {
                    args = JSON.parse(tc.arguments);
                } catch {
                    logMalformedJSON({ raw: tc.arguments, context: `streamToolLoop tool=${tc.name}` });
                    const errorResult = JSON.stringify({ error: "Invalid JSON in tool arguments", raw: tc.arguments });
                    callbacks.onToolResult(tc.id, errorResult);
                    this.conversationHistory.push({ role: "tool", tool_call_id: tc.id, content: errorResult });
                    continue;
                }

                // HITL: propose_* tool → interrupt (stop streaming)
                if (isWriteTool(tc.name)) {
                    const proposedAction = parseProposedAction(tc.name, args);
                    this.pendingInterrupt = {
                        toolCallId: tc.id,
                        toolName: tc.name,
                        args,
                        context: await this.retriever.retrieve(this.graphKey, ""),
                        toolCallLog: [],
                        remainingToolCalls: [],
                    };
                    // Notify via onToolStart (the client will show the HITL UI)
                    callbacks.onToolStart(tc.id, tc.name);
                    callbacks.onComplete(JSON.stringify({ type: "interrupt", proposedAction, toolCall: { id: tc.id, name: tc.name, args } }));
                    return;
                }

                callbacks.onToolStart(tc.id, tc.name);
                const result = await executeReadTool(tc.name, args);
                callbacks.onToolResult(tc.id, result);

                this.conversationHistory.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    content: result,
                });
            }
        }

        // Exhausted tool rounds — get a final streamed answer without tools
        const { text: finalText, usage: finalUsage } = await this.streamOneLLMCall([], callbacks);
        if (finalUsage) {
            getTokenTracker().record(
                { prompt_tokens: finalUsage.promptTokens, completion_tokens: finalUsage.completionTokens, total_tokens: finalUsage.totalTokens },
                this.llmProvider!.getModel(),
                "stream-final",
            );
        }
        this.conversationHistory.push({ role: "assistant", content: finalText });
        callbacks.onComplete(finalText);
    }

    /**
     * Stream a single LLM call, yielding tokens via callbacks.
     * Returns accumulated text, completed tool calls, and usage.
     */
    private async streamOneLLMCall(
        tools: OpenAI.Chat.Completions.ChatCompletionTool[],
        callbacks: StreamCallbacks,
    ): Promise<{
        text: string;
        toolCalls: Array<{ id: string; name: string; arguments: string }>;
        usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    }> {
        let text = "";
        const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
        let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

        const stream = this.llmProvider!.streamCompletionWithTools(
            this.conversationHistory,
            tools,
            callbacks.signal ? { signal: callbacks.signal } : undefined,
        );

        for await (const chunk of stream) {
            switch (chunk.type) {
                case "token":
                    if (chunk.token) {
                        text += chunk.token;
                        callbacks.onToken(chunk.token);
                    }
                    break;
                case "tool_call_start":
                    if (chunk.toolCall) {
                        callbacks.onToolStart(chunk.toolCall.id, chunk.toolCall.name);
                    }
                    break;
                case "tool_call_done":
                    if (chunk.toolCall) {
                        toolCalls.push(chunk.toolCall);
                    }
                    break;
                case "usage":
                    usage = chunk.usage;
                    break;
                case "done":
                    break;
            }
        }

        return { text, toolCalls, usage };
    }
}
