import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIAgent, type AgentResponse, type AgentInterrupt } from "./aiAgent.js";
import { MockGraphDataSource, MOCK_GRAPH_KEY } from "../../test-ai/mock-data.js";
import type { LLMProvider, LLMResponse } from "./providers/llmProvider.js";
import type { LLMStreamChunk, StreamCallbacks } from "./types.js";
import type { EmbeddingProvider } from "./providers/embeddingProvider.js";

/** Create a mock LLM provider that returns pre-defined responses. */
function createMockProvider(responses: LLMResponse[]): LLMProvider {
    let callIndex = 0;
    return {
        chatCompletion: vi.fn(async () => {
            return responses[callIndex++] ?? responses[responses.length - 1];
        }),
        chatCompletionWithTools: vi.fn(async () => {
            return responses[callIndex++] ?? responses[responses.length - 1];
        }),
        getModel: () => "mock-model",
        getProviderName: () => "mock",
    };
}

/** Helper to make a simple text response */
function textResponse(content: string): LLMResponse {
    return {
        message: { role: "assistant", content, tool_calls: undefined },
        model: "mock-model",
        raw: {},
    };
}

/** Helper to make a tool call response */
function toolCallResponse(toolName: string, args: Record<string, unknown>): LLMResponse {
    return {
        message: {
            role: "assistant",
            content: null,
            tool_calls: [{
                id: `call_${Math.random().toString(36).slice(2, 8)}`,
                type: "function" as const,
                function: { name: toolName, arguments: JSON.stringify(args) },
            }],
        },
        model: "mock-model",
        raw: {},
    };
}

/** Helper for a multi-tool-call response */
function multiToolCallResponse(...calls: Array<{ name: string; args: Record<string, unknown> }>): LLMResponse {
    return {
        message: {
            role: "assistant",
            content: null,
            tool_calls: calls.map(c => ({
                id: `call_${Math.random().toString(36).slice(2, 8)}`,
                type: "function" as const,
                function: { name: c.name, arguments: JSON.stringify(c.args) },
            })),
        },
        model: "mock-model",
        raw: {},
    };
}

let ds: MockGraphDataSource;

beforeEach(() => {
    ds = new MockGraphDataSource();
});

describe("AIAgent — read-only flow", () => {
    it("chat() returns type message when the LLM responds directly", async () => {
        const provider = createMockProvider([textResponse("Bonjour, voici le workflow.")]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, llmProvider: provider });
        const result = await agent.chat("Decris le workflow");
        expect(result.type).toBe("message");
        expect((result as AgentResponse).message).toBe("Bonjour, voici le workflow.");
        expect(result.toolCalls).toHaveLength(0);
    });

    it("chat() executes read tool calls and relaunches the LLM", async () => {
        const provider = createMockProvider([
            toolCallResponse("read_graph_overview", { graphKey: MOCK_GRAPH_KEY }),
            textResponse("Le graph s'appelle NBA Stats Pipeline."),
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, llmProvider: provider });
        const result = await agent.chat("C'est quoi ce graph?");
        expect(result.type).toBe("message");
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0].name).toBe("read_graph_overview");
        expect((result as AgentResponse).message).toBe("Le graph s'appelle NBA Stats Pipeline.");
    });

    it("chat() respects maxToolRounds and falls back without tools", async () => {
        const provider = createMockProvider([
            toolCallResponse("search_nodes", { query: "test" }),
            toolCallResponse("search_nodes", { query: "test2" }),
            textResponse("Reponse finale apres epuisement."),
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, maxToolRounds: 2, llmProvider: provider });
        const result = await agent.chat("Cherche quelque chose");
        expect((result as AgentResponse).message).toBe("Reponse finale apres epuisement.");
        expect(provider.chatCompletion).toHaveBeenCalled();
    });

    it("chat() builds the system prompt on first message", async () => {
        const provider = createMockProvider([textResponse("OK")]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, llmProvider: provider });
        await agent.chat("Hello");
        const calls = (provider.chatCompletionWithTools as ReturnType<typeof vi.fn>).mock.calls;
        const messages = calls[0][0];
        expect(messages[0].role).toBe("system");
        expect(messages[0].content).toContain("NBA Stats Pipeline");
    });

    it("chat() adds RAG context as a system message", async () => {
        const provider = createMockProvider([textResponse("OK")]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, llmProvider: provider });
        await agent.chat("Que fait fetch-api?");
        const calls = (provider.chatCompletionWithTools as ReturnType<typeof vi.fn>).mock.calls;
        const messages = calls[0][0];
        const systemMessages = messages.filter((m: { role: string }) => m.role === "system");
        expect(systemMessages.length).toBeGreaterThanOrEqual(2);
        const ragMsg = systemMessages.find((m: { content: string }) => m.content.includes("Contexte RAG"));
        expect(ragMsg).toBeDefined();
    });

    it("chat() maintains conversation history across calls", async () => {
        const provider = createMockProvider([
            textResponse("Premiere reponse"),
            textResponse("Deuxieme reponse"),
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, llmProvider: provider });
        await agent.chat("Premier message");
        await agent.chat("Deuxieme message");
        const calls = (provider.chatCompletionWithTools as ReturnType<typeof vi.fn>).mock.calls;
        const secondCallMessages = calls[1][0];
        expect(secondCallMessages.length).toBeGreaterThan(3);
    });

    it("reset() clears conversation history", async () => {
        const provider = createMockProvider([
            textResponse("R1"),
            textResponse("R2"),
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, llmProvider: provider });
        await agent.chat("Hello");
        agent.reset();
        await agent.chat("Fresh start");
        const calls = (provider.chatCompletionWithTools as ReturnType<typeof vi.fn>).mock.calls;
        const secondCallMessages = calls[1][0];
        const userMessages = secondCallMessages.filter((m: { role: string }) => m.role === "user");
        expect(userMessages).toHaveLength(1);
    });

    it("chat() returns tool calls in the log", async () => {
        const provider = createMockProvider([
            toolCallResponse("search_nodes", { query: "api" }),
            textResponse("Found the node."),
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, llmProvider: provider });
        const result = await agent.chat("Cherche api");
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0].name).toBe("search_nodes");
        const parsed = JSON.parse(result.toolCalls[0].result);
        expect(parsed).toBeInstanceOf(Array);
    });

    it("chat() handles invalid JSON in tool arguments gracefully", async () => {
        const provider = createMockProvider([{
            message: {
                role: "assistant",
                content: null,
                tool_calls: [{
                    id: "call_bad",
                    type: "function" as const,
                    function: { name: "search_nodes", arguments: "INVALID JSON{{{" },
                }],
            },
            model: "mock-model",
            raw: {},
        }]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, maxToolRounds: 1, llmProvider: provider });
        const result = await agent.chat("Bad call");
        // Should NOT crash — error is fed back to the LLM as a tool result
        expect(result.type).toBe("message");
        expect(result.toolCalls.length).toBe(1);
        expect(result.toolCalls[0].name).toBe("search_nodes");
        expect(result.toolCalls[0].result).toContain("Invalid JSON");
    });

    it("chat() ignores non-function tool calls", async () => {
        const provider = createMockProvider([{
            message: {
                role: "assistant",
                content: null,
                tool_calls: [{
                    id: "call_nonfunc",
                    type: "not_function" as "function",
                    function: { name: "whatever", arguments: "{}" },
                }],
            },
            model: "mock-model",
            raw: {},
        }, textResponse("Done after skipping.")]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, maxToolRounds: 1, llmProvider: provider });
        const result = await agent.chat("Test");
        expect(result.toolCalls).toHaveLength(0);
    });

    it("context RAG contains nodes and edges", async () => {
        const provider = createMockProvider([textResponse("OK")]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, llmProvider: provider });
        const result = await agent.chat("fetch api NBA players");
        expect(result.context).toBeDefined();
        expect(result.context!.relevantNodes.length).toBeGreaterThan(0);
        expect(result.context!.relevantEdges.length).toBeGreaterThan(0);
    });

    it("viewer role produces a different system prompt than editor", async () => {
        const viewerProvider = createMockProvider([textResponse("OK")]);
        const editorProvider = createMockProvider([textResponse("OK")]);

        const viewer = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "viewer", llmProvider: viewerProvider });
        const editor = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "editor", llmProvider: editorProvider });

        await viewer.chat("Hello");
        await editor.chat("Hello");

        const viewerPrompt = (viewerProvider.chatCompletionWithTools as ReturnType<typeof vi.fn>).mock.calls[0][0][0].content;
        const editorPrompt = (editorProvider.chatCompletionWithTools as ReturnType<typeof vi.fn>).mock.calls[0][0][0].content;

        expect(viewerPrompt).toContain("LECTURE SEULE");
        expect(editorPrompt).toContain("proposer des modifications");
    });
});

describe("AIAgent — tool injection by role", () => {
    it("editor gets write tools (propose_*) in tool definitions", async () => {
        const provider = createMockProvider([textResponse("OK")]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "editor", llmProvider: provider });
        await agent.chat("Hello");
        const tools = (provider.chatCompletionWithTools as ReturnType<typeof vi.fn>).mock.calls[0][1];
        const names = tools.map((t: { function: { name: string } }) => t.function.name);
        expect(names).toContain("propose_create_node");
        expect(names).toContain("propose_create_edge");
        expect(names).toContain("propose_delete_node");
    });

    it("viewer does NOT get write tools", async () => {
        const provider = createMockProvider([textResponse("OK")]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "viewer", llmProvider: provider });
        await agent.chat("Hello");
        const tools = (provider.chatCompletionWithTools as ReturnType<typeof vi.fn>).mock.calls[0][1];
        const names = tools.map((t: { function: { name: string } }) => t.function.name);
        expect(names).not.toContain("propose_create_node");
        expect(names).not.toContain("propose_create_edge");
        expect(names).not.toContain("propose_delete_node");
    });

    it("viewer still gets read tools", async () => {
        const provider = createMockProvider([textResponse("OK")]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "viewer", llmProvider: provider });
        await agent.chat("Hello");
        const tools = (provider.chatCompletionWithTools as ReturnType<typeof vi.fn>).mock.calls[0][1];
        const names = tools.map((t: { function: { name: string } }) => t.function.name);
        expect(names).toContain("search_nodes");
        expect(names).toContain("read_graph_overview");
    });
});

describe("AIAgent — HITL interrupt flow", () => {
    it("propose_create_node triggers an interrupt", async () => {
        const provider = createMockProvider([
            toolCallResponse("propose_create_node", {
                typeKey: "filter",
                sheet: "0",
                posX: 500,
                posY: 300,
                reason: "Need a new filter",
            }),
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "editor", llmProvider: provider });
        const result = await agent.chat("Ajoute un node filter");

        expect(result.type).toBe("interrupt");
        const interrupt = result as AgentInterrupt;
        expect(interrupt.proposedAction.type).toBe("create_node");
        expect(interrupt.toolCall.name).toBe("propose_create_node");
        expect(agent.hasPendingInterrupt()).toBe(true);
    });

    it("propose_create_edge triggers an interrupt", async () => {
        const provider = createMockProvider([
            toolCallResponse("propose_create_edge", {
                sourceKey: "filter-active",
                sourceHandle: "0",
                targetKey: "sort-stats",
                targetHandle: "0",
                sheet: "0",
                reason: "Connect filter to sort",
            }),
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "editor", llmProvider: provider });
        const result = await agent.chat("Connecte filter a sort");

        expect(result.type).toBe("interrupt");
        const interrupt = result as AgentInterrupt;
        expect(interrupt.proposedAction.type).toBe("create_edge");
    });

    it("propose_delete_node triggers an interrupt", async () => {
        const provider = createMockProvider([
            toolCallResponse("propose_delete_node", {
                nodeKey: "error-handler",
                reason: "No longer needed",
            }),
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "editor", llmProvider: provider });
        const result = await agent.chat("Supprime error-handler");

        expect(result.type).toBe("interrupt");
        const interrupt = result as AgentInterrupt;
        expect(interrupt.proposedAction.type).toBe("delete_node");
        expect((interrupt.proposedAction.payload as { nodeKey: string }).nodeKey).toBe("error-handler");
    });

    it("the propose_* tool is NOT executed (no result in log)", async () => {
        const provider = createMockProvider([
            toolCallResponse("propose_create_node", {
                typeKey: "filter",
                sheet: "0",
                posX: 500,
                posY: 300,
                reason: "test",
            }),
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "editor", llmProvider: provider });
        const result = await agent.chat("Ajoute un filter");

        // The tool call should NOT appear in the log (it was intercepted, not executed)
        expect(result.toolCalls).toHaveLength(0);
    });

    it("read tools before a propose_* are executed normally", async () => {
        const provider = createMockProvider([
            // First LLM response: read tool
            toolCallResponse("search_nodes", { query: "filter" }),
            // Second LLM response: propose after reading
            toolCallResponse("propose_create_node", {
                typeKey: "filter",
                sheet: "0",
                posX: 500,
                posY: 300,
                reason: "After searching, need a new filter",
            }),
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "editor", llmProvider: provider });
        const result = await agent.chat("Cherche et ajoute un filter");

        expect(result.type).toBe("interrupt");
        // The search_nodes tool WAS executed and logged
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0].name).toBe("search_nodes");
    });
});

describe("AIAgent — resumeConversation()", () => {
    it("approved: resumes and LLM gets approved result", async () => {
        const provider = createMockProvider([
            toolCallResponse("propose_create_node", {
                typeKey: "filter",
                sheet: "0",
                posX: 500,
                posY: 300,
                reason: "Need a filter",
            }),
            // After resume, LLM gives final answer
            textResponse("Node filter cree avec succes."),
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "editor", llmProvider: provider });

        const interrupt = await agent.chat("Ajoute un filter");
        expect(interrupt.type).toBe("interrupt");

        const result = await agent.resumeConversation(true, "Node cree: node_100");
        expect(result.type).toBe("message");
        expect((result as AgentResponse).message).toBe("Node filter cree avec succes.");

        // The tool call log should contain the propose with the approved result
        const proposeEntry = result.toolCalls.find(tc => tc.name === "propose_create_node");
        expect(proposeEntry).toBeDefined();
        expect(JSON.parse(proposeEntry!.result).status).toBe("approved");
    });

    it("rejected: resumes and LLM gets rejected result", async () => {
        const provider = createMockProvider([
            toolCallResponse("propose_delete_node", {
                nodeKey: "error-handler",
                reason: "Cleanup",
            }),
            textResponse("D'accord, je ne supprime pas le node."),
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "editor", llmProvider: provider });

        const interrupt = await agent.chat("Supprime error-handler");
        expect(interrupt.type).toBe("interrupt");

        const result = await agent.resumeConversation(false, "L'utilisateur refuse la suppression.");
        expect(result.type).toBe("message");

        const proposeEntry = result.toolCalls.find(tc => tc.name === "propose_delete_node");
        expect(JSON.parse(proposeEntry!.result).status).toBe("rejected");
    });

    it("throws if no pending interrupt", async () => {
        const provider = createMockProvider([textResponse("OK")]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "editor", llmProvider: provider });
        await expect(agent.resumeConversation(true)).rejects.toThrow("No pending interrupt");
    });

    it("hasPendingInterrupt() is false after resume", async () => {
        const provider = createMockProvider([
            toolCallResponse("propose_create_node", {
                typeKey: "filter",
                sheet: "0",
                posX: 500,
                posY: 300,
                reason: "test",
            }),
            textResponse("Done."),
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "editor", llmProvider: provider });

        await agent.chat("Ajoute un filter");
        expect(agent.hasPendingInterrupt()).toBe(true);

        await agent.resumeConversation(true);
        expect(agent.hasPendingInterrupt()).toBe(false);
    });

    it("reset() clears pending interrupt", async () => {
        const provider = createMockProvider([
            toolCallResponse("propose_create_node", {
                typeKey: "filter",
                sheet: "0",
                posX: 500,
                posY: 300,
                reason: "test",
            }),
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "editor", llmProvider: provider });

        await agent.chat("Ajoute un filter");
        expect(agent.hasPendingInterrupt()).toBe(true);

        agent.reset();
        expect(agent.hasPendingInterrupt()).toBe(false);
    });
});

describe("AIAgent — batch propose_* in same response", () => {
    it("multiple propose_* tools interrupt on the first one", async () => {
        const provider = createMockProvider([
            multiToolCallResponse(
                { name: "propose_create_node", args: { typeKey: "filter", sheet: "0", posX: 100, posY: 100, reason: "first" } },
                { name: "propose_create_edge", args: { sourceKey: "a", sourceHandle: "0", targetKey: "b", targetHandle: "0", sheet: "0", reason: "second" } },
            ),
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "editor", llmProvider: provider });
        const result = await agent.chat("Create and connect");

        expect(result.type).toBe("interrupt");
        const interrupt = result as AgentInterrupt;
        expect(interrupt.proposedAction.type).toBe("create_node");
        expect(agent.hasPendingInterrupt()).toBe(true);
    });

    it("after approving first, second propose_* triggers another interrupt", async () => {
        const provider = createMockProvider([
            multiToolCallResponse(
                { name: "propose_create_node", args: { typeKey: "filter", sheet: "0", posX: 100, posY: 100, reason: "first" } },
                { name: "propose_create_edge", args: { sourceKey: "a", sourceHandle: "0", targetKey: "b", targetHandle: "0", sheet: "0", reason: "second" } },
            ),
            textResponse("All done."),
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, role: "editor", llmProvider: provider });

        // First interrupt: create_node
        const first = await agent.chat("Create and connect");
        expect(first.type).toBe("interrupt");
        expect((first as AgentInterrupt).proposedAction.type).toBe("create_node");

        // Resume first → triggers second interrupt: create_edge
        const second = await agent.resumeConversation(true, "Node created");
        expect(second.type).toBe("interrupt");
        expect((second as AgentInterrupt).proposedAction.type).toBe("create_edge");

        // Resume second → final answer
        const final = await agent.resumeConversation(true, "Edge created");
        expect(final.type).toBe("message");
        expect((final as AgentResponse).message).toBe("All done.");
    });
});

describe("AIAgent — with embeddingProvider", () => {
    it("does not crash when embeddingProvider is set", async () => {
        const embProvider: EmbeddingProvider = {
            generateEmbedding: vi.fn(async () => new Array(1536).fill(0.1)),
            getDimension: () => 1536,
            getModelName: () => "mock-embedding",
        };
        const provider = createMockProvider([textResponse("OK with embeddings.")]);
        const agent = new AIAgent({
            graphKey: MOCK_GRAPH_KEY,
            dataSource: ds,
            llmProvider: provider,
            embeddingProvider: embProvider,
        });
        const result = await agent.chat("fetch api");
        expect(result.type).toBe("message");
        expect((result as AgentResponse).message).toBe("OK with embeddings.");
        expect(embProvider.generateEmbedding).toHaveBeenCalled();
    });

    it("works normally when embeddingProvider is null", async () => {
        const provider = createMockProvider([textResponse("OK without embeddings.")]);
        const agent = new AIAgent({
            graphKey: MOCK_GRAPH_KEY,
            dataSource: ds,
            llmProvider: provider,
            embeddingProvider: null,
        });
        const result = await agent.chat("fetch api");
        expect(result.type).toBe("message");
        expect((result as AgentResponse).message).toBe("OK without embeddings.");
    });
});

// ─── Streaming helpers ──────────────────────────────────────────────

/** Create a mock provider that supports streaming via async generators. */
function createMockStreamProvider(chunkSequences: LLMStreamChunk[][]): LLMProvider {
    let callIndex = 0;
    return {
        chatCompletion: vi.fn(async () => textResponse("fallback")),
        chatCompletionWithTools: vi.fn(async () => textResponse("fallback")),
        async *streamCompletionWithTools() {
            const chunks = chunkSequences[callIndex++] ?? chunkSequences[chunkSequences.length - 1];
            for (const chunk of chunks) {
                yield chunk;
            }
        },
        getModel: () => "mock-stream",
        getProviderName: () => "mock",
    };
}

function createCallbackSpy(): StreamCallbacks & { calls: Record<string, unknown[][]> } {
    const calls: Record<string, unknown[][]> = {
        onToken: [],
        onToolStart: [],
        onToolResult: [],
        onComplete: [],
        onError: [],
    };
    return {
        calls,
        onToken: vi.fn((...args) => { calls.onToken.push(args); }),
        onToolStart: vi.fn((...args) => { calls.onToolStart.push(args); }),
        onToolResult: vi.fn((...args) => { calls.onToolResult.push(args); }),
        onComplete: vi.fn((...args) => { calls.onComplete.push(args); }),
        onError: vi.fn((...args) => { calls.onError.push(args); }),
    };
}

// ─── Streaming tests ────────────────────────────────────────────────

describe("AIAgent — chatStream", () => {
    it("streams tokens from LLM response", async () => {
        const provider = createMockStreamProvider([[
            { type: "token", token: "Hello" },
            { type: "token", token: " world" },
            { type: "usage", usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
            { type: "done" },
        ]]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, llmProvider: provider });
        const cb = createCallbackSpy();

        await agent.chatStream("Say hello", cb);

        expect(cb.calls.onToken).toHaveLength(2);
        expect(cb.calls.onToken[0][0]).toBe("Hello");
        expect(cb.calls.onToken[1][0]).toBe(" world");
        expect(cb.calls.onComplete).toHaveLength(1);
        expect(cb.calls.onComplete[0][0]).toBe("Hello world");
        expect(cb.calls.onError).toHaveLength(0);
    });

    it("handles tool calls during streaming", async () => {
        const provider = createMockStreamProvider([
            // First call: tool call
            [
                { type: "tool_call_start", toolCall: { id: "call_1", name: "search_nodes", arguments: "" } },
                { type: "tool_call_done", toolCall: { id: "call_1", name: "search_nodes", arguments: '{"query":"test"}' } },
                { type: "done" },
            ],
            // Second call: final text
            [
                { type: "token", token: "Found results." },
                { type: "done" },
            ],
        ]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, llmProvider: provider });
        const cb = createCallbackSpy();

        await agent.chatStream("Search for test", cb);

        // Tool should have been started and result returned
        expect(cb.calls.onToolStart.length).toBeGreaterThanOrEqual(1);
        expect(cb.calls.onToolResult.length).toBeGreaterThanOrEqual(1);
        expect(cb.calls.onComplete).toHaveLength(1);
        expect(cb.calls.onComplete[0][0]).toBe("Found results.");
    });

    it("handles errors gracefully", async () => {
        const provider: LLMProvider = {
            chatCompletion: vi.fn(),
            chatCompletionWithTools: vi.fn(),
            async *streamCompletionWithTools() {
                throw new Error("Stream failed");
            },
            getModel: () => "mock-stream",
            getProviderName: () => "mock",
        };
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, llmProvider: provider });
        const cb = createCallbackSpy();

        await agent.chatStream("Fail", cb);

        expect(cb.calls.onError).toHaveLength(1);
        expect((cb.calls.onError[0][0] as Error).message).toBe("Stream failed");
    });

    it("llmProvider is required in constructor", () => {
        // TypeScript enforces llmProvider as required — this is a compile-time guarantee.
        // We just verify the agent works correctly when provider is given.
        const provider = createMockProvider([textResponse("ok")]);
        const agent = new AIAgent({ graphKey: MOCK_GRAPH_KEY, dataSource: ds, llmProvider: provider });
        expect(agent).toBeDefined();
    });
});
