import {Edge, Node, NodeType, NodeTypeConfig} from "../../utils/graph/graphType";
import {HtmlObject} from "../../utils/html/htmlType";
import {Instruction} from "../../utils/sync/InstructionBuilder";

export interface WorkerMessageClean {
    type: "clean"
}

export interface WorkerMessageExecute {
    type: "execute",
    entryData: Record<string, any>,
    edges: Edge[],
    nodes: Node<any>[],
    entryNodeId:string,
    nodeTypeConfig:Record<NodeType, NodeTypeConfig>,
}

export interface WorkflowMessageLog {
    type: 'log';
    message: string;
    nodeKey:string | undefined,
    data:any | undefined,
    timestamp: number;
}

export interface WorkflowMessageInitHtml {
    type: "initHtml",
    html: HtmlObject;
    containerSelector?: string;
    id?:string;
}

export interface WorkflowMessageApplyHtmlInstruction {
    type: "applyHtmlInstruction",
    instructions: Instruction[];
    id?:string;
}

export interface WorkflowMessageOutputData {
    type: "yieldData",
    data:any,
    timestamp:number,
    nodeKey:string,
}

export interface WorkflowMessageComplete {
    type: "complete";
    totalTimeMs: number;
    data: any
}

export type WorkerMessage =
    WorkerMessageClean |
    WorkflowMessageLog |
    WorkerMessageExecute |
    WorkflowMessageComplete |
    WorkflowMessageOutputData |
    WorkflowMessageApplyHtmlInstruction |
    WorkflowMessageInitHtml


export interface WorkflowCallbacks {
    onData?: (nodeKey: string | undefined, data: any, timestamp: number) => void;
    onLog?: (message: string, timestamp: number) => void;
    onComplete?: (totalTimeMs: number, data:any) => void;
    onError?: (error: string, timestamp: number) => void;
    onInitHtml?: (html: HtmlObject, id?:string, containerSelector?:string) => void;
    onUpdateHtml?: (instructions:Instruction[], id?:string) => void;
}

export class WorkflowManager {

    private worker: Worker | null;
    private isExecuting: boolean = false;

    private currentCallbacks: WorkflowCallbacks | null = null;
    
    constructor() {
        this.worker = this.createWorker();
    }

    /**
     * Create a new worker instance
     */
    private createWorker(): Worker {
        // In a real Vite setup, you'd use: new Worker(new URL('./workflowWorker.ts', import.meta.url), { type: 'module' })
        const workerPath = new URL('./workflowWorker.ts', import.meta.url);
        const worker = new Worker(workerPath, { type: 'module' });

        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
            this.handleWorkerMessage(event.data);
        };

        worker.onerror = (error) => {
            console.error('Workflow worker error:', error);
            this.handleWorkerError(error.message || 'Unknown worker error');
        };

        return worker;
    }

    public async cancelExecution() {
        if (this.worker && this.isExecuting) {
            console.log('[WorkflowManager] Sending cancel message to worker');
            const message: WorkerMessageClean = {
                type: 'clean'
            };
            this.worker.postMessage(message);

            const start = Date.now();
            const timeoutMs = 10000;
            const checkIntervalMs = 100;
            while (Date.now() - start < timeoutMs) {
                if (!this.isExecuting) {
                    return true; // field became false
                }
                await new Promise(resolve => setTimeout(resolve, checkIntervalMs)); // wait before checking again
            }
        }
    }

    /**
     * Execute workflow with given nodes and edges
     */
    public async executeWorkflow(
        nodes: Node<any>[],
        edges: Edge[],
        entryNodeId: string,
        entryData: any,
        nodeTypeConfig:Record<NodeType, NodeTypeConfig>,
        callbacks: WorkflowCallbacks
    ) {
        console.log('[WorkflowManager] Starting workflow execution', {
            nodeCount: nodes.length,
            edgeCount: edges.length
        });

        this.currentCallbacks = callbacks;


        if(!this.worker) {
            console.log('[WorkflowManager] Creating a new worker');
            this.worker = this.createWorker();
        }

        // Cancel any existing execution
        if (this.isExecuting) {
            console.log('[WorkflowManager] Cancelling previous execution');
            await this.cancelExecution();
        }


        try {
            this.isExecuting = true;

            // Send execution message
            const message: WorkerMessageExecute = {
                type: 'execute',
                nodes: nodes,
                edges: edges,
                entryNodeId: entryNodeId,
                entryData: entryData,
                nodeTypeConfig: nodeTypeConfig
            };

            this.worker.postMessage(message);
            console.log('[WorkflowManager] Execution message sent to worker');
        } catch (error) {
            console.error('[WorkflowManager] Failed to start worker:', error);
            this.handleWorkerError(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Handle worker errors
     */
    private handleWorkerError(error: string) {
        this.isExecuting = false;
        console.error('[WorkflowManager] Worker error:', error);
    }


    /**
     * Handle messages from worker
     */
    private handleWorkerMessage(message: WorkerMessage) {
        if(message.type === "log") {
            console.log('[WorkflowManager] Log:', message.message);
            this.currentCallbacks?.onData?.(message.nodeKey, message.data, message.timestamp);
        } else if(message.type === "complete") {
            this.isExecuting = false;
            console.log('[WorkflowManager] Execution completed in', message.totalTimeMs, 'ms');
            this.currentCallbacks?.onComplete?.(message.totalTimeMs, message.data);
            this.currentCallbacks = null;
        } else if(message.type === "yieldData") {
            console.log('[WorkflowManager] YieldData:', message.data, "from", message.nodeKey);
            this.currentCallbacks?.onData?.(message.nodeKey, message.data, message.timestamp);
        } else if(message.type === "initHtml") {
            console.log('[WorkflowManager] initHtml:', message.html, "with render id",message.id,"on element selector",message.containerSelector);
            this.currentCallbacks?.onInitHtml?.(message.html, message.id, message.containerSelector);
        } else if(message.type === "applyHtmlInstruction") {
            console.log('[WorkflowManager] applyHtmlInstruction: ', message.instructions, "on render id", message.id);
            this.currentCallbacks?.onUpdateHtml?.(message.instructions, message.id);
        }

    }

    public dispose() {
        console.log('[WorkflowManager] Disposing workflow manager');
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.isExecuting = false;
    }
}