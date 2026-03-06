/**
 * AI Chatbot Test Script
 *
 * Directly instantiates AIAgent with ArangoDataSource and tests
 * the full RAG + tool-calling pipeline as an end user would.
 *
 * Usage: npx tsx scripts/ai-test/test-chatbot.mts [graphKey] [question]
 *
 * Environment: reads from packages/server/.env (DEEPSEEK_API_KEY, AI_DEBUG)
 */

import 'dotenv/config';
import { resolve } from 'path';
import { config } from 'dotenv';

// Load server .env
config({ path: resolve(import.meta.dirname, '../../packages/server/.env') });

// Force AI_DEBUG for visibility
process.env.AI_DEBUG = 'true';

import { Database, aql } from 'arangojs';
import { AIAgent } from '../../packages/server/src/ai/aiAgent.js';
import { createLLMProviderFromConfig } from '../../packages/server/src/ai/providers/providerFactory.js';
import type { GraphDataSource, GraphRAGContext } from '../../packages/server/src/ai/types.js';
import type { Edge, Node, NodeTypeConfig } from '@nodius/utils';
import type { StreamCallbacks } from '../../packages/server/src/ai/types.js';

// ─── ArangoDB connection ─────────────────────────────────────────────
const ARANGO_URL = process.env.ARANGO_URL || 'http://127.0.0.1:8529';
const ARANGO_DB = process.env.ARANGO_DB || 'nodius';
const ARANGO_USER = process.env.ARANGO_USER || 'root';
const ARANGO_PASS = process.env.ARANGO_PASS || 'azerty';

const db = new Database({
    url: ARANGO_URL,
    databaseName: ARANGO_DB,
    auth: { username: ARANGO_USER, password: ARANGO_PASS },
});

// We need to mock the server's db export since arangoDataSource.ts imports from server.ts
// Instead, we create our own DataSource implementation

class TestArangoDataSource implements GraphDataSource {
    private workspace: string;
    constructor(workspace: string) {
        this.workspace = workspace;
    }

    async getGraph(graphKey: string): Promise<GraphRAGContext['graph'] | null> {
        const cursor = await db.query(aql`
            FOR g IN nodius_graphs
                FILTER g._key == ${graphKey} AND g.workspace == ${this.workspace}
                RETURN g
        `);
        const graph = await cursor.next();
        if (!graph) return null;
        return {
            _key: graph._key,
            name: graph.name,
            description: graph.description,
            sheets: graph.sheetsList ?? {},
            metadata: graph.metadata,
        };
    }

    async getNodes(graphKey: string, sheetId?: string): Promise<Node<unknown>[]> {
        let cursor;
        if (sheetId) {
            cursor = await db.query(aql`
                FOR n IN nodius_nodes
                    FILTER n.graphKey == ${graphKey} AND n.sheet == ${sheetId}
                    RETURN n
            `);
        } else {
            cursor = await db.query(aql`
                FOR n IN nodius_nodes
                    FILTER n.graphKey == ${graphKey}
                    RETURN n
            `);
        }
        const nodes = await cursor.all();
        return nodes.map(n => this.toLocalNode(n, graphKey));
    }

    async getEdges(graphKey: string, sheetId?: string): Promise<Edge[]> {
        let cursor;
        if (sheetId) {
            cursor = await db.query(aql`
                FOR e IN nodius_edges
                    FILTER e.graphKey == ${graphKey} AND e.sheet == ${sheetId}
                    RETURN e
            `);
        } else {
            cursor = await db.query(aql`
                FOR e IN nodius_edges
                    FILTER e.graphKey == ${graphKey}
                    RETURN e
            `);
        }
        const edges = await cursor.all();
        return edges.map(e => this.toLocalEdge(e, graphKey));
    }

    async getNodeByKey(graphKey: string, nodeKey: string): Promise<Node<unknown> | null> {
        const compositeKey = `${graphKey}-${nodeKey}`;
        const cursor = await db.query(aql`
            FOR n IN nodius_nodes
                FILTER n._key == ${compositeKey} AND n.graphKey == ${graphKey}
                RETURN n
        `);
        const node = await cursor.next();
        if (!node) return null;
        return this.toLocalNode(node, graphKey);
    }

    async getNodeConfigs(graphKey: string): Promise<NodeTypeConfig[]> {
        // Note: In prod, workspace filter applies. But configs may be in different workspace.
        // Try workspace first, fallback to all configs.
        const cursor = await db.query(aql`
            FOR c IN nodius_node_config
                RETURN c
        `);
        return await cursor.all();
    }

    async searchNodes(graphKey: string, query: string, maxResults = 10, queryEmbedding?: number[]): Promise<Node<unknown>[]> {
        const q = query.toLowerCase().trim();
        if (q.length <= 2) {
            return (await this.getNodes(graphKey)).slice(0, maxResults);
        }

        // Token-based search (no embedding provider for DeepSeek)
        const tokens = q.split(/\s+/).filter(t => t.length > 2);
        if (tokens.length === 0) {
            return (await this.getNodes(graphKey)).slice(0, maxResults);
        }

        const cursor = await db.query(aql`
            FOR n IN nodius_nodes
                FILTER n.graphKey == ${graphKey}
                LET searchText = LOWER(CONCAT_SEPARATOR(" ",
                    n._key, n.type, TO_STRING(n.data)
                ))
                LET score = LENGTH(
                    FOR token IN ${tokens}
                        FILTER CONTAINS(searchText, token)
                        RETURN 1
                )
                FILTER score > 0
                SORT score DESC
                LIMIT ${maxResults}
                RETURN n
        `);
        const nodes = await cursor.all();
        return nodes.map(n => this.toLocalNode(n, graphKey));
    }

    async getNeighborhood(graphKey: string, nodeKey: string, maxDepth = 2, direction: 'inbound' | 'outbound' | 'any' = 'any'): Promise<{ nodes: Node<unknown>[]; edges: Edge[] }> {
        const compositeKey = `nodius_nodes/${graphKey}-${nodeKey}`;
        const dir = direction === 'inbound' ? 'INBOUND' : direction === 'outbound' ? 'OUTBOUND' : 'ANY';

        const cursor = await db.query(aql`
            LET startId = ${compositeKey}
            FOR v, e IN 1..${maxDepth} ANY startId nodius_edges
                OPTIONS { bfs: true, uniqueVertices: "global" }
                FILTER v.graphKey == ${graphKey}
                RETURN { node: v, edge: e }
        `);

        const results = await cursor.all();
        const nodesMap = new Map<string, Node<unknown>>();
        const edgesMap = new Map<string, Edge>();

        for (const r of results) {
            if (r.node) {
                const localNode = this.toLocalNode(r.node, graphKey);
                nodesMap.set(localNode._key, localNode);
            }
            if (r.edge) {
                const localEdge = this.toLocalEdge(r.edge, graphKey);
                edgesMap.set(localEdge._key, localEdge);
            }
        }

        return {
            nodes: [...nodesMap.values()],
            edges: [...edgesMap.values()],
        };
    }

    private toLocalNode(n: any, graphKey: string): Node<unknown> {
        const prefix = `${graphKey}-`;
        const localKey = n._key.startsWith(prefix) ? n._key.slice(prefix.length) : n._key;
        return {
            ...n,
            _key: localKey,
            _id: undefined,
            _rev: undefined,
            source: undefined,
            target: undefined,
        };
    }

    private toLocalEdge(e: any, graphKey: string): Edge {
        const prefix = `${graphKey}-`;
        const localKey = e._key.startsWith(prefix) ? e._key.slice(prefix.length) : e._key;
        return {
            ...e,
            _key: localKey,
            _id: undefined,
            _rev: undefined,
            source: e.source,
            target: e.target,
        };
    }
}

// ─── Test runner ─────────────────────────────────────────────────────

interface TestResult {
    question: string;
    toolCalls: { name: string; args: Record<string, unknown>; resultLen: number }[];
    fullText: string;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    rounds: number;
    hasNodeLinks: boolean;
    hasSheetLinks: boolean;
    duration: number;
    errors: string[];
}

async function testChat(graphKey: string, question: string, workspace = '150630'): Promise<TestResult> {
    const startTime = Date.now();
    const dataSource = new TestArangoDataSource(workspace);

    const llmProvider = createLLMProviderFromConfig();
    if (!llmProvider) {
        throw new Error('No LLM provider configured. Check DEEPSEEK_API_KEY in .env');
    }

    const agent = new AIAgent({
        graphKey,
        dataSource,
        role: 'editor',
        llmProvider,
        embeddingProvider: null,
    });

    const toolCalls: TestResult['toolCalls'] = [];
    let fullText = '';
    let totalTokens = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let rounds = 0;
    const errors: string[] = [];

    const callbacks: StreamCallbacks = {
        onToken: (token: string) => {
            process.stdout.write(token);
            fullText += token;
        },
        onToolStart: (toolCallId: string, toolName: string) => {
            rounds++;
            console.log(`\n\n--- TOOL CALL: ${toolName} (id: ${toolCallId}) ---`);
        },
        onToolResult: (toolCallId: string, result: string) => {
            const preview = result.length > 300 ? result.slice(0, 300) + '...' : result;
            console.log(`--- TOOL RESULT (${result.length} chars): ${preview} ---\n`);
            toolCalls.push({ name: toolCallId, args: {}, resultLen: result.length });
        },
        onUsage: (usage: any) => {
            promptTokens += usage.promptTokens || 0;
            completionTokens += usage.completionTokens || 0;
            totalTokens += usage.totalTokens || 0;
        },
        onToolLimit: (info: any) => {
            console.log(`\n--- TOOL LIMIT REACHED: ${info.roundsUsed}/${info.maxExtended} ---`);
        },
        onComplete: (text: string) => {
            if (text !== fullText) {
                // onComplete may have a different text if it's an interrupt
                fullText = text;
            }
        },
        onError: (err: Error) => {
            console.error(`\n--- ERROR: ${err.message} ---`);
            errors.push(err.message);
        },
    };

    console.log(`\n${'='.repeat(70)}`);
    console.log(`QUESTION: "${question}"`);
    console.log(`GRAPH: ${graphKey.slice(0, 16)}...`);
    console.log(`${'='.repeat(70)}\n`);

    await agent.chatStream(question, callbacks);

    const duration = Date.now() - startTime;
    const hasNodeLinks = /\{\{node:[^}]+\}\}/.test(fullText);
    const hasSheetLinks = /\{\{sheet:[^}]+\}\}/.test(fullText);

    console.log(`\n\n${'─'.repeat(70)}`);
    console.log(`METRICS:`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Tool calls: ${toolCalls.length} (${rounds} rounds)`);
    console.log(`  Tokens: prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokens}`);
    console.log(`  Has {{node:}} links: ${hasNodeLinks}`);
    console.log(`  Has {{sheet:}} links: ${hasSheetLinks}`);
    console.log(`  Response length: ${fullText.length} chars`);
    if (errors.length) console.log(`  Errors: ${errors.join(', ')}`);
    console.log(`${'─'.repeat(70)}\n`);

    return {
        question,
        toolCalls,
        fullText,
        totalTokens,
        promptTokens,
        completionTokens,
        rounds,
        hasNodeLinks,
        hasSheetLinks,
        duration,
        errors,
    };
}

// ─── Main ────────────────────────────────────────────────────────────

const TEST_GRAPH = process.argv[2] || '4ce2aa712226d8b0a6231c61d2e8adaeb4c21a47d9d218174bff3af3c2833960';
const QUESTION = process.argv[3];

async function main() {
    if (QUESTION) {
        // Single question mode
        await testChat(TEST_GRAPH, QUESTION);
    } else {
        // Full test suite
        const questions = [
            'Decris-moi ce graph en detail.',
            'Que fait le node root ?',
            'Quels nodes sont connectes au node rope ?',
            'Comment les donnees circulent-elles depuis le debut ?',
            'Quel est le code JavaScript du type Multiplexer ?',
        ];

        const results: TestResult[] = [];
        for (const q of questions) {
            try {
                const result = await testChat(TEST_GRAPH, q);
                results.push(result);
            } catch (err) {
                console.error(`FAILED: ${q}`, err);
            }
        }

        // Summary
        console.log(`\n${'='.repeat(70)}`);
        console.log('SUMMARY');
        console.log(`${'='.repeat(70)}`);
        for (const r of results) {
            const status = r.errors.length ? 'FAIL' : 'OK';
            const nodeOk = r.hasNodeLinks ? 'YES' : 'NO';
            console.log(`[${status}] "${r.question.slice(0, 40)}..." - ${r.rounds} rounds, ${r.totalTokens} tok, {{node:}}=${nodeOk}, ${r.duration}ms`);
        }
    }

    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
