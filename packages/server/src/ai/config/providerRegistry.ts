/**
 * Provider Registry — single source of truth for all LLM provider configurations.
 *
 * Adding a new provider = 1 entry in PROVIDER_REGISTRY.
 * No need to touch factory, pricing, or env detection code.
 */

import type { TokenPricing } from "../tokenTracker.js";

export type ProviderType = "openai-compatible" | "anthropic";

export interface ProviderRegistryEntry {
    type: ProviderType;
    baseURL: string;
    defaultModel: string;
    pricing: TokenPricing;
    apiKeyEnvVar: string;
    supportsEmbedding: boolean;
}

export const PROVIDER_REGISTRY: Record<string, ProviderRegistryEntry> = {
    deepseek: {
        type: "openai-compatible",
        baseURL: "https://api.deepseek.com",
        defaultModel: "deepseek-chat",
        apiKeyEnvVar: "DEEPSEEK_API_KEY",
        supportsEmbedding: false,
        pricing: {
            inputPerMillion: 0.28,
            inputCacheHitPerMillion: 0.028,
            outputPerMillion: 0.42,
        },
    },
    openai: {
        type: "openai-compatible",
        baseURL: "https://api.openai.com/v1",
        defaultModel: "gpt-4o",
        apiKeyEnvVar: "OPENAI_API_KEY",
        supportsEmbedding: true,
        pricing: {
            inputPerMillion: 2.50,
            inputCacheHitPerMillion: 1.25,
            outputPerMillion: 10.00,
        },
    },
    "openai-mini": {
        type: "openai-compatible",
        baseURL: "https://api.openai.com/v1",
        defaultModel: "gpt-4o-mini",
        apiKeyEnvVar: "OPENAI_API_KEY",
        supportsEmbedding: true,
        pricing: {
            inputPerMillion: 0.15,
            inputCacheHitPerMillion: 0.075,
            outputPerMillion: 0.60,
        },
    },
    anthropic: {
        type: "anthropic",
        baseURL: "https://api.anthropic.com",
        defaultModel: "claude-sonnet-4-20250514",
        apiKeyEnvVar: "ANTHROPIC_API_KEY",
        supportsEmbedding: false,
        pricing: {
            inputPerMillion: 3.00,
            inputCacheHitPerMillion: 0.30,
            outputPerMillion: 15.00,
        },
    },
};

/**
 * Get pricing for a named provider. Falls back to deepseek pricing for unknown providers.
 */
export function getProviderPricing(name: string): TokenPricing {
    return PROVIDER_REGISTRY[name]?.pricing ?? PROVIDER_REGISTRY.deepseek.pricing;
}

/**
 * Detect the first available LLM provider by checking env vars.
 * Priority: DEEPSEEK > OPENAI > ANTHROPIC (same as before).
 */
export function detectAvailableProvider(): string | null {
    for (const [name, entry] of Object.entries(PROVIDER_REGISTRY)) {
        if (process.env[entry.apiKeyEnvVar]) {
            return name;
        }
    }
    return null;
}

/**
 * Detect the first available provider that supports embeddings.
 */
export function detectEmbeddingCapableProvider(): string | null {
    for (const [name, entry] of Object.entries(PROVIDER_REGISTRY)) {
        if (entry.supportsEmbedding && process.env[entry.apiKeyEnvVar]) {
            return name;
        }
    }
    return null;
}
