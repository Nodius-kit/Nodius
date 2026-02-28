# Flux complet : "Je pose une question sur mon graph"

Ce document detaille **chaque etape**, **chaque fichier**, et **chaque transformation de donnees** qui se produit lorsqu'un utilisateur tape une question dans le chat AI et recoit une reponse.

---

## Vue d'ensemble du flux

```
[1] Navigateur (React)
      │
      │  useAIChat.sendMessage("Que fait le node fetch-api ?")
      │
      ▼
[2] WebSocket (message JSON)    ──────────────────────────────────────
      │
      │  { type: "ai:chat", _id: 1, graphKey: "g1", message: "...", threadId?, token? }
      │
      ▼
[3] WebSocketManager            ── packages/server/src/cluster/webSocketManager.ts
      │
      │  Detecte "ai:" → delegue a WsAIController
      │
      ▼
[4] WsAIController.handleChat() ── packages/server/src/ai/wsAIController.ts
      │
      ├── [4a] Authentification JWT
      ├── [4b] Resolution du thread (cache → DB → creation)
      ├── [4c] Creation AIAgent si nouveau thread
      │
      ▼
[5] AIAgent.chatStream()        ── packages/server/src/ai/aiAgent.ts
      │
      ├── [5a] GraphRAGRetriever.retrieve()  ── graphRAGRetriever.ts
      │         ├── Cache check (TTL 2 min)
      │         ├── Embedding de la query (optionnel)
      │         ├── searchNodes() → MemoryAwareDataSource → memoire ou ArangoDB
      │         ├── Expansion BFS du voisinage
      │         ├── Collecte nodes, edges, configs
      │         └── Assemblage du GraphRAGContext
      │
      ├── [5b] buildSystemPrompt(context, role)  ── prompts/systemPrompt.ts
      │
      ├── [5c] buildContextSummary(context)      ── prompts/systemPrompt.ts (encodage TOON)
      │
      ▼
[6] Boucle de streaming (runStreamToolLoop)
      │
      ├── [6a] LLMProvider.streamCompletionWithTools()
      │         ├── OpenAICompatibleProvider (DeepSeek / OpenAI)
      │         └── AnthropicProvider (Claude) ← conversion messages/tools
      │
      ├── [6b] Streaming tokens → callbacks.onToken() → WS "ai:token"
      │
      ├── [6c] Si tool_calls detectes :
      │         ├── ReadTool → execution immediate → resultat injecte → reboucle
      │         └── WriteTool → HITL interrupt → arret
      │
      └── [6d] Pas de tool_calls → reponse finale → callbacks.onComplete()
      │
      ▼
[7] Retour au navigateur
      │
      ├── ai:token (fragments de texte, accumules ~32ms)
      ├── ai:tool_start / ai:tool_result (si outils appeles)
      ├── ai:complete { threadId, fullText }
      │
      ▼
[8] Persistence
      └── threadStore.save() → ArangoDB collection nodius_ai_threads
```

---

## Etape 1 — Cote client : l'utilisateur envoie un message

**Fichier :** `packages/client/src/hooks/useAIChat.ts`

L'utilisateur tape dans le composant `AIChatInput` et appuie sur Entree. Le hook `useAIChat` gere l'envoi :

```
sendMessage("Que fait le node fetch-api ?")
```

**Ce qui se passe :**

1. **Ajout local immediat** de 2 messages dans le state React :
   - Un message `role: "user"` avec le texte saisi
   - Un message `role: "assistant"` vide avec `isStreaming: true` (placeholder pour le streaming)

2. **Passage en mode "typing"** : `isTyping = true`, le spinner s'affiche

3. **Envoi du message WebSocket** au serveur :
   ```json
   {
     "type": "ai:chat",
     "_id": 1,
     "graphKey": "nba-workflow",
     "message": "Que fait le node fetch-api ?",
     "threadId": "ai_1709123456_1",
     "token": "eyJhbGciOi..."
   }
   ```
   - `_id` : identifiant incremental de la requete (pour correleler les reponses)
   - `threadId` : si c'est un message de suivi dans une conversation existante (sinon absent)
   - `token` : JWT pour l'authentification (optionnel)

**Note :** Le hook utilise un **WebSocket dedie**, separe du socket de synchronisation (`useWebSocket`). Raison : le socket de sync route les messages par `_id` vers un resolver one-shot, incompatible avec le multi-message streaming.

---

## Etape 2 — Transit WebSocket

Le message JSON transite via le WebSocket sur le port 8426, chemin `/ws`. C'est le meme serveur HTTP que l'API REST, le WebSocket est monte dessus.

---

## Etape 3 — WebSocketManager : routage

**Fichier :** `packages/server/src/cluster/webSocketManager.ts` (ligne ~1728)

Le `WebSocketManager` recoit tous les messages WebSocket. Il inspecte le champ `type` :

```typescript
} else if (this.aiController.canHandle(jsonData.type)) {
    await this.aiController.handle(ws, jsonData, "default");
    return;
}
```

`canHandle("ai:chat")` retourne `true` car le type commence par `"ai:"`. Le message est delegue au `WsAIController`.

---

## Etape 4 — WsAIController : authentification + thread

**Fichier :** `packages/server/src/ai/wsAIController.ts`

### 4a. Validation du message

Le message est valide par un schema **Zod strict** :

```typescript
const AIChatSchema = z.object({
    type: z.literal("ai:chat"),
    _id: z.number(),
    graphKey: z.string().min(1),
    message: z.string().min(1),
    threadId: z.string().optional(),
    token: z.string().optional(),
}).strict();
```

Si la validation echoue, un `ai:error` est renvoye et le traitement s'arrete.

### 4b. Authentification JWT

```typescript
auth = await this.authenticateToken(token, workspace);
```

- **Si `token` present** : valide via `AuthManager.getProvider().validateToken(token)`, extrait `workspace`, `role` (viewer/editor/admin), `userId`
- **Si pas de token** : fallback `{ workspace: "default", role: "editor", userId: "ws-user" }`

### 4c. Resolution du thread

Le controleur cherche ou cree le thread de conversation :

```
1. threadId fourni ?
   ├── OUI → threadStore.get(threadId) — cherche dans le cache memoire
   │         ├── Trouve → utilise ce thread
   │         └── Pas trouve → threadStore.loadThread(threadId, ...) — cherche en ArangoDB
   │                          (thread roaming : le thread a pu etre cree sur un autre serveur du cluster)
   │                          ├── Trouve → reconstruit un AIAgent, restaure l'historique, met en cache
   │                          └── Pas trouve → cree un nouveau thread
   └── NON → cree un nouveau thread
```

**Creation d'un nouveau thread :**

```typescript
const agent = new AIAgent({
    graphKey: "nba-workflow",
    dataSource: new MemoryAwareDataSource(workspace, this.memoryProvider),
    role: "editor",
    llmProvider: this.llmProvider,        // detecte au demarrage (DeepSeek/OpenAI/Anthropic)
    embeddingProvider: this.embeddingProvider, // detecte au demarrage (OpenAI embeddings ou null)
});
```

**`MemoryAwareDataSource`** (`memoryAwareDataSource.ts`) est un wrapper hybride :
- Si le graph est activement gere en memoire par le `WebSocketManager` (des utilisateurs sont connectes) → lit depuis les `nodeMap`/`edgeMap` en direct (etat le plus recent, meme non sauvegarde)
- Sinon → fallback vers ArangoDB

Cela resout le **gap de 30 secondes** de l'auto-save : l'IA voit toujours l'etat exact du graph, pas l'etat ArangoDB potentiellement en retard.

### 4d. Lancement du streaming

```typescript
const abort = new AbortController();
this.activeSessions.set(_id, abort);

const callbacks = this.buildCallbacks(ws, _id, thread.threadId, abort.signal);
await thread.agent.chatStream(message, callbacks);
```

Les `callbacks` sont 5 fonctions qui transforment les evenements internes en messages WebSocket :

| Callback | → Message WS |
|----------|--------------|
| `onToken(token)` | `{ type: "ai:token", _id, token }` |
| `onToolStart(id, name)` | `{ type: "ai:tool_start", _id, toolCallId, toolName }` |
| `onToolResult(id, result)` | `{ type: "ai:tool_result", _id, toolCallId, result }` |
| `onComplete(fullText)` | `{ type: "ai:complete", _id, threadId, fullText }` |
| `onError(error)` | `{ type: "ai:error", _id, error }` |

Chaque callback verifie `signal.aborted` avant d'envoyer — si l'utilisateur a clique "Stop", les messages restants sont ignores.

---

## Etape 5 — AIAgent : pipeline RAG + construction du prompt

**Fichier :** `packages/server/src/ai/aiAgent.ts`

`chatStream(userMessage, callbacks)` execute les etapes suivantes :

### 5a. GraphRAG Retrieval

**Fichier :** `packages/server/src/ai/graphRAGRetriever.ts`

```typescript
const context = await this.retriever.retrieve(this.graphKey, userMessage);
```

Le `GraphRAGRetriever` construit un sous-ensemble pertinent du graph en 7 etapes :

**Etape 0 — Cache check :**
```
Cle de cache : "nba-workflow:Que fait le node fetch-api ?"
Si une entree existe et a moins de 2 minutes → retour immediat (pas d'appel DB/embedding)
```

**Etape 1 — Generation de l'embedding de la query (optionnel) :**
```
Si EmbeddingProvider est configure (OPENAI_API_KEY present) :
  → Appel API OpenAI : text-embedding-3-small("Que fait le node fetch-api ?")
  → Retourne un vecteur de 1536 dimensions
Si pas de provider ou erreur → continue sans embedding (fallback tokens)
```

**Etape 2 — Recherche de nodes :**
```
MemoryAwareDataSource.searchNodes("nba-workflow", "Que fait le node fetch-api ?", 20, queryEmbedding?)
```

Deux strategies selon que l'embedding est disponible :

| Strategie | Quand | Comment |
|-----------|-------|---------|
| **Vectorielle** | `queryEmbedding` fourni | `COSINE_SIMILARITY(n.embedding, queryEmbedding)` en ArangoDB, score > 0.3, tri DESC |
| **Tokens** | Pas d'embedding ou en memoire | Tokenise la query ("que", "fait", "node", "fetch", "api"), score chaque node sur ses champs texte (_key, type, process, data, config.displayName, config.description) |

Si aucun resultat → fallback : prend tous les nodes (max 20).

**Etape 3 — Expansion du voisinage (BFS) :**
```
Pour les 5 meilleurs nodes trouves :
  → BFS profondeur 2, direction ANY
  → Collecte les nodes et edges voisins
  → Ex: fetch-api → trouve root, filter-active, error-handler + les edges entre eux
```

**Etape 4 — Fetch de tous les nodes uniques** (max 20)

**Etape 5 — Filtrage des edges** : garde uniquement celles dont source ET target sont dans les nodes trouves

**Etape 6 — Collecte des NodeTypeConfigs** : recupere les definitions des types utilises (api-call, filter, etc.)

**Etape 7 — Assemblage** :
```
Tronque process a 500 chars, data a 200 chars
Resout les noms de sheets (ID "0" → "main")
→ Retourne un GraphRAGContext :
{
  graph: { _key, name, description, sheets, metadata },
  relevantNodes: [ { _key, type, typeName, sheet, sheetName, process, handles, dataSummary } ],
  relevantEdges: [ { source, sourceHandle, target, targetHandle, label } ],
  nodeTypeConfigs: [ { _key, displayName, description, category, handlesSummary } ]
}
```

**Etape 7bis — Stockage en cache** : le resultat est mis en cache pour 2 minutes.

### 5b. Construction du System Prompt (1er message uniquement)

**Fichier :** `packages/server/src/ai/prompts/systemPrompt.ts`

Si c'est le **premier message** de la conversation (`conversationHistory` vide), un system prompt est genere :

```
buildSystemPrompt(context, "editor") → string (~1500 tokens)
```

Contenu du prompt :
- Identite : "Tu es un assistant IA specialise dans les workflows Nodius"
- Nom du graph, description, sheets disponibles
- Permissions : editor → "Tu peux proposer des modifications"
- 4 types built-in (starter, return, html, entryType) avec leurs handles
- Types custom du workspace (api-call, filter, transform, log-node)
- 7 regles strictes (pas d'AQL, outils obligatoires, etc.)
- Conventions Nodius (localKeys, handles, process/data)

Ce message est ajoute a `conversationHistory` comme `role: "system"`.

### 5c. Injection du contexte RAG (a chaque message)

```
buildContextSummary(context) → string (encodage TOON)
```

Le contexte est encode au format **TOON** (Token-Oriented Object Notation) — format tabulaire compact :

```
NODES PERTINENTS :
[5]{_key,type,sheet,process}:
  fetch-api,api-call (API Call),main,"const response = await fetch('https://...')..."
  filter-active,filter (Filter),main,"const players = incoming[0].data.filter(..."
  root,starter,main,""
  error-handler,log-node (Log Node),main,"console.error(incoming[0].error)..."
  display-html,html,main,""

EDGES PERTINENTES :
[4]{from,to,label}:
  "root:R-0","fetch-api:L-0",""
  "fetch-api:R-0","filter-active:L-0","success"
  "fetch-api:R-1","error-handler:L-0","error"
  "filter-active:R-0","display-html:L-0",""
```

Ce contexte est injecte comme message `role: "system"` avec le prefixe `[Contexte RAG pour cette question]`.

**Gain :** ~13% de reduction de tokens par rapport au format texte classique.

### 5d. Ajout du message utilisateur

```typescript
this.conversationHistory.push({ role: "user", content: "Que fait le node fetch-api ?" });
```

**Etat de conversationHistory a ce point :**
```
[0] role: "system"  → prompt systeme complet (identite, regles, types)
[1] role: "system"  → contexte RAG TOON (nodes, edges pertinents)
[2] role: "user"    → "Que fait le node fetch-api ?"
```

---

## Etape 6 — Boucle de streaming + tool-calling

**Fichier :** `packages/server/src/ai/aiAgent.ts` → `runStreamToolLoop()`

### 6a. Appel au LLM (streaming)

```typescript
const stream = this.llmProvider.streamCompletionWithTools(
    this.conversationHistory,   // les 3 messages ci-dessus
    tools,                      // 7 read tools + 3 write tools (si editor)
);
```

**Selon le provider configure :**

| Provider | SDK | Appel |
|----------|-----|-------|
| DeepSeek / OpenAI | `openai` | `client.chat.completions.create({ stream: true, stream_options: { include_usage: true } })` |
| Anthropic (Claude) | `@anthropic-ai/sdk` | `client.messages.stream({ max_tokens: 4096 })` apres conversion via `convertMessagesToAnthropic()` et `convertToolsToAnthropic()` |

**Pour Anthropic**, les conversions suivantes sont appliquees avant l'appel :
- Les messages `role: "system"` sont extraits et concatenes dans le parametre `system` (racine, pas dans messages)
- Les `tool_calls` OpenAI sont convertis en content blocks `tool_use`
- Les `role: "tool"` sont convertis en messages `role: "user"` avec blocks `tool_result`
- Les outils sont convertis de `{ function: { name, description, parameters } }` vers `{ name, description, input_schema }`

**Les outils transmis** (10 au total pour un `editor`) :

| Outil | Type | Description |
|-------|------|-------------|
| `read_graph_overview` | read | Metadata du graph + stats |
| `search_nodes` | read | Recherche textuelle |
| `explore_neighborhood` | read | BFS autour d'un node |
| `read_node_detail` | read | Detail complet d'un node |
| `read_node_config` | read | Definition d'un type |
| `list_available_node_types` | read | Tous les types disponibles |
| `list_node_edges` | read | Edges d'un node |
| `propose_create_node` | write/HITL | Proposer la creation d'un node |
| `propose_create_edge` | write/HITL | Proposer la creation d'une edge |
| `propose_delete_node` | write/HITL | Proposer la suppression d'un node |

### 6b. Streaming des tokens

Le stream est consomme chunk par chunk dans `streamOneLLMCall()` :

```
Pour chaque chunk du stream :
  ├── type "token"          → callbacks.onToken("Le node") → WS ai:token
  ├── type "tool_call_start"→ callbacks.onToolStart(id, "read_node_detail")
  ├── type "tool_call_done" → accumule le tool call complet
  ├── type "usage"          → enregistre dans TokenTracker
  └── type "done"           → fin du stream
```

Cote client, les tokens sont accumules dans un buffer (`pendingTextRef`) et flushes toutes les **~32ms** pour eviter les re-renders excessifs React.

### 6c. Cas 1 — Le LLM repond directement (pas de tool calls)

Pour une question simple comme "Que fait le node fetch-api ?", le LLM a deja le contexte RAG dans le prompt. Il repond directement :

```
ai:token "Le node "
ai:token "fetch-api "
ai:token "est de type "
ai:token "api-call..."
...
ai:complete { threadId: "ai_1709123456_1", fullText: "Le node fetch-api est de type api-call..." }
```

Le message est ajoute a `conversationHistory` comme `role: "assistant"`.

### 6c. Cas 2 — Le LLM appelle un outil de lecture

Si le LLM decide qu'il a besoin de plus d'informations, il appelle un outil. Exemple :

```
LLM stream → tool_call_start { id: "tc_1", name: "read_node_detail" }
LLM stream → tool_call_done  { id: "tc_1", name: "read_node_detail", arguments: '{"nodeKey":"fetch-api"}' }
```

**Execution automatique** (fichier `tools/readTools.ts`) :

```
1. callbacks.onToolStart("tc_1", "read_node_detail") → WS ai:tool_start
2. executeReadTool("read_node_detail", { nodeKey: "fetch-api" })
   → dataSource.getNodeByKey("nba-workflow", "fetch-api")
   → Retourne le node complet (type, process, data, handles, position)
3. callbacks.onToolResult("tc_1", resultJSON) → WS ai:tool_result
4. Ajoute le resultat a conversationHistory comme role: "tool"
5. → Reboucle : nouvel appel LLM avec le resultat de l'outil dans le contexte
```

La boucle peut tourner **jusqu'a 5 rounds** (configurable via `maxToolRounds`).

### 6c. Cas 3 — Le LLM appelle un outil d'ecriture (HITL)

Si le LLM propose une modification (ex: creation d'un node), la boucle **s'interrompt** :

```
LLM stream → tool_call_done { name: "propose_create_node", arguments: '{"typeKey":"filter",...}' }
```

```
1. Detecte que "propose_create_node" est un WriteTool (commence par "propose_")
2. Parse les arguments avec Zod .strict() → ProposedAction
3. Sauvegarde l'etat dans pendingInterrupt
4. callbacks.onComplete(JSON.stringify({ type: "interrupt", proposedAction, toolCall }))
5. → ARRET de la boucle
```

Le client recoit un `ai:complete` avec un JSON `interrupt` → affiche le modal `AIInterruptModal` pour approbation.

---

## Etape 7 — Retour au navigateur

**Fichier :** `packages/client/src/hooks/useAIChat.ts` → `handleMessage()`

Les messages WebSocket sont recus et traites dans le switch du handler :

| Message recu | Action React |
|--------------|-------------|
| `ai:token { token: "Le " }` | `pendingTextRef += "Le "` → flush apres 32ms → met a jour le dernier message assistant |
| `ai:tool_start { toolCallId, toolName }` | Ajoute un badge `toolCall` au dernier message assistant |
| `ai:tool_result { toolCallId, result }` | Met a jour le `toolCall` avec le resultat |
| `ai:complete { threadId, fullText }` | Flush final des tokens, `isStreaming = false`, `isTyping = false`, sauvegarde `threadId` |
| `ai:error { error }` | Affiche l'erreur, `isTyping = false` |

**Detection HITL :** A la reception de `ai:complete`, le hook tente de parser `fullText` comme JSON. S'il contient `{ type: "interrupt", proposedAction }`, le champ `proposedAction` est attache au message assistant → le composant `AIChatPanel` detecte le `proposedAction` et affiche le modal `AIInterruptModal`.

---

## Etape 8 — Persistence

**Fichier :** `packages/server/src/ai/threadStore.ts`

Apres la completion du streaming (dans `wsAIController.ts`) :

```typescript
await threadStore.save(thread.threadId);
```

Le thread est persiste dans la collection ArangoDB `nodius_ai_threads` :

```json
{
  "_key": "ai_1709123456_1",
  "graphKey": "nba-workflow",
  "workspace": "default",
  "userId": "admin",
  "conversationHistory": [
    { "role": "system", "content": "Tu es un assistant IA..." },
    { "role": "system", "content": "[Contexte RAG pour cette question]..." },
    { "role": "user", "content": "Que fait le node fetch-api ?" },
    { "role": "assistant", "content": "Le node fetch-api est de type api-call..." }
  ],
  "pendingInterrupt": null,
  "createdTime": 1709123456000,
  "lastUpdatedTime": 1709123489000
}
```

Cela permet le **thread roaming** : si le prochain message arrive sur un autre serveur du cluster, le thread est reconstruit depuis la DB.

---

## Resume : chronologie d'un aller-retour complet

| # | Ou | Quoi | Duree typique |
|---|-----|------|------|
| 1 | Client React | `sendMessage()` → WS send + UI optimistic update | ~1ms |
| 2 | WebSocket | Transit reseau | ~5ms |
| 3 | WebSocketManager | Routage `ai:` → `WsAIController` | <1ms |
| 4 | WsAIController | Validation Zod + Auth JWT + resolution thread | ~5ms |
| 5a | GraphRAGRetriever | Cache check → (miss) → embedding query | ~200ms (API) ou ~0ms (cache hit) |
| 5a | GraphRAGRetriever | searchNodes + BFS + assemble | ~50ms (memoire) ou ~100ms (ArangoDB) |
| 5b | systemPrompt.ts | buildSystemPrompt (1er message seulement) | <1ms |
| 5c | systemPrompt.ts | buildContextSummary (TOON) | <1ms |
| 6a | LLMProvider | Appel API LLM (premier token) | ~500ms-2s |
| 6b | LLMProvider | Streaming tokens (total) | ~2s-10s |
| 6c | readTools.ts | Execution outil (si appele) | ~50ms/outil |
| 7 | Client React | Reception tokens + flush 32ms + render | continu |
| 8 | ThreadStore | Persistence ArangoDB | ~20ms |

**Total typique pour une question simple :** ~3-5 secondes (dont ~80% est le temps de reponse du LLM).
**Avec cache RAG (2eme question dans la meme conversation) :** les etapes 5a sont quasi-instantanees.
