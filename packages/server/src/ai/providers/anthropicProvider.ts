/**
 * Anthropic LLM provider + format conversion helpers.
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { getTokenTracker } from "../tokenTracker.js";
import { logMalformedJSON, debugAI } from "../aiLogger.js";
import { PROVIDER_REGISTRY } from "../config/providerRegistry.js";
import type { LLMStreamChunk } from "../types.js";
import type { LLMProvider, LLMResponse, LLMToolCall } from "./llmProvider.js";

// ─── Anthropic conversion helpers ────────────────────────────────────

/**
 * Convert OpenAI-format messages to Anthropic format.
 * - Extracts system messages into a separate `system` string
 * - Converts tool results to user messages with tool_result content blocks
 * - Merges consecutive same-role messages
 */
export function convertMessagesToAnthropic(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): { system: string | undefined; messages: Anthropic.MessageParam[] } {
    const systemParts: string[] = [];
    const converted: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
        // Extract system messages
        if (msg.role === "system") {
            const text = typeof msg.content === "string" ? msg.content : "";
            if (text) systemParts.push(text);
            continue;
        }

        // Convert assistant messages
        if (msg.role === "assistant") {
            const assistantMsg = msg as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam;
            const toolCalls = assistantMsg.tool_calls;

            if (toolCalls && toolCalls.length > 0) {
                const blocks: Anthropic.ContentBlockParam[] = [];
                const textContent = typeof assistantMsg.content === "string" ? assistantMsg.content : null;
                if (textContent) {
                    blocks.push({ type: "text", text: textContent });
                }
                for (const tc of toolCalls) {
                    // Type narrowing for OpenAI SDK v6 union types
                    const ftc = tc as { id: string; type: string; function: { name: string; arguments: string } };
                    let input: Record<string, unknown>;
                    try {
                        input = JSON.parse(ftc.function.arguments);
                    } catch {
                        logMalformedJSON({ raw: ftc.function.arguments, context: `convertMessagesToAnthropic tool=${ftc.function.name}` });
                        input = {};
                    }
                    blocks.push({
                        type: "tool_use",
                        id: ftc.id,
                        name: ftc.function.name,
                        input,
                    });
                }
                converted.push({ role: "assistant", content: blocks });
            } else {
                const text = typeof assistantMsg.content === "string" ? assistantMsg.content : "";
                converted.push({ role: "assistant", content: text });
            }
            continue;
        }

        // Convert tool results → user message with tool_result blocks
        if (msg.role === "tool") {
            const toolMsg = msg as OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
            const toolResultBlock: Anthropic.ToolResultBlockParam = {
                type: "tool_result",
                tool_use_id: toolMsg.tool_call_id,
                content: typeof toolMsg.content === "string" ? toolMsg.content : "",
            };

            // Merge with previous user message if it has content blocks
            const prev = converted[converted.length - 1];
            if (prev && prev.role === "user" && Array.isArray(prev.content)) {
                (prev.content as Anthropic.ContentBlockParam[]).push(toolResultBlock);
            } else {
                converted.push({ role: "user", content: [toolResultBlock] });
            }
            continue;
        }

        // User messages (pass through)
        if (msg.role === "user") {
            const text = typeof msg.content === "string" ? msg.content : "";
            converted.push({ role: "user", content: text });
            continue;
        }
    }

    // Final pass: merge consecutive same-role messages
    const merged: Anthropic.MessageParam[] = [];
    for (const msg of converted) {
        const prev = merged[merged.length - 1];
        if (prev && prev.role === msg.role) {
            // Convert both to content block arrays and merge
            const prevBlocks = toContentBlocks(prev.content);
            const curBlocks = toContentBlocks(msg.content);
            prev.content = [...prevBlocks, ...curBlocks];
        } else {
            merged.push({ ...msg });
        }
    }

    return {
        system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
        messages: merged,
    };
}

/** Helper: normalize content to an array of content blocks. */
function toContentBlocks(content: Anthropic.MessageParam["content"]): Anthropic.ContentBlockParam[] {
    if (typeof content === "string") {
        return content ? [{ type: "text", text: content }] : [];
    }
    return content as Anthropic.ContentBlockParam[];
}

/**
 * Convert OpenAI-format tool definitions to Anthropic format.
 */
export function convertToolsToAnthropic(
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
): Anthropic.Tool[] {
    return tools.map(t => {
        // Type narrowing for OpenAI SDK v6 union types
        const ft = t as { type: string; function: { name: string; description?: string; parameters?: unknown } };
        return {
            name: ft.function.name,
            description: ft.function.description ?? "",
            input_schema: ft.function.parameters as Anthropic.Tool.InputSchema,
        };
    });
}

/**
 * Convert an Anthropic Message response to our unified LLMResponse format.
 */
export function convertAnthropicResponse(response: Anthropic.Message): LLMResponse {
    // Extract text blocks
    const textParts: string[] = [];
    const toolCalls: LLMToolCall[] = [];

    for (const block of response.content) {
        if (block.type === "text") {
            textParts.push(block.text);
        } else if (block.type === "tool_use") {
            toolCalls.push({
                id: block.id,
                type: "function",
                function: {
                    name: block.name,
                    arguments: JSON.stringify(block.input),
                },
            });
        }
    }

    const usage = response.usage;
    const cacheUsage = usage as unknown as Record<string, unknown>;
    const cachedTokens = (cacheUsage?.cache_read_input_tokens as number) ?? 0;

    return {
        message: {
            role: "assistant",
            content: textParts.join("") || null,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        usage: {
            promptTokens: usage.input_tokens,
            completionTokens: usage.output_tokens,
            totalTokens: usage.input_tokens + usage.output_tokens,
            cachedTokens,
        },
        model: response.model,
        raw: response,
    };
}

// ─── Anthropic Provider ──────────────────────────────────────────────

export class AnthropicProvider implements LLMProvider {
    private client: Anthropic;
    private model: string;

    constructor(apiKey: string, model?: string) {
        this.model = model ?? PROVIDER_REGISTRY.anthropic.defaultModel;
        this.client = new Anthropic({ apiKey });
    }

    async chatCompletion(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        _options?: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming>,
        label?: string,
    ): Promise<LLMResponse> {
        debugAI("llm_call_start", { provider: "anthropic", model: this.model, label: label ?? "chat" });
        const { system, messages: anthropicMessages } = convertMessagesToAnthropic(messages);

        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 4096,
            ...(system ? { system } : {}),
            messages: anthropicMessages,
        });

        this.trackUsage(response, label ?? "chat");
        const result = convertAnthropicResponse(response);
        debugAI("llm_call_done", { provider: "anthropic", model: this.model, tokens: result.usage?.totalTokens });
        return result;
    }

    async chatCompletionWithTools(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools: OpenAI.Chat.Completions.ChatCompletionTool[],
        _options?: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming>,
        label?: string,
    ): Promise<LLMResponse> {
        debugAI("llm_call_start", { provider: "anthropic", model: this.model, label: label ?? "tool-call", toolCount: tools.length });
        const { system, messages: anthropicMessages } = convertMessagesToAnthropic(messages);
        const anthropicTools = convertToolsToAnthropic(tools);

        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 4096,
            ...(system ? { system } : {}),
            messages: anthropicMessages,
            ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
        });

        this.trackUsage(response, label ?? "tool-call");
        const result = convertAnthropicResponse(response);
        debugAI("llm_call_done", { provider: "anthropic", model: this.model, tokens: result.usage?.totalTokens });
        return result;
    }

    async *streamCompletionWithTools(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools: OpenAI.Chat.Completions.ChatCompletionTool[],
        options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal },
    ): AsyncGenerator<LLMStreamChunk> {
        const { system, messages: anthropicMessages } = convertMessagesToAnthropic(messages);
        const anthropicTools = convertToolsToAnthropic(tools);

        const streamParams: Record<string, unknown> = {
            model: this.model,
            max_tokens: options?.maxTokens ?? 4096,
            ...(system ? { system } : {}),
            messages: anthropicMessages,
            ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
            ...(options?.temperature != null ? { temperature: options.temperature } : {}),
        };

        const stream = this.client.messages.stream(
            streamParams as Parameters<typeof this.client.messages.stream>[0],
            options?.signal ? { signal: options.signal } : undefined,
        );

        // Track tool_use blocks: index → accumulated partial JSON
        const toolUseAccum = new Map<number, { id: string; name: string; json: string }>();
        let blockIndex = 0;

        for await (const event of stream) {
            switch (event.type) {
                case "content_block_start": {
                    const block = event.content_block;
                    if (block.type === "tool_use") {
                        toolUseAccum.set(blockIndex, { id: block.id, name: block.name, json: "" });
                        yield {
                            type: "tool_call_start",
                            toolCall: { id: block.id, name: block.name, arguments: "" },
                        };
                    }
                    blockIndex++;
                    break;
                }
                case "content_block_delta": {
                    const delta = event.delta;
                    if (delta.type === "text_delta") {
                        yield { type: "token", token: delta.text };
                    } else if (delta.type === "input_json_delta") {
                        // Accumulate partial JSON for tool_use
                        const accum = toolUseAccum.get(event.index);
                        if (accum) {
                            accum.json += delta.partial_json;
                        }
                    }
                    break;
                }
                case "content_block_stop": {
                    // If this was a tool_use block, yield the completed tool call
                    const accum = toolUseAccum.get(event.index);
                    if (accum) {
                        yield {
                            type: "tool_call_done",
                            toolCall: { id: accum.id, name: accum.name, arguments: accum.json },
                        };
                    }
                    break;
                }
            }
        }

        // Get usage from the final message
        const finalMessage = await stream.finalMessage();
        const cacheUsage = finalMessage.usage as unknown as Record<string, unknown>;
        const cachedTokens = (cacheUsage?.cache_read_input_tokens as number) ?? 0;

        yield {
            type: "usage",
            usage: {
                promptTokens: finalMessage.usage.input_tokens,
                completionTokens: finalMessage.usage.output_tokens,
                totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
            },
        };

        // Track usage in token tracker
        getTokenTracker().record(
            {
                prompt_tokens: finalMessage.usage.input_tokens,
                completion_tokens: finalMessage.usage.output_tokens,
                total_tokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
                ...(cachedTokens > 0 ? { prompt_cache_hit_tokens: cachedTokens } : {}),
            },
            finalMessage.model,
            "stream",
        );

        yield { type: "done" };
    }

    getModel(): string {
        return this.model;
    }

    getProviderName(): string {
        return "anthropic";
    }

    private trackUsage(response: Anthropic.Message, label: string): void {
        const cacheUsage = response.usage as unknown as Record<string, unknown>;
        const cachedTokens = (cacheUsage?.cache_read_input_tokens as number) ?? 0;
        getTokenTracker().record(
            {
                prompt_tokens: response.usage.input_tokens,
                completion_tokens: response.usage.output_tokens,
                total_tokens: response.usage.input_tokens + response.usage.output_tokens,
                ...(cachedTokens > 0 ? { prompt_cache_hit_tokens: cachedTokens } : {}),
            },
            response.model,
            label,
        );
    }
}
