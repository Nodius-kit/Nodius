/**
 * Test 1: DeepSeek API connection
 * Verifies that we can connect to the DeepSeek API and get a response.
 *
 * Usage: npx tsx packages/server/test-ai/test-deepseek.ts
 */

import { initDeepSeekClient, chatCompletion } from "../src/ai/deepseekClient.js";
import { getTokenTracker, TokenTracker } from "../src/ai/tokenTracker.js";

async function main() {
    console.log("═══════════════════════════════════════════════════");
    console.log("  TEST 1: DeepSeek API Connection");
    console.log("═══════════════════════════════════════════════════\n");

    // Check API key
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        console.error("FAIL: DEEPSEEK_API_KEY environment variable is not set.");
        console.error("  Set it with: export DEEPSEEK_API_KEY=your_key_here");
        process.exit(1);
    }
    console.log("  API Key: " + apiKey.slice(0, 8) + "..." + apiKey.slice(-4));

    try {
        // Initialize client
        initDeepSeekClient({ apiKey });
        console.log("  Client initialized.\n");

        // Simple chat completion
        console.log("  Sending test message: 'Dis bonjour en une phrase.'");
        const startTime = Date.now();

        const response = await chatCompletion([
            { role: "system", content: "Tu es un assistant concis. Reponds en une seule phrase." },
            { role: "user", content: "Dis bonjour en une phrase." },
        ], undefined, "test-hello");

        const elapsed = Date.now() - startTime;
        const message = response.choices[0]?.message?.content;

        console.log(`\n  Response: "${message}"`);
        console.log(`  Model: ${response.model}`);
        console.log(`  Latency: ${elapsed}ms`);

        // Token tracking output
        const tracker = getTokenTracker();
        const entry = tracker.getLastEntry();
        if (entry) {
            console.log(`\n  Token Usage: ${TokenTracker.formatEntry(entry)}`);
        }

        console.log(`\n  ── Cumulative Token Summary ──`);
        console.log(tracker.formatSummary());

        if (message && message.length > 0) {
            console.log("\n  PASS: DeepSeek API connection successful.");
        } else {
            console.log("\n  FAIL: Empty response from DeepSeek.");
            process.exit(1);
        }
    } catch (error: unknown) {
        const err = error as Error;
        console.error(`\n  FAIL: ${err.message}`);
        if (err.message.includes("401")) {
            console.error("  -> Invalid API key. Check your DEEPSEEK_API_KEY.");
        }
        process.exit(1);
    }
}

main();
