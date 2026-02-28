/**
 * Test 2: Tool calling with DeepSeek
 * Verifies that DeepSeek can correctly call tools and that we can execute them.
 *
 * Usage: npx tsx packages/server/test-ai/test-tools.ts
 */

import { initDeepSeekClient, chatCompletionWithTools } from "../src/ai/deepseekClient.js";
import { getReadToolDefinitions, createReadToolExecutor } from "../src/ai/tools/readTools.js";
import { MockGraphDataSource, MOCK_GRAPH_KEY } from "./mock-data.js";
import { getTokenTracker, TokenTracker } from "../src/ai/tokenTracker.js";
import type OpenAI from "openai";

async function main() {
    console.log("═══════════════════════════════════════════════════");
    console.log("  TEST 2: Tool Calling with DeepSeek");
    console.log("═══════════════════════════════════════════════════\n");

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        console.error("FAIL: DEEPSEEK_API_KEY not set.");
        process.exit(1);
    }

    initDeepSeekClient({ apiKey });
    const tracker = getTokenTracker();

    const dataSource = new MockGraphDataSource();
    const tools = getReadToolDefinitions();
    const executeTool = createReadToolExecutor(dataSource, MOCK_GRAPH_KEY);

    console.log(`  Available tools: ${tools.map(t => t.function.name).join(", ")}\n`);

    // Test: Ask a question that should trigger tool calls
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: `Tu es un assistant specialise dans l'analyse de workflows Nodius.
Le graph actif est "${MOCK_GRAPH_KEY}". Utilise les outils fournis pour repondre aux questions.`,
        },
        {
            role: "user",
            content: "Quels sont les differents types de nodes dans ce graph ? Donne-moi un apercu.",
        },
    ];

    console.log("  Sending question: 'Quels sont les differents types de nodes dans ce graph ?'\n");

    let toolCallCount = 0;
    const maxRounds = 5;

    for (let round = 0; round < maxRounds; round++) {
        const startTime = Date.now();
        const response = await chatCompletionWithTools(messages, tools, undefined, `tool-round-${round + 1}`);
        const elapsed = Date.now() - startTime;
        const choice = response.choices[0];

        // Show per-call token usage
        const entry = tracker.getLastEntry();
        if (entry) {
            console.log(`  [Round ${round + 1}] ${TokenTracker.formatEntry(entry)} (${elapsed}ms)`);
        }

        if (!choice?.message) {
            console.error("  FAIL: No response from model.");
            process.exit(1);
        }

        messages.push(choice.message);

        if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
            // Final answer
            console.log(`\n  ── Final Answer (round ${round + 1}) ──`);
            console.log(`  ${choice.message.content}\n`);
            break;
        }

        // Execute tool calls
        for (const toolCall of choice.message.tool_calls) {
            if (toolCall.type !== "function") continue;
            toolCallCount++;
            const args = JSON.parse(toolCall.function.arguments);
            console.log(`    [Tool #${toolCallCount}] ${toolCall.function.name}(${JSON.stringify(args).slice(0, 100)})`);

            const result = await executeTool(toolCall.function.name, args);
            const preview = result.length > 150 ? result.slice(0, 150) + "..." : result;
            console.log(`      -> ${preview}`);

            messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: result,
            });
        }
        console.log();
    }

    // Cumulative summary
    console.log("  ── Cumulative Token Summary ──");
    console.log(tracker.formatSummary());

    if (toolCallCount > 0) {
        console.log(`\n  PASS: DeepSeek made ${toolCallCount} tool call(s) and produced a final answer.`);
    } else {
        console.log("\n  WARN: DeepSeek answered without calling any tools. This may be OK for simple questions.");
    }
}

main();
