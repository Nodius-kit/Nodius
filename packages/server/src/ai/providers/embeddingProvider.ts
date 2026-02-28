/**
 * Embedding Provider — generates vector embeddings for semantic search.
 *
 * Separate from LLMProvider because not all LLM providers offer embedding APIs
 * (e.g. DeepSeek doesn't). Uses OpenAI's embedding models when OPENAI_API_KEY
 * is available. Falls back gracefully to token-based search when no provider
 * is configured.
 */

import OpenAI from "openai";
import { getTokenTracker } from "../tokenTracker.js";

// ─── Interface ──────────────────────────────────────────────────────

export interface EmbeddingProvider {
    generateEmbedding(text: string): Promise<number[]>;
    getDimension(): number;
    getModelName(): string;
}

// ─── Model configs ──────────────────────────────────────────────────

export interface EmbeddingModelConfig {
    model: string;
    dimension: number;
    pricingPerMillionTokens: number;
}

export const EMBEDDING_MODELS: Record<string, EmbeddingModelConfig> = {
    "text-embedding-3-small": { model: "text-embedding-3-small", dimension: 1536, pricingPerMillionTokens: 0.02 },
    "text-embedding-3-large": { model: "text-embedding-3-large", dimension: 3072, pricingPerMillionTokens: 0.13 },
    "text-embedding-ada-002": { model: "text-embedding-ada-002", dimension: 1536, pricingPerMillionTokens: 0.10 },
};

// ─── OpenAI implementation ──────────────────────────────────────────

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
    private client: OpenAI;
    private modelConfig: EmbeddingModelConfig;

    constructor(apiKey: string, model = "text-embedding-3-small", baseURL?: string) {
        const config = EMBEDDING_MODELS[model];
        if (!config) {
            throw new Error(`Unknown embedding model: ${model}. Available: ${Object.keys(EMBEDDING_MODELS).join(", ")}`);
        }
        this.modelConfig = config;
        this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    }

    async generateEmbedding(text: string): Promise<number[]> {
        const response = await this.client.embeddings.create({
            model: this.modelConfig.model,
            input: text,
        });

        // Record usage in token tracker
        const usage = response.usage;
        if (usage) {
            getTokenTracker().recordEmbedding(
                usage.prompt_tokens,
                this.modelConfig.model,
                this.modelConfig.pricingPerMillionTokens,
                "embedding",
            );
        }

        return response.data[0].embedding;
    }

    getDimension(): number {
        return this.modelConfig.dimension;
    }

    getModelName(): string {
        return this.modelConfig.model;
    }
}

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Auto-detect embedding provider from environment variables.
 * Returns null if no OPENAI_API_KEY is set — system falls back to token search.
 */
export function detectEmbeddingProvider(): EmbeddingProvider | null {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
    try {
        return new OpenAIEmbeddingProvider(apiKey, model);
    } catch {
        return null;
    }
}
