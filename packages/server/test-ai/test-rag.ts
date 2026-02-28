/**
 * Test 3: Full RAG Pipeline
 * Tests the complete flow: question -> RAG retrieval -> context -> LLM -> answer
 *
 * Usage: npx tsx packages/server/test-ai/test-rag.ts
 */

import { initDeepSeekClient } from "../src/ai/deepseekClient.js";
import { AIAgent } from "../src/ai/aiAgent.js";
import { MockGraphDataSource, MOCK_GRAPH_KEY } from "./mock-data.js";
import { getTokenTracker, TokenTracker } from "../src/ai/tokenTracker.js";

function printAgentResult(label: string, result: Awaited<ReturnType<AIAgent["chat"]>>, elapsed: number, tracker: TokenTracker) {
    console.log(`\n  RAG Context: ${result.context?.relevantNodes.length ?? 0} nodes, ${result.context?.relevantEdges.length ?? 0} edges`);
    console.log(`  Tool calls: ${result.toolCalls.length}`);
    for (const tc of result.toolCalls) {
        console.log(`    - ${tc.name}(${JSON.stringify(tc.args).slice(0, 80)})`);
    }
    console.log(`  Latency: ${elapsed}ms`);

    // Show token entries since last print
    const entries = tracker.getEntries();
    if (entries.length > 0) {
        const last = entries[entries.length - 1];
        console.log(`  Last call tokens: ${TokenTracker.formatEntry(last)}`);
    }

    console.log(`\n  Answer:\n  ${result.message.replace(/\n/g, "\n  ")}\n`);

    if (result.message.length > 20) {
        console.log(`  PASS: ${label}\n`);
    } else {
        console.log(`  FAIL: ${label} - Answer too short.\n`);
    }
}

async function main() {
    console.log("═══════════════════════════════════════════════════");
    console.log("  TEST 3: Full RAG Pipeline");
    console.log("═══════════════════════════════════════════════════\n");

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        console.error("FAIL: DEEPSEEK_API_KEY not set.");
        process.exit(1);
    }

    initDeepSeekClient({ apiKey });
    const tracker = getTokenTracker();

    const dataSource = new MockGraphDataSource();
    const agent = new AIAgent({
        graphKey: MOCK_GRAPH_KEY,
        dataSource,
        role: "editor",
        maxToolRounds: 5,
    });

    // ─── Test 3.1: Question about the graph structure ───────────────
    console.log("  ── Test 3.1: Graph structure question ──\n");
    console.log('  Question: "Decris-moi le workflow NBA Stats Pipeline. Que fait-il ?"');

    const t1 = Date.now();
    const r1 = await agent.chat("Decris-moi le workflow NBA Stats Pipeline. Que fait-il ?");
    printAgentResult("Graph structure question", r1, Date.now() - t1, tracker);

    // ─── Test 3.2: Question about a specific node ───────────────────
    agent.reset();
    console.log("  ── Test 3.2: Specific node question ──\n");
    console.log('  Question: "Que fait le node fetch-api ? Quels sont ses handles ?"');

    const t2 = Date.now();
    const r2 = await agent.chat("Que fait le node fetch-api ? Quels sont ses handles ?");
    printAgentResult("Specific node question", r2, Date.now() - t2, tracker);

    // ─── Test 3.3: Question about connections ───────────────────────
    agent.reset();
    console.log("  ── Test 3.3: Connection/flow question ──\n");
    console.log('  Question: "Quel est le chemin d\'execution depuis le starter ? Que se passe-t-il en cas d\'erreur ?"');

    const t3 = Date.now();
    const r3 = await agent.chat("Quel est le chemin d'execution depuis le starter ? Que se passe-t-il en cas d'erreur ?");
    printAgentResult("Connection/flow question", r3, Date.now() - t3, tracker);

    // ─── Final cumulative summary ───────────────────────────────────
    console.log("═══════════════════════════════════════════════════");
    console.log("  CUMULATIVE TOKEN USAGE (all 3 tests)");
    console.log("═══════════════════════════════════════════════════");
    console.log(tracker.formatSummary());
    console.log("\n  Per-call breakdown:");
    for (const entry of tracker.getEntries()) {
        console.log(`    ${TokenTracker.formatEntry(entry)}`);
    }
    console.log("\n═══════════════════════════════════════════════════");
    console.log("  All RAG pipeline tests completed.");
    console.log("═══════════════════════════════════════════════════");
}

main();
