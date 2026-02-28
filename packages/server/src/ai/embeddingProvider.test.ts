import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EMBEDDING_MODELS, OpenAIEmbeddingProvider, detectEmbeddingProvider } from "./providers/embeddingProvider.js";

describe("EmbeddingProvider", () => {
    describe("EMBEDDING_MODELS", () => {
        it("text-embedding-3-small has dimension 1536", () => {
            expect(EMBEDDING_MODELS["text-embedding-3-small"].dimension).toBe(1536);
            expect(EMBEDDING_MODELS["text-embedding-3-small"].pricingPerMillionTokens).toBe(0.02);
        });

        it("text-embedding-3-large has dimension 3072", () => {
            expect(EMBEDDING_MODELS["text-embedding-3-large"].dimension).toBe(3072);
            expect(EMBEDDING_MODELS["text-embedding-3-large"].pricingPerMillionTokens).toBe(0.13);
        });

        it("text-embedding-ada-002 has dimension 1536", () => {
            expect(EMBEDDING_MODELS["text-embedding-ada-002"].dimension).toBe(1536);
            expect(EMBEDDING_MODELS["text-embedding-ada-002"].pricingPerMillionTokens).toBe(0.10);
        });
    });

    describe("OpenAIEmbeddingProvider", () => {
        it("throws on unknown model", () => {
            expect(() => new OpenAIEmbeddingProvider("fake-key", "unknown-model")).toThrow("Unknown embedding model");
        });

        it("getDimension() returns correct value for text-embedding-3-small", () => {
            const provider = new OpenAIEmbeddingProvider("fake-key", "text-embedding-3-small");
            expect(provider.getDimension()).toBe(1536);
        });

        it("getDimension() returns correct value for text-embedding-3-large", () => {
            const provider = new OpenAIEmbeddingProvider("fake-key", "text-embedding-3-large");
            expect(provider.getDimension()).toBe(3072);
        });

        it("getModelName() returns the model name", () => {
            const provider = new OpenAIEmbeddingProvider("fake-key", "text-embedding-3-small");
            expect(provider.getModelName()).toBe("text-embedding-3-small");
        });

        it("defaults to text-embedding-3-small", () => {
            const provider = new OpenAIEmbeddingProvider("fake-key");
            expect(provider.getModelName()).toBe("text-embedding-3-small");
            expect(provider.getDimension()).toBe(1536);
        });
    });

    describe("detectEmbeddingProvider()", () => {
        const originalEnv = { ...process.env };

        afterEach(() => {
            process.env = { ...originalEnv };
        });

        it("returns null when OPENAI_API_KEY is not set", () => {
            delete process.env.OPENAI_API_KEY;
            expect(detectEmbeddingProvider()).toBeNull();
        });

        it("returns a provider when OPENAI_API_KEY is set", () => {
            process.env.OPENAI_API_KEY = "test-key";
            const provider = detectEmbeddingProvider();
            expect(provider).not.toBeNull();
            expect(provider!.getModelName()).toBe("text-embedding-3-small");
        });

        it("respects EMBEDDING_MODEL env var", () => {
            process.env.OPENAI_API_KEY = "test-key";
            process.env.EMBEDDING_MODEL = "text-embedding-3-large";
            const provider = detectEmbeddingProvider();
            expect(provider).not.toBeNull();
            expect(provider!.getModelName()).toBe("text-embedding-3-large");
            expect(provider!.getDimension()).toBe(3072);
        });

        it("returns null for invalid EMBEDDING_MODEL", () => {
            process.env.OPENAI_API_KEY = "test-key";
            process.env.EMBEDDING_MODEL = "invalid-model";
            const provider = detectEmbeddingProvider();
            expect(provider).toBeNull();
        });
    });
});
