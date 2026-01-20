import {Edge, Node, NodeType, NodeTypeConfig} from "@nodius/utils";
import {edgeArrayToMap, nodeArrayToMap} from "@nodius/utils";
import {HtmlObject} from "@nodius/utils";
import {Instruction} from "@nodius/utils";
import {deepCopy} from "@nodius/utils";
import {AsyncFunction} from "../html/HtmlRender";
import {utilsFunctionList} from "./utilsFunction";
import {modalManager} from "../modal/ModalManager";

interface incomingWorkflowNode {
    data: any,
    pointId: string,
    node?: Node<any>
}

let isExecuting = false;
let globalData: Record<string, any>|undefined = undefined;
let nodeMap: Map<string, Node<any>> | undefined = undefined;
let edgeMap: Map<string, Edge[]> | undefined = undefined;
let entryData: Record<string, any> | undefined = undefined;
let nodeTypeConfig: Record<NodeType, NodeTypeConfig> | undefined = undefined;

let executionStepUniqueId = 0;

export interface NodeRoadMapStep {
    incoming?: incomingWorkflowNode
}

let nodeRoadMap: Map<string, NodeRoadMapStep[]> | undefined = undefined;

let pendingTasks = 0;
let currentBranchStartTime = 0;
let completeResolves: ((value: any) => void)[] = [];

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
): Promise<any> => {

    isExecuting = true;

    nodeMap = nodeArrayToMap(nodes);
    edgeMap = edgeArrayToMap(edges);
    entryData = _entryData;
    nodeTypeConfig = _nodeTypeConfig;
    globalData = initialGlobalData || {};
    nodeRoadMap = new Map();

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

    currentBranchStartTime = Date.now();

    const completePromise = new Promise<any>((res) => {
        completeResolves.push(res);
    });

    const rootTask = createTask(rootNode, incoming);
    startTask(rootTask);

    return completePromise;
}
/*
const resumeExecution = (nodeKey: string, pointId: string, data: any) => {
    if (!isExecuting || !nodeMap || !edgeMap || !nodeTypeConfig) {
        console.warn('[WorkflowWorker] Cannot resume: workflow not initialized or not executing');
        return;
    }

    const node = nodeMap.get(nodeKey);
    if (!node) {
        console.warn('[WorkflowWorker] Node not found for resume:', nodeKey);
        return;
    }

    sendLog(`Resuming execution from node ${nodeKey} at input point ${pointId}`, nodeKey, data);

    const incoming: incomingWorkflowNode = {
        pointId,
        data,
    };

    currentBranchStartTime = Date.now();

    const task = createTask(node, incoming);
    startTask(task);
}*/

const resumeExecution = (nodeKey: string, pointId: string, data: any) => {
    if (!isExecuting || !nodeMap || !edgeMap || !nodeTypeConfig) {
        console.warn('[WorkflowWorker] Cannot resume: workflow not initialized or not executing');
        return;
    }
    const fromNode = nodeMap.get(nodeKey);
    if (!fromNode) {
        console.warn('[WorkflowWorker] From node not found for resume:', nodeKey);
        return;
    }
    sendLog(`Resuming execution from output point ${pointId} of node ${nodeKey}`, nodeKey, data);
    const validEdges = edgeMap.get(`source-${nodeKey}`)?.filter((e) => e.sourceHandle === pointId) || [];
    if (validEdges.length === 0) {
        sendLog(`No outgoing edges found for point ${pointId} from node ${nodeKey}`, nodeKey, undefined);
        return;
    }
    currentBranchStartTime = Date.now();
    for (const edge of validEdges) {
        const targetNode = nodeMap.get(edge.target);
        if (targetNode) {
            const childIncoming: incomingWorkflowNode = {
                pointId: edge.targetHandle,
                data: deepCopy(data),
                node: fromNode,
            };
            const childTask = createTask(targetNode, childIncoming);
            queueMicrotask(() => startTask(childTask));
        }
    }
};

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
    pendingTasks++;
    executeTask(task)
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => {
            pendingTasks--;
            if (pendingTasks === 0) {
                const totalTime = Date.now() - currentBranchStartTime;
                sendLog(`Branch execution completed in ${totalTime}ms`, undefined, undefined);
                sendMessage({
                    type: "complete",
                    data: deepCopy(globalData),
                    totalTimeMs: totalTime,
                });
                completeResolves.forEach(res => res(deepCopy(globalData)));
                completeResolves = [];
            }
        });
};

const executeTask = async (task: Task): Promise<any> => {
    if (!isExecuting) {
        throw new Error('Execution cancelled');
    }

    const { node, incoming } = task;

    const config = nodeTypeConfig![node.type];
    if (!config) {
        throw new Error(`Node config id ${node.type} is not provided`);
    }

    sendLog("working on node id " + node._key, node._key, undefined);

    executionStepUniqueId++;

    const currentRoadMap = nodeRoadMap!.get(node._key) ?? [];
    currentRoadMap.push({
        incoming: deepCopy(incoming),
    });
    nodeRoadMap!.set(node._key, currentRoadMap);

    const env = {
        node: node,
        nodeMap: nodeMap,
        edgeMap: edgeMap,
        entryData: entryData,
        nodeTypeConfig: nodeTypeConfig,
        incoming: incoming,
        global: globalData,
        parseString: (content:string) => parseString(content, node, incoming),
        initHtml: WF_initHtml,
        yieldData: WF_yieldData,
        updateHtml: WF_updateHtml,
        log: (message: string, data?: any) => sendLog(message, node._key, data),
        next: async (pointId: string, data?: any): Promise<any[]> => {
            const validEdges = edgeMap!.get(`source-${node._key}`)?.filter((e) => e.sourceHandle === pointId) || [];
            if (validEdges.length === 0) {
                return [];
            }

            const childPromises: Promise<any>[] = [];
            for (const edge of validEdges) {
                const _node = nodeMap!.get(edge.target);
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
        },
        branch: async (targetNodeId: string, incomingPointId: string, data?: any): Promise<any> => {
            const targetNode = nodeMap!.get(targetNodeId);
            if (!targetNode) {
                throw new Error(`Branch target node ${targetNodeId} not found`);
            }

            const branchIncoming: incomingWorkflowNode = {
                pointId: incomingPointId,
                data: deepCopy(data),
                node: node,
            };

            sendLog(`Starting branch from ${node._key} to ${targetNodeId}`, node._key, undefined);

            const branchTask = createTask(targetNode, branchIncoming);
            queueMicrotask(() => startTask(branchTask));
            return branchTask.promise;
        },
        continueAndDelay: async (pointId: string, immediateData: any, delayedCallback: () => Promise<any>): Promise<void> => {
            // Continue execution with immediate data
            const continuePromise = env.next(pointId, immediateData);

            // Execute delayed callback and re-execute path with new data
            queueMicrotask(async () => {
                try {
                    const delayedData = await delayedCallback();
                    sendLog(`Delayed execution completed for node ${node._key}, re-executing path`, node._key, delayedData);
                    await env.next(pointId, delayedData);
                } catch (error) {
                    sendLog(`Delayed execution error for node ${node._key}: ${error}`, node._key, undefined);
                }
            });

            await continuePromise;
        },
        nextFromNode: async (fromNodeId: string, pointId: string, data?: any): Promise<any[]> => {
            const fromNode = nodeMap!.get(fromNodeId);
            if (!fromNode) {
                sendLog(`nextFromNode: Node ${fromNodeId} not found`, node._key, undefined);
                return [];
            }

            const validEdges = edgeMap!.get(`source-${fromNodeId}`)?.filter((e) => e.sourceHandle === pointId) || [];
            if (validEdges.length === 0) {
                sendLog(`nextFromNode: No outgoing edges from node ${fromNodeId} at point ${pointId}`, node._key, undefined);
                return [];
            }

            sendLog(`nextFromNode: Teleporting execution from ${node._key} to continue from ${fromNodeId}:${pointId}`, node._key, data);

            const childPromises: Promise<any>[] = [];
            for (const edge of validEdges) {
                const targetNode = nodeMap!.get(edge.target);
                if (targetNode) {
                    const childIncoming: incomingWorkflowNode = {
                        pointId: edge.targetHandle,
                        data: deepCopy(data),
                        node: fromNode,
                    };

                    const childTask = createTask(targetNode, childIncoming);
                    queueMicrotask(() => startTask(childTask));
                    childPromises.push(childTask.promise);
                }
            }
            return Promise.all(childPromises);
        },
        ...utilsFunctionList
    };

    const fct = new AsyncFunction(...Object.keys(env), config.node.process);
    return await fct(...Object.values(env));
};

export const handleIncomingMessage = (message: any) => {
    if (message.type === 'domEvent') {
        const { nodeKey, pointId, eventType, eventData } = message;
        resumeExecution(nodeKey, pointId, { eventType, eventData });
    } else if (message.type === 'cancel') {
        isExecuting = false;
        // Note: This will cause ongoing tasks to throw on next check; long-running awaits won't be aborted automatically
    }
};

export const parseString = async (content:string,  node:Node<any>, incoming?: incomingWorkflowNode,) => {
    const variable = {
        incoming:incoming,
        node: node,
        ...entryData,
        ...globalData,
        ...utilsFunctionList
    }

    const regex = /\{\{(.*?)\}\}/g; // Non-greedy match for {{content}}

    const matches = [...content.matchAll(regex)];
    if (matches.length === 0) return content;


    const callFunction = async (code: string, env: Record<string, any>) => {
        const fct = new AsyncFunction(...[...Object.keys(env), code]);
        let output:any = undefined;
        try {
            output = await fct(...[...Object.values(env)]);
        } catch(e) {
            console.error('Error:', e, "in function:", code, "with arg", env);
        }
        return output;
    }

    // Process each match asynchronously
    const replacements = await Promise.all(
        matches.map(async (match) => {
            const inner = match[1].trim();
            return await callFunction(
                inner.startsWith("return") ? inner : "return " + inner,
                {
                   ...variable
                }
            );
        })
    );

    // Rebuild content with resolved replacements
    let replaced = content;
    matches.forEach((match, i) => {
        replaced = replaced.replace(match[0], replacements[i]);
    });

    return replaced;
}

export const dispose = () => {
    isExecuting = false;
    globalData = undefined;
    nodeMap = undefined;
    edgeMap = undefined;
    entryData = undefined;
    nodeTypeConfig = undefined;
    executionStepUniqueId = 0;
    nodeRoadMap = undefined;
    pendingTasks = 0;
    completeResolves = [];
};

let messageHandler: ((message: any) => void) | null = null;
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

function WF_yieldData() {
    sendMessage({
        type: "complete",
        data: deepCopy(globalData),
        totalTimeMs: 0,
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