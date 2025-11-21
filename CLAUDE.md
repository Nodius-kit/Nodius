# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nodius is a visual node-based workflow builder with real-time collaborative editing capabilities. It combines graph-based workflow design with component building, enabling users to create reusable HTML templates with embedded workflow logic.

**Tech Stack:**
- Frontend: React 19 + TypeScript + Vite
- Backend: Node.js + TypeScript + Custom HTTP Server
- Database: ArangoDB (graph database)
- Communication: WebSocket (real-time), ZeroMQ (cluster), REST API
- Rendering: WebGPU (graph visualization), DOM (HTML components)

## Development Commands

### Server Development
```bash
# Start development server (default host)
npm run dev

# Start with custom host
npm run dev2

# Direct server start with custom config
tsx ./src/server/server.ts mode=development port=8426 host=192.168.1.72
```

The server:
- Runs HTTP API on the specified port (default: 8426)
- Runs WebSocket server on port + 2000 (default: 10426)
- Runs ZeroMQ cluster on port + 1000 (default: 9426)
- Auto-generates `.env` file for Vite with API URL
- Spawns Vite dev server in development mode

### Database Management

**Prerequisites:** ArangoDB must be running via Docker:
```bash
cd arrango
docker compose up --build -d
```

Access ArangoDB web panel at http://localhost:8529 (credentials: root/azerty)

**Export/Import:**
```bash
# Export database to JSON backup
npm run db:export
npm run db:export -- output=./backup/custom-backup.json

# Import from JSON backup (upserts documents, never deletes)
npm run db:import
npm run db:import -- input=./backup/custom-backup.json
```

**Import behavior:**
- Creates database and collections if they don't exist
- Replaces existing documents by `_key`
- Inserts new documents
- Preserves documents not in backup file

### Building
```bash
# Build for production (outputs to ./export)
npm run build

# TypeScript compilation
npx tsc
```

No test suite is currently configured.

## Architecture

### Three-Layer Structure

```
src/
├── client/       # React SPA frontend
├── server/       # Node.js backend (HTTP, WebSocket, cluster)
├── process/      # Workflow execution and HTML rendering engines
└── utils/        # Shared utilities (graph, HTML, sync, data types)
```

### Client-Server Communication

**1. REST API (HTTP on port 8426)**
- Graph/HTML class CRUD: `POST /api/graph/get`, `/api/graph/create`
- Node configuration: `POST /api/nodeConfig/*`
- Data types and enums: `POST /api/dataType/*`, `/api/enum/*`
- WebSocket routing: `POST /api/sync`

**2. WebSocket (port 8426 + 2000)**
- Real-time collaborative editing
- Graph instruction application: `applyInstructionToGraph`
- User session management: `registerUserOnGraph`
- Batch operations: `batchCreateElements`, `batchDeleteElements`
- Unique ID generation: `generateUniqueId`

**3. ZeroMQ (port 8426 + 1000)**
- Cluster server-to-server communication
- Pub/Sub pattern for broadcasts
- Router/Dealer for direct messaging
- Instance ownership tracking

### Core Data Model

**Graph (Workflow Canvas)**
- `_key`: Unique identifier
- `sheets`: Map of sheetId → { nodeMap, edgeMap }
- `version`: Auto-incremented on changes
- `htmlKeyLinked`: Optional link to HTML class

**Node (Workflow Operation)**
- `_key`: Unique identifier
- `type`: "html" | "entryType" | custom
- `posX, posY, width, height`: Position and size
- `handles`: { T/D/L/R: Handle[] } - Connection points (Top/Down/Left/Right)
- `data`: Node-specific payload
- `process`: Execution logic reference

**Edge (Connection)**
- `source, sourceHandle`: Origin node and handle
- `target, targetHandle`: Destination node and handle

**HtmlObject (Component Tree)**
- `type`: "block" | "list" | "text" | "array" | "html" | "icon"
- `identifier`: Unique ID for tracking
- `domEvents`: User interaction handlers
- `css`: Styled sections with CSS selectors
- `attribute`: HTML attributes
- `content`: Type-specific content (nested HtmlObject, array, string, etc.)

**NodeTypeConfig (Node Template)**
- `_key`: Template ID
- `displayName`: Human-readable name
- `content`: HtmlObject visual representation
- `node`: Default node structure
- `border`: Visual styling config

### Instruction-Based State Management

All state changes use minimal operation encoding via `InstructionBuilder`:

```typescript
Instruction {
  o: OpType,        // SET, ARR_ADD, REM, etc.
  p?: string[],     // path to property
  v?: any,          // value
  // + specialized fields for array/string operations
}
```

Benefits:
- Minimal network payload
- Reversible operations (undo/redo)
- Multi-user collaboration support
- Catch-up synchronization for reconnections

### HTML Rendering System

**HtmlRender class** (`src/process/html/HtmlRender.tsx`):
- Converts HtmlObject trees to live DOM elements
- Manages event listeners (DOM events, workflow events)
- Supports "building mode" for interactive editing
- Reactive storage via Proxy for state changes
- Diffing and patching for instruction-based updates

**Key methods:**
- `render()`: Initial DOM creation
- `updateContent()`: Apply instruction-based changes
- `getValueInStorage()`: Access element or global storage
- `setEventOnElement()`: Bind workflow events

### Graph Visualization

**WebGpuMotor** (`src/client/schema/motor/webGpuMotor/`):
- Canvas-based rendering using WebGPU
- Interactive pan/zoom
- Node selection and highlighting
- Edge routing between handles
- Context menu for operations

Coordinates with HTML rendering through `SchemaDisplay` component.

### Real-Time Collaboration

**Flow:**
1. Client connects via `/api/sync` to discover WebSocket server
2. Client registers on graph with `fromTimestamp`
3. Server replays instruction history since timestamp
4. All new instructions broadcast to connected users
5. Server saves diffs to ArangoDB every 30 seconds

**Consistency:**
- Server is single source of truth
- Instructions applied in order
- Unique IDs generated server-side
- Batch operations are atomic

### Database Collections (ArangoDB)

- `nodius_graphs`: Graph metadata and sheets
- `nodius_nodes`: Individual nodes
- `nodius_edges`: Connections (edge collection)
- `nodius_html_class`: HTML component definitions
- `nodius_node_config`: Node type templates
- `nodius_data_types`: Custom type schemas
- `nodius_enums`: Enumeration definitions
- `nodius_cluster`: Cluster node registration

### Global State (ProjectContext)

Located in `src/client/hooks/contexts/ProjectContext.tsx`:

```typescript
ProjectContextType {
  // Graph/Workflow
  graph?: Graph,
  selectedSheetId?: string,
  nodeTypeConfig: Record<NodeType, NodeTypeConfig>,

  // Editing
  editedHtml?: EditedHtmlType,
  editedNodeConfig?: string,

  // Operations
  updateGraph?: (instructions: GraphInstructions[]) => Promise,
  updateNodeConfig?: (instructions: nodeConfigInstructions[]) => Promise,
  batchCreateElements?: (nodes, edges) => Promise,
  batchDeleteElements?: (nodeKeys, edgeKeys) => Promise,

  // Rendering
  htmlRenderMap: Record<nodeId, Record<renderId, htmlRenderContext>>,

  // UI
  selectedNode: string[],
  selectedEdge: string[],
  activeAppMenuId: string,
  appMenu: AppMenu[],

  // Utilities
  generateUniqueId?: () => Promise<string[]>,
  getMotor?: () => GraphicalMotor,
}
```

## Key Files and Locations

### Server Entry Points
- `src/server/server.ts` - Main application entry
- `src/server/http/HttpServer.ts` - Custom HTTP server implementation
- `src/server/cluster/ClusterManager.ts` - ZeroMQ cluster coordination
- `src/server/cluster/WebSocketManager.ts` - Real-time WebSocket handler

### Request Handlers
- `src/server/request/requestWorkFlow.ts` - Graph CRUD operations
- `src/server/request/requestNodeConfig.ts` - Node template management
- `src/server/request/requestDataType.ts` - Type system CRUD
- `src/server/request/requestCategory.ts` - Organization/categorization
- `src/server/request/requestBuilder.ts` - Node library operations
- `src/server/request/requestSync.ts` - WebSocket routing

### Client Core
- `src/client/App.tsx` - Root React component
- `src/client/main.tsx` - Application entry point
- `src/client/hooks/contexts/ProjectContext.tsx` - Global state management
- `src/client/hooks/useWebSocket.ts` - WebSocket client
- `src/client/hooks/useSocketSync.ts` - Graph synchronization logic

### Schema Editor
- `src/client/schema/SchemaEditor.tsx` - Node/edge editing UI
- `src/client/schema/SchemaDisplay.tsx` - Graph visualization coordinator
- `src/client/schema/motor/webGpuMotor/` - WebGPU rendering engine
- `src/client/schema/menu/LeftPanel*.tsx` - Component tree editors
- `src/client/schema/menu/RightPanel*.tsx` - Property editors

### Rendering Engines
- `src/process/html/HtmlRender.tsx` - HTML component renderer
- `src/process/workflow/WorkflowManager.ts` - Workflow execution

### Utilities
- `src/utils/graph/graphType.ts` - Graph data structures
- `src/utils/html/htmlType.ts` - HTML object types
- `src/utils/sync/InstructionBuilder.ts` - State change encoding
- `src/utils/sync/wsObject.ts` - WebSocket message types
- `src/utils/dataType/` - Type system utilities

## Important Patterns

### Instruction Application
When modifying state, always use instructions:
```typescript
const instructions = new InstructionBuilder<Graph>()
  .set(['name'], 'New Name')
  .arrayAdd(['sheets', sheetId, 'nodeMap'], node)
  .build();

await updateGraph(instructions);
```

### HTML Object Manipulation
HTML components are deeply nested. Use helper functions from `src/utils/html/`:
- `parseHtmlElement()` - Convert HtmlObject to string
- `updateHtmlElement()` - Apply instructions to HtmlObject
- `findElementByIdentifier()` - Navigate component tree

### WebSocket Message Flow
Client → Server:
```typescript
ws.send(JSON.stringify({
  type: 'applyInstructionToGraph',
  graphKey: 'graph123',
  sheetId: 'sheet456',
  instructions: [...]
}));
```

Server → All Clients:
```typescript
broadcast({
  type: 'graphUpdated',
  graphKey: 'graph123',
  instructions: [...]
});
```

### Motor Abstraction
Always access graph rendering through the motor interface:
```typescript
const motor = getMotor();
motor.renderNode(node);
motor.renderEdge(edge);
motor.setViewport(x, y, zoom);
```

## Common Gotchas

1. **Instruction paths**: Use array format `['sheets', sheetId, 'nodeMap']`, not dot notation
2. **Unique IDs**: Always call `generateUniqueId()` server-side for new elements
3. **Handle directions**: T=Top, D=Down, L=Left, R=Right (not N/S/E/W)
4. **HtmlObject identifiers**: Must be unique within component tree for update tracking
5. **Edge collections**: ArangoDB requires special collection type for edges
6. **WebSocket port offset**: Always port + 2000 for WebSocket, port + 1000 for cluster
7. **Building mode**: HtmlRender has two modes - normal (events fire) vs building (editor UI)

## Database Connection

Default configuration:
```typescript
{
  url: 'http://127.0.0.1:8529',
  databaseName: 'nodius',
  auth: { username: 'root', password: 'azerty' }
}
```

Override via command line:
```bash
tsx ./src/server/server.ts arangodb=http://localhost:8529 arangodb_name=nodius_dev
```

## Environment Variables

The server auto-generates `src/client/.env` on startup:
```
VITE_API_URL=http://{host}:{port}
```

This ensures Vite builds use the correct API endpoint.
