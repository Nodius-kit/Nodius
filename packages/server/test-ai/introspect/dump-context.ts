/**
 * Introspection tool: dump the GraphRAG context for a given query.
 * Shows exactly what the AI "sees" when processing a user question.
 *
 * Usage: npx tsx packages/server/test-ai/introspect/dump-context.ts "your query here"
 */

import { GraphRAGRetriever } from "../../src/ai/graphRAGRetriever.js";
import { MockGraphDataSource, MOCK_GRAPH_KEY } from "../mock-data.js";

async function main() {
    const query = process.argv[2];
    if (!query) {
        console.error("Usage: npx tsx dump-context.ts \"<query>\"");
        process.exit(1);
    }

    console.log("╔═══════════════════════════════════════════════════╗");
    console.log("║          GraphRAG Context Dump                    ║");
    console.log("╚═══════════════════════════════════════════════════╝\n");
    console.log(`Query: "${query}"\n`);

    const ds = new MockGraphDataSource();
    const retriever = new GraphRAGRetriever(ds);

    const context = await retriever.retrieve(MOCK_GRAPH_KEY, query);

    // Graph metadata
    console.log("═══ Graph Metadata ═══");
    console.log(JSON.stringify(context.graph, null, 2));

    // Relevant nodes
    console.log(`\n═══ Relevant Nodes (${context.relevantNodes.length}) ═══`);
    for (const node of context.relevantNodes) {
        console.log(`\n  [${node._key}] type="${node.type}"${node.typeName ? ` (${node.typeName})` : ""}`);
        console.log(`    Sheet: ${node.sheetName} (${node.sheet})`);
        if (node.process) {
            console.log(`    Process: ${node.process.slice(0, 150)}${node.process.length > 150 ? "..." : ""}`);
        }
        if (node.dataSummary) {
            console.log(`    Data: ${node.dataSummary}`);
        }
        if (node.handles.length > 0) {
            for (const h of node.handles) {
                const pts = h.points.map(p => `${p.id}:${p.type}(${p.accept})`).join(", ");
                console.log(`    Handle ${h.side}: [${pts}]`);
            }
        }
    }

    // Relevant edges
    console.log(`\n═══ Relevant Edges (${context.relevantEdges.length}) ═══`);
    for (const edge of context.relevantEdges) {
        const label = edge.label ? ` [${edge.label}]` : "";
        console.log(`  ${edge.source}:${edge.sourceHandle} → ${edge.target}:${edge.targetHandle}${label}`);
    }

    // NodeTypeConfigs
    console.log(`\n═══ NodeTypeConfigs (${context.nodeTypeConfigs.length}) ═══`);
    for (const config of context.nodeTypeConfigs) {
        console.log(`  ${config._key} — "${config.displayName}" (${config.category})`);
        console.log(`    ${config.description}`);
        if (config.handlesSummary) {
            console.log(`    Handles: ${config.handlesSummary}`);
        }
    }

    // Token estimate
    const contextJson = JSON.stringify(context);
    const estimatedTokens = Math.ceil(contextJson.length / 4);
    console.log(`\n═══ Stats ═══`);
    console.log(`  Context JSON size: ${contextJson.length} chars`);
    console.log(`  Estimated tokens: ~${estimatedTokens}`);
    console.log(`  Nodes: ${context.relevantNodes.length}`);
    console.log(`  Edges: ${context.relevantEdges.length}`);
    console.log(`  Configs: ${context.nodeTypeConfigs.length}`);
}

main().catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
