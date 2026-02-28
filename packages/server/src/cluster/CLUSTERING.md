# Clustering Nodius — Documentation technique

## Vue d'ensemble

Nodius supporte le deploiement multi-serveur via un systeme de clustering base sur **ZeroMQ** (Pub/Sub + Router/Dealer). Chaque serveur gere un sous-ensemble d'instances (graphs, nodeConfigs) en memoire, et les clients sont rediriges vers le bon serveur via un mecanisme d'affinite de session.

```
                         ArangoDB (partagee)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                      │
   Serveur A             Serveur B              Serveur C
   port 8426             port 8426              port 8426
        │                     │                      │
   ┌────┴────┐          ┌────┴────┐           ┌────┴────┐
   │  HTTP   │          │  HTTP   │           │  HTTP   │
   │  + WS   │          │  + WS   │           │  + WS   │
   │  + ZMQ  │◄────────▶│  + ZMQ  │◄─────────▶│  + ZMQ  │
   └─────────┘          └─────────┘           └─────────┘
   Graph A, B            Graph C               Graph D, E
```

---

## Ports

Chaque serveur utilise 3 ports derives du port de base (`port`, defaut 8426) :

| Port | Service | Description |
|------|---------|-------------|
| `port` (8426) | HTTP/HTTPS + WebSocket | API REST + WebSocket `/ws` (mode HTTPS) |
| `port + 1000` (9426) | ZeroMQ Publisher | Diffusion Pub/Sub vers les pairs |
| `port + 1001` (9427) | ZeroMQ Router | Messages directs entre pairs |
| `port + 2000` (10426) | WebSocket standalone | Utilise uniquement en mode HTTP (non-HTTPS) |

En mode **HTTPS** : le WebSocket est attache au serveur HTTPS sur le meme port (`wss://host:8426/ws`).
En mode **HTTP** : le WebSocket tourne sur un port separe (`ws://host:10426`).

---

## Composants

### ClusterManager (`clusterManager.ts`)

Gere la decouverte de pairs, la communication inter-serveur, et la table de routage des instances.

**Sockets ZeroMQ :**

| Socket | Role | Bind/Connect |
|--------|------|-------------|
| `Publisher` | Diffuse des messages a tous les pairs | Bind `tcp://*:{port}` |
| `Subscriber` | Recoit les broadcasts des autres pairs | Connect vers chaque pair |
| `Router` | Recoit les messages directs | Bind `tcp://*:{port+1}` |
| `Dealer` | Envoie des messages directs a un pair | Connect vers le Router de chaque pair |

**Etat interne :**

```
connectedPeers   : Map<peerId, ClusterNode>       // pairs connectes
handledInstance   : Map<instanceKey, peerId|"self"> // qui gere quoi
pendingResponses  : Map<messageId, Promise>         // reponses directes en attente
```

### WebSocketManager (`webSocketManager.ts`)

Gere les connexions WebSocket des clients, l'etat en memoire des graphs/nodeConfigs, et la persistence automatique.

**Etat en memoire :**

```
managedGraph      : { [graphKey]: { [sheetId]: ManagedSheet } }
managedNodeConfig : { [configKey]: ManagedNodeConfig }
```

Chaque `ManagedSheet` contient :
- `nodeMap` / `edgeMap` — etat courant en memoire
- `originalNodeMap` / `originalEdgeMap` — snapshot pour calcul de diff
- `instructionHistory` — historique des instructions (pour rattrapage client)
- `user[]` — utilisateurs connectes sur cette sheet
- `hasUnsavedChanges` — flag pour l'auto-save

---

## Decouverte de pairs

La decouverte utilise la collection ArangoDB `nodius_cluster` comme registre partage.

### Enregistrement

Au demarrage, chaque serveur :
1. Genere un `nodeId` unique (token 64 caracteres)
2. S'enregistre dans `nodius_cluster` : `{ _key, host, port, status: "online", lastRefresh }`
3. Bind les sockets ZeroMQ (Publisher + Router)

### Decouverte periodique (toutes les 30s)

```
discoverAndConnectPeers() :
  1. Query ArangoDB : SELECT * FROM nodius_cluster
       WHERE _key != self
         AND lastRefresh > (now - 2 minutes)
         AND status == "online"

  2. Pour chaque nouveau pair :
       subscriber.connect(tcp://{peer.host}:{peer.port})     // s'abonner aux broadcasts
       dealer.connect(tcp://{peer.host}:{peer.port+1})       // canal direct
       connectedPeers.set(peerId, node)
       emit('peerConnected')

  3. Pour chaque pair disparu :
       connectedPeers.delete(peerId)
       emit('peerDisconnected')
```

### Heartbeat (toutes les 60s)

Chaque serveur met a jour son `lastRefresh` et `status: "online"` dans ArangoDB.
Un pair est considere offline s'il n'a pas rafraichi depuis > 2 minutes.

### Shutdown

A l'arret : `status: "offline"` en BDD, fermeture de tous les sockets ZeroMQ.

---

## Affinite de session (Instance Routing)

Le systeme garantit qu'un graph est gere par **un seul serveur** a la fois. Le routage se fait via l'endpoint REST `POST /api/sync`.

### Flux de connexion client

```
Client                            Serveur A                      Serveur B
  │                                   │                              │
  │── POST /api/sync ────────────────▶│                              │
  │   { instanceId: "graph-abc" }     │                              │
  │                                   ├── clusterManager             │
  │                                   │   .getInstancehPeerId(id)    │
  │                                   │                              │
  │   CAS 1 : non revendique          │                              │
  │   ◄── { host, port, path }       │                              │
  │       (connecte a Serveur A)      ├── defineInstancePeer(id)     │
  │                                   │   → broadcast ZMQ :          │
  │                                   │     CM_IManageInstance       ──▶ handledInstance["graph-abc"] = peerIdA
  │                                   │                              │
  │   CAS 2 : gere par Serveur B     │                              │
  │   ◄── { host: B, port: B+1000 }  │                              │
  │       (redirige vers Serveur B)   │                              │
  │                                   │                              │
  │── WebSocket connect ─────────────────────────────────────────────▶│
  │── registerUserOnGraph ───────────────────────────────────────────▶│
  │◄── { nodeMap, edgeMap, history } ────────────────────────────────│
```

### Messages de cluster

Deux messages ZeroMQ sont utilises pour coordonner le routage :

| Message | Direction | Effet |
|---------|-----------|-------|
| `CM_IManageInstance { instanceKey }` | Broadcast (Pub/Sub) | Tous les pairs enregistrent : `handledInstance[key] = senderId` |
| `CM_IDontManageInstance { instanceKey }` | Broadcast (Pub/Sub) | Tous les pairs suppriment `handledInstance[key]` |

### Liberation d'instance

Quand un graph n'a plus d'utilisateurs connectes (detecte par le cleanup toutes les 10s) :
1. Sauvegarde des changements en BDD
2. Suppression de la memoire
3. Broadcast `CM_IDontManageInstance` → les pairs suppriment l'entree
4. Le prochain client qui demande ce graph declenchera une nouvelle revendication

---

## Communication inter-serveur

### Broadcast (Pub/Sub)

```typescript
clusterManager.broadcastJson(payload)
// → Publisher envoie a tous les Subscribers connectes
// → Chaque pair recoit via son Subscriber (sauf l'emetteur, filtre par senderId)
```

Utilise pour : annonces de gestion d'instance (`CM_IManage*`), et potentiellement d'autres evenements globaux.

### Messages directs (Router/Dealer)

```typescript
const response = await clusterManager.sendJsonToPeer(peerId, payload, timeoutMs?)
// → Dealer envoie au Router du pair cible
// → Le pair repond via router.send([identity, response])
// → Promise resolue a la reception, ou rejetee apres timeout (defaut 10s)
```

Utilise pour : communication point-a-point entre deux serveurs (requetes avec reponse attendue).

### Format des messages

```typescript
interface Message {
    id: string;              // randomUUID()
    senderId: string;        // nodeId du serveur emetteur
    targetId?: string;       // pour messages directs
    type: 'broadcast' | 'direct' | 'response';
    payload: { type: string; [key: string]: any };
    timestamp: number;
    responseId?: string;     // lie une reponse a un message direct
}
```

---

## WebSocket : synchronisation temps-reel

### Cycle de vie d'un graph en memoire

```
registerUserOnGraph                     clearUnhabitedInstances (10s)
        │                                        │
        ▼                                        ▼
┌───────────────┐     instructions      ┌────────────────┐
│  initGraph()  │───────────────────────▶│  En memoire    │
│  (charge BDD) │     (via clients WS)  │  nodeMap/edgeMap│
└───────────────┘                        └───────┬────────┘
                                                 │
                                  savePendingChanges (30s)
                                                 │
                                                 ▼
                                         ┌───────────────┐
                                         │  ArangoDB     │
                                         │  (diff-based) │
                                         └───────────────┘
```

### Types de messages WebSocket

**Messages client → serveur :**

| Type | Description |
|------|-------------|
| `registerUserOnGraph` | S'enregistrer sur un graph (charge le graph en memoire si besoin) |
| `disconnedUserOnGraph` | Se deconnecter d'un graph |
| `registerUserOnNodeConfig` | S'enregistrer sur un nodeConfig |
| `disconnectUserOnNodeConfig` | Se deconnecter d'un nodeConfig |
| `applyInstructionToGraph` | Appliquer des instructions (move, update, etc.) |
| `applyInstructionToNodeConfig` | Appliquer des instructions a un nodeConfig |
| `generateUniqueId` | Generer des IDs uniques (base-36) |
| `batchCreateElements` | Creer des nodes/edges en batch |
| `batchDeleteElements` | Supprimer des nodes/edges en batch |
| `createSheet` / `renameSheet` / `deleteSheet` | Gestion des feuilles |
| `forceSave` | Forcer la sauvegarde immediate |
| `toggleAutoSave` | Activer/desactiver l'auto-save |
| `ai:chat` / `ai:resume` / `ai:interrupt` | Messages AI (delegues a `WsAIController`) |

### Application d'instructions

Quand un client envoie `applyInstructionToGraph` :

1. **Validation** : chaque instruction validee via `validateInstruction()`
2. **Inverse** : calcul de l'instruction inverse via `getInverseInstruction()` (pour undo/redo)
3. **Application** : `applyInstruction()` modifie le `nodeMap`/`edgeMap` en memoire
4. **Broadcast** : le message est retransmis a tous les autres utilisateurs de la sheet
5. **Historique** : ajout dans `instructionHistory` (pour rattrapage de clients retardataires)
6. **Flag** : `hasUnsavedChanges = true`

### Auto-save (toutes les 30s)

`savePendingChanges()` pour chaque graph avec `hasUnsavedChanges` :

1. Sauvegarde l'historique undo/redo dans `nodius_graphs_history`
2. Compare `nodeMap` vs `originalNodeMap` (JSON.stringify) → determine les diffs
3. Execute les operations ArangoDB :
   - **Nodes** : `save()` (creation), `replace()` (mise a jour), `remove()` (suppression)
   - **Edges** : idem, avec conversion `source/target` → `_from/_to` au format ArangoDB
4. Conversion des cles : `localKey` → `{graphKey}-{localKey}` pour ArangoDB
5. Reset : `originalNodeMap = copy(nodeMap)`, `hasUnsavedChanges = false`

### Nettoyage (toutes les 10s)

`clearUnhabitedInstances()` :
- Supprime les utilisateurs dont le WebSocket est ferme
- Si un graph n'a plus d'utilisateurs : sauvegarde + eviction memoire + broadcast `CM_IDontManageInstance`

---

## Resume des intervalles

| Intervalle | Composant | Action |
|------------|-----------|--------|
| 10s | WebSocketManager | Nettoyage des instances sans utilisateurs |
| 30s | WebSocketManager | Auto-save des changements en BDD (diff-based) |
| 30s | ClusterManager | Decouverte de nouveaux pairs |
| 60s | ClusterManager | Heartbeat (refresh status en BDD) |
