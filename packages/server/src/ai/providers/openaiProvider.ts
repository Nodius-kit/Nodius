/**
 * OpenAI-compatible LLM provider (works for DeepSeek, OpenAI, and any OpenAI-compatible API).
 */

import OpenAI from "openai";
import { getTokenTracker } from "../tokenTracker.js";
import type { LLMStreamChunk } from "../types.js";
import { debugAI } from "../aiLogger.js";
import type { LLMProvider, LLMResponse, LLMToolCall } from "./llmProvider.js";

export class OpenAICompatibleProvider implements LLMProvider {
    private client: OpenAI;
    private model: string;
    private providerName: string;

    constructor(apiKey: string, providerName: string, baseURL: string, model: string) {
        this.providerName = providerName;
        this.model = model;
        this.client = new OpenAI({ apiKey, baseURL });
    }

    async chatCompletion(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        options?: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming>,
        label?: string,
    ): Promise<LLMResponse> {
        debugAI("llm_call_start", { provider: this.providerName, model: this.model, label: label ?? "chat" });
        const response = await this.client.chat.completions.create({
            model: this.model,
            messages,
            ...options,
        });
        this.trackUsage(response, label ?? "chat");
        const result = this.toLLMResponse(response);
        debugAI("llm_call_done", { provider: this.providerName, model: this.model, tokens: result.usage?.totalTokens });
        return result;
    }

    async chatCompletionWithTools(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools: OpenAI.Chat.Completions.ChatCompletionTool[],
        options?: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming>,
        label?: string,
    ): Promise<LLMResponse> {
        debugAI("llm_call_start", { provider: this.providerName, model: this.model, label: label ?? "tool-call", toolCount: tools.length });
        const response = await this.client.chat.completions.create({
            model: this.model,
            messages,
            tools,
            ...options,
        });
        this.trackUsage(response, label ?? "tool-call");
        const result = this.toLLMResponse(response);
        debugAI("llm_call_done", { provider: this.providerName, model: this.model, tokens: result.usage?.totalTokens });
        return result;
    }

    getModel(): string {
        return this.model;
    }

    getProviderName(): string {
        return this.providerName;
    }

    async *streamCompletionWithTools(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools: OpenAI.Chat.Completions.ChatCompletionTool[],
        options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal },
    ): AsyncGenerator<LLMStreamChunk> {
        const stream = await this.client.chat.completions.create({
            model: this.model,
            messages,
            tools,
            stream: true,
            stream_options: { include_usage: true },
            ...(options?.temperature != null ? { temperature: options.temperature } : {}),
            ...(options?.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
        }, options?.signal ? { signal: options.signal } : undefined);

        // Accumulate fragmented tool call arguments by index
        const toolCallAccum = new Map<number, { id: string; name: string; args: string }>();

        for await (const chunk of stream) {
            // Usage arrives on the final chunk
            if (chunk.usage) {
                yield {
                    type: "usage",
                    usage: {
                        promptTokens: chunk.usage.prompt_tokens ?? 0,
                        completionTokens: chunk.usage.completion_tokens ?? 0,
                        totalTokens: chunk.usage.total_tokens ?? 0,
                    },
                };
            }

            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            // Text token
            if (delta.content) {
                yield { type: "token", token: delta.content };
            }

            // Tool call fragments
            if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                    const idx = tc.index;
                    if (!toolCallAccum.has(idx)) {
                        // First fragment for this tool call
                        toolCallAccum.set(idx, {
                            id: tc.id ?? "",
                            name: tc.function?.name ?? "",
                            args: tc.function?.arguments ?? "",
                        });
                        if (tc.id && tc.function?.name) {
                            yield {
                                type: "tool_call_start",
                                toolCall: { id: tc.id, name: tc.function.name, arguments: "" },
                            };
                        }
                    } else {
                        // Subsequent fragment — accumulate arguments
                        const accum = toolCallAccum.get(idx)!;
                        if (tc.function?.arguments) {
                            accum.args += tc.function.arguments;
                        }
                    }
                }
            }
        }

        // Yield completed tool calls
        for (const [, tc] of toolCallAccum) {
            yield {
                type: "tool_call_done",
                toolCall: { id: tc.id, name: tc.name, arguments: tc.args },
            };
        }

        yield { type: "done" };
    }

    /** Exposed for testing */
    getBaseURL(): string {
        return this.client.baseURL;
    }

    private trackUsage(response: OpenAI.Chat.Completions.ChatCompletion, label: string): void {
        if (response.usage) {
            getTokenTracker().record(response.usage as unknown as Record<string, unknown>, response.model, label);
        }
    }

    private toLLMResponse(response: OpenAI.Chat.Completions.ChatCompletion): LLMResponse {
        const choice = response.choices[0];
        const usage = response.usage;
        const details = usage ? (usage as unknown as Record<string, unknown>).prompt_tokens_details as { cached_tokens?: number } | undefined : undefined;
        const cachedTokens = (usage as unknown as Record<string, unknown>)?.prompt_cache_hit_tokens as number
            ?? details?.cached_tokens
            ?? 0;

        return {
            message: {
                role: choice?.message?.role ?? "assistant",
                content: choice?.message?.content ?? null,
                tool_calls: choice?.message?.tool_calls as LLMToolCall[] | undefined,
            },
            usage: usage ? {
                promptTokens: usage.prompt_tokens ?? 0,
                completionTokens: usage.completion_tokens ?? 0,
                totalTokens: usage.total_tokens ?? 0,
                cachedTokens,
            } : undefined,
            model: response.model,
            raw: response,
        };
    }
}
