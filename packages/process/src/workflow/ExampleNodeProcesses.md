# Example Workflow Node Process Code

This document contains example process code for workflow nodes, demonstrating various capabilities like data transformation, branching, and delayed execution.

## Available Environment Variables

When writing process code, you have access to these environment variables:

- `node` - Current node object with properties like `_key`, `type`, `data`, etc.
- `nodeMap` - Map of all nodes in the workflow (nodeId -> Node)
- `edgeMap` - Map of all edges in the workflow
- `entryData` - Initial data passed to the workflow
- `nodeTypeConfig` - Configuration for all node types
- `incoming` - Incoming data from the previous node: `{ data: any, pointId: string, node?: Node }`
- `global` - Global storage object (persists across entire workflow)
- `initHtml(html, id?, containerSelector?)` - Initialize HTML renderer
- `updateHtml(instructions, id?)` - Update HTML with instructions
- `log(message, data?)` - Log message with optional data
- `next(pointId, data?)` - Continue to next nodes via specified output point. **Returns**: `Promise<any[]>` - Array of return values from all downstream branches
- `nextFromNode(nodeId, pointId, data?)` - Continue execution from another node's output point (teleport execution). **Returns**: `Promise<any[]>` - Array of return values from all downstream branches
- `branch(targetNodeId, incomingPointId, data?)` - Start a new workflow branch to a specific node. **Returns**: `Promise<any>` - Result from the branch execution
- `continueAndDelay(pointId, immediateData, delayedCallback)` - Continue with immediate data, then re-execute with delayed data. **Returns**: `Promise<void>`

## Important Notes

### Entry Node Pattern

When a node has no incoming data (or non-string data in text processing nodes), it acts as an **entry node**. Entry nodes should:

1. Start the workflow with initial data
2. Call `await next(pointId, data)` to continue execution
3. Store the final results in `global` storage when `next()` resolves

**Example Entry Node Pattern:**
```javascript
if (incoming && incoming.data && typeof incoming.data === "string") {
    // Middle node: process and pass along
    await next("0", processedData);
} else {
    // Entry node: start workflow and store final result
    const results = await next("0", initialData);
    global.result = results[0]; // Store final result
}
```

## Example 1: Text Concatenation Node

**Purpose**: If incoming data is text, append `node.data["en"]` and continue to next point. If no incoming data (entry node), start with `node.data["en"]`, continue execution, and store final result in global when workflow completes.

```javascript
// Check if there is incoming data
if (incoming && incoming.data && typeof incoming.data === "string") {
    // Middle node: concatenate incoming text with node text
    const text = node.data["en"] || "";
    const result = incoming.data + text;

    log("Concatenating text: " + incoming.data + " + " + text + " = " + result);

    // Continue to output point "0" with the result
    await next("0", result);
} else {
    // Entry node: start with node text, execute workflow, store final result in global
    const text = node.data["en"] || "";

    log("Entry node, starting with: " + text);

    // Continue workflow with initial text and wait for final results
    const results = await next("0", text);

    // Store the final result in global storage
    // results is an array of return values from all branches
    if (results && results.length > 0) {
        global.result = results[0]; // Take first result
        log("Final result stored in global: " + global.result);
    } else {
        global.result = text; // No downstream nodes, store initial text
        log("No downstream results, stored initial text in global: " + global.result);
    }
}
```

## Example 2: Delayed Text Loading Node

**Purpose**: Same as Example 1, but adds "loading..." immediately, waits 2 seconds, then changes to "loaded". For entry nodes, stores final result in global after delayed execution.

```javascript
// Check if there is incoming data
if (incoming && incoming.data && typeof incoming.data === "string") {
    // Middle node: concatenate with delayed state changes
    const text = node.data["en"] || "";
    const loadingText = incoming.data + text + " loading...";

    log("Starting delayed load with immediate text: " + loadingText);

    // Continue immediately with "loading..." text, then after 2 seconds continue again with "loaded"
    await continueAndDelay("0", loadingText, async () => {
        // Wait 2 seconds
        await new Promise(resolve => setTimeout(resolve, 2000));

        const loadedText = incoming.data + text + " loaded";
        log("Delayed load completed: " + loadedText);

        return loadedText;
    });
} else {
    // Entry node: start with node text, show loading, then loaded states
    const text = node.data["en"] || "";
    const loadingText = text + " loading...";

    log("Entry node, starting with loading state: " + loadingText);

    // Set immediate loading state and continue workflow
    global.result = loadingText;

    await continueAndDelay("0", loadingText, async () => {
        // Wait 2 seconds
        await new Promise(resolve => setTimeout(resolve, 2000));

        const loadedText = text + " loaded";
        log("Delayed load completed: " + loadedText);

        // Continue workflow with loaded text
        const results = await next("0", loadedText);

        // Store final result after workflow completes
        if (results && results.length > 0) {
            global.result = results[0];
            log("Final result stored in global: " + global.result);
        } else {
            global.result = loadedText;
            log("No downstream results, stored loaded text in global: " + global.result);
        }

        return loadedText;
    });
}
```

## Example 3: Conditional Router Node

**Purpose**: Routes data to different output points based on conditions.

```javascript
if (incoming && incoming.data) {
    const value = incoming.data;

    if (typeof value === "string") {
        log("Routing string to point 'text'");
        await next("text", value);
    } else if (typeof value === "number") {
        log("Routing number to point 'number'");
        await next("number", value);
    } else if (typeof value === "object") {
        log("Routing object to point 'object'");
        await next("object", value);
    } else {
        log("Unknown type, routing to point 'other'");
        await next("other", value);
    }
} else {
    log("No incoming data");
    await next("empty");
}
```

## Example 4: Data Accumulator Node

**Purpose**: Accumulates incoming data into global storage array.

```javascript
// Initialize global array if it doesn't exist
if (!global.accumulated) {
    global.accumulated = [];
}

// Add incoming data to accumulator
if (incoming && incoming.data !== undefined) {
    global.accumulated.push(incoming.data);
    log("Accumulated data (count: " + global.accumulated.length + ")");
}

// Pass accumulated array to next node
await next("0", global.accumulated);
```

## Example 5: Branch Spawner Node

**Purpose**: Starts a parallel workflow branch while continuing the main workflow.

```javascript
// Get target node ID from node data
const branchTargetId = node.data["branchNodeId"];

if (branchTargetId) {
    log("Spawning branch to node: " + branchTargetId);

    // Start a parallel branch without waiting for it
    branch(branchTargetId, "0", {
        parentNode: node._key,
        timestamp: Date.now(),
        data: incoming?.data
    }).catch(err => {
        log("Branch execution error: " + err);
    });

    log("Branch started, continuing main workflow");
}

// Continue main workflow
await next("0", incoming?.data);
```

## Example 6: Parallel Multi-Branch Node

**Purpose**: Spawns multiple branches and waits for all to complete before continuing.

```javascript
const branchNodeIds = node.data["branchNodeIds"] || [];

if (branchNodeIds.length > 0) {
    log("Starting " + branchNodeIds.length + " parallel branches");

    // Start all branches in parallel
    const branchPromises = branchNodeIds.map(nodeId =>
        branch(nodeId, "0", {
            parentNode: node._key,
            incomingData: incoming?.data
        })
    );

    // Wait for all branches to complete
    const results = await Promise.all(branchPromises);

    log("All branches completed, results: " + JSON.stringify(results));

    // Continue with branch results
    await next("0", results);
} else {
    log("No branches defined, continuing");
    await next("0", incoming?.data);
}
```

## Example 7: Delayed Loop Node

**Purpose**: Repeatedly executes and sends updates at intervals.

```javascript
const iterations = node.data["iterations"] || 3;
const delayMs = node.data["delayMs"] || 1000;

log("Starting delayed loop: " + iterations + " iterations with " + delayMs + "ms delay");

for (let i = 0; i < iterations; i++) {
    const loopData = {
        iteration: i + 1,
        total: iterations,
        data: incoming?.data
    };

    log("Loop iteration " + (i + 1) + "/" + iterations);

    if (i < iterations - 1) {
        // Not the last iteration - continue and wait
        await next("loop", loopData);
        await new Promise(resolve => setTimeout(resolve, delayMs));
    } else {
        // Last iteration - send to completion point
        await next("complete", loopData);
    }
}
```

## Example 8: Error Handler Node

**Purpose**: Catches errors from previous nodes and routes accordingly.

```javascript
try {
    if (incoming && incoming.data) {
        // Validate incoming data
        if (incoming.data.error) {
            throw new Error(incoming.data.error);
        }

        // Process valid data
        const result = {
            status: "success",
            data: incoming.data,
            processedAt: Date.now()
        };

        await next("success", result);
    } else {
        throw new Error("No incoming data");
    }
} catch (error) {
    log("Error caught: " + error.message);

    const errorData = {
        status: "error",
        message: error.message,
        node: node._key,
        timestamp: Date.now()
    };

    // Store error in global for debugging
    if (!global.errors) {
        global.errors = [];
    }
    global.errors.push(errorData);

    // Route to error handler
    await next("error", errorData);
}
```

## Example 9: State Machine Node

**Purpose**: Maintains state in global storage and transitions based on incoming data.

```javascript
// Initialize state if needed
if (!global.state) {
    global.state = "idle";
}

const currentState = global.state;
const action = incoming?.data?.action;

log("Current state: " + currentState + ", Action: " + action);

switch (currentState) {
    case "idle":
        if (action === "start") {
            global.state = "running";
            await next("running", { state: "running" });
        }
        break;

    case "running":
        if (action === "pause") {
            global.state = "paused";
            await next("paused", { state: "paused" });
        } else if (action === "stop") {
            global.state = "stopped";
            await next("stopped", { state: "stopped" });
        }
        break;

    case "paused":
        if (action === "resume") {
            global.state = "running";
            await next("running", { state: "running" });
        } else if (action === "stop") {
            global.state = "stopped";
            await next("stopped", { state: "stopped" });
        }
        break;

    case "stopped":
        if (action === "reset") {
            global.state = "idle";
            await next("idle", { state: "idle" });
        }
        break;
}
```

## Example 10: Fetch API Node with Loading State

**Purpose**: Fetches data from an API with loading/loaded states.

```javascript
const url = node.data["url"] || "";

if (!url) {
    log("No URL provided");
    await next("error", { error: "No URL provided" });
    return;
}

log("Fetching data from: " + url);

// Continue with loading state
await continueAndDelay("0", { status: "loading", url: url }, async () => {
    try {
        // Note: In a real workflow, you'd need to have fetch available
        // This is a conceptual example
        const response = await fetch(url);
        const data = await response.json();

        log("Data fetched successfully");

        return {
            status: "loaded",
            url: url,
            data: data,
            timestamp: Date.now()
        };
    } catch (error) {
        log("Fetch error: " + error.message);

        return {
            status: "error",
            url: url,
            error: error.message,
            timestamp: Date.now()
        };
    }
});
```

## Example 11: Execution Teleport Node (nextFromNode)

**Purpose**: Teleport execution to continue from another node's output point, useful for dynamic routing or skipping parts of the workflow.

```javascript
// Get target node ID from node data or incoming data
const teleportToNodeId = node.data["teleportNodeId"] || incoming?.data?.teleportTo;

if (teleportToNodeId) {
    log("Teleporting execution to continue from node: " + teleportToNodeId);

    // Continue execution as if we were at the target node
    // This will follow the edges from the target node's output point "0"
    const results = await nextFromNode(teleportToNodeId, "0", {
        originalNode: node._key,
        teleportedFrom: node._key,
        data: incoming?.data
    });

    log("Teleported execution completed with results: " + JSON.stringify(results));

    // Optionally store results
    global.teleportResults = results;
} else {
    // No teleport target, continue normally
    await next("0", incoming?.data);
}
```

**Use Cases for nextFromNode:**

- **Dynamic routing**: Skip nodes conditionally and continue from a different part of the graph
- **Reusing subgraphs**: Execute a shared subgraph from multiple entry points
- **Error recovery**: Jump to a recovery node's output to resume normal flow
- **Workflow shortcuts**: Allow users to skip optional steps

**Difference from `branch`:**
- `branch(nodeId, pointId, data)` - Executes the target node itself with incoming data on `pointId`
- `nextFromNode(nodeId, pointId, data)` - Skips the target node, continues from its output edges on `pointId`

```javascript
// Example: Conditional teleport based on data
if (incoming?.data?.skipProcessing) {
    // Skip the processing node and continue from its output
    log("Skipping processing, teleporting to continue from processingNode output");
    await nextFromNode("processingNode", "success", incoming.data);
} else {
    // Normal flow through processing
    await next("0", incoming.data);
}
```

## Notes on Usage

- **Global Storage**: Use `global` to share data across the entire workflow
- **Local Data**: Use `incoming.data` for data that follows the current execution path
- **Branching**: Use `branch()` to spawn parallel workflow paths
- **Teleporting**: Use `nextFromNode()` to continue from another node's output point
- **Delayed Execution**: Use `continueAndDelay()` to send immediate data and then update with delayed data
- **Logging**: Use `log()` to track execution flow and debug issues
- **Error Handling**: Always wrap risky operations in try-catch blocks

Remember that all process code runs in an async context, so you can use `await` for asynchronous operations.
