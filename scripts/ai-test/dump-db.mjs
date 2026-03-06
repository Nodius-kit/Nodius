#!/usr/bin/env node
/**
 * Dump all relevant ArangoDB data for AI module analysis.
 * Usage: node scripts/ai-test/dump-db.mjs [graphKey]
 * If no graphKey, dumps a summary of all graphs.
 */

const ARANGO_URL = process.env.ARANGO_URL || "http://127.0.0.1:8529";
const ARANGO_DB = process.env.ARANGO_DB || "nodius";
const ARANGO_USER = process.env.ARANGO_USER || "root";
const ARANGO_PASS = process.env.ARANGO_PASS || "azerty";

async function query(aql) {
    const res = await fetch(`${ARANGO_URL}/_db/${ARANGO_DB}/_api/cursor`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Basic " + btoa(`${ARANGO_USER}:${ARANGO_PASS}`),
        },
        body: JSON.stringify({ query: aql }),
    });
    const data = await res.json();
    if (data.error) throw new Error(`AQL Error: ${data.errorMessage}`);
    return data.result;
}

async function dumpGraphSummary() {
    console.log("=== ALL GRAPHS ===\n");
    const graphs = await query(`
        FOR g IN nodius_graphs
        RETURN { _key: g._key, name: g.name, description: g.description, workspace: g.workspace, sheetsList: g.sheetsList }
    `);
    for (const g of graphs) {
        const nodeCount = (await query(`FOR n IN nodius_nodes FILTER n.graphKey == "${g._key}" COLLECT WITH COUNT INTO c RETURN c`))[0];
        const edgeCount = (await query(`FOR e IN nodius_edges FILTER e.graphKey == "${g._key}" COLLECT WITH COUNT INTO c RETURN c`))[0];
        console.log(`Graph: ${g.name} (${g._key.slice(0, 12)}...)`);
        console.log(`  Workspace: ${g.workspace}`);
        console.log(`  Sheets: ${JSON.stringify(g.sheetsList)}`);
        console.log(`  Nodes: ${nodeCount}, Edges: ${edgeCount}`);
        console.log(`  Description: ${g.description || "(none)"}`);
        console.log();
    }
    return graphs;
}

async function dumpGraph(graphKey) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`DETAILED DUMP FOR GRAPH: ${graphKey}`);
    console.log(`${"=".repeat(60)}\n`);

    // Graph metadata
    const graphs = await query(`FOR g IN nodius_graphs FILTER g._key == "${graphKey}" RETURN g`);
    if (graphs.length === 0) {
        console.log("Graph not found!");
        return;
    }
    const graph = graphs[0];
    console.log("--- GRAPH METADATA ---");
    console.log(JSON.stringify({ name: graph.name, description: graph.description, sheets: graph.sheetsList, workspace: graph.workspace }, null, 2));

    // Nodes
    console.log("\n--- NODES ---");
    const nodes = await query(`
        FOR n IN nodius_nodes FILTER n.graphKey == "${graphKey}"
        RETURN { localKey: SUBSTITUTE(n._key, CONCAT(n.graphKey, "-"), ""), type: n.type, sheet: n.sheet, posX: n.posX, posY: n.posY, data: n.data, handles: n.handles, size: n.size }
    `);
    for (const n of nodes) {
        console.log(`\n  Node: ${n.localKey} (type: ${n.type})`);
        console.log(`    Sheet: ${n.sheet}, Pos: (${n.posX}, ${n.posY}), Size: ${JSON.stringify(n.size)}`);
        console.log(`    Data: ${JSON.stringify(n.data, null, 2)?.slice(0, 500)}`);
        if (n.handles) console.log(`    Handles: ${JSON.stringify(n.handles).slice(0, 200)}`);
    }

    // Edges
    console.log("\n\n--- EDGES ---");
    const edges = await query(`
        FOR e IN nodius_edges FILTER e.graphKey == "${graphKey}"
        RETURN { source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, sheet: e.sheet, label: e.label }
    `);
    for (const e of edges) {
        console.log(`  ${e.source}:${e.sourceHandle} --> ${e.target}:${e.targetHandle} [sheet:${e.sheet}] ${e.label ? `label:"${e.label}"` : ""}`);
    }

    // Node configs referenced by this graph's node types
    const types = [...new Set(nodes.map(n => n.type))];
    console.log("\n--- NODE CONFIGS ---");
    const configs = await query(`FOR c IN nodius_node_config RETURN c`);
    for (const c of configs) {
        if (types.includes(c._key)) {
            console.log(`\n  Config: ${c._key}`);
            console.log(`    DisplayName: ${c.displayName}`);
            console.log(`    Description: ${c.description || "(none)"}`);
            console.log(`    Category: ${c.category}`);
            if (c.node?.process) console.log(`    Process (JS): ${c.node.process.slice(0, 300)}...`);
            if (c.node?.handles) console.log(`    Handles: ${JSON.stringify(c.node.handles).slice(0, 300)}`);
        }
    }

    // AI threads for this graph
    console.log("\n--- AI THREADS ---");
    try {
        const threads = await query(`
            FOR t IN nodius_ai_threads FILTER t.graphKey == "${graphKey}"
            RETURN { _key: t._key, title: t.title, messageCount: t.messageCount, toolCallCount: t.toolCallCount, totalTokens: t.totalTokens, provider: t.provider, model: t.model }
        `);
        if (threads.length === 0) {
            console.log("  (no AI threads for this graph)");
        } else {
            for (const t of threads) {
                console.log(`  Thread: ${t._key} - "${t.title}"`);
                console.log(`    Messages: ${t.messageCount}, Tools: ${t.toolCallCount}, Tokens: ${t.totalTokens}`);
                console.log(`    Provider: ${t.provider}, Model: ${t.model}`);
            }
        }
    } catch {
        console.log("  (nodius_ai_threads collection not found)");
    }

    return { graph, nodes, edges, configs: configs.filter(c => types.includes(c._key)) };
}

async function main() {
    const graphKey = process.argv[2];

    const graphs = await dumpGraphSummary();

    if (graphKey) {
        await dumpGraph(graphKey);
    } else {
        // Dump all 5 main graphs
        for (const g of graphs) {
            await dumpGraph(g._key);
        }
    }
}

main().catch(console.error);
