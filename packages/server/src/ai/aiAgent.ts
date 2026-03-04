import type OpenAI from "openai";
import { getReadToolDefinitions, createReadToolExecutor } from "./tools/readTools.js";
import { getWriteToolDefinitions, isWriteTool, parseProposedAction } from "./tools/writeTools.js";
import { GraphRAGRetriever } from "./graphRAGRetriever.js";
import { buildSystemPrompt, buildContextSummary } from "./prompts/systemPrompt.js";
import type { GraphDataSource, GraphRAGContext, ProposedAction, StreamCallbacks, LLMStreamChunk } from "./types.js";
import type { LLMProvider, LLMToolCall } from "./providers/llmProvider.js";
import type { EmbeddingProvider } from "./providers/embeddingProvider.js";
import { getTokenTracker } from "./tokenTracker.js";
import { logMalformedJSON, debugAI, isAIDebugEnabled } from "./aiLogger.js";

// ─── XML tool-call text filter ───────────────────────────────────────
// Some providers (e.g. DeepSeek) emit tool calls as XML text in content
// instead of using the standard tool_calls mechanism. We strip these.
// DeepSeek uses full-width ｜ (U+FF5C) in its XML tags, e.g. <｜DSML｜function_calls>
// The XML blocks are often incomplete (no closing tag), so we strip from
// the FIRST marker onwards rather than trying to match open/close pairs.
const TOOL_CALL_START_MARKERS = [
    "<\uff5cDSML\uff5c",    // DeepSeek full-width: <｜DSML｜
    "<|DSML|",               // ASCII variant
    "<function_calls>",      // Generic
    "<function_call>",
    "<tool_call>",
];

/** Pre-computed max marker length for prefix buffering. */
const MAX_MARKER_LENGTH = Math.max(...TOOL_CALL_START_MARKERS.map(m => m.length));

/** Check if `text` is a prefix of any marker (e.g. "<" is a prefix of "<function_calls>"). */
function isMarkerPrefix(text: string): boolean {
    for (const marker of TOOL_CALL_START_MARKERS) {
        if (marker.startsWith(text)) return true;
    }
    return false;
}

interface FilterResult {
    /** Text safe to emit to the client. */
    safe: string;
    /** Suffix held back because it could be the start of a marker. */
    heldBack: string;
    /** Whether a full marker was found (everything from marker onward is stripped). */
    markerFound: boolean;
}

/**
 * Filter XML-encoded tool call text from LLM content, with prefix buffering.
 * Holds back any trailing suffix that could be the beginning of a marker.
 */
function filterToolCallText(text: string): FilterResult {
    // Check for a complete marker first
    let earliest = -1;
    for (const marker of TOOL_CALL_START_MARKERS) {
        const idx = text.indexOf(marker);
        if (idx !== -1 && (earliest === -1 || idx < earliest)) {
            earliest = idx;
        }
    }
    if (earliest !== -1) {
        return { safe: text.slice(0, earliest).trimEnd(), heldBack: "", markerFound: true };
    }

    // No complete marker — check if a trailing suffix is a prefix of any marker
    const searchStart = Math.max(0, text.length - MAX_MARKER_LENGTH);
    for (let i = searchStart; i < text.length; i++) {
        const suffix = text.slice(i);
        if (isMarkerPrefix(suffix)) {
            return { safe: text.slice(0, i), heldBack: suffix, markerFound: false };
        }
    }

    return { safe: text, heldBack: "", markerFound: false };
}

// ─── Tool result truncation ─────────────────────────────────────────
// After the LLM has processed a tool result in one round, truncate it in
// history to reduce prompt tokens on subsequent rounds.
const TOOL_RESULT_MAX_CHARS = 600;

/**
 * Truncate old tool result messages in conversation history to save tokens.
 * Only truncates messages that are already in history before the current round.
 */
function truncateOldToolResults(history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): void {
    for (const msg of history) {
        if (msg.role === "tool" && typeof msg.content === "string" && msg.content.length > TOOL_RESULT_MAX_CHARS) {
            msg.content = msg.content.slice(0, TOOL_RESULT_MAX_CHARS) + `\n... [truncated, ${msg.content.length} chars total]`;
        }
    }
}

// ─── Tool round limits ──────────────────────────────────────────────
const INITIAL_TOOL_ROUNDS = 5;
const EXTENDED_TOOL_ROUNDS = 10;

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

    /** Pending interrupt state — set when a propose_* tool or tool_limit is detected. */
    private pendingInterrupt: {
        kind: "hitl" | "tool_limit";
        toolCallId: string;
        toolName: string;
        args: Record<string, unknown>;
        context: GraphRAGContext;
        toolCallLog: ToolCallEntry[];
        remainingToolCalls: LLMToolCall[];
    } | null = null;

    /** Whether the user approved extending beyond INITIAL_TOOL_ROUNDS. */
    private toolLimitExtended = false;
    /** Current round index saved when tool_limit fires. */
    private toolLimitRound = 0;

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
        debugAI("rag_context", { nodes: context.relevantNodes.length, edges: context.relevantEdges.length, nodeTypes: context.nodeTypeConfigs.length });

        // Step 2: Build system prompt (only on first message or refresh)
        if (this.conversationHistory.length === 0) {
            const systemPrompt = buildSystemPrompt(context, this.role);
            debugAI("system_prompt", { length: systemPrompt.length });
            this.conversationHistory.push({
                role: "system",
                content: systemPrompt,
            });
        }

        // Step 3: Add context summary + user message
        const contextSummary = buildContextSummary(context);
        if (contextSummary) {
            debugAI("rag_summary", { length: contextSummary.length });
            this.conversationHistory.push({
                role: "system",
                content: `[Contexte RAG pour cette question]\n${contextSummary}`,
            });
        }

        this.conversationHistory.push({
            role: "user",
            content: userMessage,
        });

        debugAI("conversation_state", { historyLength: this.conversationHistory.length });

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
                    kind: "hitl",
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
            debugAI("stream_chat_start", { graphKey: this.graphKey, messageLength: userMessage.length });

            // Step 1: Retrieve context via GraphRAG
            const context = await this.retriever.retrieve(this.graphKey, userMessage);
            debugAI("rag_context", { nodes: context.relevantNodes.length, edges: context.relevantEdges.length, nodeTypes: context.nodeTypeConfigs.length });

            // Step 2: Build system prompt (only on first message)
            if (this.conversationHistory.length === 0) {
                const systemPrompt = buildSystemPrompt(context, this.role);
                debugAI("system_prompt", { length: systemPrompt.length });
                this.conversationHistory.push({
                    role: "system",
                    content: systemPrompt,
                });
            }

            // Step 3: Add context summary + user message
            const contextSummary = buildContextSummary(context);
            if (contextSummary) {
                debugAI("rag_summary", { length: contextSummary.length });
                this.conversationHistory.push({
                    role: "system",
                    content: `[Contexte RAG pour cette question]\n${contextSummary}`,
                });
            }

            this.conversationHistory.push({ role: "user", content: userMessage });
            debugAI("conversation_state", { historyLength: this.conversationHistory.length });

            // Step 4: Run the streaming tool loop
            await this.runStreamToolLoop(callbacks);
        } catch (err) {
            callbacks.onError(err instanceof Error ? err : new Error(String(err)));
        }
    }

    /**
     * Resume a streaming conversation after HITL approval/rejection or tool_limit decision.
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
            const { kind } = this.pendingInterrupt;

            if (kind === "tool_limit") {
                this.pendingInterrupt = null;

                if (approved) {
                    // User approved more rounds
                    this.toolLimitExtended = true;
                    await this.runStreamToolLoop(callbacks, this.toolLimitRound);
                } else {
                    // User wants a summary now
                    await this.streamFinalAnswer(callbacks);
                }
                return;
            }

            // HITL interrupt — after action, the graph may have changed
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
                        kind: "hitl",
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
     * @param callbacks Stream callbacks for token/tool/complete events.
     * @param startRound Round to start from (used when resuming after tool_limit).
     */
    private async runStreamToolLoop(callbacks: StreamCallbacks, startRound = 0): Promise<void> {
        const tools = this.getTools();
        const executeReadTool = createReadToolExecutor(this.dataSource, this.graphKey);
        const maxRounds = this.toolLimitExtended ? EXTENDED_TOOL_ROUNDS : INITIAL_TOOL_ROUNDS;

        for (let round = startRound; round < maxRounds; round++) {
            // Truncate old tool results to reduce prompt tokens on subsequent rounds
            if (round > 0) {
                truncateOldToolResults(this.conversationHistory);
            }
            debugAI("stream_round_start", { round, maxRounds });
            const { text, toolCalls, usage } = await this.streamOneLLMCall(tools, callbacks);

            // Record usage in token tracker and notify client
            if (usage) {
                debugAI("llm_usage", { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, totalTokens: usage.totalTokens });
                getTokenTracker().record(
                    { prompt_tokens: usage.promptTokens, completion_tokens: usage.completionTokens, total_tokens: usage.totalTokens },
                    this.llmProvider!.getModel(),
                    "stream",
                );
                callbacks.onUsage?.(usage);
            }

            // No tool calls → final answer
            if (toolCalls.length === 0) {
                debugAI("stream_final_answer", { textLength: text.length });
                this.conversationHistory.push({ role: "assistant", content: text });
                callbacks.onComplete(text);
                return;
            }

            debugAI("stream_tool_calls", { count: toolCalls.length, names: toolCalls.map(tc => tc.name).join(",") });

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
            // Note: onToolStart is already called in streamOneLLMCall for each tool_call_start chunk
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
                    debugAI("hitl_interrupt_stream", { toolName: tc.name });
                    const proposedAction = parseProposedAction(tc.name, args);
                    this.pendingInterrupt = {
                        kind: "hitl",
                        toolCallId: tc.id,
                        toolName: tc.name,
                        args,
                        context: await this.retriever.retrieve(this.graphKey, ""),
                        toolCallLog: [],
                        remainingToolCalls: [],
                    };
                    callbacks.onComplete(JSON.stringify({ type: "interrupt", proposedAction, toolCall: { id: tc.id, name: tc.name, args } }));
                    return;
                }

                debugAI("tool_execute", { toolName: tc.name, args });
                const result = await executeReadTool(tc.name, args);
                debugAI("tool_result", { toolName: tc.name, resultLen: result.length });
                callbacks.onToolResult(tc.id, result);

                this.conversationHistory.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    content: result,
                });
            }

            // Check if we've reached the initial limit and should ask the user
            if (round === INITIAL_TOOL_ROUNDS - 1 && !this.toolLimitExtended) {
                debugAI("tool_limit_reached", { round, maxRounds });
                this.toolLimitRound = round + 1;
                this.pendingInterrupt = {
                    kind: "tool_limit",
                    toolCallId: "",
                    toolName: "",
                    args: {},
                    context: await this.retriever.retrieve(this.graphKey, ""),
                    toolCallLog: [],
                    remainingToolCalls: [],
                };
                callbacks.onToolLimit?.({ roundsUsed: INITIAL_TOOL_ROUNDS, maxExtended: EXTENDED_TOOL_ROUNDS });
                callbacks.onComplete(JSON.stringify({ type: "tool_limit", roundsUsed: INITIAL_TOOL_ROUNDS, maxExtended: EXTENDED_TOOL_ROUNDS }));
                return;
            }
        }

        // Exhausted tool rounds — get a final streamed answer without tools
        this.streamFinalAnswer(callbacks);
    }

    /** Stream a forced final answer (no tools) when tool rounds are exhausted. */
    private async streamFinalAnswer(callbacks: StreamCallbacks): Promise<void> {
        truncateOldToolResults(this.conversationHistory);
        this.conversationHistory.push({
            role: "system",
            content: "Tu as atteint la limite de rounds d'outils. Reponds maintenant directement a l'utilisateur avec les informations que tu as deja collectees. N'essaie PAS d'appeler d'outils, reponds uniquement en texte.",
        });
        debugAI("stream_exhausted_rounds", { maxRounds: this.toolLimitExtended ? EXTENDED_TOOL_ROUNDS : INITIAL_TOOL_ROUNDS });
        const { text: finalText, usage: finalUsage } = await this.streamOneLLMCall([], callbacks);
        if (finalUsage) {
            debugAI("llm_usage_final", { promptTokens: finalUsage.promptTokens, completionTokens: finalUsage.completionTokens, totalTokens: finalUsage.totalTokens });
            getTokenTracker().record(
                { prompt_tokens: finalUsage.promptTokens, completion_tokens: finalUsage.completionTokens, total_tokens: finalUsage.totalTokens },
                this.llmProvider!.getModel(),
                "stream-final",
            );
            callbacks.onUsage?.(finalUsage);
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

        // Log full conversation being sent to LLM
        debugAI("messages_to_llm", {
            messageCount: this.conversationHistory.length,
            toolCount: tools.length,
            messages: this.conversationHistory.map((m, i) => {
                const role = m.role;
                const content = typeof (m as { content?: string | null }).content === "string"
                    ? ((m as { content: string }).content.length > 500
                        ? (m as { content: string }).content.slice(0, 500) + `... [${(m as { content: string }).content.length} chars]`
                        : (m as { content: string }).content)
                    : "(no content)";
                const toolCalls = (m as { tool_calls?: unknown[] }).tool_calls;
                return `[${i}] ${role}: ${content}${toolCalls ? ` +${toolCalls.length} tool_calls` : ""}`;
            }).join("\n"),
        });

        const stream = this.llmProvider!.streamCompletionWithTools(
            this.conversationHistory,
            tools,
            callbacks.signal ? { signal: callbacks.signal } : undefined,
        );

        // Track how much clean text we've already sent to the client
        let sentLength = 0;
        let rawAccumulator = "";
        let markerFound = false;

        for await (const chunk of stream) {
            switch (chunk.type) {
                case "token":
                    if (chunk.token && !markerFound) {
                        rawAccumulator += chunk.token;
                        const result = filterToolCallText(rawAccumulator);
                        if (result.markerFound) markerFound = true;
                        // Only emit the safe portion beyond what we've already sent
                        if (result.safe.length > sentLength) {
                            const delta = result.safe.slice(sentLength);
                            sentLength = result.safe.length;
                            text = result.safe;
                            callbacks.onToken(delta);
                        }
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

        // After stream ends, flush any held-back text that wasn't a marker
        if (!markerFound && rawAccumulator.length > sentLength) {
            // Re-run filter one last time — if heldBack remains and no marker was found, it's safe
            const finalResult = filterToolCallText(rawAccumulator);
            if (!finalResult.markerFound) {
                const remaining = rawAccumulator.slice(sentLength);
                if (remaining) {
                    text = rawAccumulator;
                    callbacks.onToken(remaining);
                }
            }
        }

        debugAI("llm_response", {
            textLength: text.length,
            text: text.length > 500 ? text.slice(0, 500) + `... [${text.length} chars]` : text,
            toolCallCount: toolCalls.length,
            toolCallNames: toolCalls.map(tc => tc.name).join(",") || "(none)",
        });

        return { text, toolCalls, usage };
    }
}
