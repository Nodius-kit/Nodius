import { describe, it, expect, beforeEach, vi } from "vitest";
import { TokenTracker, TokenLimitError, getTokenTracker, initTokenTracker } from "./tokenTracker.js";

describe("TokenTracker", () => {
    let tracker: TokenTracker;

    beforeEach(() => {
        tracker = new TokenTracker();
    });

    describe("record()", () => {
        it("computes cost correctly for uncached input + output", () => {
            const cost = tracker.record(
                { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
                "deepseek-chat",
                "test",
            );
            // uncached: 1000 / 1M * 0.28 = 0.00028
            // output:   500 / 1M * 0.42 = 0.00021
            // total: 0.00049
            expect(cost).toBeCloseTo(0.00049, 6);
        });

        it("computes cost correctly with cached tokens (prompt_cache_hit_tokens)", () => {
            const cost = tracker.record(
                { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500, prompt_cache_hit_tokens: 600 },
                "deepseek-chat",
            );
            // uncached: 400 / 1M * 0.28 = 0.000112
            // cached:   600 / 1M * 0.028 = 0.0000168
            // output:   500 / 1M * 0.42 = 0.00021
            // total: 0.0003388
            expect(cost).toBeCloseTo(0.0003388, 6);
        });

        it("computes cost correctly with cached tokens (prompt_tokens_details)", () => {
            const cost = tracker.record(
                { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500, prompt_tokens_details: { cached_tokens: 400 } },
                "deepseek-chat",
            );
            // uncached: 600 / 1M * 0.28 = 0.000168
            // cached:   400 / 1M * 0.028 = 0.0000112
            // output:   500 / 1M * 0.42 = 0.00021
            // total: 0.0003892
            expect(cost).toBeCloseTo(0.0003892, 6);
        });
    });

    describe("getSummary()", () => {
        it("returns zeros when empty", () => {
            const summary = tracker.getSummary();
            expect(summary.totalCalls).toBe(0);
            expect(summary.totalPromptTokens).toBe(0);
            expect(summary.totalCompletionTokens).toBe(0);
            expect(summary.totalTokens).toBe(0);
            expect(summary.totalCachedTokens).toBe(0);
            expect(summary.totalCost).toBe(0);
            expect(summary.averagePromptTokens).toBe(0);
            expect(summary.averageCompletionTokens).toBe(0);
            expect(summary.averageCost).toBe(0);
        });

        it("cumulates N entries correctly", () => {
            tracker.record({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }, "m1");
            tracker.record({ prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 }, "m1");

            const summary = tracker.getSummary();
            expect(summary.totalCalls).toBe(2);
            expect(summary.totalPromptTokens).toBe(300);
            expect(summary.totalCompletionTokens).toBe(150);
            expect(summary.totalTokens).toBe(450);
            expect(summary.averagePromptTokens).toBe(150);
            expect(summary.averageCompletionTokens).toBe(75);
        });
    });

    describe("recordEmbedding()", () => {
        it("computes cost correctly (input-only)", () => {
            const cost = tracker.recordEmbedding(1000, "text-embedding-3-small", 0.02, "embed");
            // 1000 / 1M * 0.02 = 0.00002
            expect(cost).toBeCloseTo(0.00002, 8);
        });

        it("creates entry with completionTokens=0 and cachedTokens=0", () => {
            tracker.recordEmbedding(500, "text-embedding-3-small", 0.02);
            const entry = tracker.getLastEntry()!;
            expect(entry.completionTokens).toBe(0);
            expect(entry.cachedTokens).toBe(0);
            expect(entry.promptTokens).toBe(500);
            expect(entry.totalTokens).toBe(500);
        });

        it("counts in getSummary() global totals", () => {
            tracker.record({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }, "m1");
            tracker.recordEmbedding(200, "text-embedding-3-small", 0.02);
            const summary = tracker.getSummary();
            expect(summary.totalCalls).toBe(2);
            expect(summary.totalPromptTokens).toBe(300);
            expect(summary.totalCompletionTokens).toBe(50);
            expect(summary.totalTokens).toBe(350);
        });
    });

    describe("checkCallLimit()", () => {
        it("throws TokenLimitError when exceeded", () => {
            const limited = new TokenTracker(undefined, { maxTokensPerCall: 1000 });
            expect(() => limited.checkCallLimit(1500)).toThrow(TokenLimitError);
        });

        it("does not throw when below limit", () => {
            const limited = new TokenTracker(undefined, { maxTokensPerCall: 1000 });
            expect(() => limited.checkCallLimit(500)).not.toThrow();
        });

        it("does not throw when no limit is set", () => {
            expect(() => tracker.checkCallLimit(999999)).not.toThrow();
        });
    });

    describe("onLimitExceeded callback", () => {
        it("is called when maxTotalTokens is exceeded", () => {
            const callback = vi.fn();
            const limited = new TokenTracker(undefined, { maxTotalTokens: 100 });
            limited.onLimitExceeded(callback);

            limited.record({ prompt_tokens: 80, completion_tokens: 40, total_tokens: 120 }, "m1");
            expect(callback).toHaveBeenCalledWith("maxTotalTokens", 120, 100);
        });

        it("is called when maxCostUSD is exceeded", () => {
            const callback = vi.fn();
            const limited = new TokenTracker(undefined, { maxCostUSD: 0.0001 });
            limited.onLimitExceeded(callback);

            limited.record({ prompt_tokens: 10000, completion_tokens: 5000, total_tokens: 15000 }, "m1");
            expect(callback).toHaveBeenCalledWith("maxCostUSD", expect.any(Number), 0.0001);
        });
    });

    describe("formatSummary()", () => {
        it("contains the correct values", () => {
            tracker.record({ prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 }, "deepseek-chat");
            const formatted = tracker.formatSummary();
            expect(formatted).toContain("Calls: 1");
            expect(formatted).toContain("1000 in");
            expect(formatted).toContain("500 out");
            expect(formatted).toContain("1500 total");
            expect(formatted).toContain("Cost:");
        });
    });

    describe("TokenTracker.formatEntry()", () => {
        it("formats a single entry correctly", () => {
            tracker.record({ prompt_tokens: 500, completion_tokens: 200, total_tokens: 700 }, "m1", "my-label");
            const entry = tracker.getLastEntry()!;
            const formatted = TokenTracker.formatEntry(entry);
            expect(formatted).toContain("500 in");
            expect(formatted).toContain("200 out");
            expect(formatted).toContain("700 tok");
            expect(formatted).toContain("[my-label]");
        });

        it("includes cached info when present", () => {
            tracker.record({ prompt_tokens: 500, completion_tokens: 200, total_tokens: 700, prompt_cache_hit_tokens: 300 }, "m1");
            const entry = tracker.getLastEntry()!;
            const formatted = TokenTracker.formatEntry(entry);
            expect(formatted).toContain("300 cached");
        });
    });

    describe("reset()", () => {
        it("clears all entries", () => {
            tracker.record({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }, "m1");
            tracker.reset();
            expect(tracker.getEntries()).toHaveLength(0);
            expect(tracker.getSummary().totalCalls).toBe(0);
        });
    });

    describe("setLimits()", () => {
        it("updates the limits", () => {
            tracker.setLimits({ maxTokensPerCall: 5000 });
            expect(tracker.getLimits().maxTokensPerCall).toBe(5000);
        });

        it("merges with existing limits", () => {
            tracker.setLimits({ maxTokensPerCall: 5000 });
            tracker.setLimits({ maxCostUSD: 1.0 });
            const limits = tracker.getLimits();
            expect(limits.maxTokensPerCall).toBe(5000);
            expect(limits.maxCostUSD).toBe(1.0);
        });
    });

    describe("getLastEntry()", () => {
        it("returns undefined when empty", () => {
            expect(tracker.getLastEntry()).toBeUndefined();
        });

        it("returns the last recorded entry", () => {
            tracker.record({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }, "m1", "first");
            tracker.record({ prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 }, "m1", "second");
            expect(tracker.getLastEntry()!.label).toBe("second");
        });
    });

    describe("custom pricing override", () => {
        it("uses custom pricing for cost calculation", () => {
            const custom = new TokenTracker({ inputPerMillion: 1.0, inputCacheHitPerMillion: 0.1, outputPerMillion: 2.0 });
            const cost = custom.record(
                { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
                "custom-model",
            );
            // uncached: 1000 / 1M * 1.0 = 0.001
            // output:   500 / 1M * 2.0 = 0.001
            // total: 0.002
            expect(cost).toBeCloseTo(0.002, 6);
        });
    });

    describe("global singleton", () => {
        it("getTokenTracker() returns the same instance", () => {
            const a = getTokenTracker();
            const b = getTokenTracker();
            expect(a).toBe(b);
        });

        it("initTokenTracker() replaces the global instance", () => {
            const old = getTokenTracker();
            const fresh = initTokenTracker({ inputPerMillion: 1.0 });
            expect(fresh).not.toBe(old);
            expect(getTokenTracker()).toBe(fresh);
        });
    });
});
