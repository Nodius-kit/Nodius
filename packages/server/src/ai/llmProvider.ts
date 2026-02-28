/**
 * Re-export shim — all types and classes have moved to providers/.
 *
 * This file re-exports everything for backward compatibility with existing imports.
 * New code should import directly from:
 *   - ./providers/llmProvider.js (types/interfaces)
 *   - ./providers/openaiProvider.js (OpenAICompatibleProvider)
 *   - ./providers/anthropicProvider.js (AnthropicProvider + conversion helpers)
 */

// Types and interfaces
export type { LLMToolCall, LLMResponse, LLMProvider, ProviderConfig } from "./providers/llmProvider.js";

// Provider classes
export { OpenAICompatibleProvider } from "./providers/openaiProvider.js";
export {
    AnthropicProvider,
    convertMessagesToAnthropic,
    convertToolsToAnthropic,
    convertAnthropicResponse,
} from "./providers/anthropicProvider.js";

// PROVIDER_CONFIGS re-built from registry for backward compatibility
import { PROVIDER_REGISTRY } from "./config/providerRegistry.js";
import type { ProviderConfig } from "./providers/llmProvider.js";

export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = Object.fromEntries(
    Object.entries(PROVIDER_REGISTRY).map(([name, entry]) => [
        name,
        { baseURL: entry.baseURL, defaultModel: entry.defaultModel, pricing: entry.pricing },
    ]),
);
