import { describe, it, expect, afterEach } from "vitest";
import {
    PROVIDER_REGISTRY,
    getProviderPricing,
    detectAvailableProvider,
    detectEmbeddingCapableProvider,
} from "./providerRegistry.js";

describe("PROVIDER_REGISTRY", () => {
    it("contains deepseek, openai, openai-mini, anthropic", () => {
        expect(Object.keys(PROVIDER_REGISTRY)).toEqual(
            expect.arrayContaining(["deepseek", "openai", "openai-mini", "anthropic"]),
        );
    });

    it("deepseek is openai-compatible", () => {
        expect(PROVIDER_REGISTRY.deepseek.type).toBe("openai-compatible");
        expect(PROVIDER_REGISTRY.deepseek.apiKeyEnvVar).toBe("DEEPSEEK_API_KEY");
        expect(PROVIDER_REGISTRY.deepseek.supportsEmbedding).toBe(false);
    });

    it("anthropic has correct type", () => {
        expect(PROVIDER_REGISTRY.anthropic.type).toBe("anthropic");
        expect(PROVIDER_REGISTRY.anthropic.apiKeyEnvVar).toBe("ANTHROPIC_API_KEY");
    });

    it("openai supports embedding", () => {
        expect(PROVIDER_REGISTRY.openai.supportsEmbedding).toBe(true);
    });
});

describe("getProviderPricing", () => {
    it("returns correct pricing for deepseek", () => {
        const pricing = getProviderPricing("deepseek");
        expect(pricing.inputPerMillion).toBe(0.28);
        expect(pricing.outputPerMillion).toBe(0.42);
    });

    it("returns correct pricing for anthropic", () => {
        const pricing = getProviderPricing("anthropic");
        expect(pricing.inputPerMillion).toBe(3.00);
        expect(pricing.outputPerMillion).toBe(15.00);
    });

    it("falls back to deepseek for unknown provider", () => {
        const pricing = getProviderPricing("unknown-provider");
        expect(pricing).toEqual(PROVIDER_REGISTRY.deepseek.pricing);
    });
});

describe("detectAvailableProvider", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it("returns null when no API keys are set", () => {
        delete process.env.DEEPSEEK_API_KEY;
        delete process.env.OPENAI_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;
        expect(detectAvailableProvider()).toBeNull();
    });

    it("returns deepseek when DEEPSEEK_API_KEY is set", () => {
        process.env.DEEPSEEK_API_KEY = "test-key";
        delete process.env.OPENAI_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;
        expect(detectAvailableProvider()).toBe("deepseek");
    });

    it("returns openai when only OPENAI_API_KEY is set", () => {
        delete process.env.DEEPSEEK_API_KEY;
        process.env.OPENAI_API_KEY = "test-key";
        delete process.env.ANTHROPIC_API_KEY;
        expect(detectAvailableProvider()).toBe("openai");
    });
});

describe("detectEmbeddingCapableProvider", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it("returns null when no embedding-capable provider has a key", () => {
        delete process.env.OPENAI_API_KEY;
        process.env.DEEPSEEK_API_KEY = "test-key";
        expect(detectEmbeddingCapableProvider()).toBeNull();
    });

    it("returns openai when OPENAI_API_KEY is set", () => {
        process.env.OPENAI_API_KEY = "test-key";
        expect(detectEmbeddingCapableProvider()).toBe("openai");
    });
});
