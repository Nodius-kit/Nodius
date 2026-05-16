# Verifier prompt — RAG reasoning path swap (instances → primitives)

This document is a **self-contained brief** to be handed to a fresh agent
(`claude … --print < VERIFY_REASONING_PATH.md`, an `Agent` sub-task, or any
external reviewer). The agent that reads this has **no prior context** about
the swap — every fact it needs is in this file.

The job is to verify that the RAG/embedding pipeline now routes through the
**NodeTypeConfig catalog** (`nodius_node_config`) instead of node *instances*
(`nodius_nodes`), and that the AI's reasoning path actually uses semantic
matches on primitives.

## Background you need

Nodius has two distinct ArangoDB collections:

| Collection | What it holds | Multiplicity |
|---|---|---|
| `nodius_node_config` | **Type definitions** ("primitives"). Each document is the spec of a node type: `displayName`, `description`, `category`, `handles`, `process`, sizing. | One document per type. |
| `nodius_nodes` | **Instances** placed by a user inside a graph. Each instance carries an arbitrary `data` payload and a `type` field that points back to a config `_key`. | Many per type. |

Until this branch, the RAG semantic search (OpenAI embeddings + cosine
similarity in ArangoDB) ran on `nodius_nodes.embedding`. That had two bad
properties:

1. The same `type` text got embedded N times (once per instance), wasting
   tokens and adding noise.
2. The LLM could only see primitives the user had **already placed** — it
   couldn't suggest a type from the catalog that the user hadn't tried yet.

The swap moves the vector store to `nodius_node_config.embedding`. Instances
are now searched by token-text only.

## What you're verifying

A focused, four-question audit. Keep the report under 400 words.

### Q1 — Cold-path code routes correctly

In the working tree, confirm:

- `packages/server/src/ai/data/arangoDataSource.ts`
  - `ensureVectorIndex()` targets the `nodius_node_config` collection.
  - A `searchNodeConfigs(query, maxResults?, queryEmbedding?)` method exists
    that runs `COSINE_SIMILARITY(c.embedding, @queryEmbedding)` over
    `FOR c IN nodius_node_config` with score > 0.3.
  - `searchNodes(graphKey, query, maxResults)` no longer accepts
    `queryEmbedding`. No `COSINE_SIMILARITY` query lives in this method.
- `packages/server/src/ai/utils.ts`
  - Exports `createNodeConfigEmbeddingText(config)` and
    `hasNodeConfigContentChanged(original, current)`.
  - The old `createNodeEmbeddingText(node)` / `hasNodeContentChanged(...)`
    are gone (no compat re-export).
- `packages/server/src/ai/types.ts`
  - `GraphDataSource` interface lists both `searchNodes` and
    `searchNodeConfigs`. `searchNodes` does **not** carry an embedding param.

Flag any drift, missing method, or orphaned import.

### Q2 — RAG retrieval flow follows the new contract

Read `packages/server/src/ai/data/graphRAGRetriever.ts::retrieve()` and walk
through the algorithm. The order of operations must be:

1. Cache check.
2. Embed the query (when an embedding provider is wired and the query is
   non-empty).
3. **`searchNodeConfigs(query, maxConfigs, queryEmbedding?)`** — semantic
   pass on primitives.
4. **`searchNodes(graphKey, query, maxNodes)`** — token pass on instances.
5. Seed merge: token-matched instances first, then instances whose `type`
   is in the relevant-primitives set, capped at `maxNodes`.
6. Fallback: when nothing matched, seed with the first N instances of the
   graph (so we never return empty).
7. BFS neighbourhood expansion around the first 5 seeds.
8. Edge filter (only edges with both endpoints in the seed set).
9. Final config set = **union** of (semantic-relevant primitives) and
   (configs of types actually used by the kept instances — the "backfill",
   so the LLM has the spec for every type it sees).

Verify all nine steps are present in that order. If any step is missing,
mis-ordered, or has a different cap, flag it.

### Q3 — Write-path matches the read-path

The vector store is only useful if it stays fresh. Confirm both write-paths:

- `packages/server/src/cluster/webSocketManager.ts`
  - The old `generateNodeEmbeddings(nodes, graphKey, ...)` that embedded
    instances during `saveGraphChanges` is **gone**.
  - `saveNodeConfigChanges` invokes a private
    `generateNodeConfigEmbedding(config, collection, provider)` in
    fire-and-forget, guarded by `hasNodeConfigContentChanged(previous,
    updated)`.
- `packages/server/src/request/requestNodeConfig.ts`
  - `POST /api/nodeconfig/create`, `/update`, and `/rename` each call a
    helper that runs `createNodeConfigEmbeddingText` →
    `provider.generateEmbedding` → `collection.update(_key, { embedding })`
    in the background.
  - `/update` is gated by `hasNodeConfigContentChanged(existing,
    updatedConfig)` so an icon-only change does not trigger an embedding.

Flag any path that mutates a primitive without queuing a re-embed.

### Q4 — The AI's reasoning path now uses primitives

This is the part the user actually cares about. Read the mock data source
in `packages/server/test-ai/mock-data.ts` to understand the test catalog
(it contains `api-call`, `filter`, `transform`, `log-node` primitives plus
several instances), then run the retriever unit tests:

```
cd packages/server
npx vitest run src/ai/__tests__/graphRAGRetriever.test.ts
```

Inside that file there is a `describe("semantic search on primitives (swap
behavior)", ...)` block. It asserts:

- The retriever calls `searchNodeConfigs` with the query and forwards a
  query embedding when a provider is wired.
- A semantically-relevant primitive (e.g. `transform`) lands in
  `ctx.nodeTypeConfigs` even when no instance of it is explicitly named in
  the query.
- For every type used by `ctx.relevantNodes`, its config is present in
  `ctx.nodeTypeConfigs` (the backfill works).

If any of these assertions fail, the swap is incomplete — report which one.

For a deeper end-to-end check, run `tsx scripts/ai-test/test-chatbot.mts`
with a real DeepSeek/OpenAI key against a seeded Arango. Send a query that
mentions a *capability* not present as an instance (e.g. "I want to schedule
something periodically" against a graph with no scheduler node). The
retriever output (logged at `debugAI` level if `AI_DEBUG=1`) should list a
matching primitive's `_key` in `relevantPrimitives` even though no instance
of that type exists. If it does not, the swap is plumbed but not actually
queried — investigate `ArangoGraphDataSource.searchNodeConfigs` and the
embedding write-path together.

## Reporting format

Reply with:

```
Q1: pass | fail — short reason if fail
Q2: pass | fail — list any missing/mis-ordered step
Q3: pass | fail — list any path that mutates a config without re-embed
Q4: pass | fail — which assertion failed, or which query proved the gap
Verdict: shippable | needs fixes (one sentence)
```

Do **not** edit code. Do **not** propose a redesign. This is a verification
pass; if you find a bug, name it and stop.
