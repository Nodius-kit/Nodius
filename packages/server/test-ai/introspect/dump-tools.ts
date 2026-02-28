/**
 * Introspection tool: dump all tool definitions and execute examples.
 * Shows exactly what tool schemas the LLM receives.
 *
 * Usage: npx tsx packages/server/test-ai/introspect/dump-tools.ts
 */

import { getReadToolDefinitions, createReadToolExecutor } from "../../src/ai/tools/readTools.js";
import { MockGraphDataSource, MOCK_GRAPH_KEY } from "../mock-data.js";

const EXAMPLES: Record<string, Record<string, unknown>> = {
    read_graph_overview: { graphKey: MOCK_GRAPH_KEY },
    search_nodes: { query: "fetch api" },
    explore_neighborhood: { nodeKey: "fetch-api", maxDepth: 1, direction: "any" },
    read_node_detail: { nodeKey: "fetch-api" },
    read_node_config: { typeKey: "api-call" },
    list_available_node_types: {},
    list_node_edges: { nodeKey: "fetch-api", direction: "any" },
};

async function main() {
    console.log("╔═══════════════════════════════════════════════════╗");
    console.log("║          Tool Definitions & Examples              ║");
    console.log("╚═══════════════════════════════════════════════════╝\n");

    const tools = getReadToolDefinitions();
    const ds = new MockGraphDataSource();
    const exec = createReadToolExecutor(ds, MOCK_GRAPH_KEY);

    for (const tool of tools) {
        const name = tool.function.name;
        console.log(`\n${"═".repeat(60)}`);
        console.log(`Tool: ${name}`);
        console.log(`Description: ${tool.function.description}`);
        console.log(`\nSchema:`);
        console.log(JSON.stringify(tool.function.parameters, null, 2));

        const exampleArgs = EXAMPLES[name];
        if (exampleArgs) {
            console.log(`\nExample call: ${name}(${JSON.stringify(exampleArgs)})`);
            try {
                const result = await exec(name, exampleArgs);
                const parsed = JSON.parse(result);
                console.log(`\nResult:`);
                console.log(JSON.stringify(parsed, null, 2));
            } catch (err) {
                console.error(`\nError: ${(err as Error).message}`);
            }
        }
    }

    console.log(`\n${"═".repeat(60)}`);
    console.log(`\nTotal tools: ${tools.length}`);
}

main().catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
