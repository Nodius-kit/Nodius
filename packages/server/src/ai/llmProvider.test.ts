import { describe, it, expect } from "vitest";
import { createLLMProvider } from "./providers/providerFactory.js";
import { OpenAICompatibleProvider } from "./providers/openaiProvider.js";
import {
    AnthropicProvider,
    convertMessagesToAnthropic,
    convertToolsToAnthropic,
    convertAnthropicResponse,
} from "./providers/anthropicProvider.js";
import { PROVIDER_REGISTRY } from "./config/providerRegistry.js";
import { getPricing } from "./tokenTracker.js";
import type OpenAI from "openai";
import type Anthropic from "@anthropic-ai/sdk";

describe("createLLMProvider factory", () => {
    it("creates a DeepSeek provider", () => {
        const p = createLLMProvider({ provider: "deepseek", apiKey: "test-key" });
        expect(p.getProviderName()).toBe("deepseek");
        expect(p.getModel()).toBe("deepseek-chat");
    });

    it("creates an OpenAI provider", () => {
        const p = createLLMProvider({ provider: "openai", apiKey: "test-key" });
        expect(p.getProviderName()).toBe("openai");
        expect(p.getModel()).toBe("gpt-4o");
    });

    it("creates an OpenAI-mini provider", () => {
        const p = createLLMProvider({ provider: "openai-mini", apiKey: "test-key" });
        expect(p.getProviderName()).toBe("openai-mini");
        expect(p.getModel()).toBe("gpt-4o-mini");
    });

    it("creates an Anthropic provider with default model", () => {
        const p = createLLMProvider({ provider: "anthropic", apiKey: "test-key" });
        expect(p.getProviderName()).toBe("anthropic");
        expect(p.getModel()).toBe("claude-sonnet-4-20250514");
    });

    it("creates an Anthropic provider with custom model", () => {
        const p = createLLMProvider({ provider: "anthropic", apiKey: "test-key", model: "claude-3-5-sonnet-20241022" });
        expect(p.getModel()).toBe("claude-3-5-sonnet-20241022");
    });

    it("PROVIDER_REGISTRY contains anthropic entry with pricing", () => {
        const entry = PROVIDER_REGISTRY.anthropic;
        expect(entry).toBeDefined();
        expect(entry.defaultModel).toBe("claude-sonnet-4-20250514");
        expect(entry.pricing.inputPerMillion).toBe(3.00);
        expect(entry.pricing.outputPerMillion).toBe(15.00);
    });
});

describe("OpenAICompatibleProvider", () => {
    it("has correct baseURL for DeepSeek", () => {
        const p = new OpenAICompatibleProvider("key", "deepseek", PROVIDER_REGISTRY.deepseek.baseURL, "deepseek-chat");
        expect(p.getBaseURL()).toBe("https://api.deepseek.com");
    });

    it("has correct baseURL for OpenAI", () => {
        const p = new OpenAICompatibleProvider("key", "openai", PROVIDER_REGISTRY.openai.baseURL, "gpt-4o");
        expect(p.getBaseURL()).toBe("https://api.openai.com/v1");
    });

    it("getProviderName() returns the correct name", () => {
        const p = new OpenAICompatibleProvider("key", "deepseek", "url", "model");
        expect(p.getProviderName()).toBe("deepseek");
    });

    it("getModel() returns the correct model", () => {
        const p = new OpenAICompatibleProvider("key", "openai", "url", "gpt-4o");
        expect(p.getModel()).toBe("gpt-4o");
    });

    it("accepts custom model override", () => {
        const p = createLLMProvider({ provider: "openai", apiKey: "key", model: "gpt-4-turbo" });
        expect(p.getModel()).toBe("gpt-4-turbo");
    });
});

describe("Pricing per provider", () => {
    it("DeepSeek pricing differs from OpenAI", () => {
        const ds = getPricing("deepseek");
        const oai = getPricing("openai");
        expect(ds.inputPerMillion).not.toBe(oai.inputPerMillion);
        expect(ds.outputPerMillion).not.toBe(oai.outputPerMillion);
        // OpenAI is more expensive
        expect(oai.inputPerMillion).toBeGreaterThan(ds.inputPerMillion);
    });

    it("Anthropic pricing is available", () => {
        const pricing = getPricing("anthropic");
        expect(pricing.inputPerMillion).toBe(3.00);
        expect(pricing.inputCacheHitPerMillion).toBe(0.30);
        expect(pricing.outputPerMillion).toBe(15.00);
    });

    it("unknown provider falls back to DeepSeek pricing", () => {
        const unknown = getPricing("unknown-provider");
        const ds = getPricing("deepseek");
        expect(unknown).toEqual(ds);
    });
});

// ─── Anthropic conversion tests ──────────────────────────────────────

describe("convertMessagesToAnthropic", () => {
    it("extracts system messages into a separate parameter", () => {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "system", content: "You are helpful." },
            { role: "user", content: "Hello" },
        ];
        const result = convertMessagesToAnthropic(messages);
        expect(result.system).toBe("You are helpful.");
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].role).toBe("user");
    });

    it("concatenates multiple system messages", () => {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "system", content: "System prompt" },
            { role: "system", content: "RAG context" },
            { role: "user", content: "Question" },
        ];
        const result = convertMessagesToAnthropic(messages);
        expect(result.system).toBe("System prompt\n\nRAG context");
    });

    it("returns undefined system when no system messages", () => {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "user", content: "Hello" },
        ];
        const result = convertMessagesToAnthropic(messages);
        expect(result.system).toBeUndefined();
    });

    it("converts assistant messages with tool_calls to content blocks", () => {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "user", content: "Search nodes" },
            {
                role: "assistant",
                content: "Let me search.",
                tool_calls: [{
                    id: "tc_1",
                    type: "function" as const,
                    function: { name: "search_nodes", arguments: '{"query":"test"}' },
                }],
            },
        ];
        const result = convertMessagesToAnthropic(messages);
        const assistantMsg = result.messages[1];
        expect(assistantMsg.role).toBe("assistant");
        expect(Array.isArray(assistantMsg.content)).toBe(true);
        const blocks = assistantMsg.content as Anthropic.ContentBlockParam[];
        expect(blocks).toHaveLength(2);
        expect(blocks[0]).toEqual({ type: "text", text: "Let me search." });
        expect(blocks[1]).toMatchObject({
            type: "tool_use",
            id: "tc_1",
            name: "search_nodes",
            input: { query: "test" },
        });
    });

    it("handles assistant with tool_calls but no text content", () => {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "user", content: "Do something" },
            {
                role: "assistant",
                content: null,
                tool_calls: [{
                    id: "tc_1",
                    type: "function" as const,
                    function: { name: "get_node", arguments: '{"key":"n1"}' },
                }],
            },
        ];
        const result = convertMessagesToAnthropic(messages);
        const blocks = result.messages[1].content as Anthropic.ContentBlockParam[];
        // Should only have tool_use block, no empty text block
        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toMatchObject({ type: "tool_use" });
    });

    it("converts tool results to user messages with tool_result blocks", () => {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "user", content: "Search" },
            {
                role: "assistant",
                content: null,
                tool_calls: [{
                    id: "tc_1",
                    type: "function" as const,
                    function: { name: "search_nodes", arguments: '{}' },
                }],
            },
            { role: "tool", tool_call_id: "tc_1", content: '{"nodes":[]}' },
        ];
        const result = convertMessagesToAnthropic(messages);
        // Tool result should be a user message with tool_result block
        const toolResultMsg = result.messages[2];
        expect(toolResultMsg.role).toBe("user");
        const blocks = toolResultMsg.content as Anthropic.ContentBlockParam[];
        expect(blocks[0]).toMatchObject({
            type: "tool_result",
            tool_use_id: "tc_1",
            content: '{"nodes":[]}',
        });
    });

    it("merges consecutive tool results into a single user message", () => {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "user", content: "Do things" },
            {
                role: "assistant",
                content: null,
                tool_calls: [
                    { id: "tc_1", type: "function" as const, function: { name: "tool_a", arguments: '{}' } },
                    { id: "tc_2", type: "function" as const, function: { name: "tool_b", arguments: '{}' } },
                ],
            },
            { role: "tool", tool_call_id: "tc_1", content: "result_a" },
            { role: "tool", tool_call_id: "tc_2", content: "result_b" },
        ];
        const result = convertMessagesToAnthropic(messages);
        // The two tool results should be merged into one user message
        expect(result.messages).toHaveLength(3); // user, assistant, user(2 tool_results)
        const toolResultMsg = result.messages[2];
        expect(toolResultMsg.role).toBe("user");
        const blocks = toolResultMsg.content as Anthropic.ContentBlockParam[];
        expect(blocks).toHaveLength(2);
        expect(blocks[0]).toMatchObject({ type: "tool_result", tool_use_id: "tc_1" });
        expect(blocks[1]).toMatchObject({ type: "tool_result", tool_use_id: "tc_2" });
    });

    it("handles malformed tool call arguments gracefully", () => {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "user", content: "Test" },
            {
                role: "assistant",
                content: null,
                tool_calls: [{
                    id: "tc_1",
                    type: "function" as const,
                    function: { name: "broken", arguments: "not-json" },
                }],
            },
        ];
        const result = convertMessagesToAnthropic(messages);
        const blocks = result.messages[1].content as Anthropic.ContentBlockParam[];
        const toolUseBlock = blocks[0] as { type: "tool_use"; input: unknown };
        // Should fallback to empty object
        expect(toolUseBlock.input).toEqual({});
    });
});

describe("convertToolsToAnthropic", () => {
    it("converts OpenAI tool definitions to Anthropic format", () => {
        const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [{
            type: "function",
            function: {
                name: "search_nodes",
                description: "Search nodes in the graph",
                parameters: {
                    type: "object",
                    properties: { query: { type: "string" } },
                    required: ["query"],
                },
            },
        }];
        const result = convertToolsToAnthropic(tools);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("search_nodes");
        expect(result[0].description).toBe("Search nodes in the graph");
        expect(result[0].input_schema).toEqual({
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
        });
    });

    it("handles tools without description", () => {
        const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [{
            type: "function",
            function: {
                name: "my_tool",
                parameters: { type: "object", properties: {} },
            },
        }];
        const result = convertToolsToAnthropic(tools);
        expect(result[0].description).toBe("");
    });
});

describe("convertAnthropicResponse", () => {
    it("extracts text from text blocks", () => {
        const response = {
            id: "msg_1",
            type: "message" as const,
            role: "assistant" as const,
            model: "claude-sonnet-4-20250514",
            content: [{ type: "text" as const, text: "Hello world" }],
            usage: { input_tokens: 10, output_tokens: 5 },
            stop_reason: "end_turn" as const,
        } as Anthropic.Message;

        const result = convertAnthropicResponse(response);
        expect(result.message.content).toBe("Hello world");
        expect(result.message.role).toBe("assistant");
        expect(result.message.tool_calls).toBeUndefined();
        expect(result.usage?.promptTokens).toBe(10);
        expect(result.usage?.completionTokens).toBe(5);
        expect(result.usage?.totalTokens).toBe(15);
        expect(result.model).toBe("claude-sonnet-4-20250514");
    });

    it("extracts tool_calls from tool_use blocks", () => {
        const response = {
            id: "msg_2",
            type: "message" as const,
            role: "assistant" as const,
            model: "claude-sonnet-4-20250514",
            content: [
                { type: "tool_use" as const, id: "tu_1", name: "search_nodes", input: { query: "NBA" } },
            ],
            usage: { input_tokens: 20, output_tokens: 10 },
            stop_reason: "tool_use" as const,
        } as Anthropic.Message;

        const result = convertAnthropicResponse(response);
        expect(result.message.content).toBe(null);
        expect(result.message.tool_calls).toHaveLength(1);
        expect(result.message.tool_calls![0]).toEqual({
            id: "tu_1",
            type: "function",
            function: { name: "search_nodes", arguments: '{"query":"NBA"}' },
        });
    });

    it("handles mixed text + tool_use response", () => {
        const response = {
            id: "msg_3",
            type: "message" as const,
            role: "assistant" as const,
            model: "claude-sonnet-4-20250514",
            content: [
                { type: "text" as const, text: "Let me search." },
                { type: "tool_use" as const, id: "tu_1", name: "get_node", input: { key: "n1" } },
            ],
            usage: { input_tokens: 15, output_tokens: 8 },
            stop_reason: "tool_use" as const,
        } as Anthropic.Message;

        const result = convertAnthropicResponse(response);
        expect(result.message.content).toBe("Let me search.");
        expect(result.message.tool_calls).toHaveLength(1);
    });

    it("extracts cachedTokens from cache_read_input_tokens", () => {
        const response = {
            id: "msg_4",
            type: "message" as const,
            role: "assistant" as const,
            model: "claude-sonnet-4-20250514",
            content: [{ type: "text" as const, text: "Cached response" }],
            usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 80 },
            stop_reason: "end_turn" as const,
        } as Anthropic.Message;

        const result = convertAnthropicResponse(response);
        expect(result.usage?.cachedTokens).toBe(80);
    });
});
