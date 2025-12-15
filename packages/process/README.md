# @nodius/process

[![npm version](https://img.shields.io/npm/v/@nodius/process)](https://www.npmjs.com/package/@nodius/process)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Workflow execution engine for Nodius. This package handles orchestration and execution of workflow graphs, dynamic HTML rendering in nodes, and modal management.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Main Components](#main-components)
  - [WorkflowManager](#workflowmanager)
  - [WorkflowWorker](#workflowworker)
  - [HtmlRender](#htmlrender)
  - [ModalManager](#modalmanager)
- [Writing Process Code](#writing-process-code)
- [API Reference](#api-reference)
- [Node Examples](#node-examples)
- [Development](#development)

## Installation

### Within the Monorepo

```bash
npm install
```

### As Standalone Package

```bash
npm install @nodius/process
```

## Usage

### Basic Import

```typescript
import {
  WorkflowManager,
  HtmlRender,
  ModalManager
} from '@nodius/process';
```

### Initialization Example

```typescript
import { WorkflowManager, WorkflowCallbacks } from '@nodius/process';
import { Node, Edge } from '@nodius/utils';

// Define callbacks
const callbacks: WorkflowCallbacks = {
  onLog: (message, timestamp) => {
    console.log(`[${new Date(timestamp).toISOString()}] ${message}`);
  },

  onComplete: (totalTimeMs, data) => {
    console.log(`Workflow completed in ${totalTimeMs}ms`, data);
  },

  onError: (error, timestamp) => {
    console.error(`Workflow error:`, error);
  },

  onInitHtml: (html, id, containerSelector) => {
    // Initialize HTML rendering
    console.log('Init HTML:', html);
  },

  onUpdateHtml: (instructions, id) => {
    // Apply HTML instructions
    console.log('Update HTML:', instructions);
  },

  onDomEvent: (nodeKey, pointId, eventType, eventData) => {
    // Handle DOM events from nodes
    console.log(`DOM Event from ${nodeKey}:`, eventType);
  }
};

// Create manager
const workflowManager = new WorkflowManager(callbacks);

// Execute workflow
await workflowManager.executeWorkflow(
  nodes,           // Node[]
  edges,           // Edge[]
  entryNodeId,     // Entry node ID
  entryData,       // Initial data
  nodeTypeConfig   // Node type configuration
);

// Cleanup when done
workflowManager.dispose();
```

## Main Components

### WorkflowManager

The `WorkflowManager` is the main entry point for workflow execution. It orchestrates node execution and manages communication with the host application via callbacks.

#### Creation

```typescript
import { WorkflowManager, WorkflowCallbacks } from '@nodius/process';

const callbacks: WorkflowCallbacks = {
  onData?: (nodeKey: string | undefined, data: any, timestamp: number) => void;
  onLog?: (message: string, timestamp: number) => void;
  onComplete?: (totalTimeMs: number, data: any) => void;
  onError?: (error: string, timestamp: number) => void;
  onInitHtml?: (html: HtmlObject, id?: string, containerSelector?: string) => void;
  onUpdateHtml?: (instructions: Instruction[], id?: string) => void;
  onDomEvent?: (nodeKey: string, pointId: string, eventType: string, eventData: any) => void;
};

const manager = new WorkflowManager(callbacks);
```

#### Methods

##### executeWorkflow

Executes a workflow from an entry node.

```typescript
await manager.executeWorkflow(
  nodes: Node<any>[],
  edges: Edge[],
  entryNodeId: string,
  entryData: Record<string, any>,
  nodeTypeConfig: Record<NodeType, NodeTypeConfig>
): Promise<void>
```

**Parameters**:
- `nodes`: List of all workflow nodes
- `edges`: List of all connections
- `entryNodeId`: ID of the node to start execution from
- `entryData`: Initial data to pass to entry node
- `nodeTypeConfig`: Configuration for each node type (contains process code)

**Example**:
```typescript
await manager.executeWorkflow(
  [node1, node2, node3],
  [edge1, edge2],
  'node1',
  { input: 'Hello World' },
  {
    'textNode': {
      _key: 'textNode',
      name: 'Text Node',
      process: `
        const text = incoming?.data || node.data.text;
        await next("0", text);
      `
    }
  }
);
```

##### cancelExecution

Cancels current execution.

```typescript
await manager.cancelExecution(): Promise<void>
```

##### sendDomEvent

Sends a DOM event to a node (used for user interactions).

```typescript
manager.sendDomEvent(
  nodeKey: string,
  pointId: string,
  eventType: string,
  eventData: any
): void
```

**Example**:
```typescript
// Simulate button click in HTML node
manager.sendDomEvent(
  'node_button',
  'output1',
  'click',
  { x: 100, y: 50 }
);
```

##### dispose

Cleans up manager and releases resources.

```typescript
manager.dispose(): void
```

### WorkflowWorker

The `WorkflowWorker` is the internal execution engine that handles graph traversal and process code execution for each node.

**Note**: This module is used internally by the `WorkflowManager` and is generally not used directly.

#### Features

- **Sequential Execution**: Traverses graph following connections
- **Parallel Branches**: Supports workflows with multiple branches
- **State Management**: Maintains global state accessible to all nodes
- **Error Handling**: Captures and propagates errors
- **Async Support**: All operations are asynchronous

### HtmlRender

React component for rendering HTML objects defined in nodes.

#### Usage

```typescript
import { HtmlRender } from '@nodius/process';
import { HtmlObject } from '@nodius/utils';

const htmlObject: HtmlObject = {
  id: 'root',
  tag: 'div',
  css: {
    padding: '20px',
    backgroundColor: '#f0f0f0'
  },
  children: [
    {
      id: 'title',
      tag: 'h1',
      content: 'Hello Nodius',
      css: {
        color: '#333'
      }
    },
    {
      id: 'button',
      tag: 'button',
      content: 'Click Me',
      events: {
        click: {
          type: 'domEvent',
          event: 'click',
          handleId: 'output1'
        }
      }
    }
  ]
};

// In React component
<HtmlRender
  htmlObject={htmlObject}
  onDomEvent={(handleId, event, eventData) => {
    console.log('Event:', event, 'on handle:', handleId);
  }}
/>
```

#### Props

```typescript
interface HtmlRenderProps {
  htmlObject: HtmlObject;
  onDomEvent?: (handleId: string, event: string, eventData: any) => void;
  containerRef?: React.RefObject<HTMLDivElement>;
}
```

#### Features

- **Recursive Rendering**: Handles nested HTML structures
- **CSS Styles**: Apply styles via CSS objects
- **Events**: Support for custom DOM events
- **Icons**: Lucide icon integration
- **Images**: Image support
- **Anchoring**: Absolute/relative positioning system
- **Instructions**: Update via instruction system

### ModalManager

Modal manager for displaying pop-up windows in workflows.

#### Usage

```typescript
import { ModalManager } from '@nodius/process';

// Get singleton instance
const modalManager = ModalManager.getInstance();

// Open simple modal
const modalId = await modalManager.open({
  nodeId: 'node_123',
  title: 'My Modal',
  content: 'Hello from modal!',
  width: '400px',
  height: '300px',
  onClose: () => {
    console.log('Modal closed');
  }
});

// Open modal with complex HTML
await modalManager.open({
  nodeId: 'node_456',
  title: 'Complex Modal',
  content: htmlObject,  // HtmlObject
  width: '600px',
  height: '400px'
});

// Close modal
modalManager.close(modalId);

// Close all modals for a node
modalManager.closeAllByNodeId('node_123');
```

#### Options

```typescript
interface ModalOptions {
  id?: string;                    // Unique ID (auto-generated if omitted)
  nodeId: string;                 // Owner node ID
  title?: string;                 // Modal title
  content: HtmlObject | HTMLElement | string | React.ReactElement;
  width?: string;                 // Width (default: '500px')
  height?: string;                // Height (default: '400px')
  onClose?: () => void;           // Close callback
  closeIfExists?: boolean;        // Close existing if same ID (default: true)
}
```

#### Features

- **Singleton**: Single instance for entire application
- **Multi-Modals**: Support for multiple modals open simultaneously
- **Draggable**: Modals can be moved
- **Auto Z-Index**: Automatic modal ordering management
- **Node Management**: Ability to close all modals for specific node
- **Content Types**: Support for string, HTMLElement, HtmlObject, and React.ReactElement

## Writing Process Code

Process code is the JavaScript/TypeScript executed for each node during workflow traversal.

### Available Environment Variables

Each process has access to the following variables:

| Variable | Type | Description |
|----------|------|-------------|
| `node` | `Node<any>` | Current node |
| `nodeMap` | `Map<string, Node>` | Map of all workflow nodes |
| `edgeMap` | `Map<string, Edge>` | Map of all connections |
| `entryData` | `Record<string, any>` | Workflow initial data |
| `nodeTypeConfig` | `Record<NodeType, NodeTypeConfig>` | Node type configuration |
| `incoming` | `{ data: any, pointId: string, node?: Node }` | Incoming data from previous node |
| `global` | `Record<string, any>` | Global storage shared between all nodes |

### Available Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `log(message, data?)` | `(message: string, data?: any) => void` | Log message |
| `next(pointId, data?)` | `(pointId: string, data?: any) => Promise<any[]>` | Continue to next nodes via output point |
| `branch(targetNodeId, incomingPointId, data?)` | `(targetNodeId: string, incomingPointId: string, data?: any) => Promise<any>` | Start parallel branch |
| `continueAndDelay(pointId, immediateData, delayedCallback)` | `(pointId: string, immediateData: any, delayedCallback: () => Promise<any>) => Promise<void>` | Continue immediately then re-execute after delay |
| `initHtml(html, id?, containerSelector?)` | `(html: HtmlObject, id?: string, containerSelector?: string) => void` | Initialize HTML rendering |
| `updateHtml(instructions, id?)` | `(instructions: Instruction[], id?: string) => void` | Update HTML with instructions |

### Basic Pattern

```javascript
// Check for incoming data
if (incoming && incoming.data) {
    // Middle node: process and continue
    const processedData = processData(incoming.data);
    await next("output1", processedData);
} else {
    // Entry node: start workflow
    const initialData = node.data.value;
    const results = await next("output1", initialData);

    // Store final result
    global.result = results[0];
}
```

### Entry Node Pattern

Entry nodes (without incoming data) must:
1. Initialize data
2. Call `next()` to continue
3. Store final results in `global` when `next()` resolves

```javascript
if (incoming && incoming.data) {
    // Middle node
    await next("0", incoming.data + " processed");
} else {
    // Entry node
    const results = await next("0", "initial data");
    global.result = results[0]; // Store final result
}
```

### Process Examples

See [ExampleNodeProcesses.md](./src/workflow/ExampleNodeProcesses.md) for a complete collection of examples including:

1. **Text Concatenation** - Simple text concatenation
2. **Delayed Loading** - Loading with loading/loaded states
3. **Conditional Router** - Condition-based routing
4. **Data Accumulator** - Data accumulation
5. **Branch Spawner** - Parallel branch startup
6. **Parallel Multi-Branch** - Multiple parallel branches
7. **Delayed Loop** - Loop with delay
8. **Error Handler** - Error handling
9. **State Machine** - State machine
10. **Fetch API** - API calls with states

## API Reference

### WorkflowCallbacks

Interface for WorkflowManager callbacks.

```typescript
interface WorkflowCallbacks {
  /**
   * Called when node emits data
   */
  onData?: (nodeKey: string | undefined, data: any, timestamp: number) => void;

  /**
   * Called when node logs message
   */
  onLog?: (message: string, timestamp: number) => void;

  /**
   * Called when workflow completes
   */
  onComplete?: (totalTimeMs: number, data: any) => void;

  /**
   * Called on error
   */
  onError?: (error: string, timestamp: number) => void;

  /**
   * Called to initialize HTML rendering
   */
  onInitHtml?: (html: HtmlObject, id?: string, containerSelector?: string) => void;

  /**
   * Called to update HTML rendering
   */
  onUpdateHtml?: (instructions: Instruction[], id?: string) => void;

  /**
   * Called when DOM event triggered in node
   */
  onDomEvent?: (nodeKey: string, pointId: string, eventType: string, eventData: any) => void;
}
```

### Process Environment API

API available in process code for each node.

```typescript
// Logging
log(message: string, data?: any): void

// Navigation
next(pointId: string, data?: any): Promise<any[]>

// Branching
branch(targetNodeId: string, incomingPointId: string, data?: any): Promise<any>

// Delayed execution
continueAndDelay(
  pointId: string,
  immediateData: any,
  delayedCallback: () => Promise<any>
): Promise<void>

// HTML rendering
initHtml(html: HtmlObject, id?: string, containerSelector?: string): void
updateHtml(instructions: Instruction[], id?: string): void
```

## Node Examples

### Simple Calculation Node

```javascript
// Multiply by 2
const value = incoming?.data || 0;
const result = value * 2;

log(`Multiplying ${value} by 2 = ${result}`);
await next("output", result);
```

### Conditional Node

```javascript
const value = incoming?.data;

if (typeof value === 'number' && value > 100) {
    log('Value is greater than 100');
    await next("high", value);
} else {
    log('Value is 100 or less');
    await next("low", value);
}
```

### Node with HTML

```javascript
const htmlContent = {
    id: 'counter',
    tag: 'div',
    children: [
        {
            id: 'count',
            tag: 'h2',
            content: '0',
            css: {
                fontSize: '48px',
                textAlign: 'center'
            }
        },
        {
            id: 'increment',
            tag: 'button',
            content: 'Increment',
            events: {
                click: {
                    type: 'domEvent',
                    event: 'click',
                    handleId: 'increment'
                }
            }
        }
    ]
};

// Initialize HTML
initHtml(htmlContent, 'counter-ui');

// Initialize counter
global.count = 0;

// Wait for click events
// (Rest of code triggered by DOM events)
```

### Node with Modal

```javascript
// Import ModalManager (must be available in context)
const modalManager = ModalManager.getInstance();

await modalManager.open({
    nodeId: node._key,
    title: 'Information',
    content: `
        <div style="padding: 20px;">
            <h3>Workflow Started</h3>
            <p>Data: ${JSON.stringify(incoming?.data)}</p>
        </div>
    `,
    width: '400px',
    height: '200px',
    onClose: () => {
        log('Modal closed');
    }
});

// Continue workflow
await next("0", incoming?.data);
```

### Data Transformation Node

```javascript
const data = incoming?.data;

if (Array.isArray(data)) {
    // Transform array
    const transformed = data.map(item => ({
        ...item,
        processed: true,
        timestamp: Date.now()
    }));

    log(`Transformed ${data.length} items`);
    await next("output", transformed);
} else {
    log('Input is not an array');
    await next("error", { error: 'Expected array input' });
}
```

## Development

### Package Structure

```
packages/process/
├── src/
│   ├── html/                    # HTML rendering
│   │   ├── HtmlRender.tsx       # React component for rendering
│   │   └── HtmlRenderUtility.ts # Rendering utilities
│   ├── modal/                   # Modal management
│   │   ├── ModalManager.ts      # Modal manager
│   │   └── example.ts           # Usage examples
│   ├── workflow/                # Workflow engine
│   │   ├── WorkflowManager.ts   # Main manager
│   │   ├── WorkflowWorker.ts    # Workflow executor
│   │   ├── utilsFunction.ts     # Utility functions
│   │   └── ExampleNodeProcesses.md  # Example documentation
│   └── index.ts                 # Entry point
├── package.json
├── tsconfig.json
└── README.md
```

### Scripts

```bash
# Build package
npm run build

# Generate barrel files
npm run barrelize
```

### Testing

To test a workflow locally:

```typescript
import { WorkflowManager } from '@nodius/process';
import { Node, Edge } from '@nodius/utils';

const testWorkflow = async () => {
  const manager = new WorkflowManager({
    onLog: console.log,
    onComplete: (time, data) => console.log('Done:', data),
    onError: console.error
  });

  const nodes: Node<any>[] = [
    {
      _key: 'start',
      graphKey: 'test',
      type: 'text',
      typeVersion: 1,
      sheet: 'main',
      size: { width: 200, height: 100 },
      posX: 0,
      posY: 0,
      process: `
        const text = "Hello World";
        await next("0", text);
      `,
      handles: {
        D: {
          position: 'fix',
          point: [{ id: '0', type: 'out', accept: 'any' }]
        }
      }
    }
  ];

  await manager.executeWorkflow(nodes, [], 'start', {}, {
    text: {
      _key: 'text',
      name: 'Text Node',
      process: nodes[0].process
    }
  });

  manager.dispose();
};

testWorkflow();
```

## Contributing

Contributions are welcome! To contribute:

1. Ensure code is compatible with React 19
2. Document new features
3. Add examples for new process types
4. Test with different workflow types

## Creator

**Hugo MATHIEU**
- Email: hugo.mathieu771@gmail.com
- LinkedIn: https://www.linkedin.com/in/hugo-mathieu-fullstack/

## Support

- **Issues**: https://github.com/Nodius-kit/Nodius/issues
- **Documentation**: See [ExampleNodeProcesses.md](./src/workflow/ExampleNodeProcesses.md)

## License

ISC - See [LICENSE](../../LICENSE)

---

**Note**: This package requires React and React DOM as peer dependencies. Make sure they are installed in your project.
