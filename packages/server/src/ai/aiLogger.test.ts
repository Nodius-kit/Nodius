import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    setAILogSink,
    resetAILogSink,
    setAIDebug,
    debugAI,
    logLLMError,
    logMalformedJSON,
    logClientDisconnect,
    logTokenUsage,
    type AILogEntry,
} from "./aiLogger.js";

describe("aiLogger", () => {
    const entries: AILogEntry[] = [];

    beforeEach(() => {
        entries.length = 0;
        setAILogSink((entry) => entries.push(entry));
    });

    afterEach(() => {
        resetAILogSink();
    });

    describe("logLLMError", () => {
        it("emits an error-level entry with provider and model", () => {
            logLLMError({
                provider: "openai",
                model: "gpt-4o",
                error: new Error("Rate limit exceeded"),
                statusCode: 429,
                sessionId: 42,
                threadId: "thread-1",
            });

            expect(entries).toHaveLength(1);
            expect(entries[0].level).toBe("error");
            expect(entries[0].event).toBe("llm_error");
            expect(entries[0].provider).toBe("openai");
            expect(entries[0].model).toBe("gpt-4o");
            expect(entries[0].error).toBe("Rate limit exceeded");
            expect(entries[0].statusCode).toBe(429);
            expect(entries[0].sessionId).toBe(42);
            expect(entries[0].threadId).toBe("thread-1");
            expect(entries[0].timestamp).toBeDefined();
        });

        it("handles string error input", () => {
            logLLMError({
                provider: "anthropic",
                model: "claude-sonnet-4-20250514",
                error: "some string error",
            });

            expect(entries[0].error).toBe("some string error");
            expect(entries[0].errorName).toBeUndefined();
        });
    });

    describe("logMalformedJSON", () => {
        it("emits a warn-level entry", () => {
            logMalformedJSON({
                raw: '{"broken": true,',
                context: "runToolLoop tool=search_nodes",
            });

            expect(entries[0].level).toBe("warn");
            expect(entries[0].event).toBe("malformed_json");
            expect(entries[0].raw).toBe('{"broken": true,');
            expect(entries[0].context).toBe("runToolLoop tool=search_nodes");
        });

        it("truncates long raw strings", () => {
            const longStr = "x".repeat(1000);
            logMalformedJSON({ raw: longStr, context: "test" });

            expect((entries[0].raw as string).length).toBeLessThanOrEqual(501);
            expect((entries[0].raw as string).endsWith("…")).toBe(true);
        });
    });

    describe("logClientDisconnect", () => {
        it("emits a warn-level entry", () => {
            logClientDisconnect({ sessionId: 7, threadId: "t-1", tokensStreamed: 150 });

            expect(entries[0].level).toBe("warn");
            expect(entries[0].event).toBe("client_disconnect_abort");
            expect(entries[0].sessionId).toBe(7);
            expect(entries[0].threadId).toBe("t-1");
            expect(entries[0].tokensStreamed).toBe(150);
        });
    });

    describe("logTokenUsage", () => {
        it("emits an info-level entry with token counts", () => {
            logTokenUsage({
                provider: "deepseek",
                model: "deepseek-chat",
                promptTokens: 500,
                completionTokens: 200,
                cachedTokens: 100,
                threadId: "t-2",
                label: "stream",
            });

            expect(entries[0].level).toBe("info");
            expect(entries[0].event).toBe("token_usage");
            expect(entries[0].promptTokens).toBe(500);
            expect(entries[0].completionTokens).toBe(200);
            expect(entries[0].cachedTokens).toBe(100);
            expect(entries[0].totalTokens).toBe(700);
        });
    });

    describe("debugAI", () => {
        afterEach(() => {
            setAIDebug(false);
        });

        it("does not emit when debug is disabled", () => {
            setAIDebug(false);
            debugAI("test_event", { foo: "bar" });
            expect(entries).toHaveLength(0);
        });

        it("emits when debug is enabled", () => {
            setAIDebug(true);
            debugAI("test_event", { foo: "bar" });
            expect(entries).toHaveLength(1);
            expect(entries[0].level).toBe("info");
            expect(entries[0].event).toBe("debug:test_event");
            expect(entries[0].foo).toBe("bar");
        });

        it("emits without data", () => {
            setAIDebug(true);
            debugAI("simple_event");
            expect(entries).toHaveLength(1);
            expect(entries[0].event).toBe("debug:simple_event");
        });
    });

    describe("setAILogSink / resetAILogSink", () => {
        it("custom sink receives all entries", () => {
            const customEntries: AILogEntry[] = [];
            setAILogSink((e) => customEntries.push(e));

            logLLMError({ provider: "test", model: "test", error: "e" });
            expect(customEntries).toHaveLength(1);
            expect(entries).toHaveLength(0); // old sink doesn't receive
        });

        it("resetAILogSink restores default behavior", () => {
            const spy = vi.spyOn(console, "error").mockImplementation(() => {});
            resetAILogSink();

            logLLMError({ provider: "test", model: "test", error: "e" });
            expect(spy).toHaveBeenCalledTimes(1);

            spy.mockRestore();
            // Re-set for other tests
            setAILogSink((e) => entries.push(e));
        });
    });
});
