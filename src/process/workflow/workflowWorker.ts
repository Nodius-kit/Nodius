import {Edge, Node, NodeType, NodeTypeConfig} from "../../utils/graph/graphType";
import {edgeArrayToMap, nodeArrayToMap} from "../../utils/graph/nodeUtils";
import {HtmlObject} from "../../utils/html/htmlType";
import {Instruction} from "../../utils/sync/InstructionBuilder";
import {deepCopy} from "../../utils/objectUtils";


export interface incomingWorkflowNode {
    data: any,
    pointId: string,
    node?: Node<any>
}

type AsyncFunctionConstructor = new (...args: string[]) => (...args: any[]) => Promise<any>;
const AsyncFunction: AsyncFunctionConstructor = Object.getPrototypeOf(async function () {
}).constructor;

let isExecuting = false;
let shouldCancel = false;
let globalData:any;
let messageHandler: ((message: any) => void) | null = null;

interface Task {
    node: Node<any>;
    incoming: incomingWorkflowNode | undefined;
    promise: Promise<any>;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
}

const createTask = (node: Node<any>, incoming: incomingWorkflowNode | undefined): Task => {
    const task: any = { node, incoming };
    task.promise = new Promise((res, rej) => {
        task.resolve = res;
        task.reject = rej;
    });
    return task;
};

const startTask = (task: Task) => {
    executeTask(task).then(task.resolve).catch(task.reject);
};

const executeTask = async (task: Task): Promise<any> => {
    if (shouldCancel) {
        throw new Error('Execution cancelled');
    }

    const { node, incoming } = task;

    const config = nodeTypeConfig[node.type];
    if (!config) {
        throw new Error(`Node config id ${node.type} is not provided`);
    }

    sendLog("working on node id "+node._key, node._key, undefined);

    const env = {
        node: node,
        nodeMap: nodeMap,
        edgeMap: edgeMap,
        entryData: entryData,
        nodeTypeConfig: nodeTypeConfig,
        incoming: incoming,
        initHtml: WF_initHtml,
        updateHtml: WF_updateHtml,
        log: (message: string, data?: any) => sendLog(message, node._key, data),
        yieldData: (data: any) => WF_yieldData(data, node._key),
        next: async (pointId: string, data?: any): Promise<any[]> => {
            const validEdges = edgeMap.get(`source-${node._key}`)?.filter((e) => e.sourceHandle === pointId) || [];
            if (validEdges.length === 0) {
                return [];
            }

            const childPromises: Promise<any>[] = [];
            for (const edge of validEdges) {
                const _node = nodeMap.get(edge.target);
                if (_node) {
                    const childIncoming: incomingWorkflowNode = {
                        pointId: edge.targetHandle,
                        data: deepCopy(data),
                        node: node,
                    };
                    const childTask = createTask(_node, childIncoming);
                    queueMicrotask(() => startTask(childTask));
                    childPromises.push(childTask.promise);
                }
            }
            return Promise.all(childPromises);
        }
    };

    const fct = new AsyncFunction(...Object.keys(env), config.node.process);
    return await fct(...Object.values(env));
};

let nodeMap: Map<string, Node<any>>;
let edgeMap: Map<string, Edge[]>;
let entryData: Record<string, any>;
let nodeTypeConfig: Record<NodeType, NodeTypeConfig>;

export const executeWorkflow = async (
    nodes: Node<any>[],
    edges: Edge[],
    entryNodeId: string,
    _entryData: Record<string, any>,
    _nodeTypeConfig: Record<NodeType, NodeTypeConfig>,
    startNodeId?: string,
    startPointId?: string,
    startData?: any,
    initialGlobalData?: any
) => {
    const startTime = Date.now();

    isExecuting = true;

    nodeMap = nodeArrayToMap(nodes);
    edgeMap = edgeArrayToMap(edges);
    entryData = _entryData;
    nodeTypeConfig = _nodeTypeConfig;
    globalData = initialGlobalData || {};

    sendLog(`Graph built: ${nodes.length} nodes, ${edges.length} edges`, undefined, undefined);

    const rootNodeId = startNodeId || entryNodeId;
    const rootNode = nodeMap.get(rootNodeId);
    if (!rootNode) {
        throw new Error(`No root node with id ${rootNodeId} found in workflow`);
    }

    sendLog(`Starting execution from root node: ${rootNodeId}`, undefined, undefined);

    let incoming: incomingWorkflowNode | undefined = undefined;
    if (startPointId) {
        incoming = {
            pointId: startPointId,
            data: startData,
        };
    }

    const rootTask = createTask(rootNode, incoming);
    startTask(rootTask);
    await rootTask.promise;

    const totalTime = Date.now() - startTime;
    sendLog(`Workflow execution completed in ${totalTime}ms`, undefined, undefined);

    sendMessage({
        type: "complete",
        data: deepCopy(globalData),
        totalTimeMs: totalTime,
    });
};

/**
 * Cancel execution
 */
export function cancelExecution() {
    shouldCancel = true;
    isExecuting = false;
    sendLog('Cancellation requested', undefined, undefined);
}

/**
 * Handle DOM event
 */
export async function handleDomEvent(nodeKey: string, pointId: string, eventType: string, eventData: any) {
    if (!isExecuting) {
        sendLog('Received DOM event but workflow is not executing', undefined, undefined);
        return;
    }

    sendLog(`DOM event received: ${eventType} on node ${nodeKey}, point ${pointId}`, nodeKey, eventData);

    // Get all edges connected to the source node at the specified point
    const edges = edgeMap.get("source-"+nodeKey)?.filter((e) => e.sourceHandle === pointId);

    if (!edges || edges.length === 0) {
        sendLog(`No nodes connected to node ${nodeKey} at point ${pointId}`, undefined, undefined);
        return;
    }

    // Get all connected nodes
    const connectedNodes = edges.map(edge => nodeMap.get(edge.target)).filter((n) => n !== undefined) as Node<any>[];

    if (connectedNodes.length === 0) {
        sendLog(`No valid nodes found connected to point ${pointId}`, undefined, undefined);
        return;
    }

    sendLog(`Executing ${connectedNodes.length} node(s) connected to point ${pointId}`, nodeKey, undefined);

    // Execute all connected nodes with the event data
    const tasks: Promise<any>[] = [];
    for (const connectedNode of connectedNodes) {
        const edge = edges.find(e => e.target === connectedNode._key);
        const incoming: incomingWorkflowNode = {
            pointId: edge!.targetHandle,
            data: deepCopy(eventData),
            node: nodeMap.get(nodeKey),
        };

        const task = createTask(connectedNode, incoming);
        startTask(task);
        tasks.push(task.promise);
    }

    // Wait for all tasks to complete
    await Promise.all(tasks);
}

/**
 * Set message handler for communication
 */
export function setMessageHandler(handler: (message: any) => void) {
    messageHandler = handler;
}

/**
 * Send message to manager
 */
function sendMessage(message: any) {
    if (messageHandler) {
        messageHandler(message);
    }
}

function WF_initHtml(html: HtmlObject, id?: string, containerSelector?: string) {
    sendMessage({
        containerSelector: containerSelector,
        html: html,
        id: id,
        type: "initHtml",
    });
}

function WF_updateHtml(instructions: Instruction[], id?: string) {
    sendMessage({
        instructions: instructions,
        id: id,
        type: "applyHtmlInstruction"
    });
}

function WF_yieldData(data: any, nodeKey: string) {
    sendMessage({
        type: "yieldData",
        data: data,
        nodeKey: nodeKey,
        timestamp: Date.now(),
    });
}

/**
 * Send log message
 */
function sendLog(message: string, nodeKey: string | undefined, data: any | undefined) {
    sendMessage({
        type: 'log',
        message: message,
        nodeKey: nodeKey,
        data: data,
        timestamp: Date.now()
    });
}
