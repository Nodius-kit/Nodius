import { describe, it, expect, afterEach } from "vitest";
import { resolveAIConfig, getAIConfig, resetAIConfig } from "./aiConfig.js";

describe("resolveAIConfig", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
        resetAIConfig();
    });

    it("returns null providers when no API keys", () => {
        delete process.env.DEEPSEEK_API_KEY;
        delete process.env.OPENAI_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;
        const config = resolveAIConfig();
        expect(config.chatProvider).toBeNull();
        expect(config.chatApiKey).toBeNull();
        expect(config.embeddingProvider).toBeNull();
    });

    it("detects deepseek when DEEPSEEK_API_KEY is set", () => {
        process.env.DEEPSEEK_API_KEY = "dk-test";
        delete process.env.OPENAI_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;
        const config = resolveAIConfig();
        expect(config.chatProvider).toBe("deepseek");
        expect(config.chatApiKey).toBe("dk-test");
        expect(config.chatModel).toBe("deepseek-chat");
        expect(config.embeddingProvider).toBeNull();
    });

    it("detects openai for both chat and embedding", () => {
        delete process.env.DEEPSEEK_API_KEY;
        process.env.OPENAI_API_KEY = "sk-test";
        delete process.env.ANTHROPIC_API_KEY;
        const config = resolveAIConfig();
        expect(config.chatProvider).toBe("openai");
        expect(config.embeddingProvider).toBe("openai");
        expect(config.embeddingApiKey).toBe("sk-test");
    });

    it("accepts overrides", () => {
        const config = resolveAIConfig({
            chatProvider: "anthropic",
            chatApiKey: "ant-key",
            chatModel: "claude-3-5-sonnet-20241022",
            debug: true,
        });
        expect(config.chatProvider).toBe("anthropic");
        expect(config.chatApiKey).toBe("ant-key");
        expect(config.chatModel).toBe("claude-3-5-sonnet-20241022");
        expect(config.debug).toBe(true);
    });

    it("debug defaults to false", () => {
        delete process.env.AI_DEBUG;
        const config = resolveAIConfig();
        expect(config.debug).toBe(false);
    });

    it("AI_DEBUG=true enables debug", () => {
        process.env.AI_DEBUG = "true";
        const config = resolveAIConfig();
        expect(config.debug).toBe(true);
    });

    it("AI_DEBUG=1 enables debug", () => {
        process.env.AI_DEBUG = "1";
        const config = resolveAIConfig();
        expect(config.debug).toBe(true);
    });
});

describe("getAIConfig singleton", () => {
    afterEach(() => {
        resetAIConfig();
    });

    it("returns the same config on consecutive calls", () => {
        const a = getAIConfig();
        const b = getAIConfig();
        expect(a).toBe(b);
    });

    it("resetAIConfig clears the singleton", () => {
        const a = getAIConfig();
        resetAIConfig();
        const b = getAIConfig();
        expect(a).not.toBe(b);
    });
});
