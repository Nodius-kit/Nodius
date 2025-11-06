//import { JSDOM } from "jsdom";
import {
    WorkerMessage,
    WorkerMessageExecute,
    WorkflowMessageApplyHtmlInstruction, WorkflowMessageComplete,
    WorkflowMessageInitHtml,
    WorkflowMessageLog, WorkflowMessageOutputData
} from "./WorkflowManager";
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
/*
let dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
let document = dom.window.document;*/

let globalData:any;

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

const executeWorkflow = async (
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

    isExecuting = false;
    const totalTime = Date.now() - startTime;
    sendLog(`Workflow execution completed in ${totalTime}ms`, undefined, undefined);

    const completeMessage: WorkflowMessageComplete = {
        type: "complete",
        data: deepCopy(globalData),
        totalTimeMs: totalTime,
    };
    self.postMessage(completeMessage);

};

/**
 * Message handler
 */
export async function handleMessage(message: WorkerMessage) {
    if (message.type === 'clean') {
        shouldCancel = true;
        sendLog('Cancellation requested', undefined, undefined);
        return;
    } else if (message.type === 'execute') {
        isExecuting = true;
        shouldCancel = false;

        const parsedMessage = message as WorkerMessageExecute & {
            startNodeId?: string;
            startPointId?: string;
            startData?: any;
            initialGlobalData?: any;
        };
        await executeWorkflow(
            parsedMessage.nodes,
            parsedMessage.edges,
            parsedMessage.entryNodeId,
            parsedMessage.entryData,
            parsedMessage.nodeTypeConfig,
            parsedMessage.startNodeId,
            parsedMessage.startPointId,
            parsedMessage.startData,
            parsedMessage.initialGlobalData
        );

    } else if (message.type === 'domEvent') {
        if (!isExecuting) {
            sendLog('Received DOM event but workflow is not executing', undefined, undefined);
            return;
        }

        // Handle DOM event by continuing workflow from the specified node and point
        const eventMessage = message as any; // WorkflowMessageDomEvent
        sendLog(`DOM event received: ${eventMessage.eventType} on node ${eventMessage.nodeKey}, point ${eventMessage.pointId}`, eventMessage.nodeKey, eventMessage.eventData);

        // Find the node
        const node = nodeMap.get(eventMessage.nodeKey);
        if (!node) {
            sendLog(`Node ${eventMessage.nodeKey} not found for DOM event`, undefined, undefined);
            return;
        }

        // Create incoming data with event information
        const incoming: incomingWorkflowNode = {
            pointId: eventMessage.pointId,
            data: eventMessage.eventData,
        };

        // Execute from this node
        const task = createTask(node, incoming);
        startTask(task);
        await task.promise;
    }
}

// Worker message listener
if (typeof self !== 'undefined' && 'onmessage' in self) {
    self.onmessage = (event: MessageEvent<WorkerMessage>) => {
        handleMessage(event.data);
    };
}


function WF_initHtml(html: HtmlObject, id?: string, containerSelector?: string) {
    const htmlMessage: WorkflowMessageInitHtml = {
        containerSelector: containerSelector,
        html: html,
        id: id,
        type: "initHtml",
    };
    self.postMessage(htmlMessage);
}

function WF_updateHtml(instructions: Instruction[], id?: string) {
    const htmlMessage: WorkflowMessageApplyHtmlInstruction = {
        instructions: instructions,
        id: id,
        type: "applyHtmlInstruction"
    };
    self.postMessage(htmlMessage);
}

function WF_yieldData(data: any, nodeKey: string) {
    const htmlMessage: WorkflowMessageOutputData = {
        type: "yieldData",
        data: data,
        nodeKey: nodeKey,
        timestamp: Date.now(),
    };
    self.postMessage(htmlMessage);
}


/**
 * Send log message to main thread
 */
function sendLog(message: string, nodeKey: string | undefined, data: any | undefined) {
    const logMessage: WorkflowMessageLog = {
        type: 'log',
        message: message,
        nodeKey: nodeKey,
        data: data,
        timestamp: Date.now()
    };
    self.postMessage(logMessage);
}


/**
 * Build execution graph from nodes and edges
 * Maps source handle points to their connected target nodes and handles
 */
function buildExecutionGraph(nodes: Node<any>[], edges: Edge[]) {
    return { nodeMap: nodeArrayToMap(nodes), edgeMap: edgeArrayToMap(edges) };
}