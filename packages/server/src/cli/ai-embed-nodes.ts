/**
 * @file ai-embed-nodes.ts
 * @description CLI tool to generate embeddings for all existing nodes in ArangoDB.
 * @module server/cli
 *
 * Iterates over all nodes in `nodius_nodes` that lack an `embedding` field
 * and generates vector embeddings using the configured embedding provider
 * (OpenAI text-embedding-3-small by default).
 *
 * Usage:
 * ```bash
 * # Embed only nodes without existing embeddings
 * tsx src/cli/ai-embed-nodes.ts
 *
 * # Force re-embed all nodes (even those with existing embeddings)
 * tsx src/cli/ai-embed-nodes.ts --force
 *
 * # Custom database connection
 * tsx src/cli/ai-embed-nodes.ts arangodb=http://localhost:8529 arangodb_name=nodius
 *
 * # Custom batch size and rate limit delay
 * tsx src/cli/ai-embed-nodes.ts batch=50 delay=200
 * ```
 *
 * Arguments:
 * - --force: Re-generate embeddings even for nodes that already have one
 * - arangodb: ArangoDB URL (default: http://127.0.0.1:8529)
 * - arangodb_user: ArangoDB username (default: root)
 * - arangodb_pass: ArangoDB password (default: azerty)
 * - arangodb_name: ArangoDB database name (default: nodius)
 * - batch: Number of nodes per batch (default: 100)
 * - delay: Milliseconds to wait between each embedding API call (default: 100)
 *
 * Requires: OPENAI_API_KEY environment variable
 */

import { Database } from "arangojs";
import { aql } from "arangojs";
import { detectEmbeddingProvider } from "../ai/providers/embeddingProvider.js";
import { createNodeEmbeddingText } from "../ai/utils.js";
import { parseArgs } from "../utils/env.js";

async function embedNodes() {
    const args = parseArgs();
    const forceMode = process.argv.includes("--force");

    // Database configuration
    const dbUrl = args.get("arangodb", "http://127.0.0.1:8529");
    const dbUser = args.get("arangodb_user", "root");
    const dbPass = args.get("arangodb_pass", "azerty");
    const dbName = args.get("arangodb_name", "nodius");
    const batchSize = parseInt(args.get("batch", "100")!, 10);
    const delayMs = parseInt(args.get("delay", "100")!, 10);

    // Detect embedding provider
    const provider = detectEmbeddingProvider();
    if (!provider) {
        console.error("Error: No embedding provider available.");
        console.error("Set OPENAI_API_KEY environment variable to enable embeddings.");
        process.exit(1);
    }

    console.log(`Embedding provider: ${provider.getModelName()} (dim=${provider.getDimension()})`);
    console.log(`Mode: ${forceMode ? "force (re-embed all)" : "incremental (skip existing)"}`);
    console.log(`Batch size: ${batchSize}, Delay: ${delayMs}ms`);

    // Connect to database
    console.log(`\nConnecting to ArangoDB at ${dbUrl}/${dbName}...`);
    const db = new Database({
        url: dbUrl,
        auth: { username: dbUser, password: dbPass },
        databaseName: dbName,
    });

    // Check collection exists
    const collection = db.collection("nodius_nodes");
    const exists = await collection.exists();
    if (!exists) {
        console.error("Error: Collection 'nodius_nodes' does not exist.");
        process.exit(1);
    }

    // Count nodes to process
    const filterCondition = forceMode
        ? aql`RETURN 1`
        : aql`FILTER doc.embedding == null RETURN 1`;

    const countCursor = await db.query(aql`
        FOR doc IN nodius_nodes
            ${filterCondition}
    `);
    const totalNodes = (await countCursor.all()).length;

    if (totalNodes === 0) {
        console.log("\nNo nodes to embed. All nodes already have embeddings.");
        process.exit(0);
    }

    console.log(`\nFound ${totalNodes} nodes to embed.`);

    // Fetch nodes in batches
    let processed = 0;
    let embedded = 0;
    let skipped = 0;
    let failed = 0;
    let offset = 0;

    while (offset < totalNodes) {
        const batchQuery = forceMode
            ? aql`
                FOR doc IN nodius_nodes
                    LIMIT ${offset}, ${batchSize}
                    RETURN doc
            `
            : aql`
                FOR doc IN nodius_nodes
                    FILTER doc.embedding == null
                    LIMIT ${offset}, ${batchSize}
                    RETURN doc
            `;

        const cursor = await db.query(batchQuery);
        const nodes = await cursor.all();

        if (nodes.length === 0) break;

        for (const node of nodes) {
            processed++;

            try {
                // Build embedding text from the node
                const text = createNodeEmbeddingText(node);
                if (text.trim().length === 0) {
                    skipped++;
                    continue;
                }

                // Generate embedding
                const embedding = await provider.generateEmbedding(text);

                // Update the node in ArangoDB
                await collection.update(node._key, { embedding });
                embedded++;

                // Progress log every 25 nodes
                if (embedded % 25 === 0) {
                    console.log(`  Progress: ${processed}/${totalNodes} (embedded: ${embedded}, skipped: ${skipped}, failed: ${failed})`);
                }

                // Rate limit delay
                if (delayMs > 0) {
                    await sleep(delayMs);
                }
            } catch (err) {
                failed++;
                console.warn(`  Warning: Failed to embed node ${node._key}:`, err instanceof Error ? err.message : err);
            }
        }

        // For non-force mode, offset stays at 0 because processed nodes now have embeddings
        // For force mode, we advance the offset
        if (forceMode) {
            offset += batchSize;
        } else {
            // Re-query from 0 since processed nodes are now filtered out
            offset = 0;
            // Safety: if we got no new results, break
            if (nodes.length < batchSize) break;
        }
    }

    console.log(`\nDone!`);
    console.log(`  Total processed: ${processed}`);
    console.log(`  Embedded: ${embedded}`);
    console.log(`  Skipped (empty text): ${skipped}`);
    console.log(`  Failed: ${failed}`);

    process.exit(0);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Export for programmatic use
export { embedNodes };

// CLI execution
const isMainModule = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
    process.argv[1]?.endsWith("ai-embed-nodes.ts") ||
    process.argv[1]?.endsWith("ai-embed-nodes.js");

if (isMainModule) {
    embedNodes().catch(err => {
        console.error("Fatal error:", err);
        process.exit(1);
    });
}
