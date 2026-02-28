/**
 * Integration test — full RAG + tool calling pipeline with real LLM API.
 * Tests that the AI can correctly analyze the mock NBA Stats Pipeline graph.
 *
 * Usage: npx tsx packages/server/test-ai/test-integration.ts
 */

import { AIAgent } from "../src/ai/aiAgent.js";
import { detectLLMProvider } from "../src/ai/llmProviderFactory.js";
import { initTokenTracker } from "../src/ai/tokenTracker.js";
import { MockGraphDataSource, MOCK_GRAPH_KEY } from "./mock-data.js";

interface TestCase {
    name: string;
    query: string;
    validate: (response: { message: string; toolCalls: Array<{ name: string }> }) => boolean;
}

const tests: TestCase[] = [
    {
        name: "L'IA decrit correctement le workflow",
        query: "Decris-moi le workflow NBA Stats Pipeline. Quels sont les nodes principaux?",
        validate: (r) => {
            const msg = r.message.toLowerCase();
            // Should mention key nodes
            return msg.includes("fetch") && (msg.includes("filter") || msg.includes("filtr"));
        },
    },
    {
        name: "L'IA identifie le chemin d'erreur",
        query: "Quel node gere les erreurs? D'ou vient-il dans le workflow?",
        validate: (r) => {
            const msg = r.message.toLowerCase();
            return msg.includes("error") && (msg.includes("fetch") || msg.includes("api"));
        },
    },
    {
        name: "L'IA identifie les types de nodes",
        query: "Quels sont les types de nodes disponibles dans ce graph?",
        validate: (r) => {
            const msg = r.message.toLowerCase();
            return msg.includes("starter") || msg.includes("api") || msg.includes("filter");
        },
    },
    {
        name: "L'IA utilise un outil pour une question specifique",
        query: "Donne-moi les details complets du node fetch-api",
        validate: (r) => {
            // Should have used at least one tool
            return r.toolCalls.length > 0;
        },
    },
    {
        name: "L'IA gere le node entryType",
        query: "Y a-t-il un formulaire de saisie (entryType) dans ce workflow? A quoi est-il connecte?",
        validate: (r) => {
            const msg = r.message.toLowerCase();
            return msg.includes("entry") || msg.includes("formulaire") || msg.includes("saisie");
        },
    },
];

async function main() {
    console.log("╔═══════════════════════════════════════════════════╗");
    console.log("║          Integration Tests (Real LLM API)        ║");
    console.log("╚═══════════════════════════════════════════════════╝\n");

    const provider = detectLLMProvider();
    if (!provider) {
        console.error("No API key found. Set DEEPSEEK_API_KEY or OPENAI_API_KEY.");
        process.exit(1);
    }

    console.log(`Provider: ${provider.getProviderName()} (${provider.getModel()})\n`);

    const ds = new MockGraphDataSource();
    const tracker = initTokenTracker();

    let passed = 0;
    let failed = 0;

    for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        console.log(`\n▶ Test ${i + 1}/${tests.length}: ${test.name}`);
        console.log(`  Query: "${test.query}"`);
        console.log("─".repeat(60));

        try {
            // Create fresh agent per test
            const agent = new AIAgent({
                graphKey: MOCK_GRAPH_KEY,
                dataSource: ds,
                llmProvider: provider,
            });

            const startTime = Date.now();
            const result = await agent.chat(test.query);
            const elapsed = Date.now() - startTime;

            // Display context info
            if (result.context) {
                console.log(`  Context: ${result.context.relevantNodes.length} nodes, ${result.context.relevantEdges.length} edges, ${result.context.nodeTypeConfigs.length} configs`);
            }

            // Display tool calls
            if (result.toolCalls.length > 0) {
                console.log(`  Tools used: ${result.toolCalls.map(t => t.name).join(", ")}`);
            }

            // Display response (truncated)
            const truncated = result.message.length > 300 ? result.message.slice(0, 300) + "..." : result.message;
            console.log(`  Response: ${truncated}`);
            console.log(`  Latency: ${elapsed}ms`);

            // Validate
            const ok = test.validate(result);
            if (ok) {
                passed++;
                console.log(`  ✓ PASSED`);
            } else {
                failed++;
                console.log(`  ✗ FAILED (validation did not pass)`);
            }
        } catch (err) {
            failed++;
            console.error(`  ✗ ERROR: ${(err as Error).message}`);
        }
    }

    // Final summary
    console.log("\n╔═══════════════════════════════════════════════════╗");
    console.log(`║  Results: ${passed} passed, ${failed} failed, ${tests.length} total`);
    console.log("╚═══════════════════════════════════════════════════╝");
    console.log("\nToken usage summary:");
    console.log(tracker.formatSummary());

    if (failed > 0) process.exit(1);
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
