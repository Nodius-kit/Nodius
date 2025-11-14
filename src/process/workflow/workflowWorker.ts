import {Edge, Node, NodeType, NodeTypeConfig} from "../../utils/graph/graphType";
import {edgeArrayToMap, nodeArrayToMap} from "../../utils/graph/nodeUtils";
import {HtmlObject} from "../../utils/html/htmlType";
import {Instruction} from "../../utils/sync/InstructionBuilder";
import {deepCopy} from "../../utils/objectUtils";
import {AsyncFunction} from "../html/HtmlRender";


interface incomingWorkflowNode {
    data: any,
    pointId: string,
    node?: Node<any>
}

let isExecuting = false;
let globalData:any = undefined;
let nodeMap: Map<string, Node<any>> | undefined = undefined;
let edgeMap: Map<string, Edge[]> | undefined = undefined;
let entryData: Record<string, any> | undefined = undefined;
let nodeTypeConfig: Record<NodeType, NodeTypeConfig> | undefined = undefined;


let executionStepUniqueId = 0;

export interface NodeRoadMapStep {
    incoming?: incomingWorkflowNode
}

let nodeRoadMap: Map<string, NodeRoadMapStep[]>|undefined = undefined;

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

}

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
    if (!isExecuting) {
        throw new Error('Execution cancelled');
    }

    const { node, incoming } = task;

    const config = nodeTypeConfig![node.type];
    if (!config) {
        throw new Error(`Node config id ${node.type} is not provided`);
    }

    sendLog("working on node id "+node._key, node._key, undefined);

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
        initHtml: WF_initHtml,
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
        }
    };


    const fct = new AsyncFunction(...Object.keys(env), config.node.process);
    return await fct(...Object.values(env));
};


export const dispose = () => {
    isExecuting = false;
    globalData = undefined;
    nodeMap = undefined;
    edgeMap = undefined;
    entryData = undefined;
    nodeTypeConfig = undefined;
    executionStepUniqueId = 0;
    nodeRoadMap = undefined;
}


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
