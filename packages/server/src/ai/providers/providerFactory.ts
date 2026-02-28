/**
 * Provider factory — creates LLM and Embedding providers from config or registry.
 */

import { PROVIDER_REGISTRY, detectAvailableProvider } from "../config/providerRegistry.js";
import { getAIConfig } from "../config/aiConfig.js";
import { OpenAICompatibleProvider } from "./openaiProvider.js";
import { AnthropicProvider } from "./anthropicProvider.js";
import { OpenAIEmbeddingProvider, detectEmbeddingProvider } from "./embeddingProvider.js";
import type { LLMProvider } from "./llmProvider.js";
import type { EmbeddingProvider } from "./embeddingProvider.js";

export interface LLMProviderConfig {
    provider: string;
    apiKey: string;
    model?: string;
}

/**
 * Create an LLM provider instance from a config object.
 * Uses the provider registry — no switch-case needed.
 */
export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
    const entry = PROVIDER_REGISTRY[config.provider];
    if (!entry) {
        throw new Error(`Unknown LLM provider: ${config.provider}`);
    }

    if (entry.type === "anthropic") {
        return new AnthropicProvider(config.apiKey, config.model ?? entry.defaultModel);
    }

    return new OpenAICompatibleProvider(
        config.apiKey,
        config.provider,
        entry.baseURL,
        config.model ?? entry.defaultModel,
    );
}

/**
 * Auto-detect available provider from environment variables.
 * Delegates to the provider registry.
 */
export function detectLLMProvider(): LLMProvider | null {
    const providerName = detectAvailableProvider();
    if (!providerName) return null;

    const entry = PROVIDER_REGISTRY[providerName];
    const apiKey = process.env[entry.apiKeyEnvVar];
    if (!apiKey) return null;

    return createLLMProvider({ provider: providerName, apiKey });
}

/**
 * Create an LLM provider using the resolved AI config.
 */
export function createLLMProviderFromConfig(): LLMProvider | null {
    const config = getAIConfig();
    if (!config.chatProvider || !config.chatApiKey) return null;

    return createLLMProvider({
        provider: config.chatProvider,
        apiKey: config.chatApiKey,
        model: config.chatModel ?? undefined,
    });
}

/**
 * Create an embedding provider using the resolved AI config.
 */
export function createEmbeddingProviderFromConfig(): EmbeddingProvider | null {
    const config = getAIConfig();
    if (!config.embeddingProvider || !config.embeddingApiKey) return null;

    try {
        return new OpenAIEmbeddingProvider(
            config.embeddingApiKey,
            config.embeddingModel,
        );
    } catch {
        return null;
    }
}

/**
 * Get the pricing config for a provider name.
 * Re-exported from providerRegistry for backward compatibility.
 */
export { getProviderPricing } from "../config/providerRegistry.js";

// Re-export detection for backward compatibility
export { detectEmbeddingProvider };
