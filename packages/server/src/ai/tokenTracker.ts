/**
 * Token usage tracking and cost estimation for DeepSeek API.
 *
 * Pricing (DeepSeek V3, as of 2025-09):
 *   - Input  (cache miss): $0.28  / 1M tokens
 *   - Input  (cache hit):  $0.028 / 1M tokens
 *   - Output:              $0.42  / 1M tokens
 *
 * Source: https://api-docs.deepseek.com/quick_start/pricing
 */

export interface TokenPricing {
    inputPerMillion: number;
    inputCacheHitPerMillion: number;
    outputPerMillion: number;
}

export interface TokenUsageEntry {
    timestamp: number;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedTokens: number;
    cost: number;
    label?: string;
}

export interface TokenUsageSummary {
    totalCalls: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    totalCachedTokens: number;
    totalCost: number;
    averagePromptTokens: number;
    averageCompletionTokens: number;
    averageCost: number;
}

export interface TokenLimits {
    maxTokensPerCall?: number;
    maxTotalTokens?: number;
    maxCostUSD?: number;
}

import { getProviderPricing } from "./config/providerRegistry.js";

/** Default pricing used when no provider is specified. */
const DEFAULT_PRICING: TokenPricing = {
    inputPerMillion: 0.28,
    inputCacheHitPerMillion: 0.028,
    outputPerMillion: 0.42,
};

/**
 * Get pricing for a given provider name.
 * Delegates to the provider registry.
 */
export function getPricing(provider: string): TokenPricing {
    return getProviderPricing(provider);
}

export class TokenTracker {
    private entries: TokenUsageEntry[] = [];
    private pricing: TokenPricing;
    private limits: TokenLimits;
    private _onLimitExceeded?: (type: string, current: number, limit: number) => void;

    constructor(pricing?: Partial<TokenPricing>, limits?: TokenLimits) {
        this.pricing = { ...DEFAULT_PRICING, ...pricing };
        this.limits = limits ?? {};
    }

    /**
     * Register a callback when a limit is exceeded.
     */
    onLimitExceeded(callback: (type: string, current: number, limit: number) => void): void {
        this._onLimitExceeded = callback;
    }

    /**
     * Record token usage from an API response.
     * Returns the computed cost for this call.
     */
    record(usage: Record<string, unknown>, model: string, label?: string): number {
        const promptTokens = (usage.prompt_tokens as number) ?? 0;
        const completionTokens = (usage.completion_tokens as number) ?? 0;
        const totalTokens = (usage.total_tokens as number) ?? (promptTokens + completionTokens);

        // DeepSeek returns cached tokens in prompt_cache_hit_tokens or prompt_tokens_details.cached_tokens
        const details = usage.prompt_tokens_details as { cached_tokens?: number } | undefined;
        const cachedTokens = (usage.prompt_cache_hit_tokens as number)
            ?? details?.cached_tokens
            ?? 0;

        const uncachedInputTokens = promptTokens - cachedTokens;
        const cost =
            (uncachedInputTokens / 1_000_000) * this.pricing.inputPerMillion +
            (cachedTokens / 1_000_000) * this.pricing.inputCacheHitPerMillion +
            (completionTokens / 1_000_000) * this.pricing.outputPerMillion;

        const entry: TokenUsageEntry = {
            timestamp: Date.now(),
            model,
            promptTokens,
            completionTokens,
            totalTokens,
            cachedTokens,
            cost,
            label,
        };

        this.entries.push(entry);

        // Check limits
        this.checkLimits(entry);

        return cost;
    }

    /**
     * Record embedding usage (input tokens only, no completion/cache).
     * Returns the computed cost for this call.
     */
    recordEmbedding(inputTokens: number, model: string, pricingPerMillion: number, label?: string): number {
        const cost = (inputTokens / 1_000_000) * pricingPerMillion;
        const entry: TokenUsageEntry = {
            timestamp: Date.now(),
            model,
            promptTokens: inputTokens,
            completionTokens: 0,
            totalTokens: inputTokens,
            cachedTokens: 0,
            cost,
            label,
        };
        this.entries.push(entry);
        this.checkLimits(entry);
        return cost;
    }

    /**
     * Check if a call would exceed per-call token limits. Throws if exceeded.
     */
    checkCallLimit(estimatedTokens: number): void {
        if (this.limits.maxTokensPerCall && estimatedTokens > this.limits.maxTokensPerCall) {
            const msg = `Token limit per call exceeded: ${estimatedTokens} > ${this.limits.maxTokensPerCall}`;
            this._onLimitExceeded?.("maxTokensPerCall", estimatedTokens, this.limits.maxTokensPerCall);
            throw new TokenLimitError(msg, "maxTokensPerCall", estimatedTokens, this.limits.maxTokensPerCall);
        }
    }

    private checkLimits(entry: TokenUsageEntry): void {
        const summary = this.getSummary();

        if (this.limits.maxTotalTokens && summary.totalTokens > this.limits.maxTotalTokens) {
            this._onLimitExceeded?.("maxTotalTokens", summary.totalTokens, this.limits.maxTotalTokens);
        }

        if (this.limits.maxCostUSD && summary.totalCost > this.limits.maxCostUSD) {
            this._onLimitExceeded?.("maxCostUSD", summary.totalCost, this.limits.maxCostUSD);
        }
    }

    /**
     * Get cumulative usage summary.
     */
    getSummary(): TokenUsageSummary {
        const totalCalls = this.entries.length;
        if (totalCalls === 0) {
            return {
                totalCalls: 0,
                totalPromptTokens: 0,
                totalCompletionTokens: 0,
                totalTokens: 0,
                totalCachedTokens: 0,
                totalCost: 0,
                averagePromptTokens: 0,
                averageCompletionTokens: 0,
                averageCost: 0,
            };
        }

        const totalPromptTokens = this.entries.reduce((s, e) => s + e.promptTokens, 0);
        const totalCompletionTokens = this.entries.reduce((s, e) => s + e.completionTokens, 0);
        const totalTokens = this.entries.reduce((s, e) => s + e.totalTokens, 0);
        const totalCachedTokens = this.entries.reduce((s, e) => s + e.cachedTokens, 0);
        const totalCost = this.entries.reduce((s, e) => s + e.cost, 0);

        return {
            totalCalls,
            totalPromptTokens,
            totalCompletionTokens,
            totalTokens,
            totalCachedTokens,
            totalCost,
            averagePromptTokens: Math.round(totalPromptTokens / totalCalls),
            averageCompletionTokens: Math.round(totalCompletionTokens / totalCalls),
            averageCost: totalCost / totalCalls,
        };
    }

    /**
     * Get all recorded entries.
     */
    getEntries(): readonly TokenUsageEntry[] {
        return this.entries;
    }

    /**
     * Get the last recorded entry.
     */
    getLastEntry(): TokenUsageEntry | undefined {
        return this.entries[this.entries.length - 1];
    }

    /**
     * Format summary as a human-readable string.
     */
    formatSummary(): string {
        const s = this.getSummary();
        const lines = [
            `  Calls: ${s.totalCalls}`,
            `  Tokens: ${s.totalPromptTokens} in + ${s.totalCompletionTokens} out = ${s.totalTokens} total`,
        ];
        if (s.totalCachedTokens > 0) {
            lines.push(`  Cached: ${s.totalCachedTokens} tokens (${((s.totalCachedTokens / s.totalPromptTokens) * 100).toFixed(1)}% of input)`);
        }
        lines.push(`  Cost: $${s.totalCost.toFixed(6)} (avg $${s.averageCost.toFixed(6)}/call)`);

        if (this.limits.maxTotalTokens) {
            const pct = ((s.totalTokens / this.limits.maxTotalTokens) * 100).toFixed(1);
            lines.push(`  Token budget: ${s.totalTokens}/${this.limits.maxTotalTokens} (${pct}%)`);
        }
        if (this.limits.maxCostUSD) {
            const pct = ((s.totalCost / this.limits.maxCostUSD) * 100).toFixed(1);
            lines.push(`  Cost budget: $${s.totalCost.toFixed(6)}/$${this.limits.maxCostUSD} (${pct}%)`);
        }

        return lines.join("\n");
    }

    /**
     * Format a single entry as a compact line.
     */
    static formatEntry(entry: TokenUsageEntry): string {
        const label = entry.label ? ` [${entry.label}]` : "";
        const cached = entry.cachedTokens > 0 ? ` (${entry.cachedTokens} cached)` : "";
        return `${entry.promptTokens} in${cached} + ${entry.completionTokens} out = ${entry.totalTokens} tok | $${entry.cost.toFixed(6)}${label}`;
    }

    /**
     * Reset all tracked data.
     */
    reset(): void {
        this.entries = [];
    }

    /**
     * Update limits at runtime.
     */
    setLimits(limits: Partial<TokenLimits>): void {
        this.limits = { ...this.limits, ...limits };
    }

    /**
     * Get current limits.
     */
    getLimits(): TokenLimits {
        return { ...this.limits };
    }
}

export class TokenLimitError extends Error {
    constructor(
        message: string,
        public readonly limitType: string,
        public readonly current: number,
        public readonly limit: number,
    ) {
        super(message);
        this.name = "TokenLimitError";
    }
}

/**
 * Global singleton tracker instance.
 */
let globalTracker: TokenTracker | null = null;

export function getTokenTracker(): TokenTracker {
    if (!globalTracker) {
        globalTracker = new TokenTracker();
    }
    return globalTracker;
}

export function initTokenTracker(pricing?: Partial<TokenPricing>, limits?: TokenLimits): TokenTracker {
    globalTracker = new TokenTracker(pricing, limits);
    return globalTracker;
}
