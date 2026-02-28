/**
 * Introspection tool: dump the full system prompt and RAG context
 * as it would be sent to the LLM for a given query.
 *
 * Usage: npx tsx packages/server/test-ai/introspect/dump-prompt.ts "your query here"
 */

import { GraphRAGRetriever } from "../../src/ai/graphRAGRetriever.js";
import { buildSystemPrompt, buildContextSummary } from "../../src/ai/prompts/systemPrompt.js";
import { MockGraphDataSource, MOCK_GRAPH_KEY } from "../mock-data.js";

async function main() {
    const query = process.argv[2];
    if (!query) {
        console.error("Usage: npx tsx dump-prompt.ts \"<query>\"");
        process.exit(1);
    }

    console.log("╔═══════════════════════════════════════════════════╗");
    console.log("║          System Prompt & RAG Context Dump         ║");
    console.log("╚═══════════════════════════════════════════════════╝\n");
    console.log(`Query: "${query}"\n`);

    const ds = new MockGraphDataSource();
    const retriever = new GraphRAGRetriever(ds);
    const context = await retriever.retrieve(MOCK_GRAPH_KEY, query);

    // System prompt
    const systemPrompt = buildSystemPrompt(context, "editor");
    console.log("═══ System Prompt ═══");
    console.log(systemPrompt);

    // RAG context summary
    const contextSummary = buildContextSummary(context);
    console.log("\n═══ RAG Context Summary ═══");
    if (contextSummary) {
        console.log(`[Contexte RAG pour cette question]\n${contextSummary}`);
    } else {
        console.log("(empty — no relevant nodes/edges found)");
    }

    // User message
    console.log("\n═══ User Message ═══");
    console.log(query);

    // Token estimates
    const systemTokens = Math.ceil(systemPrompt.length / 4);
    const contextTokens = Math.ceil(contextSummary.length / 4);
    const queryTokens = Math.ceil(query.length / 4);
    const totalTokens = systemTokens + contextTokens + queryTokens;

    console.log("\n═══ Token Estimates (chars/4) ═══");
    console.log(`  System prompt: ~${systemTokens} tokens (${systemPrompt.length} chars)`);
    console.log(`  RAG context:   ~${contextTokens} tokens (${contextSummary.length} chars)`);
    console.log(`  User query:    ~${queryTokens} tokens (${query.length} chars)`);
    console.log(`  Total input:   ~${totalTokens} tokens`);
}

main().catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
