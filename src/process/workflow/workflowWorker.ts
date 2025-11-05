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
    node:Node<any>
}

type AsyncFunctionConstructor = new (...args: string[]) => (...args: any[]) => Promise<any>;
const AsyncFunction: AsyncFunctionConstructor = Object.getPrototypeOf(async function () {
}).constructor;

let isExecuting = false;
let shouldCancel = false;
/*
let dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
let document = dom.window.document;*/

let executionOutput:any;

const executeWorkflow = async (
    nodes: Node<any>[],
    edges: Edge[],
    entryNodeId: string,
    entryData: Record<string, any>,
    nodeTypeConfig:Record<NodeType, NodeTypeConfig>
) => {
    const startTime = Date.now();

    const { nodeMap, edgeMap } = buildExecutionGraph(nodes, edges);
    sendLog(`Graph built: ${nodes.length} nodes, ${edges.length} edges`, undefined, undefined);

    const rootNode = nodeMap.get(entryNodeId);
    if(!rootNode) {
        throw new Error('No root node with id '+entryNodeId+' found in workflow');
    }

    sendLog(`Starting execution from root node: ${entryNodeId}`, undefined, undefined);

    await executeNode(rootNode, undefined, nodeMap, edgeMap, entryData, nodeTypeConfig, );

    isExecuting = false;
    const totalTime = Date.now() - startTime;
    sendLog(`Workflow execution completed in ${totalTime}ms`, undefined, undefined);

    const completeMessage:WorkflowMessageComplete = {
        type: "complete",
        data: deepCopy(executionOutput),
        totalTimeMs: totalTime,
    }
    self.postMessage(completeMessage);

    executionOutput = undefined;
}



const executeNode = async (
    node:Node<any>,
    incoming: incomingWorkflowNode | undefined,
    nodeMap: Map<string, Node<any>>,
    edgeMap: Map<string, Edge[]>,
    entryData: Record<string, any>,
    nodeTypeConfig:Record<NodeType, NodeTypeConfig>
) => {

    if(shouldCancel) return;

    const config = nodeTypeConfig[node.type];
    if(!config) {
        throw new Error('Node config id '+node.type+' is not provided');
    }

    const env = {
        node: node,
        nodeMap: nodeMap,
        edgeMap: edgeMap,
        entryData: entryData,
        nodeTypeConfig: nodeTypeConfig,
        incoming: incoming,
        initHtml: WF_initHtml,
        updateHtml: WF_updateHtml,
        log: (message:string, data?:any) => sendLog(message, node._key, data),
        yieldData: (data:any) => WF_yieldData(data, node._key),
        next: async (pointId: string, data?:any):Promise<boolean> => {

            const validEdges = edgeMap.get("source-"+node._key)?.filter((e) => e.sourceHandle === pointId);
            if(validEdges && validEdges.length > 0) {
                const execs:Promise<void>[] = [];
                for(const edge of validEdges) {
                    const _node = nodeMap.get(edge.target);
                    const nodePointId = edge.targetHandle;
                    if(_node) {
                        execs.push(executeNode(
                            _node,
                            {
                                pointId: nodePointId,
                                node: node,
                                data: deepCopy(data)
                            },
                            nodeMap,
                            edgeMap,
                            entryData,
                            nodeTypeConfig,
                        ))
                    }
                }
                await Promise.all(execs);
                return true;
            }
            return false;
        }
    }

    const fct = new AsyncFunction(...[...Object.keys(env), config.node.process]);
    await fct(...[...Object.values(env)]);
}




/**
 * Message handler
 */
async function handleMessage(message: WorkerMessage) {
    if (message.type === 'clean') {
        shouldCancel = true;
        sendLog('Cancellation requested', undefined, undefined);
        return;
    } else if(message.type === 'execute') {
        isExecuting = true;
        shouldCancel = false;

        const parsedMessage = message as WorkerMessageExecute;
        await executeWorkflow(parsedMessage.nodes, parsedMessage.edges, parsedMessage.entryNodeId, parsedMessage.entryData, parsedMessage.nodeTypeConfig)

    }

}

// Worker message listener
if (typeof self !== 'undefined' && 'onmessage' in self) {
    self.onmessage = (event: MessageEvent<WorkerMessage>) => {
        handleMessage(event.data);
    };
}


function WF_initHtml(html:HtmlObject, id?:string, containerSelector?: string) {
    const htmlMessage: WorkflowMessageInitHtml = {
        containerSelector: containerSelector,
        html: html,
        id: id,
        type: "initHtml",
    }
    self.postMessage(htmlMessage);
}

function WF_updateHtml(instructions: Instruction[], id?:string) {
    const htmlMessage: WorkflowMessageApplyHtmlInstruction = {
        instructions: instructions,
        id: id,
        type: "applyHtmlInstruction"
    }
    self.postMessage(htmlMessage);
}

function WF_yieldData(data: any, nodeKey:string) {
    const htmlMessage: WorkflowMessageOutputData = {
        type: "yieldData",
        data: data,
        nodeKey: nodeKey,
        timestamp: Date.now(),
    }
    self.postMessage(htmlMessage);
}


/**
 * Send log message to main thread
 */
function sendLog(message: string, nodeKey:string|undefined, data:any) {
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