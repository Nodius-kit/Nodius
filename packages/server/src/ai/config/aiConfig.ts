/**
 * Unified AI configuration — single entry point for all AI settings.
 *
 * Reads from environment variables and provides a resolved config
 * with provider names, API keys, models, and debug flag.
 */

import { PROVIDER_REGISTRY, detectAvailableProvider, detectEmbeddingCapableProvider } from "./providerRegistry.js";
import { setAIDebug } from "../aiLogger.js";

export interface AIConfig {
    chatProvider: string | null;
    chatApiKey?: string;
    chatModel?: string;
    embeddingProvider: string | null;
    embeddingApiKey?: string;
    embeddingModel?: string;
    debug: boolean;
}

export interface ResolvedAIConfig {
    chatProvider: string | null;
    chatApiKey: string | null;
    chatModel: string | null;
    chatBaseURL: string | null;
    embeddingProvider: string | null;
    embeddingApiKey: string | null;
    embeddingModel: string;
    debug: boolean;
}

/**
 * Resolve a full AI config from env vars + optional overrides.
 */
export function resolveAIConfig(overrides?: Partial<AIConfig>): ResolvedAIConfig {

    const debug = overrides?.debug ?? (process.env.AI_DEBUG === "true" || process.env.AI_DEBUG === "1");

    // Chat provider
    const chatProviderName = overrides?.chatProvider ?? detectAvailableProvider();
    const chatEntry = chatProviderName ? PROVIDER_REGISTRY[chatProviderName] : null;
    const chatApiKey = overrides?.chatApiKey ?? (chatEntry ? process.env[chatEntry.apiKeyEnvVar] : null) ?? null;
    const chatModel = overrides?.chatModel ?? chatEntry?.defaultModel ?? null;
    const chatBaseURL = chatEntry?.baseURL ?? null;

    // Embedding provider
    const embeddingProviderName = overrides?.embeddingProvider ?? detectEmbeddingCapableProvider();
    const embeddingEntry = embeddingProviderName ? PROVIDER_REGISTRY[embeddingProviderName] : null;
    const embeddingApiKey = overrides?.embeddingApiKey ?? (embeddingEntry ? process.env[embeddingEntry.apiKeyEnvVar] : null) ?? null;
    const embeddingModel = overrides?.embeddingModel ?? process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";

    return {
        chatProvider: chatProviderName,
        chatApiKey,
        chatModel,
        chatBaseURL,
        embeddingProvider: embeddingProviderName,
        embeddingApiKey,
        embeddingModel,
        debug,
    };
}

// ─── Singleton ──────────────────────────────────────────────────────

let _config: ResolvedAIConfig | null = null;

/**
 * Get the resolved AI config (lazy singleton).
 * Also syncs the debug flag to the logger.
 */
export function getAIConfig(): ResolvedAIConfig {
    if (!_config) {
        _config = resolveAIConfig();
        setAIDebug(_config.debug);
    }
    return _config;
}

/**
 * Reset the cached config (for tests or runtime reconfiguration).
 */
export function resetAIConfig(): void {
    _config = null;
}
