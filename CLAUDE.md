# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nodius is a distributed, real-time visual workflow editor built with React, TypeScript, and WebGPU. It enables creating and executing node-based workflows with visual programming, HTML rendering within nodes, and collaborative editing across multiple server instances.

**Core Architecture:**
- **Client**: React-based visual editor with WebGPU rendering for graph visualization
- **Server**: Node.js HTTP/WebSocket server with cluster coordination via ZeroMQ
- **Database**: ArangoDB for persistent storage of workflows, node configs, and data types
- **Process**: HTML rendering engine with three-way merge for hybrid editing

## Development Commands

### Running the Development Server

```bash
# Start dev server (adjust host IP as needed)
npm run dev

# Alternative dev server with different host
npm run dev2
```

Development mode automatically starts both:
- Backend server (default port 8426)
- Vite dev server for frontend hot-reload

The server uses command-line arguments for configuration:
- `mode`: "development" or "production"
- `port`: HTTP server port (default: 8426)
- `host`: Server host address
- `arangodb`: ArangoDB URL (default: http://127.0.0.1:8529)
- `arangodb_user`: Database username (default: root)
- `arangodb_pass`: Database password (default: azerty)
- `arangodb_name`: Database name (default: nodius)

### Building for Production

```bash
# Build frontend (outputs to export/)
npx vite build

# TypeScript compilation (outputs to dist/)
npx tsc
```

Frontend build output: `export/`
TypeScript output: `dist/`

### Database Setup

Ensure ArangoDB is running before starting the server. The server will automatically:
- Connect to ArangoDB using credentials from command-line args
- Create necessary collections for workflows, nodes, edges, categories, data types, etc.
- Initialize cluster node tracking

## Architecture Deep Dive

### 1. Client Architecture (src/client/)

**Graph Visualization (SchemaDisplay.tsx)**
- Uses WebGPU for high-performance rendering of nodes and edges
- HTML overlay system (`OverlayManager`) for rendering HTML content within nodes
- Spring-based animation system (`NodeAnimationManager`) for smooth node movement and resizing
- Event forwarding between canvas and HTML overlays
- **Node Selection**: Visual effects with glow, pulse animation, and resize handles for single-selected nodes
- **Resize System**: Drag handles at bottom-right corner of selected nodes with real-time server sync

**State Management**
- Context-based architecture: `ThemeContext`, `ProjectContext`
- `useCreateReducer` hook for reducer-like state management without Redux
- WebSocket synchronization via `useSocketSync` for real-time collaboration

**Component Structure**
- `src/client/component/dashboard/`: Main editor UI components
  - `SchemaEditor.tsx`: Main workflow editor
  - `DashboardNodeConfigurations.tsx`: Node type configuration panel
  - `Editor/`: Visual HTML component editor with drag-and-drop
- `src/client/schema/`: Graph rendering and interaction logic
  - `motor/webGpuMotor/`: WebGPU rendering pipeline
  - `hooks/`: Reusable hooks for drag-drop, rendering, and resizing

### 2. Server Architecture (src/server/)

**Main Server (server.ts)**
- HTTP server built on custom `HttpServer` class (Express-like middleware system)
- Automatically spawns Vite in development mode for frontend dev server
- Request handlers initialize routes for workflows, categories, builders, data types, sync, and node configs

**Port Allocation**
- HTTP server: base port (e.g., 8426)
- ClusterManager (ZeroMQ): base port + 1000 (e.g., 9426)
- WebSocketManager: base port + 2000 (e.g., 10426)

**Cluster System (cluster/clusterManager.ts)**
- ZeroMQ Pub/Sub for broadcast messages across cluster nodes
- ZeroMQ Router/Dealer for direct node-to-node communication
- Database-backed peer discovery and heartbeat monitoring
- Instance management tracking (which server handles which workflow instances)

**WebSocket System (cluster/webSocketManager.ts)**
- Real-time collaboration server for graph updates
- Message types defined in `src/utils/requests/type/` and `src/utils/sync/wsObject.ts`
- Instruction-based updates (`InstructionBuilder`) for granular state changes
- Supports batch operations and optimistic updates

### 3. Data Layer (src/utils/)

**Graph Types (graph/graphType.ts)**
- `Node`: Graph nodes with position, size, handles, and typed data
- `Edge`: Connections between node handles
- `Graph`: Multi-sheet graph structure
- `NodeTypeConfig`: Configurable node types with HTML content and styling
- Handle system: T (top), D (down), R (right), L (left), 0 (center)

**Data Types (dataType/dataType.ts)**
- Built-in types: int, str, bool, db (double), color, ref, enum
- Regex-based validation for each type
- Database-backed custom type definitions (`DataTypeClass`)
- Enum support (`EnumClass`)

**Sync System (sync/)**
- `wsObject.ts`: WebSocket message type definitions with `animatePos` and `animateSize` flags
- `InstructionBuilder.ts`: Immutable update instructions for graph modifications
- Supports optimistic updates (apply locally before server confirms)

### 4. HTML Rendering Engine (src/process/html/)

**HtmlRender.ts - Core Features**
- Renders `HtmlObject` definitions to DOM elements
- Event system: DOM events, workflow events, and building mode events
- Building mode: Interactive editor with hover/select functionality for visual editing
- Global storage with Proxy-based reactivity

**Three-Way Merge (see THREE_WAY_MERGE_DOCUMENTATION.md)**
- Preserves external DOM modifications during re-renders
- MutationObserver tracks external changes to attributes, content, classes
- Merge logic: object changes override external changes; when object unchanged, preserve external edits
- Critical for hybrid visual + code editing workflows

**Dynamic CSS (html/HtmlCss.ts)**
- CSS blocks with selectors (& for self, &:hover, etc.)
- Auto-generated class names (`css-0`, `css-1`, etc.)
- Scoped style injection per element

### 5. Animation System (src/client/schema/nodeAnimations.ts)

**Spring-Based Animations**
- Handles position transitions via `toPosX`/`toPosY` properties
- Handles size transitions via `toWidth`/`toHeight` properties (in `node.size`)
- Physics simulation with stiffness and damping for natural movement
- Automatic cleanup when animation completes

**Animation Triggers**
- Position: When instructions have `animatePos: true` flag
- Size: When instructions have `animateSize: true` flag
- Converted in `useSocketSync.ts` from `posX`/`posY`/`size.width`/`size.height` to animation targets
- SchemaDisplay monitors for these properties and starts spring animations

## Key Workflows

### Creating a New Node Type

1. Define node config structure in `NodeTypeConfig` (graph/graphType.ts)
2. Create HTML content using `HtmlObject` structure (html/htmlType.ts)
3. Use dashboard `DashboardNodeConfigurations.tsx` to configure via UI
4. Server stores config in ArangoDB via `RequestNodeConfig` handler

### Real-time Collaboration Flow

1. Client connects to WebSocket server (`useSocketSync` hook)
2. User edits graph → generates `Instruction` objects
3. Instructions sent via WebSocket to server with appropriate flags
4. Server broadcasts to all connected clients on same graph
5. Clients apply instructions to local state
6. Server persists changes to ArangoDB

### Visual HTML Editing

1. Enable building mode in `HtmlRender`
2. User hovers/selects elements → events fire to editor UI
3. Editor modifies DOM directly (e.g., change attributes, content)
4. MutationObserver tracks external changes
5. Re-render preserves external changes via three-way merge
6. Export final `HtmlObject` definition from modified DOM

### Node Dragging and Resizing

**Drag System (useNodeDragDrop.ts)**
- Throttled server updates (200ms delay)
- `saveInProgress` flag prevents concurrent requests
- Uses `animatePos: true` for smooth animations on other clients
- Pending save queue ensures final position is always saved

**Resize System (useNodeResize.ts)**
- Resize handles appear on single-selected nodes (bottom-right corner)
- Minimum size constraints (50x50px default)
- Throttled server updates (200ms delay)
- `saveInProgress` flag prevents concurrent requests
- Uses `animateSize: true` for smooth animations on other clients
- Updates `node.size.width` and `node.size.height` properties

**Critical Pattern for Both Hooks:**
```typescript
// Check saveInProgress BEFORE calling save function
if (!saveInProgress && hasChanges) {
    saveNode(node); // This sets saveInProgress = true
}

// If save in progress, queue to pendingSave
if (saveInProgress) {
    pendingSave = { node, oldValues };
}

// When save completes, process pendingSave if exists
saveInProgress = false;
if (pendingSave) {
    saveNode(pendingSave.node);
}
```

## Important Patterns

### Request Handlers Pattern

All server request handlers follow this pattern (see `src/server/request/`):
```typescript
class RequestSomething {
    static init(app: HttpServer) {
        app.get("/api/something", handler);
        // ... more routes
    }
}
```

### Instruction-Based Updates

Use `InstructionBuilder` for all state modifications:
- `set(path, value)`: Set property
- `delete(path)`: Delete property
- `arrayPush(path, value)`: Add to array
- Paths use dot notation: `"nodes.nodeId.position.x"`
- Animation flags: `animatePos: true` or `animateSize: true`

### WebSocket Message Structure

All messages extend `WSMessage<T>` with auto-applied `_id` for request tracking. Responses use `WSResponseMessage<T>` with status field.

### Animation Conversion Logic (useSocketSync.ts)

```typescript
// Position animation
if (instruction.animatePos && path === ["posX"]) {
    instruction.i.p[0] = "toPosX"; // Client-only property
}

// Size animation
if (instruction.animateSize && path === ["size", "width"]) {
    instruction.i.p[1] = "toWidth"; // Client-only property
}
```

### Dynamic CSS Classes (useDynamicClass hook)

```typescript
const className = useDynamicClass(`
    & {
        property: value;
    }
    &:hover {
        property: other-value;
    }
`);
```

## File Organization

- `src/client/`: React frontend
  - `component/`: React components (dashboard, forms, animations)
  - `schema/`: Graph rendering and WebGPU motor
  - `hooks/`: Custom hooks and context providers
- `src/server/`: Backend server
  - `request/`: API route handlers
  - `cluster/`: Distributed cluster management
  - `http/`: HTTP server implementation
- `src/process/`: Processing engines
  - `html/`: HTML rendering engine
- `src/utils/`: Shared utilities and type definitions
  - `graph/`: Graph data structures
  - `dataType/`: Type system
  - `sync/`: WebSocket/sync utilities
  - `html/`: HTML type definitions and CSS utilities

## Database Collections

ArangoDB collections automatically created:
- `workflows`: Graph/workflow definitions
- `nodes`: Node instances
- `edges`: Edge connections
- `categories`: Node type categories
- `dataTypes`: Custom data type definitions
- `enums`: Enumeration types
- `nodeConfigs`: Node type configurations
- `clusterNodes`: Cluster node registry

## TypeScript Configuration

- Target: ES2024
- Module: Preserve (ESM)
- JSX: react-jsx
- Strict mode enabled
- Output: dist/ (declaration files included)

## Critical Implementation Notes

### Avoiding Race Conditions in Async Operations

When implementing hooks that involve throttled server updates (like drag/resize):
1. **Never** use `await` inside `requestAnimationFrame` callbacks
2. **Always** check `saveInProgress` flag BEFORE calling save functions
3. Use `pendingSave` queue pattern to handle concurrent changes
4. Clear timeouts in cleanup handlers (`mouseUp`, `useEffect` cleanup)

### Animation Flag Usage

- `animatePos: true`: For position updates that should animate on other clients
- `animateSize: true`: For size updates that should animate on other clients
- `dontApplyToMySelf: true`: Prevents local double-application during optimistic updates
- Animation flags are removed from catch-up messages (no animation for old changes)

### Selection Visual Effects

Selected nodes receive:
- Multi-layer glow effect with pulsing animation
- Slight scale increase (1.02) and brightness boost (1.05)
- Z-index elevation (+10000) to appear above other nodes
- Resize handle (only for single selection)
- Smooth transitions for all effects (0.3s cubic-bezier)

available css var color:

--nodius-primary-main: #1976d2; --nodius-primary-light: #e3f2fd; --nodius-primary-dark: #42a5f5; --nodius-primary-contrastText: rgba(0, 0, 0, 0.87); --nodius-secondary-main: #ce93d8; --nodius-secondary-light: #f3e5f5; --nodius-secondary-dark: #ab47bc; --nodius-secondary-contrastText: rgba(0, 0, 0, 0.87); --nodius-text-primary: #fff; --nodius-text-secondary: rgba(255, 255, 255, 0.7); --nodius-text-disabled: rgba(255, 255, 255, 0.5); --nodius-text-divider: rgba(255, 255, 255, 0.12); --nodius-info-main: #29b6f6; --nodius-info-light: #4fc3f7; --nodius-info-dark: #0288d1; --nodius-info-contrastText: rgba(0, 0, 0, 0.87); --nodius-background-paper: #282E3B; --nodius-background-default: #1F242F; --nodius-background-resizeBar: #30394d; --nodius-success-main: #66bb6a; --nodius-success-light: #81c784; --nodius-success-dark: #388e3c; --nodius-success-contrastText: rgba(0, 0, 0, 0.87); --nodius-warning-main: #ffa726; --nodius-warning-light: #ffb74d; --nodius-warning-dark: #f57c00; --nodius-warning-contrastText: rgba(0, 0, 0, 0.87); --nodius-error-main: #f44336; --nodius-error-light: #e57373; --nodius-error-dark: #d32f2f; --nodius-error-contrastText: #fff; --nodius-shadow-1: rgba(0, 0, 0, 0.12) 0px 1px 3px, rgba(0, 0, 0, 0.24) 0px 1px 2px; --nodius-shadow-2: rgba(0, 0, 0, 0.16) 0px 3px 6px, rgba(0, 0, 0, 0.23) 0px 3px 6px; --nodius-shadow-3: rgba(0, 0, 0, 0.19) 0px 10px 20px, rgba(0, 0, 0, 0.23) 0px 6px 6px; --nodius-shadow-4: rgba(0, 0, 0, 0.25) 0px 14px 28px, rgba(0, 0, 0, 0.22) 0px 10px 10px; --nodius-reverse-primary-main: #1976d2; --nodius-reverse-primary-light: #42a5f5; --nodius-reverse-primary-dark: #1565c0; --nodius-reverse-primary-contrastText: #fff; --nodius-reverse-secondary-main: #9c27b0; --nodius-reverse-secondary-light: #ba68c8; --nodius-reverse-secondary-dark: #7b1fa2; --nodius-reverse-secondary-contrastText: #fff; --nodius-reverse-text-primary: rgba(0, 0, 0, 0.87); --nodius-reverse-text-secondary: rgba(0, 0, 0, 0.6); --nodius-reverse-text-disabled: rgba(0, 0, 0, 0.38); --nodius-reverse-text-divider: rgba(0, 0, 0, 0.12); --nodius-reverse-info-main: #0288d1; --nodius-reverse-info-light: #03a9f4; --nodius-reverse-info-dark: #01579b; --nodius-reverse-info-contrastText: #fff; --nodius-reverse-background-paper: #FFF; --nodius-reverse-background-default: #fefefe; --nodius-reverse-background-resizeBar: #e8e8e8; --nodius-reverse-success-main: #2e7d32; --nodius-reverse-success-light: #4caf50; --nodius-reverse-success-dark: #1b5e20; --nodius-reverse-success-contrastText: #fff; --nodius-reverse-warning-main: #ed6c02; --nodius-reverse-warning-light: #ff9800; --nodius-reverse-warning-dark: #e65100; --nodius-reverse-warning-contrastText: #fff; --nodius-reverse-error-main: #d32f2f; --nodius-reverse-error-light: #ef5350; --nodius-reverse-error-dark: #c62828; --nodius-reverse-error-contrastText: #fff; --nodius-reverse-shadow-1: rgba(0, 0, 0, 0.12) 0px 1px 3px, rgba(0, 0, 0, 0.24) 0px 1px 2px; --nodius-reverse-shadow-2: rgba(0, 0, 0, 0.16) 0px 3px 6px, rgba(0, 0, 0, 0.23) 0px 3px 6px; --nodius-reverse-shadow-3: rgba(0, 0, 0, 0.19) 0px 10px 20px, rgba(0, 0, 0, 0.23) 0px 6px 6px; --nodius-reverse-shadow-4: rgba(0, 0, 0, 0.25) 0px 14px 28px, rgba(0, 0, 0, 0.22) 0px 10px 10px; --nodius-red-50: #ffebee; --nodius-red-100: #ffcdd2; --nodius-red-200: #ef9a9a; --nodius-red-300: #e57373; --nodius-red-400: #ef5350; --nodius-red-500: #f44336; --nodius-red-600: #e53935; --nodius-red-700: #d32f2f; --nodius-red-800: #c62828; --nodius-red-900: #b71c1c; --nodius-pink-50: #fce4ec; --nodius-pink-100: #f8bbd0; --nodius-pink-200: #f48fb1; --nodius-pink-300: #f06292; --nodius-pink-400: #ec407a; --nodius-pink-500: #e91e63; --nodius-pink-600: #d81b60; --nodius-pink-700: #c2185b; --nodius-pink-800: #ad1457; --nodius-pink-900: #880e4f; --nodius-purple-50: #f3e5f5; --nodius-purple-100: #e1bee7; --nodius-purple-200: #ce93d8; --nodius-purple-300: #ba68c8; --nodius-purple-400: #ab47bc; --nodius-purple-500: #9c27b0; --nodius-purple-600: #8e24aa; --nodius-purple-700: #7b1fa2; --nodius-purple-800: #6a1b9a; --nodius-purple-900: #4a148c; --nodius-deepPurple-50: #ede7f6; --nodius-deepPurple-100: #d1c4e9; --nodius-deepPurple-200: #b39ddb; --nodius-deepPurple-300: #9575cd; --nodius-deepPurple-400: #7e57c2; --nodius-deepPurple-500: #673ab7; --nodius-deepPurple-600: #5e35b1; --nodius-deepPurple-700: #512da8; --nodius-deepPurple-800: #4527a0; --nodius-deepPurple-900: #311b92; --nodius-indigo-50: #e8eaf6; --nodius-indigo-100: #c5cae9; --nodius-indigo-200: #9fa8da; --nodius-indigo-300: #7986cb; --nodius-indigo-400: #5c6bc0; --nodius-indigo-500: #3f51b5; --nodius-indigo-600: #3949ab; --nodius-indigo-700: #303f9f; --nodius-indigo-800: #283593; --nodius-indigo-900: #1a237e; --nodius-blue-50: #e3f2fd; --nodius-blue-100: #bbdefb; --nodius-blue-200: #90caf9; --nodius-blue-300: #64b5f6; --nodius-blue-400: #42a5f5; --nodius-blue-500: #2196f3; --nodius-blue-600: #1e88e5; --nodius-blue-700: #1976d2; --nodius-blue-800: #1565c0; --nodius-blue-900: #0d47a1; --nodius-lightBlue-50: #e1f5fe; --nodius-lightBlue-100: #b3e5fc; --nodius-lightBlue-200: #81d4fa; --nodius-lightBlue-300: #4fc3f7; --nodius-lightBlue-400: #29b6f6; --nodius-lightBlue-500: #03a9f4; --nodius-lightBlue-600: #039be5; --nodius-lightBlue-700: #0288d1; --nodius-lightBlue-800: #0277bd; --nodius-lightBlue-900: #01579b; --nodius-cyan-50: #e0f7fa; --nodius-cyan-100: #b2ebf2; --nodius-cyan-200: #80deea; --nodius-cyan-300: #4dd0e1; --nodius-cyan-400: #26c6da; --nodius-cyan-500: #00bcd4; --nodius-cyan-600: #00acc1; --nodius-cyan-700: #0097a7; --nodius-cyan-800: #00838f; --nodius-cyan-900: #006064; --nodius-teal-50: #e0f2f1; --nodius-teal-100: #b2dfdb; --nodius-teal-200: #80cbc4; --nodius-teal-300: #4db6ac; --nodius-teal-400: #26a69a; --nodius-teal-500: #009688; --nodius-teal-600: #00897b; --nodius-teal-700: #00796b; --nodius-teal-800: #00695c; --nodius-teal-900: #004d40; --nodius-green-50: #e8f5e9; --nodius-green-100: #c8e6c9; --nodius-green-200: #a5d6a7; --nodius-green-300: #81c784; --nodius-green-400: #66bb6a; --nodius-green-500: #4caf50; --nodius-green-600: #43a047; --nodius-green-700: #388e3c; --nodius-green-800: #2e7d32; --nodius-green-900: #1b5e20; --nodius-lightGreen-50: #f1f8e9; --nodius-lightGreen-100: #dcedc8; --nodius-lightGreen-200: #c5e1a5; --nodius-lightGreen-300: #aed581; --nodius-lightGreen-400: #9ccc65; --nodius-lightGreen-500: #8bc34a; --nodius-lightGreen-600: #7cb342; --nodius-lightGreen-700: #689f38; --nodius-lightGreen-800: #558b2f; --nodius-lightGreen-900: #33691e; --nodius-lime-50: #f9fbe7; --nodius-lime-100: #f0f4c3; --nodius-lime-200: #e6ee9c; --nodius-lime-300: #dce775; --nodius-lime-400: #d4e157; --nodius-lime-500: #cddc39; --nodius-lime-600: #c0ca33; --nodius-lime-700: #afb42b; --nodius-lime-800: #9e9d24; --nodius-lime-900: #827717; --nodius-yellow-50: #fffde7; --nodius-yellow-100: #fff9c4; --nodius-yellow-200: #fff59d; --nodius-yellow-300: #fff176; --nodius-yellow-400: #ffee58; --nodius-yellow-500: #ffeb3b; --nodius-yellow-600: #fdd835; --nodius-yellow-700: #fbc02d; --nodius-yellow-800: #f9a825; --nodius-yellow-900: #f57f17; --nodius-amber-50: #fff8e1; --nodius-amber-100: #ffecb3; --nodius-amber-200: #ffe082; --nodius-amber-300: #ffd54f; --nodius-amber-400: #ffca28; --nodius-amber-500: #ffc107; --nodius-amber-600: #ffb300; --nodius-amber-700: #ffa000; --nodius-amber-800: #ff8f00; --nodius-amber-900: #ff6f00; --nodius-orange-50: #fff3e0; --nodius-orange-100: #ffe0b2; --nodius-orange-200: #ffcc80; --nodius-orange-300: #ffb74d; --nodius-orange-400: #ffa726; --nodius-orange-500: #ff9800; --nodius-orange-600: #fb8c00; --nodius-orange-700: #f57c00; --nodius-orange-800: #ef6c00; --nodius-orange-900: #e65100; --nodius-deepOrange-50: #fbe9e7; --nodius-deepOrange-100: #ffccbc; --nodius-deepOrange-200: #ffab91; --nodius-deepOrange-300: #ff8a65; --nodius-deepOrange-400: #ff7043; --nodius-deepOrange-500: #ff5722; --nodius-deepOrange-600: #f4511e; --nodius-deepOrange-700: #e64a19; --nodius-deepOrange-800: #d84315; --nodius-deepOrange-900: #bf360c; --nodius-brown-50: #efebe9; --nodius-brown-100: #d7ccc8; --nodius-brown-200: #bcaaa4; --nodius-brown-300: #a1887f; --nodius-brown-400: #8d6e63; --nodius-brown-500: #795548; --nodius-brown-600: #6d4c41; --nodius-brown-700: #5d4037; --nodius-brown-800: #4e342e; --nodius-brown-900: #3e2723; --nodius-grey-50: #fafafa; --nodius-grey-100: #f5f5f5; --nodius-grey-200: #eeeeee; --nodius-grey-300: #e0e0e0; --nodius-grey-400: #bdbdbd; --nodius-grey-500: #9e9e9e; --nodius-grey-600: #757575; --nodius-grey-700: #616161; --nodius-grey-800: #424242; --nodius-grey-900: #212121; --nodius-blueGrey-50: #eceff1; --nodius-blueGrey-100: #cfd8dc; --nodius-blueGrey-200: #b0bec5; --nodius-blueGrey-300: #90a4ae; --nodius-blueGrey-400: #78909c; --nodius-blueGrey-500: #607d8b; --nodius-blueGrey-600: #546e7a; --nodius-blueGrey-700: #455a64; --nodius-blueGrey-800: #37474f; --nodius-blueGrey-900: #263238; --nodius-transition-default: all 0.3s ease-in-out;