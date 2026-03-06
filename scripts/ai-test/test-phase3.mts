/**
 * Phase 3 AI Chatbot Tests
 *
 * Tests for enhanced AI capabilities:
 * - Full node configuration (propose_configure_node_type)
 * - Node creation with edges (propose_create_node_with_edges)
 * - HtmlObject content creation/update
 * - Process code explanation
 * - Reorganize layout
 * - Batch node+edge creation
 * - Full graph creation from description
 *
 * Usage:
 *   npx tsx scripts/ai-test/test-phase3.mts [testName]
 *   npx tsx scripts/ai-test/test-phase3.mts explain-config
 *   npx tsx scripts/ai-test/test-phase3.mts create-node-with-edges
 *   npx tsx scripts/ai-test/test-phase3.mts configure-node-type
 *   npx tsx scripts/ai-test/test-phase3.mts html-content
 *   npx tsx scripts/ai-test/test-phase3.mts reorganize
 *   npx tsx scripts/ai-test/test-phase3.mts full-graph
 *   npx tsx scripts/ai-test/test-phase3.mts all
 */

import 'dotenv/config';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(import.meta.dirname, '../../packages/server/.env') });
process.env.AI_DEBUG = 'true';

import { Database, aql } from 'arangojs';
import { AIAgent } from '../../packages/server/src/ai/aiAgent.js';
import { createLLMProviderFromConfig } from '../../packages/server/src/ai/providers/providerFactory.js';
import { parseProposedAction } from '../../packages/server/src/ai/tools/writeTools.js';
import { computeAutoLayout } from '../../packages/server/src/ai/autoLayout.js';
import type { GraphDataSource, GraphRAGContext, StreamCallbacks, ProposedAction } from '../../packages/server/src/ai/types.js';
import type { Edge, Node, NodeTypeConfig } from '@nodius/utils';

// ─── ArangoDB ───────────────────────────────────────────────────────
const db = new Database({
    url: process.env.ARANGO_URL || 'http://127.0.0.1:8529',
    databaseName: process.env.ARANGO_DB || 'nodius',
    auth: { username: process.env.ARANGO_USER || 'root', password: process.env.ARANGO_PASS || 'azerty' },
});

// ─── DataSource ──────────────────────────────────────────────────────
class TestDataSource implements GraphDataSource {
    constructor(private workspace: string) {}

    async getGraph(graphKey: string): Promise<GraphRAGContext['graph'] | null> {
        const cursor = await db.query(aql`
            FOR g IN nodius_graphs FILTER g._key == ${graphKey} AND g.workspace == ${this.workspace} RETURN g
        `);
        const g = await cursor.next();
        if (!g) return null;
        return { _key: g._key, name: g.name, description: g.description, sheets: g.sheetsList ?? {}, metadata: g.metadata };
    }

    async getNodes(graphKey: string, sheetId?: string): Promise<Node<unknown>[]> {
        const cursor = sheetId
            ? await db.query(aql`FOR n IN nodius_nodes FILTER n.graphKey == ${graphKey} AND n.sheet == ${sheetId} RETURN n`)
            : await db.query(aql`FOR n IN nodius_nodes FILTER n.graphKey == ${graphKey} RETURN n`);
        return (await cursor.all()).map(n => this.toLocal(n, graphKey));
    }

    async getEdges(graphKey: string, sheetId?: string): Promise<Edge[]> {
        const cursor = sheetId
            ? await db.query(aql`FOR e IN nodius_edges FILTER e.graphKey == ${graphKey} AND e.sheet == ${sheetId} RETURN e`)
            : await db.query(aql`FOR e IN nodius_edges FILTER e.graphKey == ${graphKey} RETURN e`);
        return (await cursor.all()).map(e => this.toLocalEdge(e, graphKey));
    }

    async getNodeByKey(graphKey: string, nodeKey: string): Promise<Node<unknown> | null> {
        const cursor = await db.query(aql`
            FOR n IN nodius_nodes FILTER n._key == ${`${graphKey}-${nodeKey}`} AND n.graphKey == ${graphKey} RETURN n
        `);
        const n = await cursor.next();
        return n ? this.toLocal(n, graphKey) : null;
    }

    async getNodeConfigs(_graphKey: string): Promise<NodeTypeConfig[]> {
        const workspaces = [this.workspace, 'root'];
        return (await db.query(aql`FOR c IN nodius_node_config FILTER c.workspace IN ${workspaces} RETURN c`)).all();
    }

    async searchNodes(graphKey: string, query: string, maxResults = 10): Promise<Node<unknown>[]> {
        const q = query.toLowerCase().trim();
        if (q.length <= 2) return (await this.getNodes(graphKey)).slice(0, maxResults);
        const tokens = q.split(/\s+/).filter(t => t.length > 2);
        if (!tokens.length) return (await this.getNodes(graphKey)).slice(0, maxResults);
        const cursor = await db.query(aql`
            FOR n IN nodius_nodes
                FILTER n.graphKey == ${graphKey}
                LET searchText = LOWER(CONCAT_SEPARATOR(" ", n._key, n.type, TO_STRING(n.data)))
                LET score = LENGTH(FOR token IN ${tokens} FILTER CONTAINS(searchText, token) RETURN 1)
                FILTER score > 0 SORT score DESC LIMIT ${maxResults} RETURN n
        `);
        return (await cursor.all()).map(n => this.toLocal(n, graphKey));
    }

    async getNeighborhood(graphKey: string, nodeKey: string, maxDepth = 2): Promise<{ nodes: Node<unknown>[]; edges: Edge[] }> {
        const startId = `nodius_nodes/${graphKey}-${nodeKey}`;
        const cursor = await db.query(aql`
            FOR v, e IN 1..${maxDepth} ANY ${startId} nodius_edges
                OPTIONS { bfs: true, uniqueVertices: "global" }
                FILTER v.graphKey == ${graphKey}
                RETURN { node: v, edge: e }
        `);
        const results = await cursor.all();
        const nodesMap = new Map<string, Node<unknown>>();
        const edgesMap = new Map<string, Edge>();
        for (const r of results) {
            if (r.node) { const ln = this.toLocal(r.node, graphKey); nodesMap.set(ln._key, ln); }
            if (r.edge) { const le = this.toLocalEdge(r.edge, graphKey); edgesMap.set(le._key, le); }
        }
        return { nodes: [...nodesMap.values()], edges: [...edgesMap.values()] };
    }

    private toLocal(n: any, gk: string): Node<unknown> {
        const prefix = `${gk}-`;
        return { ...n, _key: n._key.startsWith(prefix) ? n._key.slice(prefix.length) : n._key, _id: undefined, _rev: undefined };
    }

    private toLocalEdge(e: any, gk: string): Edge {
        const prefix = `${gk}-`;
        return {
            ...e,
            _key: e._key?.startsWith(prefix) ? e._key.slice(prefix.length) : e._key,
            _id: undefined, _rev: undefined,
            source: e.source?.startsWith?.(prefix) ? e.source.slice(prefix.length) : e.source,
            target: e.target?.startsWith?.(prefix) ? e.target.slice(prefix.length) : e.target,
        };
    }
}

// ─── Helpers ────────────────────────────────────────────────────────
const TEST_GRAPH = '4ce2aa712226d8b0a6231c61d2e8adaeb4c21a47d9d218174bff3af3c2833960';
const WORKSPACE = '150630';

interface ChatResult {
    text: string;
    toolCalls: { name: string; args: string }[];
    rounds: number;
    totalTokens: number;
    duration: number;
    interrupted: boolean;
    interruptAction?: any;
    errors: string[];
}

function createAgent(graphKey: string): AIAgent {
    const llm = createLLMProviderFromConfig();
    if (!llm) throw new Error('No LLM provider. Check DEEPSEEK_API_KEY.');
    return new AIAgent({
        graphKey,
        dataSource: new TestDataSource(WORKSPACE),
        role: 'editor',
        llmProvider: llm,
        embeddingProvider: null,
    });
}

async function chat(agent: AIAgent, question: string, label: string): Promise<ChatResult> {
    const start = Date.now();
    let text = '';
    let rounds = 0;
    let totalTokens = 0;
    let interrupted = false;
    let interruptAction: any;
    const toolCalls: { name: string; args: string }[] = [];
    const errors: string[] = [];

    const callbacks: StreamCallbacks = {
        onToken: (t) => { text += t; },
        onToolStart: (id, name) => { rounds++; toolCalls.push({ name, args: '' }); },
        onToolResult: (id, result) => {},
        onComplete: (fullText) => {
            try {
                const parsed = JSON.parse(fullText);
                if (parsed?.type === 'interrupt') {
                    interrupted = true;
                    interruptAction = parsed.proposedAction;
                    text = fullText;
                }
            } catch { /* not JSON = normal text response */ }
        },
        onError: (err) => { errors.push(err.message); },
        onUsage: (u) => { totalTokens += u.totalTokens; },
    };

    await agent.chatStream(question, callbacks);

    const duration = Date.now() - start;
    console.log(`\n[${label}] Duration: ${duration}ms | Tokens: ${totalTokens} | Rounds: ${rounds} | Interrupted: ${interrupted}`);
    if (toolCalls.length) console.log(`  Tools: ${toolCalls.map(t => t.name).join(', ')}`);
    if (errors.length) console.log(`  ERRORS: ${errors.join('; ')}`);
    console.log(`  Response (${text.length} chars): ${text.slice(0, 300)}${text.length > 300 ? '...' : ''}`);

    return { text, toolCalls, rounds, totalTokens, duration, interrupted, interruptAction, errors };
}

// ─── Tests ──────────────────────────────────────────────────────────

async function testExplainConfig() {
    console.log('\n========== TEST: Explain Node Config Process Code ==========');
    const agent = createAgent(TEST_GRAPH);

    // Ask the AI to explain what a node config's process code does
    const r = await chat(agent, "Explique-moi en detail ce que fait le code process du type de node qui est utilise dans ce graph. Lis la config et explique.", "explain-config");

    // Should call read_node_config and provide a clear explanation
    const usedReadConfig = r.toolCalls.some(t => t.name === 'read_node_config');
    const hasExplanation = r.text.length > 200 && !r.interrupted;

    console.log(`\n  [CHECK] Used read_node_config: ${usedReadConfig ? 'YES' : 'NO'}`);
    console.log(`  [CHECK] Has explanation (>200 chars, not interrupted): ${hasExplanation ? 'YES' : 'NO'}`);
    console.log(`  [CHECK] Contains {{node:}} refs: ${r.text.includes('{{node:') ? 'YES' : 'NO'}`);

    return { usedReadConfig, hasExplanation };
}

async function testCreateNodeWithEdges() {
    console.log('\n========== TEST: Create Node With Edges ==========');
    const agent = createAgent(TEST_GRAPH);

    const r = await chat(agent,
        "Cree un nouveau node de type 'NBA Sentence' connecte en entree au node root (handle R:0) et positionne-le a X=500, Y=300. Utilise l'outil le plus efficace possible.",
        "create-node-with-edges"
    );

    // Check if it used propose_create_node_with_edges (preferred) or batch (acceptable)
    const usedCreateWithEdges = r.toolCalls.some(t => t.name === 'propose_create_node_with_edges');
    const usedBatch = r.toolCalls.some(t => t.name === 'propose_batch');
    const wasInterrupted = r.interrupted;
    const hasAction = r.interruptAction != null;

    console.log(`\n  [CHECK] Used propose_create_node_with_edges: ${usedCreateWithEdges ? 'YES' : 'NO'}`);
    console.log(`  [CHECK] Used propose_batch: ${usedBatch ? 'YES' : 'NO'}`);
    console.log(`  [CHECK] Was interrupted (HITL): ${wasInterrupted ? 'YES' : 'NO'}`);
    console.log(`  [CHECK] Has proposed action: ${hasAction ? 'YES' : 'NO'}`);
    if (hasAction) {
        console.log(`  Action type: ${r.interruptAction?.type}`);
        console.log(`  Action payload: ${JSON.stringify(r.interruptAction?.payload).slice(0, 500)}`);
    }

    return { usedCreateWithEdges, usedBatch, wasInterrupted, hasAction };
}

async function testConfigureNodeType() {
    console.log('\n========== TEST: Configure Node Type ==========');
    const agent = createAgent(TEST_GRAPH);

    const r = await chat(agent,
        `Cree un nouveau type de node appele "Data Aggregator" qui :
- a une description "Aggrege les donnees de plusieurs sources"
- a 3 entrees (L: in, accepte 'any') et 1 sortie (R: out, accepte 'any')
- a une bordure arrondie (radius 12) de couleur bleue
- a un code process qui combine toutes les donnees entrantes dans un objet et les envoie en sortie
- a une icone "layers"
- categorie "data"
- taille 250x150`,
        "configure-node-type"
    );

    const usedConfigureTool = r.toolCalls.some(t => t.name === 'propose_configure_node_type');
    const wasInterrupted = r.interrupted;
    const actionType = r.interruptAction?.type;

    console.log(`\n  [CHECK] Used propose_configure_node_type: ${usedConfigureTool ? 'YES' : 'NO'}`);
    console.log(`  [CHECK] Was interrupted (HITL): ${wasInterrupted ? 'YES' : 'NO'}`);
    console.log(`  [CHECK] Action type: ${actionType}`);

    if (r.interruptAction?.type === 'configure_node_type') {
        const payload = r.interruptAction.payload;
        console.log(`  [CHECK] Has displayName: ${payload.displayName ? 'YES' : 'NO'} (${payload.displayName})`);
        console.log(`  [CHECK] Has process code: ${payload.process ? 'YES' : 'NO'} (${payload.process?.length} chars)`);
        console.log(`  [CHECK] Has handles: ${payload.handles ? 'YES' : 'NO'}`);
        console.log(`  [CHECK] Has border: ${payload.border ? 'YES' : 'NO'}`);
        console.log(`  [CHECK] Has icon: ${payload.icon ? 'YES' : 'NO'} (${payload.icon})`);
        console.log(`  [CHECK] Has size: ${payload.size ? 'YES' : 'NO'}`);
    }

    return { usedConfigureTool, wasInterrupted };
}

async function testHtmlContent() {
    console.log('\n========== TEST: HTML Content Creation ==========');
    const agent = createAgent(TEST_GRAPH);

    const r = await chat(agent,
        `Modifie le contenu HTML du node root (c'est un node html). Mets-lui un HtmlObject qui affiche un titre "Dashboard" en bleu avec une taille de 24px et un paragraphe "Welcome to the workflow" en dessous. Utilise la structure HtmlObject correcte avec css, identifier, tag, etc.`,
        "html-content"
    );

    const usedUpdateNode = r.toolCalls.some(t => t.name === 'propose_update_node');
    const wasInterrupted = r.interrupted;

    console.log(`\n  [CHECK] Used propose_update_node: ${usedUpdateNode ? 'YES' : 'NO'}`);
    console.log(`  [CHECK] Was interrupted (HITL): ${wasInterrupted ? 'YES' : 'NO'}`);

    if (r.interruptAction?.type === 'update_node') {
        const changes = r.interruptAction.payload?.changes;
        const hasData = changes?.data != null;
        const dataIsHtmlObject = hasData && typeof changes.data === 'object' && 'type' in changes.data;
        console.log(`  [CHECK] Has data change: ${hasData ? 'YES' : 'NO'}`);
        console.log(`  [CHECK] Data is HtmlObject: ${dataIsHtmlObject ? 'YES' : 'NO'}`);
        if (dataIsHtmlObject) {
            console.log(`  HtmlObject type: ${changes.data.type}`);
            console.log(`  HtmlObject: ${JSON.stringify(changes.data).slice(0, 500)}`);
        }
    }

    return { usedUpdateNode, wasInterrupted };
}

async function testReorganizeLayout() {
    console.log('\n========== TEST: Reorganize Layout ==========');
    const agent = createAgent(TEST_GRAPH);

    const r = await chat(agent,
        "Reorganise le layout de tous les nodes de type Section (rop0, rop1, rop2) pour qu'ils soient mieux organises.",
        "reorganize"
    );

    const usedReorganize = r.toolCalls.some(t => t.name === 'propose_reorganize_layout');
    const usedBatchMove = r.toolCalls.some(t => t.name === 'propose_batch');
    const wasInterrupted = r.interrupted;

    console.log(`\n  [CHECK] Used propose_reorganize_layout: ${usedReorganize ? 'YES' : 'NO'}`);
    console.log(`  [CHECK] Used propose_batch (fallback): ${usedBatchMove ? 'YES' : 'NO'}`);
    console.log(`  [CHECK] Was interrupted (HITL): ${wasInterrupted ? 'YES' : 'NO'}`);

    if (r.interruptAction?.type === 'reorganize_layout') {
        const payload = r.interruptAction.payload;
        console.log(`  [CHECK] Node keys: ${JSON.stringify(payload.nodeKeys)}`);
        console.log(`  [CHECK] Strategy: ${payload.strategy || '(default)'}`);
    }

    return { usedReorganize, usedBatchMove, wasInterrupted };
}

async function testFullGraphCreation() {
    console.log('\n========== TEST: Full Graph Creation from Description ==========');
    const agent = createAgent(TEST_GRAPH);

    const r = await chat(agent,
        `Je veux creer un mini workflow dans ce graph :
1. Un node de type "starter" a la position (0, 0)
2. Un node NBA Sentence connecte au starter, position (300, 0)
3. Un node return connecte au NBA Sentence, position (600, 0)
Cree tout en un seul appel batch.`,
        "full-graph"
    );

    const usedBatch = r.toolCalls.some(t => t.name === 'propose_batch');
    const usedCreateWithEdges = r.toolCalls.some(t => t.name === 'propose_create_node_with_edges');
    const wasInterrupted = r.interrupted;

    console.log(`\n  [CHECK] Used propose_batch: ${usedBatch ? 'YES' : 'NO'}`);
    console.log(`  [CHECK] Used propose_create_node_with_edges: ${usedCreateWithEdges ? 'YES' : 'NO'}`);
    console.log(`  [CHECK] Was interrupted (HITL): ${wasInterrupted ? 'YES' : 'NO'}`);

    if (r.interruptAction) {
        console.log(`  Action type: ${r.interruptAction.type}`);
        if (r.interruptAction.type === 'batch') {
            const actions = r.interruptAction.payload?.actions;
            console.log(`  Batch sub-actions: ${actions?.length}`);
            for (const a of actions || []) {
                console.log(`    - ${a.type}: ${JSON.stringify(a.payload).slice(0, 200)}`);
            }
        }
    }

    return { usedBatch, usedCreateWithEdges, wasInterrupted };
}

async function testLayoutCompute() {
    console.log('\n========== TEST: Layout Compute (unit, real DB data) ==========');
    const ds = new TestDataSource(WORKSPACE);
    const nodes = await ds.getNodes(TEST_GRAPH);
    const edges = await ds.getEdges(TEST_GRAPH);

    console.log(`  Graph has ${nodes.length} nodes, ${edges.length} edges`);

    // Test horizontal layout
    const hResult = computeAutoLayout(nodes, edges, 'horizontal');
    console.log(`\n  [Horizontal] ${hResult.length} nodes positioned`);
    for (const r of hResult.slice(0, 5)) {
        console.log(`    ${r.nodeKey}: (${r.posX}, ${r.posY})`);
    }
    if (hResult.length > 5) console.log(`    ... and ${hResult.length - 5} more`);

    // Test vertical layout
    const vResult = computeAutoLayout(nodes, edges, 'vertical');
    console.log(`\n  [Vertical] ${vResult.length} nodes positioned`);
    for (const r of vResult.slice(0, 5)) {
        console.log(`    ${r.nodeKey}: (${r.posX}, ${r.posY})`);
    }
    if (vResult.length > 5) console.log(`    ... and ${vResult.length - 5} more`);

    // Checks
    const allPositioned = hResult.length === nodes.length;
    const allFinite = hResult.every(r => isFinite(r.posX) && isFinite(r.posY));
    const noOverlaps = checkNoOverlaps(hResult, nodes);

    console.log(`\n  [CHECK] All nodes positioned: ${allPositioned ? 'YES' : 'NO'} (${hResult.length}/${nodes.length})`);
    console.log(`  [CHECK] All positions finite: ${allFinite ? 'YES' : 'NO'}`);
    console.log(`  [CHECK] No overlaps: ${noOverlaps ? 'YES' : 'NO'}`);

    return { allPositioned, allFinite, noOverlaps, nodeCount: nodes.length };
}

function checkNoOverlaps(results: { nodeKey: string; posX: number; posY: number }[], nodes: Node<unknown>[]): boolean {
    const sizeMap = new Map(nodes.map(n => [n._key, n.size]));
    for (let i = 0; i < results.length; i++) {
        for (let j = i + 1; j < results.length; j++) {
            const a = results[i];
            const b = results[j];
            const sA = sizeMap.get(a.nodeKey) ?? { width: 200, height: 100 };
            const sB = sizeMap.get(b.nodeKey) ?? { width: 200, height: 100 };
            const overlapX = a.posX < b.posX + sB.width && a.posX + sA.width > b.posX;
            const overlapY = a.posY < b.posY + sB.height && a.posY + sA.height > b.posY;
            if (overlapX && overlapY) return false;
        }
    }
    return true;
}

async function testLayoutAI() {
    console.log('\n========== TEST: AI Triggers Layout ==========');
    const agent = createAgent(TEST_GRAPH);

    const r = await chat(agent,
        "Reorganise automatiquement tous les nodes de ce graph pour un layout horizontal propre.",
        "layout-ai"
    );

    const usedReorganize = r.toolCalls.some(t => t.name === 'propose_reorganize_layout');
    const usedBatch = r.toolCalls.some(t => t.name === 'propose_batch');
    const wasInterrupted = r.interrupted;

    console.log(`\n  [CHECK] Used propose_reorganize_layout: ${usedReorganize ? 'YES' : 'NO'}`);
    console.log(`  [CHECK] Used propose_batch (fallback): ${usedBatch ? 'YES' : 'NO'}`);
    console.log(`  [CHECK] Was interrupted (HITL): ${wasInterrupted ? 'YES' : 'NO'}`);

    if (r.interruptAction?.type === 'reorganize_layout') {
        const payload = r.interruptAction.payload;
        console.log(`  [CHECK] Node keys count: ${payload.nodeKeys?.length}`);
        console.log(`  [CHECK] Node keys: ${JSON.stringify(payload.nodeKeys)}`);
        console.log(`  [CHECK] Strategy: ${payload.strategy || '(default)'}`);
    }

    return { usedReorganize, usedBatch, wasInterrupted };
}

// ─── Main ───────────────────────────────────────────────────────────

const tests: Record<string, () => Promise<any>> = {
    'explain-config': testExplainConfig,
    'create-node-with-edges': testCreateNodeWithEdges,
    'configure-node-type': testConfigureNodeType,
    'html-content': testHtmlContent,
    'reorganize': testReorganizeLayout,
    'full-graph': testFullGraphCreation,
    'layout-compute': testLayoutCompute,
    'layout-ai': testLayoutAI,
};

async function main() {
    const arg = process.argv[2] ?? 'all';

    if (arg === 'all') {
        console.log('Running ALL Phase 3 tests...\n');
        const results: Record<string, any> = {};
        for (const [name, fn] of Object.entries(tests)) {
            try {
                results[name] = await fn();
            } catch (err) {
                console.error(`\n[${name}] FATAL ERROR:`, err);
                results[name] = { error: String(err) };
            }
        }
        console.log('\n\n========== PHASE 3 SUMMARY ==========');
        for (const [name, result] of Object.entries(results)) {
            console.log(`\n${name}:`, JSON.stringify(result, null, 2));
        }
    } else if (tests[arg]) {
        await tests[arg]();
    } else {
        console.error(`Unknown test: ${arg}. Available: ${Object.keys(tests).join(', ')}, all`);
        process.exit(1);
    }

    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
