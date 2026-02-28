/**
 * Re-export shim — EmbeddingProvider has moved to providers/embeddingProvider.ts.
 * New code should import from ./providers/embeddingProvider.js.
 */
export {
    type EmbeddingProvider,
    type EmbeddingModelConfig,
    EMBEDDING_MODELS,
    OpenAIEmbeddingProvider,
    detectEmbeddingProvider,
} from "./providers/embeddingProvider.js";
