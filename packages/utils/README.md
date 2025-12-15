# @nodius/utils

[![npm version](https://img.shields.io/npm/v/@nodius/utils)](https://www.npmjs.com/package/@nodius/utils)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Utilities and shared types package for the Nodius ecosystem. This package contains all type definitions, data structures, and utility functions used by different Nodius components (client, server, process).

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Modules](#modules)
  - [Graph Types](#graph-types)
  - [Instruction Builder](#instruction-builder)
  - [HTML Types](#html-types)
  - [Data Types](#data-types)
  - [Request Types](#request-types)
  - [WebSocket Objects](#websocket-objects)
  - [Utilities](#utilities)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Development](#development)

## Installation

### Within the Monorepo

If you're working in the Nodius monorepo, the package is automatically available via npm workspaces:

```bash
# Install dependencies from root
npm install
```

### As Standalone Package

```bash
npm install @nodius/utils
```

## Usage

### Global Import

```typescript
import { Node, Edge, InstructionBuilder, OpType, HtmlObject } from '@nodius/utils';
```

### Specific Import

```typescript
// Graph types
import { Node, Edge, NodeType, handleSide } from '@nodius/utils';

// Instruction system
import { InstructionBuilder, OpType, Instruction } from '@nodius/utils';

// HTML types
import { HtmlObject, HTMLDomEvent, CssObject } from '@nodius/utils';

// Data types
import { EntryTypeConfig, EntryField } from '@nodius/utils';

// API request types
import {
  ApiWorkflowListRequest,
  ApiWorkflowGetRequest,
  ApiSyncRequest
} from '@nodius/utils';
```

## Modules

### Graph Types

Core module for workflow graph manipulation.

#### Main Types

```typescript
// Node type
export type NodeType = "html" | "entryType" | string;

// Handle position
export type handleSide = "T" | "D" | "R" | "L" | "0"; // Top, Down, Right, Left, Middle

// Node structure
export interface Node<T> {
    _key: string;           // Unique node ID
    graphKey: string;       // Parent graph ID
    type: NodeType;         // Node type
    typeVersion: number;    // Type version
    sheet: string;          // Sheet/tab
    size: {
        width: number;
        height: number;
        dynamic?: boolean;
    };
    posX: number;           // X position
    posY: number;           // Y position
    process: string;        // Associated process
    handles: Partial<Record<handleSide, {
        position: "separate" | "fix";
        point: Array<NodePoint>;
    }>>;
    data?: T;              // Custom data
}

// Edge structure (connection)
export interface Edge {
    _key: string;
    graphKey: string;
    sheet: string;
    source: string;         // Source node ID
    sourceHandle: string;   // Source handle
    target: string;         // Target node ID
    targetHandle: string;   // Target handle
    label?: string;
}

// Connection point (Handle)
export interface NodePoint {
    id: string;
    offset?: number;
    display?: string;
    type: "in" | "out";
    accept: string;         // Accepted data type
    linkedHtmlId?: string;
}
```

#### Utility Functions

```typescript
// Clean an Edge (ArangoDB -> app format conversion)
function cleanEdge(obj: any): Edge

// Clean a Node
function cleanNode<T>(obj: any): Node<T>

// Create connection data for ArangoDB
function makeEdgeConnection(workflowKey: string, source: string, target: string): object

// Parse handle attributes
function parseHandleAttributes(str: string): { nodeId: string; handleSide: string; handleId: string } | null

// Check if connection can be established
function canConnectNodes(source: NodePoint, target: NodePoint): boolean

// Get selected nodes from graph
function getNodeSelection(graph: Graph): Set<string>
```

### Instruction Builder

Atomic instruction system for real-time synchronization. This module is at the core of Nodius's multi-user collaboration system.

#### Concept

Instructions allow describing state modifications in an atomic and serializable way. They are:
- **Compact**: Minimal JSON format with short keys
- **Type-safe**: Strict operation validation
- **Path-based**: Modifications on nested object paths
- **Reversible**: Undo/redo support

#### Operation Types

```typescript
export enum OpType {
    SET = 1,           // Set value
    REM = 2,           // Remove value
    ARR_ADD = 3,       // Add to array
    ARR_INS = 4,       // Insert in array at index
    STR_REP = 5,       // Replace in string
    STR_REP_ALL = 6,   // Replace all occurrences
    ARR_POP = 7,       // Remove last element
    ARR_SHIFT = 8,     // Remove first element
    ARR_UNSHIFT = 9,   // Add to beginning
    STR_APP = 10,      // Append to string
    STR_REM = 11,      // Remove from string
    STR_REP_AT = 12,   // Replace at position
    BOOL_TOG = 13,     // Toggle boolean
    ARR_REM_IDX = 14,  // Remove at index
    DICT_MERGE = 15,   // Merge objects
    STR_INS = 16,      // Insert in string
    ARR_MOVE = 17,     // Move array element
    OBJ_MOVE = 18,     // Move object
    OBJ_INSERT = 19,   // Insert object in array
}
```

#### Instruction Structure

```typescript
export interface Instruction {
    o: OpType;      // Operation
    p?: string[];   // Path (keys)
    v?: any;        // Value
    i?: number;     // Index
    l?: number;     // Length
    s?: string;     // Search string
    r?: string;     // Replacement string
    f?: number;     // From index (for move)
    t?: number;     // To index
    d?: string[];   // Destination path
}
```

#### Usage

```typescript
import { InstructionBuilder, OpType } from '@nodius/utils';

// Create a builder
const builder = new InstructionBuilder();

// Example 1: Modify simple field
const instruction1 = builder
    .key('nodes')
    .key('node123')
    .key('posX')
    .set(100);

// Example 2: Add to array
const instruction2 = new InstructionBuilder()
    .key('edges')
    .arrayAdd({ source: 'A', target: 'B' });

// Example 3: Modify string
const instruction3 = new InstructionBuilder()
    .key('config')
    .key('title')
    .stringReplace('old', 'new');

// Example 4: Move element
const instruction4 = new InstructionBuilder()
    .key('items')
    .arrayMove(0, 5); // Move from index 0 to 5

// Clone instruction
const cloned = builder.clone();

// Get instruction value
const value = builder.getValue<number>();
```

#### Executing Instructions

```typescript
import { applyInstruction } from '@nodius/utils';

const state = {
    nodes: {
        node1: { posX: 0, posY: 0 }
    }
};

const instruction = new InstructionBuilder()
    .key('nodes')
    .key('node1')
    .key('posX')
    .set(100);

// Apply instruction
const result = applyInstruction(state, instruction);
// state.nodes.node1.posX = 100
```

### HTML Types

Types and utilities for the HTML rendering system in nodes.

#### HtmlObject

Structure for defining HTML elements in workflows:

```typescript
export interface HtmlObject {
    id: string;
    tag: string;                    // 'div', 'button', 'input', etc.
    content?: string;               // Text content
    children?: HtmlObject[];        // Children
    anchor?: HtmlObjectAnchor;      // Node anchoring
    css?: CssObject;                // CSS styles
    attributes?: Record<string, string>;  // HTML attributes
    events?: Record<string, HTMLWorkflowEvent>;  // Events
    icon?: string;                  // Lucide icon
    image?: string;                 // Image
}

// Anchoring system
export interface HtmlObjectAnchor {
    top?: string | number;
    bottom?: string | number;
    left?: string | number;
    right?: string | number;
    width?: string | number;
    height?: string | number;
}

// CSS Object
export type CssObject = Partial<CSSStyleDeclaration>;
```

#### Events

```typescript
export interface HTMLWorkflowEvent {
    type: "domEvent" | "workflowEvent";

    // For domEvent
    event?: string;              // 'click', 'change', etc.
    handleId?: string;           // Handle to trigger

    // For workflowEvent
    workflowEventType?: string;  // Workflow event type
}
```

#### Utility Functions

```typescript
// Apply CSS to element
function applyCssToElement(element: HTMLElement, css: CssObject): void

// Parse CSS from string
function parseCss(cssString: string): CssObject

// Find HtmlObject by ID
function findHtmlObjectById(root: HtmlObject, id: string): HtmlObject | null

// Clone HtmlObject
function cloneHtmlObject(obj: HtmlObject): HtmlObject
```

### Data Types

Data type system for defining structured schemas.

```typescript
export interface EntryTypeConfig {
    _key: string;
    name: string;
    description?: string;
    fields: EntryField[];
    category?: string;
}

export interface EntryField {
    name: string;
    type: FieldType;
    required?: boolean;
    defaultValue?: any;
    validation?: FieldValidation;
}

export type FieldType =
    | 'string'
    | 'number'
    | 'boolean'
    | 'date'
    | 'array'
    | 'object'
    | 'reference';
```

### Request Types

TypeScript types for all Nodius API requests.

#### Workflow API

```typescript
// List workflows
export interface ApiWorkflowListRequest {
    category?: string;
    limit?: number;
    offset?: number;
}

export interface ApiWorkflowListResponse {
    workflows: Array<{
        _key: string;
        name: string;
        category?: string;
        createdAt: number;
        updatedAt: number;
    }>;
    total: number;
}

// Get workflow
export interface ApiWorkflowGetRequest {
    workflowKey: string;
}

export interface ApiWorkflowGetResponse {
    workflow: {
        _key: string;
        name: string;
        nodes: Node<any>[];
        edges: Edge[];
        // ... other properties
    };
}

// Create workflow
export interface ApiWorkflowCreateRequest {
    name: string;
    category?: string;
}

export interface ApiWorkflowCreateResponse {
    workflowKey: string;
}
```

#### Sync API

```typescript
export interface ApiSyncRequest {
    workflowKey: string;
    instructions: Instruction[];
    clientId: string;
    timestamp: number;
}

export interface ApiSyncResponse {
    success: boolean;
    appliedInstructions: number;
    conflicts?: Array<{
        instruction: Instruction;
        reason: string;
    }>;
}
```

#### Image API

```typescript
export interface ApiImageUploadRequest {
    file: File | Buffer;
    name?: string;
}

export interface ApiImageUploadResponse {
    imageKey: string;
    url: string;
}

export interface ApiImageListResponse {
    images: Array<{
        _key: string;
        name: string;
        size: number;
        mimeType: string;
        uploadedAt: number;
    }>;
}
```

### WebSocket Objects

Types for real-time WebSocket communication.

```typescript
// Sync message
export interface GraphInstructions {
    type: 'instructions';
    workflowKey: string;
    instructions: Instruction[];
    clientId: string;
    timestamp: number;
}

// Connect message
export interface WsConnectMessage {
    type: 'connect';
    workflowKey: string;
    token: string;
}

// Disconnect message
export interface WsDisconnectMessage {
    type: 'disconnect';
    reason?: string;
}

// Union of all messages
export type WsMessage =
    | GraphInstructions
    | WsConnectMessage
    | WsDisconnectMessage;
```

### Utilities

#### Object Utils

```typescript
// Deep copy object
function deepCopy<T>(obj: T): T

// Deep equality
function deepEqual(a: any, b: any): boolean

// Pick keys
function pickKeys<T>(obj: any, keys: string[]): T

// Merge objects
function deepMerge<T>(target: T, source: Partial<T>): T

// Get value by path
function getByPath(obj: any, path: string[]): any

// Set value by path
function setByPath(obj: any, path: string[], value: any): void
```

#### Numeric Utils

```typescript
// Round to N decimals
function round(value: number, decimals: number): number

// Clamp value
function clamp(value: number, min: number, max: number): number

// Linear interpolation
function lerp(start: number, end: number, t: number): number

// Map value from one range to another
function map(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number
```

## API Reference

### InstructionBuilder API

| Method | Description | Example |
|---------|-------------|---------|
| `key(k: string)` | Add key to path | `builder.key('nodes')` |
| `index(idx: number)` | Add index to path | `builder.index(0)` |
| `set(value: any)` | Set value | `builder.set(100)` |
| `remove()` | Remove element | `builder.remove()` |
| `arrayAdd(value)` | Add to array | `builder.arrayAdd(item)` |
| `arrayInsertAtIndex(i, value)` | Insert at index | `builder.arrayInsertAtIndex(0, item)` |
| `arrayPop()` | Remove last element | `builder.arrayPop()` |
| `arrayShift()` | Remove first element | `builder.arrayShift()` |
| `arrayUnshift(value)` | Add to beginning | `builder.arrayUnshift(item)` |
| `arrayMove(from, to)` | Move element | `builder.arrayMove(0, 5)` |
| `stringReplace(search, replace)` | Replace in string | `builder.stringReplace('a', 'b')` |
| `stringReplaceAll(search, replace)` | Replace all occurrences | `builder.stringReplaceAll('a', 'b')` |
| `stringAppend(value)` | Append to string | `builder.stringAppend('text')` |
| `stringInsert(index, value)` | Insert in string | `builder.stringInsert(5, 'x')` |
| `boolToggle()` | Toggle boolean | `builder.boolToggle()` |
| `dictMerge(value)` | Merge objects | `builder.dictMerge({a: 1})` |
| `clone()` | Clone builder | `builder.clone()` |
| `getValue<T>()` | Get value | `builder.getValue<number>()` |

## Examples

### Example 1: Create a Node

```typescript
import { Node, NodePoint } from '@nodius/utils';

const node: Node<any> = {
    _key: 'node_123',
    graphKey: 'workflow_456',
    type: 'html',
    typeVersion: 1,
    sheet: 'main',
    size: {
        width: 200,
        height: 100,
        dynamic: false
    },
    posX: 100,
    posY: 200,
    process: 'renderHtml',
    handles: {
        T: {
            position: 'separate',
            point: [
                {
                    id: 'input1',
                    type: 'in',
                    accept: 'string',
                    display: 'Input'
                }
            ]
        },
        D: {
            position: 'separate',
            point: [
                {
                    id: 'output1',
                    type: 'out',
                    accept: 'any',
                    display: 'Output'
                }
            ]
        }
    },
    data: {
        htmlContent: '<div>Hello World</div>'
    }
};
```

### Example 2: Synchronization with Instructions

```typescript
import { InstructionBuilder, GraphInstructions } from '@nodius/utils';

// Create series of instructions to modify workflow
const instructions: GraphInstructions = {
    type: 'instructions',
    workflowKey: 'workflow_123',
    clientId: 'client_abc',
    timestamp: Date.now(),
    instructions: [
        // Move node
        new InstructionBuilder()
            .key('nodes')
            .key('node_1')
            .key('posX')
            .set(150),

        // Add edge
        new InstructionBuilder()
            .key('edges')
            .arrayAdd({
                _key: 'edge_new',
                source: 'node_1',
                target: 'node_2',
                sourceHandle: 'out1',
                targetHandle: 'in1'
            }),

        // Modify property
        new InstructionBuilder()
            .key('nodes')
            .key('node_2')
            .key('data')
            .key('title')
            .set('New Title')
    ]
};
```

### Example 3: Create HtmlObject

```typescript
import { HtmlObject, HTMLDomEvent } from '@nodius/utils';

const htmlObject: HtmlObject = {
    id: 'btn_submit',
    tag: 'button',
    content: 'Submit',
    css: {
        backgroundColor: '#4CAF50',
        color: 'white',
        padding: '10px 20px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
    },
    anchor: {
        top: 10,
        left: 10,
        width: 100,
        height: 40
    },
    events: {
        click: {
            type: 'domEvent',
            event: 'click',
            handleId: 'output1'
        }
    },
    icon: 'check' // Lucide icon
};
```

### Example 4: Validate and Clean Data

```typescript
import { cleanNode, cleanEdge } from '@nodius/utils';

// Raw ArangoDB data
const rawNodeData = {
    _key: 'node_1',
    _id: 'nodius_nodes/node_1',
    _rev: '123456',
    graphKey: 'workflow_1',
    type: 'html',
    posX: 100,
    posY: 200,
    extraField: 'should be removed'
};

// Clean node (keeps only allowed fields)
const cleanedNode = cleanNode(rawNodeData);
// cleanedNode no longer contains _id, _rev, extraField

// Same for edges
const rawEdgeData = {
    _key: 'edge_1',
    _from: 'nodius_nodes/node_1',
    _to: 'nodius_nodes/node_2',
    graphKey: 'workflow_1',
    sourceHandle: 'out1',
    targetHandle: 'in1'
};

const cleanedEdge = cleanEdge(rawEdgeData);
// cleanedEdge.source = 'node_1'
// cleanedEdge.target = 'node_2'
```

## Development

### Package Structure

```
packages/utils/
├── src/
│   ├── dataType/           # Data type system
│   │   └── dataType.ts
│   ├── graph/              # Graph types and utils
│   │   ├── graphType.ts    # Node, Edge, Graph types
│   │   ├── handleUtils.ts  # Handle utilities
│   │   └── nodeUtils.ts    # Node utilities
│   ├── html/               # HTML types and utils
│   │   ├── htmlCss.ts      # CSS utilities
│   │   ├── htmlType.ts     # HtmlObject types
│   │   └── htmlUtils.ts    # HTML utilities
│   ├── requests/           # API request types
│   │   ├── clusterMessage.ts
│   │   └── type/
│   │       ├── api_builder.type.ts
│   │       ├── api_category.type.ts
│   │       ├── api_history.type.ts
│   │       ├── api_image.type.ts
│   │       ├── api_nodeconfig.type.ts
│   │       ├── api_sync.type.ts
│   │       ├── api_type.type.ts
│   │       └── api_workflow.type.ts
│   ├── sync/               # Synchronization system
│   │   ├── InstructionBuilder.ts  # Instruction builder
│   │   └── wsObject.ts            # WebSocket types
│   ├── numericUtils.ts     # Numeric utilities
│   ├── objectUtils.ts      # Object utilities
│   └── index.ts            # Barrel file (entry point)
├── package.json
├── tsconfig.json
└── README.md
```

### Build Scripts

```bash
# Build package
npm run build

# Generate barrel files
npm run barrelize
```

### Adding a New Module

1. Create TypeScript file in `src/`
2. Export necessary types/functions
3. Add export in `src/index.ts`
4. Run `npm run barrelize` to update barrel files
5. Run `npm run build` to compile

### Tests

```typescript
// Example test for InstructionBuilder
import { InstructionBuilder, OpType } from '@nodius/utils';

test('InstructionBuilder set operation', () => {
    const builder = new InstructionBuilder();
    const instruction = builder.key('test').set(123);

    expect(instruction.o).toBe(OpType.SET);
    expect(instruction.p).toEqual(['test']);
    expect(instruction.v).toBe(123);
});
```

## Code Conventions

- **Types**: PascalCase (`Node`, `Edge`, `HtmlObject`)
- **Interfaces**: PascalCase with optional `I`
- **Functions**: camelCase (`cleanNode`, `applyInstruction`)
- **Constants**: UPPER_SNAKE_CASE or camelCase depending on context
- **Enums**: PascalCase for name, UPPER_CASE for values

## Contributing

Contributions are welcome! To contribute:

1. Ensure all types are properly exported
2. Document new functions with JSDoc
3. Maintain compatibility with existing packages
4. Add usage examples if relevant

## Creator

**Hugo MATHIEU**
- Email: hugo.mathieu771@gmail.com
- LinkedIn: https://www.linkedin.com/in/hugo-mathieu-fullstack/

## Support

- **Issues**: https://github.com/Nodius-kit/Nodius/issues
- **Documentation**: See other package READMEs

## License

ISC - See [LICENSE](../../LICENSE)

---

**Note**: This package is designed for internal use within the Nodius ecosystem, but can be published to npm for external use if needed.
