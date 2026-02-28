/**
 * Re-export shim — Provider factory has moved to providers/providerFactory.ts.
 * New code should import from ./providers/providerFactory.js.
 */
export {
    type LLMProviderConfig,
    createLLMProvider,
    detectLLMProvider,
    getProviderPricing,
} from "./providers/providerFactory.js";
