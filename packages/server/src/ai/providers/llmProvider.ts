/**
 * LLM Provider abstraction — interfaces and types.
 */

import type OpenAI from "openai";
import type { LLMStreamChunk } from "../types.js";
import type { TokenPricing } from "../tokenTracker.js";

// ─── Interfaces ──────────────────────────────────────────────────────

export interface LLMToolCall {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
}

export interface LLMResponse {
    message: {
        role: string;
        content: string | null;
        tool_calls?: LLMToolCall[];
    };
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        cachedTokens: number;
    };
    model: string;
    raw: unknown;
}

export interface LLMProvider {
    chatCompletion(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        options?: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming>,
        label?: string,
    ): Promise<LLMResponse>;

    chatCompletionWithTools(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools: OpenAI.Chat.Completions.ChatCompletionTool[],
        options?: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming>,
        label?: string,
    ): Promise<LLMResponse>;

    streamCompletionWithTools(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools: OpenAI.Chat.Completions.ChatCompletionTool[],
        options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal },
    ): AsyncGenerator<LLMStreamChunk>;

    getModel(): string;
    getProviderName(): string;
}

// ─── Provider configs ────────────────────────────────────────────────

export interface ProviderConfig {
    baseURL: string;
    defaultModel: string;
    pricing: TokenPricing;
}
