/**
 * @file ai-embed-node-configs.ts
 * @description CLI tool to generate embeddings for NodeTypeConfig primitives.
 * @module server/cli
 *
 * Iterates over every document in `nodius_node_config` that lacks an
 * `embedding` field and generates vector embeddings using the configured
 * embedding provider (OpenAI text-embedding-3-small by default).
 *
 * The RAG semantic search runs on these vectors, so any new or updated
 * primitive must be embedded for the AI to surface it from a query.
 *
 * Usage:
 * ```bash
 * # Embed only configs without existing embeddings
 * tsx src/cli/ai-embed-node-configs.ts
 *
 * # Force re-embed every config
 * tsx src/cli/ai-embed-node-configs.ts --force
 *
 * # Custom database connection
 * tsx src/cli/ai-embed-node-configs.ts arangodb=http://localhost:8529 arangodb_name=nodius
 *
 * # Custom batch size and rate limit delay
 * tsx src/cli/ai-embed-node-configs.ts batch=50 delay=200
 * ```
 *
 * Arguments:
 * - --force: Re-generate embeddings even for configs that already have one
 * - arangodb: ArangoDB URL (default: http://127.0.0.1:8529)
 * - arangodb_user: ArangoDB username (default: root)
 * - arangodb_pass: ArangoDB password (default: azerty)
 * - arangodb_name: ArangoDB database name (default: nodius)
 * - batch: Number of configs per batch (default: 100)
 * - delay: Milliseconds to wait between each embedding API call (default: 100)
 *
 * Requires: OPENAI_API_KEY environment variable
 */

import { Database } from "arangojs";
import { aql } from "arangojs";
import { detectEmbeddingProvider } from "../ai/providers/embeddingProvider.js";
import { createNodeConfigEmbeddingText } from "../ai/utils.js";
import { parseArgs } from "../utils/env.js";

async function embedNodeConfigs() {
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
    const collection = db.collection("nodius_node_config");
    const exists = await collection.exists();
    if (!exists) {
        console.error("Error: Collection 'nodius_node_config' does not exist.");
        process.exit(1);
    }

    // Count configs to process
    const filterCondition = forceMode
        ? aql`RETURN 1`
        : aql`FILTER doc.embedding == null RETURN 1`;

    const countCursor = await db.query(aql`
        FOR doc IN nodius_node_config
            ${filterCondition}
    `);
    const totalConfigs = (await countCursor.all()).length;

    if (totalConfigs === 0) {
        console.log("\nNo node configs to embed. All primitives already have embeddings.");
        process.exit(0);
    }

    console.log(`\nFound ${totalConfigs} node configs to embed.`);

    let processed = 0;
    let embedded = 0;
    let skipped = 0;
    let failed = 0;
    let offset = 0;

    while (offset < totalConfigs) {
        const batchQuery = forceMode
            ? aql`
                FOR doc IN nodius_node_config
                    LIMIT ${offset}, ${batchSize}
                    RETURN doc
            `
            : aql`
                FOR doc IN nodius_node_config
                    FILTER doc.embedding == null
                    LIMIT ${offset}, ${batchSize}
                    RETURN doc
            `;

        const cursor = await db.query(batchQuery);
        const configs = await cursor.all();

        if (configs.length === 0) break;

        for (const config of configs) {
            processed++;

            try {
                const text = createNodeConfigEmbeddingText(config);
                if (text.trim().length === 0) {
                    skipped++;
                    continue;
                }

                const embedding = await provider.generateEmbedding(text);
                await collection.update(config._key, { embedding });
                embedded++;

                if (embedded % 25 === 0) {
                    console.log(`  Progress: ${processed}/${totalConfigs} (embedded: ${embedded}, skipped: ${skipped}, failed: ${failed})`);
                }

                if (delayMs > 0) {
                    await sleep(delayMs);
                }
            } catch (err) {
                failed++;
                console.warn(`  Warning: Failed to embed config ${config._key}:`, err instanceof Error ? err.message : err);
            }
        }

        if (forceMode) {
            offset += batchSize;
        } else {
            // Re-query from 0 since processed configs are now filtered out
            offset = 0;
            if (configs.length < batchSize) break;
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

export { embedNodeConfigs };

const isMainModule = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
    process.argv[1]?.endsWith("ai-embed-node-configs.ts") ||
    process.argv[1]?.endsWith("ai-embed-node-configs.js");

if (isMainModule) {
    embedNodeConfigs().catch(err => {
        console.error("Fatal error:", err);
        process.exit(1);
    });
}
