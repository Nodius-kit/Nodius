/**
 * Test LLM provider with real API calls.
 * Auto-detects available provider from env vars.
 *
 * Usage: npx tsx packages/server/test-ai/test-provider.ts
 */

import { createLLMProvider, detectLLMProvider, type LLMProviderConfig } from "../src/ai/llmProviderFactory.js";
import { initTokenTracker } from "../src/ai/tokenTracker.js";
import { getReadToolDefinitions } from "../src/ai/tools/readTools.js";

async function main() {
    console.log("╔═══════════════════════════════════════════════════╗");
    console.log("║          LLM Provider Test                       ║");
    console.log("╚═══════════════════════════════════════════════════╝\n");

    // Detect available providers
    const available: LLMProviderConfig[] = [];

    if (process.env.DEEPSEEK_API_KEY) {
        available.push({ provider: "deepseek", apiKey: process.env.DEEPSEEK_API_KEY });
    }
    if (process.env.OPENAI_API_KEY) {
        available.push({ provider: "openai", apiKey: process.env.OPENAI_API_KEY });
    }

    if (available.length === 0) {
        console.error("No API keys found. Set DEEPSEEK_API_KEY or OPENAI_API_KEY.");
        process.exit(1);
    }

    console.log(`Found ${available.length} provider(s): ${available.map(a => a.provider).join(", ")}\n`);

    const results: Array<{ provider: string; chatOk: boolean; toolsOk: boolean; response?: string }> = [];

    for (const config of available) {
        console.log(`\n▶ Testing: ${config.provider}`);
        console.log("─".repeat(50));

        const tracker = initTokenTracker();
        const provider = createLLMProvider(config);

        // Test 1: Simple chat completion
        console.log("\n  [1] Simple chat completion...");
        let chatOk = false;
        let chatResponse = "";
        try {
            const response = await provider.chatCompletion([
                { role: "user", content: "Dis bonjour en une phrase courte." },
            ], undefined, "test-chat");

            chatResponse = response.message.content ?? "(empty)";
            console.log(`  Response: ${chatResponse}`);
            if (response.usage) {
                console.log(`  Tokens: ${response.usage.promptTokens} in + ${response.usage.completionTokens} out = ${response.usage.totalTokens} total`);
            }
            chatOk = chatResponse.length > 0;
            console.log(`  ✓ Chat completion OK`);
        } catch (err) {
            console.error(`  ✗ Chat completion failed:`, (err as Error).message);
        }

        // Test 2: Chat completion with tools
        console.log("\n  [2] Chat completion with tools...");
        let toolsOk = false;
        try {
            const tools = getReadToolDefinitions();
            const response = await provider.chatCompletionWithTools([
                { role: "system", content: "Tu es un assistant pour un graph editor. Utilise les outils pour repondre." },
                { role: "user", content: "Quels types de nodes sont disponibles?" },
            ], tools, undefined, "test-tools");

            const hasToolCalls = (response.message.tool_calls?.length ?? 0) > 0;
            const hasContent = (response.message.content?.length ?? 0) > 0;

            if (hasToolCalls) {
                console.log(`  Tool calls: ${response.message.tool_calls!.map(t => t.function.name).join(", ")}`);
            }
            if (hasContent) {
                console.log(`  Response: ${response.message.content!.slice(0, 200)}`);
            }
            if (response.usage) {
                console.log(`  Tokens: ${response.usage.promptTokens} in + ${response.usage.completionTokens} out`);
            }
            toolsOk = hasToolCalls || hasContent;
            console.log(`  ✓ Tool calling OK`);
        } catch (err) {
            console.error(`  ✗ Tool calling failed:`, (err as Error).message);
        }

        // Summary
        console.log(`\n  Token usage summary:`);
        console.log(tracker.formatSummary());

        results.push({ provider: config.provider, chatOk, toolsOk, response: chatResponse });
    }

    // Compare if multiple providers
    if (results.length > 1) {
        console.log("\n╔═══════════════════════════════════════════════════╗");
        console.log("║          Provider Comparison                     ║");
        console.log("╚═══════════════════════════════════════════════════╝\n");

        for (const r of results) {
            const status = r.chatOk && r.toolsOk ? "✓ PASS" : "✗ FAIL";
            console.log(`  ${r.provider}: ${status} — "${r.response?.slice(0, 80)}"`);
        }
    }

    const allPassed = results.every(r => r.chatOk && r.toolsOk);
    console.log(`\n${allPassed ? "✓" : "✗"} Provider test ${allPassed ? "PASSED" : "FAILED"}`);
    if (!allPassed) process.exit(1);
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
