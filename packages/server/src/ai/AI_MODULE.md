# Module AI/GraphRAG — Documentation technique

## Vue d'ensemble

Le module AI permet a un utilisateur de **discuter avec un LLM** (DeepSeek, OpenAI, Anthropic) qui "voit" et comprend le contenu d'un graph Nodius. L'IA peut explorer les nodes, edges, configs, repondre a des questions, et **proposer des modifications** (creation/suppression de nodes/edges) soumises a validation humaine (Human-in-the-Loop). La recherche utilise optionnellement des **embeddings vectoriels** (OpenAI) avec `COSINE_SIMILARITY` pour une comprehension semantique, avec fallback sur la recherche par tokens.

**Write-path embeddings :** Le `WebSocketManager` genere automatiquement les embeddings des nodes lors de l'auto-save (toutes les 30s) pour les nodes crees ou dont le contenu a change (pas les deplacements). Un script CLI `ai:embed-nodes` permet de migrer les nodes existants.

```
Client React
    │
    │  POST /api/ai/chat  { graphKey, message, threadId? }  ← HTTP (non-streaming)
    │  WS   ai:chat       { graphKey, message, threadId? }  ← WebSocket (streaming)
    ▼
┌──────────────────────────────────────────────────────────────────────┐
│  RequestAI (requestAI.ts)        WsAIController (wsAIController.ts) │
│  HTTP endpoints                  WebSocket messages ai:*            │
│  Validation Zod stricte          Validation Zod stricte             │
│         │                                  │                        │
│         └──── threadStore.ts ──────────────┘                        │
│                (ThreadStore class, cache + ArangoDB persistence)    │
│                                                                      │
│  ┌──────────┐     ┌───────────────────┐     ┌────────────────────┐  │
│  │ AIAgent  │────▶│ GraphRAGRetriever │────▶│ GraphDataSource    │  │
│  │          │     │  (search nodes +  │     │ ┌────────────────┐ │  │
│  │          │     │   expand voisins) │     │ │ArangoDataSource│ │  │
│  │          │     └───────────────────┘     │ │ (prod: ArangoDB)│ │  │
│  │          │                               │ ├────────────────┤ │  │
│  │          │                               │ │MemoryAware     │ │  │
│  │          │                               │ │DataSource      │ │  │
│  │          │                               │ │ (memory-first, │ │  │
│  │          │                               │ │  fallback DB)  │ │  │
│  │          │                               │ ├────────────────┤ │  │
│  │          │                               │ │MockDataSource  │ │  │
│  │          │                               │ │ (tests: memoire)│ │  │
│  │          │                               │ └────────────────┘ │  │
│  │          │                               └────────────────────┘  │
│  │          │                                                        │
│  │          │──── buildSystemPrompt(context, role)                    │
│  │          │──── buildContextSummary(context) ← encodage TOON       │
│  │          │                                                        │
│  │          │     ┌──────────────────┐                               │
│  │          │────▶│ LLMProvider      │────▶ API DeepSeek / OpenAI /  │
│  │          │     │ (multi-SDK)      │     Anthropic (stream ou non) │
│  │          │     └──────────────────┘                               │
│  │          │                                                        │
│  │          │     ┌──────────────────┐                               │
│  │          │◀───▶│ ReadTools (×7)   │ ← outils lecture (exec auto)  │
│  │          │     ├──────────────────┤                               │
│  │          │◀───▶│ WriteTools (×3)  │ ← outils ecriture (HITL)     │
│  │          │     └──────────────────┘                               │
│  │          │                                                        │
│  │          │──── TokenTracker ──── suivi couts/tokens                │
│  │          │                                                        │
│  │          │     ┌──────────────────┐                               │
│  │          │────▶│ EmbeddingProvider│────▶ API OpenAI Embeddings    │
│  │          │     │ (optionnel)      │     (text-embedding-3-small)  │
│  │          │     └──────────────────┘                               │
│  └──────────┘                                                        │
│      │                                                               │
│      ▼                                                               │
│  HTTP: AgentResult (message | interrupt)                             │
│  WS:   ai:token → ai:tool_start → ai:tool_result → ai:complete     │
│        ai:error { error, code, retryable }                          │
│                                                                      │
│  ┌──────────────────────────────────────────────────────┐            │
│  │ errorClassifier.ts — classifie 429/502/timeout/auth  │            │
│  │ aiLogger.ts        — logs structurés JSON (stderr)   │            │
│  └──────────────────────────────────────────────────────┘            │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ ActionConverter (actionConverter.ts)                          │    │
│  │ convertAction(ProposedAction, graphKey, defaultSheetId)      │    │
│  │ → ActionConversionResult :                                    │    │
│  │   { instructions[], nodesToCreate[], edgesToCreate[],        │    │
│  │     nodeKeysToDelete[], edgeKeysToDelete[], sheetId }        │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘

Client React (useAIChat hook + composants AI)
    │
    │  WebSocket dedie (separe du socket de sync)
    │  JWT token envoye dans chaque message ai:*
    │  Throttle tokens ~32ms pour limiter les re-renders
    │  Gere: ai:token, ai:tool_start, ai:tool_result, ai:complete, ai:error
    │
    │  ┌──────────────────────────────────────────────────────┐
    │  │  AIChatPanel          AIChatInput    AIInterruptModal │
    │  │  (message list,       (textarea,    (approve/reject  │
    │  │   auto-scroll,         send/stop)    HITL modal)     │
    │  │   typing indicator)                                   │
    │  └──────────────────────────────────────────────────────┘
    ▼
```

---

## Pipeline RAG detaille

Quand l'utilisateur envoie un message, voici le flux complet execute par `AIAgent.chat()` :

### Etape 1 — Retrieval (graphRAGRetriever.ts)

Le `GraphRAGRetriever` construit un sous-ensemble pertinent du graph :

```
retrieve(graphKey, "fetch api NBA") :

  0. Si EmbeddingProvider disponible :
     → Genere l'embedding de la query (vecteur 1536 dims)
     → Passe queryEmbedding a searchNodes()

  1. searchNodes("fetch api NBA", queryEmbedding?)
     → Si queryEmbedding fourni : COSINE_SIMILARITY sur les nodes embeddes en ArangoDB
       (score > 0.3, tries par score DESC). Fallback tokens si aucun resultat.
     → Sinon : Tokenise la query, score chaque node sur ses champs
       (_key, type, process, data, config.displayName, config.description)
     → Retourne les nodes tries par score descendant

  2. Si aucun resultat → fallback: prend tous les nodes (slice maxNodes)

  3. Expansion du voisinage (5 seed nodes max) :
     Pour chaque seed, BFS profondeur 2 (ANY direction)
     → Collecte les nodes et edges voisins

  4. Fetch tous les nodes uniques trouves (max 20)

  5. Filtre les edges : garde seulement celles dont
     source ET target sont dans les nodes trouves

  6. Collecte les NodeTypeConfigs references par les types des nodes

  7. Assemblage : tronque process (500 chars) et data (200 chars)
     Resout les noms de sheets (ID → nom lisible)
     → Stocke dans le cache TTL (si active, cle `{graphKey}:{query}`)
     → Retourne un GraphRAGContext compact

  Note : le cache est verifie en etape 0 (avant l'embedding).
  Si une entree valide existe, le pipeline retourne immediatement.
```

**Options configurables** (`GraphRAGOptions`) :

| Option | Defaut | Description |
|--------|--------|-------------|
| `maxNodes` | 20 | Nombre max de nodes dans le contexte |
| `maxDepth` | 2 | Profondeur BFS pour l'expansion |
| `truncateProcess` | 500 | Taille max du code JS (chars) |
| `truncateData` | 200 | Taille max des data serialisees (chars) |
| `cacheTTLMs` | 120000 | TTL du cache RAG en ms (0 pour desactiver) |

### Etape 2 — System Prompt (prompts/systemPrompt.ts)

Au **premier message** de la conversation, un system prompt est construit avec :

- Identite : "assistant IA specialise dans les workflows Nodius"
- Contexte du graph : nom, description, sheets, types de nodes
- Permissions : viewer (lecture seule) vs editor/admin (peut proposer des modifs)
- 4 types built-in documentes : starter, return, html, entryType
- Types custom listes dynamiquement depuis les NodeTypeConfigs
- 7 regles strictes (pas d'AQL, pas de cross-graph, outils obligatoires, etc.)
- Conventions Nodius (localKeys, handles, process/data)

### Etape 3 — Injection du contexte RAG (TOON)

A chaque message, `buildContextSummary(context)` encode les nodes/edges pertinents
au format **TOON** (Token-Oriented Object Notation, `@toon-format/toon`) et les injecte
comme message `role: "system"` avec le prefixe `[Contexte RAG pour cette question]`.

TOON utilise un encodage tabulaire compact : une ligne d'en-tete avec les cles,
puis une ligne par element avec les valeurs separees par des virgules.

Format de sortie :
```
NODES PERTINENTS :
[8]{_key,type,sheet,process}:
  fetch-api,api-call (API Call),main,"const response = await fetch(...)..."
  filter-active,filter (Filter),main,"const players = incoming[0].data..."
  root,starter,main,""

EDGES PERTINENTES :
[6]{from,to,label}:
  "root:0","fetch-api:0",""
  "fetch-api:0","filter-active:0",success
  "fetch-api:1","error-handler:0",error
```

**Gain de tokens :** ~13% de reduction sur le contexte RAG par rapport au format texte
precedent. Le gain augmente avec le nombre de nodes/edges (l'en-tete n'est emis qu'une fois).

### Etape 4 — Boucle Tool-Calling (aiAgent.ts)

```
runToolLoop(context) :
  pour chaque round (max 5) :
    │
    ├── Appel LLM avec messages + outils (read + write si editor)
    │
    ├── Si pas de tool_calls → reponse finale texte → return AgentResponse
    │
    └── Pour chaque tool_call dans la reponse :
          │
          ├── JSON.parse(arguments) avec try/catch
          │     → Si JSON invalide : erreur renvoyee au LLM comme tool result
          │     → Le LLM peut corriger et re-appeler l'outil
          │
          ├── Si c'est un ReadTool (search_nodes, read_node_detail, etc.)
          │     → Execute immediatement via GraphDataSource
          │     → Ajoute le resultat a l'historique (role: "tool")
          │     → Continue la boucle
          │
          └── Si c'est un WriteTool (propose_create_node, etc.)
                → Parse + valide avec Zod .strict()
                → Sauvegarde l'etat (pendingInterrupt)
                → return AgentInterrupt ← ARRET, attente validation

  Si rounds epuises → appel final sans outils → return reponse texte
```

**Distinction Read vs Write :**
- **ReadTools** : executes automatiquement, le resultat est renvoye au LLM
- **WriteTools** : l'execution est **interrompue**, le client recoit un `AgentInterrupt` avec la `ProposedAction` a valider

### Etape 5 — Resume apres validation (HITL)

Quand le client envoie `POST /api/ai/resume { threadId, approved: true/false }` :

```
resumeConversation(approved, feedback?) :
  0. Invalide le cache RAG (clearCache()) — le graph a pu changer apres l'action HITL
  1. Recupere l'etat sauvegarde (pendingInterrupt)
  2. Construit un message tool result :
     approved → { status: "approved", message: "Action executee" }
     rejected → { status: "rejected", message: "Action refusee" }
  3. Ajoute a l'historique (role: "tool")
  4. Traite les tool_calls restants du meme batch
     (si le LLM avait envoye plusieurs tools en parallele)
     → Chaque propose_* restant declenche un nouvel interrupt
  5. Relance runToolLoop() pour continuer la conversation
```

---

## Securite

### Prevention injection AQL

Toutes les requetes dans `arangoDataSource.ts` utilisent **exclusivement** le template
literal `aql` d'arangojs qui produit des bind variables automatiques. Aucune concatenation
de string dans les requetes AQL.

### Isolation multi-tenant

- `getGraph()` filtre par `g.workspace == ${this.workspace}` — un graph d'un autre workspace est invisible
- `getNodeConfigs()` filtre par `c.workspace == ${this.workspace}`
- Les nodes/edges n'ont pas de champ `workspace` en BDD — l'isolation passe par le graph qui est verifie en premier par le retriever (`retrieve()` → `getGraph()` → throw si null)
- `requestAI.ts` cree le `ArangoGraphDataSource(workspace)` a partir du JWT de l'utilisateur

### Validation des entrees

- **Request bodies** : 3 schemas Zod `.strict()` dans `requestAI.ts` (`ChatBodySchema`, `ResumeBodySchema`, `ThreadsBodySchema`). Les cles inattendues sont rejetees.
- **WriteTools schemas** : 3 schemas Zod `.strict()` (`ProposeCreateNodeSchema`, `ProposeCreateEdgeSchema`, `ProposeDeleteNodeSchema`). Les cles hallucinées par le LLM sont rejetees.
- **ReadTools schemas** : validation Zod standard (sans `.strict()` car lecture seule, pas de risque de mutation)

### Robustesse JSON

`aiAgent.ts` wrappe les deux appels `JSON.parse(tc.function.arguments)` (lignes ~151 et ~246)
dans un try/catch. Si le LLM renvoie du JSON malformed, l'erreur est injectee comme
`tool result` dans l'historique et le LLM peut corriger. L'agent ne crashe plus.

---

## Configuration

### Variables d'environnement

| Variable | Description | Defaut |
|----------|-------------|--------|
| `DEEPSEEK_API_KEY` | Cle API DeepSeek | — |
| `OPENAI_API_KEY` | Cle API OpenAI (chat + embedding) | — |
| `ANTHROPIC_API_KEY` | Cle API Anthropic | — |
| `EMBEDDING_MODEL` | Modele d'embedding OpenAI | `text-embedding-3-small` |
| `AI_DEBUG` | Active le debug logging (`true` ou `1`) | `false` |

### Provider Registry (`config/providerRegistry.ts`)

Source unique de verite pour tous les providers LLM. Ajouter un nouveau provider (ex: Alibaba Qwen) = 1 entree :

```typescript
qwen: {
    type: "openai-compatible",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    apiKeyEnvVar: "QWEN_API_KEY",
    supportsEmbedding: true,
    pricing: { inputPerMillion: 0.80, inputCacheHitPerMillion: 0.20, outputPerMillion: 2.00 },
},
```

### Config unifiee (`config/aiConfig.ts`)

`getAIConfig()` retourne un `ResolvedAIConfig` avec :
- `chatProvider` / `chatApiKey` / `chatModel` — provider LLM detecte ou override
- `embeddingProvider` / `embeddingApiKey` / `embeddingModel` — provider embedding
- `debug` — flag active par `AI_DEBUG=true`

### Debug mode

Quand `AI_DEBUG=true`, `debugAI()` emet des logs structurés a chaque etape :

| Event | Fichier | Donnees |
|-------|---------|---------|
| `agent_chat_start` | `aiAgent.ts` | graphKey, messageLength |
| `rag_retrieve` | `graphRAGRetriever.ts` | graphKey, query, nodeCount, cacheHit |
| `rag_embedding` | `graphRAGRetriever.ts` | queryLength, dim |
| `llm_call_start` / `llm_call_done` | providers | provider, model, tokens |
| `tool_execute` / `tool_result` | `aiAgent.ts` | toolName, resultLen |
| `hitl_interrupt` | `aiAgent.ts` | toolName, actionType |
| `ws_chat` / `ws_resume` | `wsAIController.ts` | threadId |

---

## Fichiers source

### `types.ts` — Types partages

**Interfaces de contexte RAG :**

| Interface | Description |
|-----------|-------------|
| `GraphRAGContext` | Contexte complet envoye au LLM : graph metadata, nodes pertinents, edges, configs |
| `RelevantNode` | Node condense : _key, type, typeName, sheet, sheetName, process (tronque), handles, dataSummary |
| `RelevantEdge` | Edge condensee : source, sourceHandle, target, targetHandle, label |
| `NodeTypeConfigSummary` | Config condensee : _key, displayName, description, category, icon, handlesSummary |
| `HandleSummary` | Resume d'un groupe de handles : side + points[] |

**Interfaces d'actions HITL :**

| Type | Description |
|------|-------------|
| `ProposedAction` | Union discriminee : create_node, delete_node, update_node, create_edge, delete_edge, move_node, batch |
| `CreateNodePayload` | typeKey, sheet, posX, posY, data? |
| `CreateEdgePayload` | sourceKey, sourceHandle, targetKey, targetHandle, sheet, label? |

**Interfaces de streaming :**

| Interface | Description |
|-----------|-------------|
| `LLMStreamChunk` | Chunk unitaire du stream LLM (token, tool_call_start, tool_call_done, usage, done) |
| `StreamCallbacks` | 5 callbacks pour le streaming (onToken, onToolStart, onToolResult, onComplete, onError) |

**Interfaces de donnees :**

| Interface | Description |
|-----------|-------------|
| `GraphDataSource` | Interface abstraite, 7 methodes (getGraph, getNodes, getEdges, getNodeByKey, getNodeConfigs, searchNodes(+queryEmbedding?), getNeighborhood) |
| `MutableGraphDataSource` | Etend GraphDataSource avec 4 methodes de mutation (createNode, deleteNode, createEdge, deleteEdge) |
| `AIChatMessage` | Message generique (role, content, toolCallId?, toolCalls?) |
| `AIToolCall` | Appel d'outil (id, name, arguments) |
| `AIToolDefinition` | Definition d'outil (name, description, parameters) |

### `utils.ts` — Helpers partages

Fonctions utilitaires extraites pour eviter la duplication entre `graphRAGRetriever.ts` et `readTools.ts` :

- **`truncate(str, maxLen)`** — Tronque une string, ajoute "..." si depassement
- **`summarizeHandles(handles)`** — Convertit les handles bruts en `HandleSummary[]` compact
- **`createNodeEmbeddingText(node)`** — Construit un texte semantique a partir d'un node pour la generation d'embedding (concatene `type`, `process`, `data`). Tronque a 8000 caracteres. Utilise par le write-path (auto-save) et le script de migration.
- **`hasNodeContentChanged(original, current)`** — Compare deux versions d'un node et retourne `true` uniquement si le contenu semantique a change (`type`, `process`, `data`, `handles`). Ignore les changements de position (`posX`, `posY`) et de taille (`size`). Utilise par le write-path pour eviter de regenerer un embedding lors d'un simple deplacement.

### `graphRAGRetriever.ts` — Moteur RAG

Classe `GraphRAGRetriever` :

```typescript
constructor(dataSource: GraphDataSource, options?: GraphRAGOptions, embeddingProvider?: EmbeddingProvider | null)
retrieve(graphKey: string, query: string): Promise<GraphRAGContext>
clearCache(graphKey?: string): void
getCacheSize(): number
```

**Cache TTL :** Le retriever dispose d'un cache en memoire (`Map`) avec TTL configurable (`cacheTTLMs`, defaut 2 min). Les resultats du pipeline RAG sont mis en cache par cle `{graphKey}:{query}`. `clearCache()` vide tout le cache ou uniquement les entrees d'un graph donne. `cacheTTLMs: 0` desactive le cache. Le cache est invalide dans `AIAgent.resumeConversation()` et `resumeConversationStream()` apres chaque action HITL (le graph a change).

**Pipeline interne :**
1. **Cache check** : si le cache contient une entree valide pour `{graphKey}:{query}`, retourne directement
2. **Embedding** (optionnel) : si `embeddingProvider` est fourni et la query non vide, genere l'embedding vectoriel de la query (`generateEmbedding(query)` → `number[]`). En cas d'erreur, continue sans embedding (fallback tokens).
3. **Search** : `searchNodes(graphKey, query, maxNodes, queryEmbedding?)` — passe l'embedding si disponible
4. **Expand neighbors** → **fetch nodes** → **filter edges** → **collect configs** → **assemble**
5. **Cache store** : stocke le resultat dans le cache

Methodes privees :
- `nodeToRelevant()` — tronque process/data, resout le nom du sheet et du type
- `edgeToRelevant()` — extrait source/target/handles/label
- `configToSummary()` — condense un NodeTypeConfig (handles formattees comme `R:out(any), L:in(string)`)

Utilise `truncate()` et `summarizeHandles()` de `utils.ts`.

### `arangoDataSource.ts` — Implementation ArangoDB

Classe `ArangoGraphDataSource` implements `GraphDataSource`.
Constructeur prend le `workspace` pour l'isolation multi-tenant.

| Methode | Requete AQL |
|---------|-------------|
| `getGraph` | `FOR g IN nodius_graphs FILTER g._key == @key AND g.workspace == @ws` |
| `getNodes` | `FOR n IN nodius_nodes FILTER n.graphKey == @gk [AND n.sheet == @s]` |
| `getEdges` | `FOR e IN nodius_edges FILTER e.graphKey == @gk [AND e.sheet == @s]` |
| `getNodeByKey` | `FOR n IN nodius_nodes FILTER n._key == @compositeKey` (compose: `{graphKey}-{nodeKey}`) |
| `getNodeConfigs` | `FOR c IN nodius_node_config FILTER c.workspace == @ws` |
| `searchNodes` | **Vectoriel** (si `queryEmbedding` fourni) : `COSINE_SIMILARITY(n.embedding, @queryEmbedding)` score > 0.3, tri DESC. **Fallback tokens** : concatene champs texte + config, tokenise, score par CONTAINS |
| `getNeighborhood` | AQL graph traversal `FOR v, e IN 1..@depth ANY/INBOUND/OUTBOUND @startId nodius_edges` avec BFS + uniqueVertices |

**Recherche vectorielle (`searchNodes`)** :
- Si `queryEmbedding` est fourni (non vide), tente d'abord une recherche par `COSINE_SIMILARITY` sur le champ `n.embedding` des documents ArangoDB
- Filtre `n.embedding != null` (les nodes sans embedding sont ignores)
- Seuil de similarite : `score > 0.3`
- Si aucun resultat vectoriel ou erreur → fallback vers la recherche par tokens classique
- `ensureVectorIndex(dimension)` : tente de creer un index `inverted` sur le champ `embedding` (silencieux en cas d'echec, `COSINE_SIMILARITY` fonctionne sans index)

**Note ArangoDB :** L'index `type: "vector"` natif n'est disponible que dans ArangoDB Enterprise 3.12+. Pour ArangoDB Community 3.11 (prerequis actuel), `COSINE_SIMILARITY()` fonctionne sans index dedie mais parcourt tous les documents (acceptable pour des graphs de taille petite/moyenne).

**Conversion de cles :** Toutes les methodes convertissent les cles composites ArangoDB (`{graphKey}-{localKey}`) en localKeys via `toLocalNode()` / `toLocalEdge()`, en utilisant `cleanNode()` / `cleanEdge()` de `@nodius/utils`.

**Note arangojs v10 :** `aql` est une fonction template literal (pas un objet), donc pas de `aql.literal()`. La direction de traversal (INBOUND/OUTBOUND/ANY) est geree par 3 requetes separees dans un ternaire.

### `deepseekClient.ts` — Client DeepSeek legacy

Client OpenAI SDK configure avec l'URL DeepSeek. Singleton.
- `initDeepSeekClient(options?)` — Initialise avec API key (env ou options)
- `chatCompletion(messages)` — Completion simple
- `chatCompletionWithTools(messages, tools)` — Completion avec function calling
- Tracking automatique via `TokenTracker`

> **Note :** Ce client est le fallback quand aucun `LLMProvider` n'est fourni a `AIAgent`. En production, `RequestAI` passe toujours un `LLMProvider` via la factory.

### `llmProvider.ts` — Abstraction multi-provider

Interface `LLMProvider` :

```typescript
interface LLMProvider {
    chatCompletion(messages, options?, label?): Promise<LLMResponse>;
    chatCompletionWithTools(messages, tools, options?, label?): Promise<LLMResponse>;
    streamCompletionWithTools(messages, tools, options?): AsyncGenerator<LLMStreamChunk>;
    getModel(): string;
    getProviderName(): string;
}
```

**`LLMResponse`** contient : `message` (role, content, tool_calls?), `usage` (promptTokens, completionTokens, cachedTokens), `model`, `raw`.

**`LLMToolCall`** : `{ id, type: "function", function: { name, arguments } }` — format OpenAI.

**`LLMStreamChunk`** : Union discriminee par `type` :

| type | Champs | Description |
|------|--------|-------------|
| `token` | `token: string` | Fragment de texte |
| `tool_call_start` | `toolCall: { id, name, arguments }` | Debut d'un appel d'outil |
| `tool_call_done` | `toolCall: { id, name, arguments }` | Fin d'un appel (arguments complets) |
| `usage` | `usage: { promptTokens, completionTokens, totalTokens }` | Stats de tokens (dernier chunk) |
| `done` | — | Fin du stream |

Implementations :
- **`OpenAICompatibleProvider`** — Fonctionne pour DeepSeek ET OpenAI (meme SDK `openai`, `baseURL` differente). Tracking automatique via `TokenTracker`. Streaming via `client.chat.completions.create({ stream: true, stream_options: { include_usage: true } })` avec accumulation des fragments de tool_calls par index.
- **`AnthropicProvider`** — Implementation complete via `@anthropic-ai/sdk`. Gere les differences de format Anthropic : system prompt en parametre racine, content blocks `tool_use`/`tool_result`, `max_tokens` obligatoire (4096 par defaut). Streaming via `client.messages.stream()` avec mapping evenements `content_block_start`/`content_block_delta`/`content_block_stop` vers `LLMStreamChunk`. Trois fonctions de conversion exportees : `convertMessagesToAnthropic()`, `convertToolsToAnthropic()`, `convertAnthropicResponse()`.

**Details de l'accumulation des tool_calls en streaming (OpenAI) :**
Les arguments des tool_calls arrivent fragmentes par l'API OpenAI (petits morceaux de JSON).
Le provider maintient une `Map<index, { id, name, args }>`, concatene les fragments au fur et a mesure,
emet `tool_call_start` au premier fragment (quand `id` et `name` sont connus),
puis `tool_call_done` a la fin du stream avec les arguments JSON complets.

**Details du streaming Anthropic :**
L'API Anthropic utilise un format d'evenements different. Le `AnthropicProvider` utilise `client.messages.stream()` qui retourne un `MessageStream` iterable. Mapping :

| Evenement Anthropic | → LLMStreamChunk |
|---------------------|-------------------|
| `content_block_start` (type: `tool_use`) | `tool_call_start` (id, name) |
| `content_block_delta` (type: `text_delta`) | `token` (delta.text) |
| `content_block_delta` (type: `input_json_delta`) | Accumule `partial_json` dans Map |
| `content_block_stop` (si tool_use) | `tool_call_done` (id, name, JSON complet) |
| `stream.finalMessage()` (apres iteration) | `usage` (promptTokens, completionTokens) |

**Fonctions de conversion Anthropic (exportees pour les tests) :**

- **`convertMessagesToAnthropic(messages)`** → `{ system, messages }` — Extrait les system messages dans un parametre racine separe (concatenes par `\n\n`). Convertit les `tool_calls` OpenAI en content blocks `tool_use`. Convertit les `role: "tool"` en messages `role: "user"` avec blocks `tool_result`. Fusionne les tool results consecutifs dans un seul message user (critique pour le format Anthropic qui interdit les messages `user` consecutifs).

- **`convertToolsToAnthropic(tools)`** → `Anthropic.Tool[]` — Mappe `function.name/description/parameters` vers `name/description/input_schema`.

- **`convertAnthropicResponse(response)`** → `LLMResponse` — Extrait le texte des blocks `type: "text"`, les tool_calls des blocks `type: "tool_use"` (avec `JSON.stringify(input)`), et l'usage (`input_tokens` → `promptTokens`, `output_tokens` → `completionTokens`, `cache_read_input_tokens` → `cachedTokens`).

**Points d'attention Anthropic :**
- `max_tokens` est **obligatoire** (defaut 4096, configurable via `options.maxTokens`)
- `system` doit etre `undefined` si vide (pas une string vide)
- `tools` ne doit pas etre passe si le tableau est vide
- `JSON.parse(arguments)` dans la conversion → try/catch avec fallback `{}`

**Configs providers** (`PROVIDER_CONFIGS`) :

| Provider | baseURL | Model par defaut | Prix input/M |
|----------|---------|-----------------|-------------|
| deepseek | api.deepseek.com | deepseek-chat | $0.28 |
| openai | api.openai.com/v1 | gpt-4o | $2.50 |
| openai-mini | api.openai.com/v1 | gpt-4o-mini | $0.15 |
| anthropic | api.anthropic.com | claude-sonnet-4-20250514 | $3.00 |

### `llmProviderFactory.ts` — Factory + auto-detection

- `createLLMProvider({ provider, apiKey, model? })` — Cree un provider par nom
- `detectLLMProvider()` — Auto-detecte via env vars. Priorite : `DEEPSEEK_API_KEY` > `OPENAI_API_KEY` > `ANTHROPIC_API_KEY`
- `getProviderPricing(providerName)` — Retourne les prix pour un provider

### `embeddingProvider.ts` — Embeddings vectoriels

Interface `EmbeddingProvider` separee du `LLMProvider` (DeepSeek n'offre pas d'API embeddings) :

```typescript
interface EmbeddingProvider {
    generateEmbedding(text: string): Promise<number[]>;
    getDimension(): number;
    getModelName(): string;
}
```

**Implementation : `OpenAIEmbeddingProvider`** — utilise le SDK `openai` (meme que `llmProvider.ts`).
Appelle `client.embeddings.create({ model, input: text })` et enregistre l'usage via `getTokenTracker().recordEmbedding()`.

**Modeles supportes** (`EMBEDDING_MODELS`) :

| Modele | Dimension | Prix / 1M tokens |
|--------|-----------|-------------------|
| `text-embedding-3-small` | 1536 | $0.02 |
| `text-embedding-3-large` | 3072 | $0.13 |
| `text-embedding-ada-002` | 1536 | $0.10 |

**Factory : `detectEmbeddingProvider()`** — auto-detecte via `OPENAI_API_KEY`. Modele configurable via `EMBEDDING_MODEL` env var (defaut: `text-embedding-3-small`). Retourne `null` si pas de cle API → le systeme utilise la recherche par tokens.

**Injection :** Le provider est detecte au demarrage dans `WsAIController` et `RequestAI`, puis transmis a `AIAgent` → `GraphRAGRetriever` → `searchNodes(queryEmbedding)`.

---

## Write-Path des Embeddings

### Vue d'ensemble

Le write-path assure que les nodes en base ArangoDB contiennent un champ `embedding` (vecteur `number[]`) a jour, utilise par la recherche vectorielle du read-path.

```
Node cree/modifie
       │
       ▼
WebSocketManager.saveGraphChanges()  ← auto-save toutes les 30s
       │
       ├── Sauvegarde classique (nodes, edges) → ArangoDB
       │
       └── [fire-and-forget] generateNodeEmbeddings()
              │
              ├── hasNodeContentChanged(original, current)?
              │     → false (position/taille seule) → skip
              │     → true (type, process, data, handles) → continue
              │
              ├── createNodeEmbeddingText(node) → texte semantique
              │
              ├── EmbeddingProvider.generateEmbedding(text) → number[]
              │
              └── collection.update(arangoKey, { embedding }) → ArangoDB
```

### `webSocketManager.ts` — Integration write-path

**Changements :**
- Import de `createNodeEmbeddingText`, `hasNodeContentChanged` (depuis `ai/utils.ts`) et `detectEmbeddingProvider` (depuis `ai/embeddingProvider.ts`)
- Nouveau champ `private embeddingProvider: EmbeddingProvider | null` — detecte au constructeur
- Apres la sauvegarde classique dans `saveGraphChanges()`, les nodes crees (`nodesToCreate`) et les nodes dont le contenu a change (`nodesToUpdate` filtres par `hasNodeContentChanged`) sont passes a `generateNodeEmbeddings()` en fire-and-forget (`.catch()`)
- Nouvelle methode privee `generateNodeEmbeddings(nodes, graphKey, collection, provider)` — itere les nodes, genere embedding via `createNodeEmbeddingText` + `provider.generateEmbedding()`, et `collection.update(arangoKey, { embedding })`. Chaque node est protege par try/catch individuel.

**Garanties de securite :**
- L'appel d'embedding ne bloque jamais l'auto-save classique (fire-and-forget avec `.catch()`)
- Un echec d'embedding sur un node n'affecte pas les autres (try/catch par node)
- Les nodes simplement deplaces (posX/posY) ou redimensionnes (size) ne declenchent pas de re-embedding
- Si aucun `EmbeddingProvider` n'est configure (`OPENAI_API_KEY` absent), tout le write-path est ignore

### `src/cli/ai-embed-nodes.ts` — Script de migration CLI

Script d'administration pour generer les embeddings des nodes existants en base.

**Usage :**
```bash
# Embed uniquement les nodes sans embedding existant
npm run ai:embed-nodes

# Force re-embed tous les nodes
npm run ai:embed-nodes -- --force

# Configuration personnalisee
npm run ai:embed-nodes -- arangodb=http://localhost:8529 arangodb_name=nodius batch=50 delay=200
```

**Parametres :**
| Parametre | Defaut | Description |
|-----------|--------|-------------|
| `--force` | — | Re-genere les embeddings meme pour les nodes qui en ont deja |
| `arangodb` | `http://127.0.0.1:8529` | URL ArangoDB |
| `arangodb_name` | `nodius` | Nom de la base |
| `arangodb_user` | `root` | Utilisateur ArangoDB |
| `arangodb_pass` | `azerty` | Mot de passe ArangoDB |
| `batch` | `100` | Nombre de nodes par batch |
| `delay` | `100` | Delai en ms entre chaque appel API (rate limiting) |

**Fonctionnement :**
1. Detecte le provider d'embedding via `detectEmbeddingProvider()` (necessite `OPENAI_API_KEY`)
2. Requete AQL : filtre `doc.embedding == null` (ou tous si `--force`)
3. Pour chaque node : `createNodeEmbeddingText()` → `generateEmbedding()` → `collection.update()`
4. Rate limiting : `delay` ms entre chaque appel API
5. Rapport final : nodes traites, embeddes, ignores (texte vide), echoues

**Prerequis :** `OPENAI_API_KEY` dans l'environnement.

### `tokenTracker.ts` — Suivi des couts

```
record(usage) → cout =
  (tokens_non_caches × prix_input) + (tokens_caches × prix_cache) + (tokens_output × prix_output)

recordEmbedding(inputTokens, model, pricingPerMillion) → cout =
  (inputTokens / 1M) × pricingPerMillion
```

- Pricing multi-provider (DeepSeek, OpenAI, OpenAI-mini, Anthropic)
- `recordEmbedding()` : enregistre l'usage embedding (tokens d'entree uniquement, `completionTokens=0`, `cachedTokens=0`). Utilise par `OpenAIEmbeddingProvider`.
- Limites : `maxTokensPerCall`, `maxTotalTokens`, `maxCostUSD` — avec callback `onLimitExceeded`
- `TokenLimitError` thrown si `checkCallLimit()` depasse
- Singleton : `getTokenTracker()` / `initTokenTracker(pricing?, limits?)`
- `formatSummary()` pour affichage lisible, `formatEntry()` pour une ligne compacte

### `prompts/systemPrompt.ts` — Prompt systeme + contexte TOON

Deux fonctions :
- **`buildSystemPrompt(context, role)`** — Prompt complet en francais avec contexte, regles, types
- **`buildContextSummary(context)`** — Encode les nodes/edges pertinents en format TOON tabulaire via `@toon-format/toon`. Chaque node est reduit a 4 colonnes (`_key, type, sheet, process`), chaque edge a 3 colonnes (`from, to, label`).

### `tools/readTools.ts` — 7 outils de lecture

Executes automatiquement par l'AIAgent, resultats renvoyes au LLM.

| Outil | Schema Zod | Description |
|-------|-----------|-------------|
| `read_graph_overview` | `{ graphKey }` | Metadata du graph + stats par sheet (nombre nodes/edges) |
| `search_nodes` | `{ query, sheetId?, maxResults? }` | Recherche textuelle par nom/type/contenu |
| `explore_neighborhood` | `{ nodeKey, maxDepth?, direction? }` | BFS autour d'un node (1-3 profondeur) |
| `read_node_detail` | `{ nodeKey }` | Detail complet : type, process, data, handles, position |
| `read_node_config` | `{ typeKey }` | Definition d'un type custom : displayName, handles, category |
| `list_available_node_types` | `{}` | 4 built-in + tous les custom du workspace |
| `list_node_edges` | `{ nodeKey, direction? }` | Edges inbound/outbound/any d'un node |

**Architecture :**
- `getReadToolDefinitions()` → retourne les 7 outils au format OpenAI function calling
- `createReadToolExecutor(dataSource, graphKey)` → retourne une closure `executeReadTool(toolName, args) → string`
- Chaque outil tronque les champs longs (process, data) pour economiser les tokens
- Utilise `truncate()` et `summarizeHandles()` de `utils.ts`

### `tools/writeTools.ts` — 3 outils d'ecriture (HITL)

**Ces outils ne s'executent PAS.** Quand le LLM les appelle, l'AIAgent interrompt la boucle
et retourne un `AgentInterrupt` au client pour validation humaine.

| Outil | Schema Zod (`.strict()`) | ProposedAction |
|-------|-----------|----------------|
| `propose_create_node` | `{ typeKey, sheet, posX, posY, process?, handles?, data?, reason }` | `{ type: "create_node", payload: CreateNodePayload }` |
| `propose_create_edge` | `{ sourceKey, sourceHandle, targetKey, targetHandle, sheet, label?, reason }` | `{ type: "create_edge", payload: CreateEdgePayload }` |
| `propose_delete_node` | `{ nodeKey, reason }` | `{ type: "delete_node", payload: { nodeKey } }` |

Helpers :
- `getWriteToolDefinitions()` → 3 outils au format OpenAI function calling
- `isWriteTool(name)` → `true` si le nom commence par `propose_`
- `parseProposedAction(toolName, args)` → parse + valide Zod `.strict()` → retourne `ProposedAction`

> Les schemas utilisent `.strict()` pour rejeter toute cle inattendue hallucinee par le LLM.
> Les outils write ne sont injectes que si `role === "editor"` ou `"admin"`. Un viewer n'a que les read tools.

### `aiAgent.ts` — L'orchestrateur

Classe `AIAgent` — gere le pipeline RAG + tool-calling + HITL.

**Options (`AIAgentOptions`) :**

| Option | Type | Description |
|--------|------|-------------|
| `graphKey` | `string` | Graph cible |
| `dataSource` | `GraphDataSource` | Source de donnees |
| `role` | `"viewer" \| "editor" \| "admin"` | Role de l'utilisateur (defaut: `"editor"`) |
| `maxToolRounds` | `number` | Nombre max de rounds d'outils (defaut: 5) |
| `llmProvider` | `LLMProvider?` | Provider LLM (fallback deepseekClient) |
| `embeddingProvider` | `EmbeddingProvider \| null` | Provider d'embeddings (defaut: `null`, recherche par tokens) |

L'`embeddingProvider` est transmis au `GraphRAGRetriever` dans le constructeur.

**Methodes publiques — mode classique (HTTP) :**

| Methode | Description |
|---------|-------------|
| `chat(userMessage)` | Envoie un message → RAG → prompt → tool loop → `AgentResult` |
| `resumeConversation(approved, resultMessage?)` | Reprend apres HITL → injecte le resultat → continue la boucle |
| `hasPendingInterrupt()` | `true` si une ProposedAction attend validation |
| `reset()` | Efface l'historique et l'interrupt |
| `getConversationHistory()` | Retourne l'historique serialisable (pour persistence) |
| `loadConversationHistory(history)` | Charge un historique precedemment sauvegarde |
| `getPendingInterrupt()` | Retourne l'etat de l'interrupt en attente (ou null) |
| `loadPendingInterrupt(interrupt)` | Restaure un etat d'interrupt sauvegarde |

**Methodes publiques — mode streaming (WebSocket) :**

| Methode | Description |
|---------|-------------|
| `chatStream(userMessage, callbacks)` | Streaming token-par-token via `StreamCallbacks` |
| `resumeConversationStream(approved, callbacks, feedback?)` | Reprend apres HITL en mode streaming |

**`StreamCallbacks`** — interface de callbacks pour le streaming :

| Callback | Description |
|----------|-------------|
| `onToken(token)` | Fragment de texte emis par le LLM |
| `onToolStart(toolCallId, toolName)` | Debut d'un appel d'outil |
| `onToolResult(toolCallId, result)` | Resultat d'un outil execute |
| `onComplete(fullText)` | Fin du streaming (texte complet accumule) |
| `onError(error)` | Erreur survenue pendant le streaming |

**Pipeline streaming interne :**

```
chatStream(userMessage, callbacks) :
  1. Retrieve context via GraphRAG
  2. Build system prompt (1er message)
  3. Inject RAG context
  4. runStreamToolLoop(callbacks) :
     │
     └─ Boucle (max rounds) :
          │
          ├── streamOneLLMCall(tools, callbacks)
          │     → AsyncGenerator de LLMStreamChunk
          │     → yield tokens via callbacks.onToken()
          │     → Accumule tool_calls fragmentes
          │     → Retourne { text, toolCalls, usage }
          │
          ├── Si pas de tool_calls → onComplete(text) → fin
          │
          └── Pour chaque tool call :
                ├── propose_* → pendingInterrupt → onComplete(interrupt JSON) → fin
                └── read tool → onToolStart + execute → onToolResult → continue
```

**Types de retour (`AgentResult`, mode classique)** :
- `AgentResponse` : `{ type: "message", message, toolCalls[], context? }`
- `AgentInterrupt` : `{ type: "interrupt", proposedAction, toolCall, message, toolCalls[], context? }`

**Etat interne :**
- `conversationHistory` — messages OpenAI accumules (system, user, assistant, tool)
- `pendingInterrupt` — etat sauvegarde quand un write tool est detecte (toolCallId, args, context, remaining tool calls)
- Le system prompt n'est injecte qu'au premier message
- Le contexte RAG est mis en cache par le `GraphRAGRetriever` (TTL 2 min). Le cache est invalide dans `resumeConversation()` et `resumeConversationStream()` apres chaque action HITL

**Robustesse :** Les appels `JSON.parse(tc.function.arguments)` sont proteges par try/catch
(mode classique ET streaming). En cas de JSON malformed du LLM, une erreur structuree est
renvoyee comme tool result pour permettre au LLM de corriger son appel.

---

## Couche serveur — Endpoints REST

### `request/requestAI.ts` — Handler HTTP

Enregistre dans `server.ts` via `RequestAI.init(app)`.

**Validation des requetes :** Chaque endpoint valide son body via un schema Zod `.strict()` :

| Schema | Champs | Utilise par |
|--------|--------|-------------|
| `ChatBodySchema` | `graphKey: string, message: string, threadId?: string` | POST /api/ai/chat |
| `ResumeBodySchema` | `threadId: string, approved: boolean, feedback?: string` | POST /api/ai/resume |
| `ThreadsBodySchema` | `graphKey: string` | POST /api/ai/threads |

**Endpoints :**

| Methode | URL | Description |
|---------|-----|-------------|
| POST | `/api/ai/chat` | Envoie un message. Cree un thread si `threadId` absent. |
| POST | `/api/ai/resume` | Approuve/refuse une ProposedAction. |
| POST | `/api/ai/threads` | Liste les threads d'un graph (tries par date). |
| DELETE | `/api/ai/thread/:threadId` | Supprime un thread. |

**Gestion des threads (avec thread roaming) :**
- Stockage via `ThreadStore` (cache memoire + persistence ArangoDB `nodius_ai_threads`)
- `threadStore.init()` est appele au demarrage (fire-and-forget, le cache fonctionne immediatement)
- Chaque thread contient un `AIAgent` avec son historique de conversation
- Un thread est lie a un `graphKey` + `workspace` + `userId`
- Securite : verification que le thread appartient au bon graph/workspace
- Persistence apres chaque `chat()` et `resume()` via `threadStore.save(threadId)`
- Le LLM provider est auto-detecte au demarrage via `detectLLMProvider()`
- Le embedding provider est auto-detecte au demarrage via `detectEmbeddingProvider()` et transmis a chaque `AIAgent`
- **Thread roaming** : recherche 3-tiers (cache → `threadStore.loadThread()` depuis ArangoDB → creation). Quand un thread existe dans la DB mais pas dans le cache (cree sur un autre serveur du cluster), il est reconstruit avec un nouvel `AIAgent` + `MemoryAwareDataSource`
- Helper `createDataSource(workspace)` : cree un `MemoryAwareDataSource` avec le `webSocketManager` comme memory provider (import dynamique)

**Format de reponse :**

```typescript
// Reponse texte
{ threadId, type: "message", message: "...", toolCalls: [...] }

// Proposition en attente de validation
{ threadId, type: "interrupt", message: "...", proposedAction: {...}, toolCall: {...}, toolCalls: [...] }
```

### `threadStore.ts` — Store de threads avec persistence ArangoDB

Classe `ThreadStore` partagee entre les endpoints HTTP et le controlleur WebSocket.
Maintient un cache en memoire (Map) pour les acces rapides, et persiste dans la collection ArangoDB `nodius_ai_threads`.

**Types :**
- **`AIThread`** — Interface runtime : `{ threadId, graphKey, workspace, userId, agent: AIAgent, createdTime, lastUpdatedTime }`
- **`AIThreadDocument`** — Document ArangoDB : `{ _key, graphKey, workspace, userId, conversationHistory: object[], pendingInterrupt, createdTime, lastUpdatedTime }`

**Methodes publiques :**

| Methode | Description |
|---------|-------------|
| `init()` | Cree la collection ArangoDB si absente. Mode memoire-seule si pas de DB. |
| `generateThreadId()` | Genere un ID unique `ai_{timestamp}_{counter}` |
| `has(threadId)` | Verifie la presence dans le cache |
| `get(threadId)` | Cache-first, retourne `AIThread` ou `null` |
| `getDocument(threadId)` | Retourne le document brut ArangoDB (sans agent) |
| `loadThread(threadId, dataSource, llmProvider, role?, embeddingProvider?)` | **Thread roaming** : charge un thread depuis ArangoDB, reconstruit un `AIAgent` avec les dependances fournies (y compris embedding provider), restaure `conversationHistory` et `pendingInterrupt`, met en cache |
| `set(thread)` | Met en cache + persiste en DB |
| `save(threadId)` | Persiste un thread deja en cache vers la DB |
| `delete(threadId)` | Supprime du cache et de la DB |
| `listByGraph(graphKey, workspace)` | Liste combinee cache + DB, triee par date |
| `values()` | Iterateur sur les threads en cache |

**Singleton :** `export const threadStore = new ThreadStore()` — initialise une fois au demarrage via `threadStore.init()`.

**Flux de persistence :**
- `set()` : ecrit dans le cache ET upsert en DB (extraction de `conversationHistory` et `pendingInterrupt` depuis l'agent)
- `save()` : persiste un thread deja en cache (apres chat/resume completion)
- `get()` : cache-first. Si absent du cache et present en DB, retourne `null` (l'agent doit etre reconstruit par le caller via `loadThread`)
- `loadThread()` : cache-first → DB fallback → reconstruit un `AIAgent` (avec `llmProvider`, `embeddingProvider`, `loadConversationHistory()` + `loadPendingInterrupt()`) → met en cache. Utilise pour le **thread roaming** (thread cree sur un autre serveur du cluster)
- Mode gracieux : si la DB est indisponible, le store fonctionne en memoire seule sans erreur

---

## Couche WebSocket — Streaming AI

### `wsAIController.ts` — Controlleur WebSocket

Classe `WsAIController` deleguee par le `WebSocketManager` pour tous les messages `ai:*`.
Auto-detecte le `LLMProvider` et l'`EmbeddingProvider` au constructeur. Log le statut des providers au demarrage.
Initialise le `ThreadStore` via `init(memoryProvider?)` (lazy, au premier message `ai:*`).
Persiste les conversations apres chaque `chatStream()` et `resumeConversationStream()` via `threadStore.save()`.

**Fonctionnalites :**
- **JWT auth** : chaque message `ai:*` peut contenir un `token` JWT. Le controlleur valide via `AuthManager.getProvider().validateToken()` et extrait `workspace`, `role`, `userId`. Si pas de token, fallback au workspace passe par le WebSocketManager.
- **Thread roaming** : recherche 3-tiers (cache → `threadStore.loadThread()` → creation). Quand un thread existe dans la DB mais pas dans le cache, il est reconstruit avec un nouvel `AIAgent` + `MemoryAwareDataSource`.
- **MemoryAwareDataSource** : `createDataSource(workspace)` cree une source qui lit l'etat en memoire du `WebSocketManager` (via `memoryProvider`) avant de fallback sur ArangoDB.

**Integration avec `webSocketManager.ts` :**
1. `this.aiController = new WsAIController();` — constructeur dans WebSocketManager
2. `this.aiController.init(this).catch(...)` — passe le WebSocketManager comme `MemoryGraphProvider`
3. `else if (this.aiController.canHandle(jsonData.type)) { await this.aiController.handle(ws, jsonData, workspace); }`

**Messages entrants (client → serveur) :**

| Type | Schema Zod (`.strict()`) | Description |
|------|--------------------------|-------------|
| `ai:chat` | `{ type, _id: number, graphKey, message, threadId?, token? }` | Nouvelle conversation streaming |
| `ai:resume` | `{ type, _id: number, threadId, approved: boolean, feedback?, token? }` | Reprendre apres HITL |
| `ai:interrupt` | `{ type, _id: number, threadId, token? }` | Interrompre le streaming en cours |

> **`token`** : JWT optionnel. Si present, le controlleur valide le token via `AuthManager` et extrait le workspace/role/userId de l'utilisateur. Sinon, fallback sur le workspace par defaut.

**Messages sortants (serveur → client) :**

| Type | Champs | Description |
|------|--------|-------------|
| `ai:token` | `_id, token` | Fragment de texte |
| `ai:tool_start` | `_id, toolCallId, toolName` | Debut d'execution d'un outil |
| `ai:tool_result` | `_id, toolCallId, result` | Resultat d'un outil |
| `ai:complete` | `_id, threadId, fullText` | Fin du streaming |
| `ai:error` | `_id, error, code?, retryable?` | Erreur classifiee (voir errorClassifier) |

**Flux complet :**

```
Client                          Serveur (WsAIController)
  │                                │
  │─── ai:chat { _id, graphKey, ──▶│
  │        message }               │
  │                                ├── Validation Zod
  │                                ├── Find/create thread (threadStore)
  │                                ├── AIAgent.chatStream(message, callbacks)
  │◀── ai:token { _id, token } ───┤     │
  │◀── ai:token { _id, token } ───┤     ├── stream tokens
  │◀── ai:tool_start { _id, ... }─┤     ├── tool detected
  │◀── ai:tool_result { _id, ... }┤     ├── tool executed
  │◀── ai:token { _id, token } ───┤     ├── continue streaming
  │◀── ai:complete { _id, ... } ──┤     └── done
  │                                │
  │─── ai:interrupt { _id, ... } ─▶│── AbortController.abort()
```

**Gestion de l'interruption :**
- Chaque session de streaming est associee a un `AbortController` stocke dans `activeSessions` (Map par `_id`)
- Quand `ai:interrupt` est recu, l'`AbortController` est avorte
- Les callbacks verifient `signal.aborted` avant chaque `ws.send()`
- La session est nettoyee dans le `finally` block

**Abort on disconnect (economie de tokens) :**
- `wsSessions: Map<WebSocket, Set<number>>` — mapping inverse WS → session IDs actifs
- `onClientDisconnect(ws)` — appele par `webSocketManager.ts` dans `ws.on('close')`
- Abort toutes les sessions actives du client, arrete les streams LLM cote SDK
- Le `signal: AbortSignal` est passe dans les `StreamCallbacks` → `aiAgent.streamOneLLMCall()` → `LLMProvider.streamCompletionWithTools({ signal })`
- Les SDK OpenAI et Anthropic supportent l'option `{ signal }` pour annuler les requetes HTTP en vol

**Classification des erreurs (errorClassifier.ts) :**
- `classifyLLMError(err)` → `ClassifiedError { userMessage, code, retryable, statusCode, provider }`
- Codes : `rate_limit` (429), `server_error` (500-503), `auth_error` (401/403), `timeout`, `network`, `content_filter`, `context_length`, `internal`
- Messages user-friendly en francais, envoyes dans `ai:error`
- Le client recoit `code` et `retryable` pour afficher un bouton "Reessayer" si pertinent

---

## Robustesse & Observabilite

### `errorClassifier.ts` — Classification des erreurs LLM

Classifie les erreurs des SDK LLM (OpenAI, Anthropic, DeepSeek) en categories structurees.

**`classifyLLMError(err: unknown): ClassifiedError`**

| Code | Condition | Retryable | Message |
|------|-----------|-----------|---------|
| `rate_limit` | status 429, `too many requests` | oui | "Le service IA est temporairement surchargé..." |
| `server_error` | status 500-503 | oui | "Le service IA est temporairement indisponible..." |
| `auth_error` | status 401/403, `invalid api key` | non | "Erreur d'authentification..." |
| `timeout` | `ETIMEDOUT`, `timed out` | oui | "La requête IA a expiré..." |
| `network` | `ECONNREFUSED`, `ENOTFOUND` | oui | "Impossible de contacter le service IA..." |
| `content_filter` | `content filter`, `flagged` | non | "Le message a été filtré..." |
| `context_length` | `maximum context length` | non | "La conversation est trop longue..." |
| `internal` | tout le reste | non | "Une erreur inattendue..." |

Detection automatique du provider (`openai`, `anthropic`, `deepseek`) et extraction du status HTTP depuis les objets d'erreur des SDK.

### `aiLogger.ts` — Logger structuré AI

Emettre des log entries JSON sur stderr, prets pour ingestion par Sentry/Datadog ou tout aggregateur JSON lines.

**Sink pluggable :**
```typescript
setAILogSink((entry: AILogEntry) => {
    sentry.captureMessage(entry.event, { extra: entry });
});
```

**Events emis :**

| Fonction | Event | Level | Contexte |
|----------|-------|-------|----------|
| `logLLMError()` | `llm_error` | error | provider, model, statusCode, sessionId, threadId |
| `logMalformedJSON()` | `malformed_json` | warn | raw (tronque a 500 chars), corrected, context (tool name) |
| `logClientDisconnect()` | `client_disconnect_abort` | warn | sessionId, threadId, tokensStreamed |
| `logTokenUsage()` | `token_usage` | info | provider, model, promptTokens, completionTokens, cachedTokens |

**Points d'integration :**
- `wsAIController.ts` → `handleStreamError()` appelle `logLLMError()`
- `wsAIController.ts` → `onClientDisconnect()` appelle `logClientDisconnect()`
- `aiAgent.ts` → catch JSON.parse appelle `logMalformedJSON()` (3 sites)
- `llmProvider.ts` → `convertMessagesToAnthropic()` catch appelle `logMalformedJSON()`

---

## MemoryAwareDataSource — Source de donnees hybride

### `memoryAwareDataSource.ts` — Memoire-first, fallback ArangoDB

Wraps `ArangoGraphDataSource` avec un overlay en memoire depuis le `WebSocketManager`.
Quand un graph est activement gere en memoire (des utilisateurs sont connectes), lit depuis les `nodeMap`/`edgeMap` en direct qui contiennent les modifications non sauvegardees.
Fallback vers ArangoDB quand le graph n'est pas en memoire.

**Probleme resolu :** L'auto-save du `WebSocketManager` persiste les changements toutes les 30 secondes. Pendant ce gap, ArangoDB est en retard. L'IA doit voir l'etat exact courant.

**Interface `MemoryGraphProvider` :**

```typescript
interface MemoryGraphProvider {
    getManagedGraphSheets(graphKey: string): Record<string, {
        nodeMap: Map<string, Node<any>>;
        edgeMap: Map<string, Edge[]>;
    }> | undefined;
}
```

Le `WebSocketManager` implemente cette interface directement via sa methode `getManagedGraphSheets()`.

**Logique par methode :**

| Methode | Memoire | ArangoDB |
|---------|---------|----------|
| `getGraph()` | — | Toujours DB (metadata non modifiee en memoire) |
| `getNodeConfigs()` | — | Toujours DB |
| `getNodes(graphKey, sheetId?)` | Itere `nodeMap` de chaque sheet | Fallback si graph pas en memoire |
| `getEdges(graphKey, sheetId?)` | Itere `edgeMap` avec deduplication par `_key` | Fallback |
| `getNodeByKey(graphKey, nodeKey)` | Cherche dans tous les sheets | Fallback |
| `searchNodes(graphKey, query, maxResults, queryEmbedding?)` | En memoire : recherche par tokens (pas d'embedding). Fallback ArangoDB : passe `queryEmbedding` pour recherche vectorielle | Fallback avec embedding |
| `getNeighborhood(graphKey, nodeKey)` | BFS en memoire | Fallback |

**Deduplication des edges :** L'`edgeMap` du `WebSocketManager` stocke chaque edge sous deux cles (`"source-{nodeId}"` et `"target-{nodeId}"`). Le `MemoryAwareDataSource` deduplique via un `Set<string>` par `_key`.

---

## ActionConverter — ProposedAction → Mutations Nodius

### `actionConverter.ts` — Convertisseur pur/synchrone

Transforme les `ProposedAction` du HITL en commandes de mutation pour le pipeline de sync Nodius.
L'IA ne execute JAMAIS les mutations elle-meme.

**Fonction principale :**

```typescript
convertAction(action: ProposedAction, graphKey: string, defaultSheetId?: string): ActionConversionResult
```

**Type de retour (`ActionConversionResult`) :**

| Champ | Type | Description |
|-------|------|-------------|
| `instructions` | `GraphInstructions[]` | Instructions de modification de champs (move, update) |
| `nodesToCreate` | `Node<unknown>[]` | Nodes complets a creer |
| `edgesToCreate` | `Edge[]` | Edges complets a creer |
| `nodeKeysToDelete` | `string[]` | Cles de nodes a supprimer |
| `edgeKeysToDelete` | `string[]` | Cles d'edges a supprimer |
| `sheetId` | `string` | SheetId concerne (pour WSBatch*) |

**Conversion par type :**

| ProposedAction | Resultat |
|----------------|----------|
| `move_node` | 2 `GraphInstructions` SET posX/posY avec `animatePos: true` |
| `update_node` | N `GraphInstructions` SET par changement, `triggerHtmlRender: true`. Supporte les chemins nested `data.foo.bar` |
| `create_node` | 1 `Node<unknown>` dans `nodesToCreate` (key generee `ai_{timestamp}_{random}`) |
| `create_edge` | 1 `Edge` dans `edgesToCreate` (key generee) |
| `delete_node` | key dans `nodeKeysToDelete` |
| `delete_edge` | key dans `edgeKeysToDelete` |
| `batch` | Fusion recursive des sous-actions |

**Proprietes :** Pur (pas d'effet de bord), synchrone (pas d'appel reseau), deterministe. Le `defaultSheetId` est utilise pour les actions qui n'ont pas de champ `sheet` (move_node, update_node, delete_node, delete_edge).

---

## useAIChat — Hook React client

### `packages/client/src/hooks/useAIChat.ts`

Hook React pour consommer le streaming AI via un WebSocket dedie (separe du socket de sync `useWebSocket`).

**Pourquoi un socket separe ?** Le `useWebSocket` route les messages par `_id` vers un resolver de promesse one-shot. Le premier `ai:token` consommerait le resolver, et les suivants seraient ignores.

**Interface publique :**

```typescript
interface UseAIChatReturn {
    messages: AIChatMessage[];     // Historique des messages (user + assistant)
    isConnected: boolean;
    isTyping: boolean;             // true pendant le streaming
    sendMessage: (text: string) => void;
    resume: (threadId: string, approved: boolean, feedback?: string) => void;
    stopGeneration: () => void;
    connect: () => void;
    disconnect: () => void;
    threadId: string | null;
}
```

**Gestion des messages entrants :**

| Type WS | Action React |
|---------|--------------|
| `ai:token` | Accumule dans un buffer, flush throttle a ~32ms |
| `ai:tool_start` | Ajoute un `toolCall` au dernier message assistant |
| `ai:tool_result` | Met a jour le `toolCall` correspondant avec le resultat |
| `ai:complete` | Flush final, `isTyping=false`, sauvegarde `threadId`, detecte les interrupts HITL |
| `ai:error` | Flush final, `isTyping=false`, affiche l'erreur. Stocke `errorCode` et `retryable` sur le message pour afficher un bouton Retry si pertinent |

**Throttle tokens :** Les tokens sont accumules dans un `pendingTextRef` et flushes toutes les ~32ms pour eviter les re-renders excessifs React.

**Options :**
- `graphKey` — Graph cible
- `serverInfo` — `api_sync_info` (host, port, secure, path) depuis `ProjectContext`
- `autoConnect` — Connexion automatique au montage (defaut: `false`)
- `token` — JWT token optionnel pour authentifier les messages `ai:*` (depuis `UserContext`)

---

## Composants React (`packages/client/src/component/ai/`)

3 composants React dediees a l'interface de chat AI, suivant les conventions Nodius (`memo`, `useDynamicClass`, `ThemeContext`, `lucide-react`).

### `AIChatInput.tsx`

Champ de saisie avec auto-expansion (textarea) et boutons contextuels.

| Prop | Type | Description |
|------|------|-------------|
| `onSend` | `(text: string) => void` | Envoyer un message |
| `onStop` | `() => void` | Interrompre la generation |
| `isTyping` | `boolean` | Si l'IA est en train de generer |
| `disabled` | `boolean` | Desactive l'input (ex: deconnecte) |

- **Enter** envoie le message, **Shift+Enter** insere un saut de ligne
- Bouton **Send** (idle) / **Stop** (streaming) avec icones `Send` / `Square` de lucide-react
- Textarea auto-resize via `scrollHeight` (max 120px)

### `AIChatPanel.tsx`

Panneau de chat complet integrant `AIChatInput` et `AIInterruptModal`.

| Prop | Type | Description |
|------|------|-------------|
| `messages` | `AIChatMessage[]` | Historique des messages |
| `isTyping` | `boolean` | Indicateur de streaming |
| `isConnected` | `boolean` | Etat de connexion WebSocket |
| `threadId` | `string \| null` | Thread ID courant |
| `onSend` | `(text: string) => void` | Envoyer un message |
| `onStop` | `() => void` | Stop generation |
| `onResume` | `(threadId, approved, feedback?) => void` | Resume HITL |

- Header avec icone Bot, statut connexion (dot vert/gris)
- Liste de messages scrollable avec auto-scroll
- Bulles user (droite, couleur primaire) / assistant (gauche, bordure grise)
- Badges `toolCalls` avec icone Wrench
- Indicateur "AI is thinking..." avec spinner
- Etat vide avec icone Bot placeholder
- Detection automatique du `pendingInterrupt` (dernier message assistant avec `proposedAction`)

### `AIInterruptModal.tsx`

Modal HITL pour approuver/rejeter les actions proposees par l'IA.

| Prop | Type | Description |
|------|------|-------------|
| `proposedAction` | `Record<string, unknown>` | Action proposee |
| `threadId` | `string` | Thread a reprendre |
| `onResume` | `(threadId, approved, feedback?) => void` | Callback decision |
| `onDismiss` | `() => void` | Fermer la modal (optionnel) |

- Overlay fond noir semi-transparent (z-index 100)
- Carte centree avec header (icone AlertTriangle), corps (JSON formate), footer (boutons)
- Bouton **Approve** (vert) / **Reject** (rouge)
- Champ feedback optionnel

---

## Dependances

| Package | Version | Usage |
|---------|---------|-------|
| `openai` | SDK | Client API pour DeepSeek, OpenAI (chat + embeddings) |
| `@anthropic-ai/sdk` | SDK | Client API pour Anthropic Claude (chat + tools + streaming) |
| `zod` | v4 | Validation des schemas (tools + request bodies) |
| `arangojs` | v10 | Driver ArangoDB (template `aql` pour bind variables) |
| `@toon-format/toon` | 2.1.0 | Encodage TOON tabulaire du contexte RAG |

**Notes Zod v4 :**
- `z.record(z.unknown())` est cassé — utiliser `z.record(z.string(), z.unknown())`
- `z.any().optional()` est cassé — utiliser des schemas types explicites

**Notes arangojs v10 :**
- `aql` est une fonction template literal, pas un objet — pas de `aql.literal()`
- La direction de traversal graph doit etre branchee en dur dans des requetes separees

---

## Tests unitaires (248 tests)

Commande : `cd packages/server && npx vitest run`

| Fichier | Tests | Description |
|---------|-------|-------------|
| `utils.test.ts` | 25 | `createNodeEmbeddingText` (type, process, data, truncation, cas vides), `hasNodeContentChanged` (position-only, size-only, type/process/data/handles changes), `truncate`, `summarizeHandles` |
| `tokenTracker.test.ts` | 24 | Calcul de cout, tokens caches, `recordEmbedding()`, limites, callbacks, singleton, reset, formatting |
| `systemPrompt.test.ts` | 8 | Prompt contient le graph/sheets/configs, viewer vs editor, TOON format nodes/edges |
| `readTools.test.ts` | 20 | 7 outils avec MockGraphDataSource, filtrage, erreurs, validation Zod |
| `graphRAGRetriever.test.ts` | 20 | Recherche, expansion BFS, maxNodes/maxDepth, fallback, noms de sheets, **embedding provider** (mock, null, failing, empty query), **cache TTL** (hit, miss, expiration, clearCache, selective clear, disable) |
| `llmProvider.test.ts` | 28 | Factory (4 providers), baseURLs, pricing (Anthropic), **convertMessagesToAnthropic** (system extraction, tool_calls → content blocks, tool results merge, null content), **convertToolsToAnthropic** (format, no description), **convertAnthropicResponse** (text, tool_use, mixed, cached tokens) |
| `embeddingProvider.test.ts` | 12 | Modeles (dimensions, prix), OpenAIEmbeddingProvider (constructeur, accesseurs, modele inconnu), `detectEmbeddingProvider()` (null, valid, env vars) |
| `aiAgent.test.ts` | 33 | Mock LLM, reponse directe, outils read, outils write + HITL interrupt/resume, maxToolRounds, system prompt 1er message, historique, reset, JSON malformed graceful, viewer vs editor, **embeddingProvider** (avec/sans), **chatStream** (4 tests) |
| `writeTools.test.ts` | 17 | 3 outils, schemas Zod strict (create node/edge, delete node, handles, data), parseProposedAction, isWriteTool |
| `actionConverter.test.ts` | 12 | 7 types d'action (move, update, create node/edge, delete node/edge, batch), chemins data.* nested, purete, sheetId par defaut vs explicite |
| `errorClassifier.test.ts` | 17 | Classification 429/502/503/401/timeout/ECONNREFUSED/content_filter/context_length, detection provider, extraction status code, fallback, non-Error input |
| `aiLogger.test.ts` | 11 | `logLLMError`, `logMalformedJSON` (truncation), `logClientDisconnect`, `logTokenUsage`, `setAILogSink`/`resetAILogSink`, **`debugAI`** (enabled/disabled/no-data) |
| `config/providerRegistry.test.ts` | 12 | Registry entries, `getProviderPricing` (deepseek, anthropic, unknown fallback), `detectAvailableProvider`, `detectEmbeddingCapableProvider` |
| `config/aiConfig.test.ts` | 9 | `resolveAIConfig` (no keys, deepseek, openai, overrides, debug flag), `getAIConfig` singleton, `resetAIConfig` |

---

## Mock data (`test-ai/mock-data.ts`)

Un workflow NBA complet avec **9 nodes** et **6 edges** :

```
entry-form ──(entryType)──▶ root ──▶ fetch-api ──(success)──▶ filter-active ──▶ display-html ──▶ return
                                         │
                                         └──(error)──▶ error-handler

(sheet "data-processing": sort-stats, disconnected-note)
```

- `MockGraphDataSource` implements `MutableGraphDataSource` (read + write)
- Recherche par scoring de tokens (tokenise query, match sur _key/type/process/data/config)
- BFS pour le voisinage (parcours en largeur avec direction)
- Mutations : `createNode`, `deleteNode`, `createEdge`, `deleteEdge` (en memoire)
- `disconnected-note` : node isole pour tester les cas limites
- 4 `NodeTypeConfig` custom : api-call, filter, transform, log-node

---

## Outils d'introspection

4 scripts CLI pour voir exactement ce que l'IA "voit" et fait :

```bash
# Voir le contexte RAG complet pour une query
npx tsx packages/server/test-ai/introspect/dump-context.ts "NBA stats"

# Voir tous les outils avec exemples executes
npx tsx packages/server/test-ai/introspect/dump-tools.ts

# Voir le prompt systeme complet + contexte TOON + estimation tokens
npx tsx packages/server/test-ai/introspect/dump-prompt.ts "Que fait le fetch-api?"

# Tester le streaming AI via WebSocket (necessite un serveur local)
npx tsx packages/server/test-ai/introspect/test-stream.ts --graph=<key> --message="Decris ce graph"
```

---

## Tests d'integration (API reelle)

Necessitent `DEEPSEEK_API_KEY` ou `OPENAI_API_KEY` dans l'environnement.

```bash
npx tsx packages/server/test-ai/test-provider.ts      # Test provider (chat + tool calling)
npx tsx packages/server/test-ai/test-integration.ts    # 5 tests complets (RAG + tools + LLM)
npx tsx packages/server/test-ai/run-all.ts             # Tous les tests
npx tsx packages/server/test-ai/run-all.ts --introspect # Tous + introspection
```

---

## Arborescence des fichiers

```
packages/server/
├── vitest.config.ts
├── src/
│   ├── ai/
│   │   ├── AI_MODULE.md                   # Cette documentation
│   │   ├── types.ts                       # GraphDataSource, GraphRAGContext, ProposedAction, LLMStreamChunk, StreamCallbacks
│   │   ├── utils.ts                       # Helpers partages (truncate, summarizeHandles, createNodeEmbeddingText, hasNodeContentChanged)
│   │   ├── utils.test.ts                 # 25 tests
│   │   ├── threadStore.ts                 # ThreadStore class (cache memoire + persistence ArangoDB nodius_ai_threads)
│   │   ├── actionConverter.ts             # Convertisseur ProposedAction → GraphInstructions/Node/Edge/Delete
│   │   ├── actionConverter.test.ts        # 12 tests
│   │   ├── graphRAGRetriever.ts           # Moteur RAG (search + BFS + assemble)
│   │   ├── graphRAGRetriever.test.ts      # 20 tests
│   │   ├── arangoDataSource.ts            # Implementation ArangoDB de GraphDataSource
│   │   ├── memoryAwareDataSource.ts       # DataSource hybride (memoire WebSocketManager + fallback ArangoDB)
│   │   ├── aiAgent.ts                     # Orchestrateur (RAG + prompt + tool loop + HITL + streaming)
│   │   ├── aiAgent.test.ts               # 33 tests (mock LLM, HITL, JSON errors, chatStream, embeddingProvider)
│   │   ├── wsAIController.ts             # Controlleur WebSocket AI (ai:* messages, streaming, abort-on-disconnect)
│   │   ├── errorClassifier.ts           # Classification erreurs LLM (429/502/timeout/auth → codes + messages user-friendly)
│   │   ├── errorClassifier.test.ts      # 17 tests
│   │   ├── aiLogger.ts                  # Logger structure AI (JSON stderr, pluggable sink, debugAI)
│   │   ├── aiLogger.test.ts             # 11 tests
│   │   ├── tokenTracker.ts               # Suivi tokens/couts (pricing delegue au registre)
│   │   ├── tokenTracker.test.ts           # 24 tests
│   │   ├── llmProvider.ts                 # Re-export shim → providers/
│   │   ├── llmProvider.test.ts            # 28 tests
│   │   ├── llmProviderFactory.ts          # Re-export shim → providers/providerFactory
│   │   ├── embeddingProvider.ts           # Re-export shim → providers/embeddingProvider
│   │   ├── embeddingProvider.test.ts      # 12 tests
│   │   ├── config/
│   │   │   ├── aiConfig.ts               # Configuration unifiee (AIConfig, getAIConfig, AI_DEBUG)
│   │   │   ├── aiConfig.test.ts          # 9 tests
│   │   │   ├── providerRegistry.ts       # Registre unique des providers (PROVIDER_REGISTRY, pricing, detection)
│   │   │   └── providerRegistry.test.ts  # 12 tests
│   │   ├── providers/
│   │   │   ├── llmProvider.ts            # Interface LLMProvider + types (LLMResponse, LLMToolCall)
│   │   │   ├── openaiProvider.ts         # OpenAICompatibleProvider (DeepSeek, OpenAI, etc.)
│   │   │   ├── anthropicProvider.ts      # AnthropicProvider + conversion helpers
│   │   │   ├── embeddingProvider.ts      # EmbeddingProvider interface + OpenAIEmbeddingProvider
│   │   │   └── providerFactory.ts        # Factory basee sur le registre (createLLMProviderFromConfig, etc.)
│   │   ├── prompts/
│   │   │   ├── systemPrompt.ts            # Prompt systeme + contexte RAG TOON
│   │   │   └── systemPrompt.test.ts       # 8 tests
│   │   └── tools/
│   │       ├── readTools.ts               # 7 outils read-only + executor
│   │       ├── readTools.test.ts          # 20 tests
│   │       ├── writeTools.ts              # 3 outils propose_* (HITL) + schemas Zod strict
│   │       └── writeTools.test.ts         # 17 tests
│   ├── cli/
│   │   └── ai-embed-nodes.ts              # Script migration : genere embeddings pour les nodes existants (--force, batch, delay)
│   ├── cluster/
│   │   └── webSocketManager.ts            # Delegation ai:* → WsAIController + write-path embeddings + abort-on-disconnect
│   └── request/
│       └── requestAI.ts                   # REST endpoints /api/ai/* + validation Zod (imports ThreadStore)
├── ../client/src/hooks/
│   └── useAIChat.ts                       # Hook React : WebSocket AI dedie, throttle tokens, HITL resume, JWT token
├── ../client/src/component/ai/
│   ├── AIChatInput.tsx                    # Textarea auto-resize + Send/Stop boutons
│   ├── AIChatPanel.tsx                    # Panneau de chat complet (messages, scroll, typing, HITL)
│   └── AIInterruptModal.tsx               # Modal HITL approve/reject avec feedback
└── test-ai/
    ├── mock-data.ts                       # 9 nodes, 6 edges, 4 configs, MockGraphDataSource
    ├── run-all.ts                         # Runner global (--introspect)
    ├── test-deepseek.ts                   # Test connexion DeepSeek
    ├── test-tools.ts                      # Test tool calling
    ├── test-rag.ts                        # Test pipeline RAG
    ├── test-provider.ts                   # Test multi-provider (API reelle)
    ├── test-integration.ts                # 5 tests integration (API reelle)
    └── introspect/
        ├── dump-context.ts                # Dump contexte RAG
        ├── dump-tools.ts                  # Dump definitions d'outils
        ├── dump-prompt.ts                 # Dump prompt systeme + tokens
        └── test-stream.ts                # Test streaming AI via WebSocket (CLI interactif)
```

---

## Etat d'avancement

### Fait
- [x] Pipeline RAG complet (search + BFS + truncate + assemble)
- [x] 7 outils de lecture avec validation Zod
- [x] 3 outils d'ecriture HITL (propose_create_node/edge, propose_delete_node) avec schemas `.strict()`
- [x] AIAgent avec boucle tool-calling et mecanisme interrupt/resume
- [x] Gestion robuste du JSON malformed (try/catch + error feedback au LLM)
- [x] Abstraction multi-provider LLM (DeepSeek, OpenAI, Anthropic)
- [x] Suivi tokens/couts avec limites
- [x] Source de donnees ArangoDB (arangoDataSource.ts)
- [x] Endpoints REST (/api/ai/chat, /resume, /threads, /thread/:id) avec validation Zod
- [x] Encodage TOON du contexte RAG (-13% tokens sur le contexte)
- [x] Helpers partages extraits dans utils.ts (DRY)
- [x] WebSocket streaming (token-par-token via `ai:*` messages, WsAIController, AbortController)
- [x] `streamCompletionWithTools` async generator dans LLMProvider (accumulation tool_call fragments)
- [x] `chatStream` / `resumeConversationStream` dans AIAgent (streaming tool loop)
- [x] Thread store partage entre REST et WebSocket (threadStore.ts)
- [x] Script d'introspection streaming (test-stream.ts)
- [x] **ActionConverter** — Convertisseur ProposedAction → GraphInstructions/Node/Edge/Delete (actionConverter.ts, 12 tests)
- [x] **Persistance ArangoDB des threads** — ThreadStore class (cache memoire + collection `nodius_ai_threads`, persistence apres chat/resume)
- [x] **useAIChat hook** — Hook React client avec WebSocket dedie, throttle tokens ~32ms, gestion HITL interrupt
- [x] **Accesseurs AIAgent** — `getConversationHistory()`, `loadConversationHistory()`, `getPendingInterrupt()`, `loadPendingInterrupt()` pour serialisation
- [x] 248 tests unitaires, 5 tests integration
- [x] Outils d'introspection CLI
- [x] **MemoryAwareDataSource** — Source de donnees hybride (memoire WebSocketManager + fallback ArangoDB), deduplication edges
- [x] **Thread roaming** — `loadThread()` reconstruit un AIAgent depuis ArangoDB quand le thread n'est pas en cache local (3-tier : cache → DB → create)
- [x] **Authentification JWT** — Token optionnel dans les messages `ai:*`, valide via `AuthManager.getProvider().validateToken()`
- [x] **Composants React AI** — `AIChatPanel`, `AIChatInput`, `AIInterruptModal` (useDynamicClass, memo, ThemeContext)
- [x] **EmbeddingProvider** — Interface separee du LLM, implementation OpenAI (text-embedding-3-small/large/ada-002), detection auto via `OPENAI_API_KEY`
- [x] **Recherche vectorielle** — `COSINE_SIMILARITY` dans ArangoDataSource, fallback gracieux sur tokens, `recordEmbedding()` dans TokenTracker
- [x] **Write-path embeddings** — Generation automatique des embeddings lors de l'auto-save dans `webSocketManager.ts` (fire-and-forget, try/catch, skip position-only). Helpers `createNodeEmbeddingText()` et `hasNodeContentChanged()` dans `utils.ts`.
- [x] **Script migration `ai:embed-nodes`** — CLI pour embedder les nodes existants (`src/cli/ai-embed-nodes.ts`, `--force`, rate limiting, batch)
- [x] **AnthropicProvider** — Implementation complete (chat + tools + streaming) via `@anthropic-ai/sdk`, fonctions de conversion messages/tools/reponse, support cache tokens
- [x] **Cache TTL GraphRAG** — Cache en memoire avec TTL configurable (defaut 2 min), invalidation automatique dans `resumeConversation()` et `resumeConversationStream()` apres actions HITL
- [x] **Abort on disconnect** — `onClientDisconnect(ws)` dans `WsAIController`, mapping inverse `wsSessions`, propagation `AbortSignal` aux SDK LLM (OpenAI + Anthropic `{ signal }`)
- [x] **Classification erreurs LLM** — `errorClassifier.ts` : 429 → rate_limit (retryable), 502/503 → server_error (retryable), 401/403 → auth_error, timeout, network, content_filter, context_length. Messages user-friendly en francais. Champs `code` + `retryable` dans `ai:error`.
- [x] **Observabilite structuree** — `aiLogger.ts` : JSON lines sur stderr, sink pluggable (`setAILogSink`). Events : `llm_error`, `malformed_json`, `client_disconnect_abort`, `token_usage`. Integration dans `wsAIController`, `aiAgent`, `llmProvider`.
- [x] **Provider Registry** — `config/providerRegistry.ts` : source unique de verite pour tous les providers (type, baseURL, model, pricing, apiKeyEnvVar, supportsEmbedding). Ajouter un provider = 1 ligne dans `PROVIDER_REGISTRY`.
- [x] **Configuration unifiee** — `config/aiConfig.ts` : `getAIConfig()` resout chat/embedding providers, API keys, modeles, et debug flag depuis env vars ou overrides. Singleton avec `resetAIConfig()` pour tests.
- [x] **Debug mode** — `AI_DEBUG=true` active `debugAI()` dans `aiLogger.ts`. Trace chaque etape : `agent_chat_start`, `rag_retrieve`, `rag_embedding`, `llm_call_start/done`, `tool_execute/result`, `hitl_interrupt`, `ws_chat/resume`.
- [x] **Suppression deepseekClient.ts** — `llmProvider` est maintenant required dans `AIAgentOptions`. Plus de fallback legacy.
- [x] **Split providers/** — `llmProvider.ts` monolithique (617 lignes) eclate en `providers/llmProvider.ts` (types), `openaiProvider.ts`, `anthropicProvider.ts`, `embeddingProvider.ts`, `providerFactory.ts`. Les anciens fichiers sont des re-export shims.

### A faire
- [ ] Supprimer les re-export shims (`llmProvider.ts`, `llmProviderFactory.ts`, `embeddingProvider.ts`) quand tous les consommateurs externes sont migres
