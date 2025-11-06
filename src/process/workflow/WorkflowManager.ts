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

export interface WorkflowMessageDomEvent {
    type: "domEvent";
    nodeKey: string;
    pointId: string;
    eventType: string;
    eventData: any;
}

export type WorkerMessage =
    WorkerMessageClean |
    WorkflowMessageLog |
    WorkerMessageExecute |
    WorkflowMessageComplete |
    WorkflowMessageOutputData |
    WorkflowMessageApplyHtmlInstruction |
    WorkflowMessageInitHtml |
    WorkflowMessageDomEvent


export interface WorkflowCallbacks {
    onData?: (nodeKey: string | undefined, data: any, timestamp: number) => void;
    onLog?: (message: string, timestamp: number) => void;
    onComplete?: (totalTimeMs: number, data:any) => void;
    onError?: (error: string, timestamp: number) => void;
    onInitHtml?: (html: HtmlObject, id?:string, containerSelector?:string) => void;
    onUpdateHtml?: (instructions:Instruction[], id?:string) => void;
    onDomEvent?: (nodeKey: string, pointId: string, eventType: string, eventData: any) => void;
}

export class WorkflowManager {

    private worker: Worker | null;
    private isExecuting: boolean = false;
    private useWorker: boolean = true; // true = real worker, false = main thread

    private currentCallbacks: WorkflowCallbacks | null = null;

    constructor(useWorker: boolean = true) {
        this.useWorker = useWorker;
        if (this.useWorker) {
            this.worker = this.createWorker();
        } else {
            this.worker = null;
        }
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

    public sendDomEvent(nodeKey: string, pointId: string, eventType: string, eventData: any) {
        if (!this.isExecuting) {
            console.warn('[WorkflowManager] Cannot send DOM event: workflow not executing');
            return;
        }

        const message: WorkflowMessageDomEvent = {
            type: 'domEvent',
            nodeKey: nodeKey,
            pointId: pointId,
            eventType: eventType,
            eventData: eventData
        };

        console.log('[WorkflowManager] Sending DOM event:', eventType, 'for node:', nodeKey, 'point:', pointId);

        if (this.useWorker) {
            if (this.worker) {
                this.worker.postMessage(message);
            }
        } else {
            // Main thread mode: call handleMessage directly
            import('./workflowWorker').then(workerModule => {
                const fakeSelf = {
                    postMessage: (msg: WorkerMessage) => {
                        this.handleWorkerMessage(msg);
                    }
                };
                const originalSelf = (globalThis as any).self;
                (globalThis as any).self = fakeSelf;
                try {
                    (workerModule as any).handleMessage?.(message);
                } finally {
                    (globalThis as any).self = originalSelf;
                }
            });
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
            edgeCount: edges.length,
            mode: this.useWorker ? 'worker' : 'main-thread'
        });

        this.currentCallbacks = callbacks;

        // Cancel any existing execution
        if (this.isExecuting) {
            console.log('[WorkflowManager] Cancelling previous execution');
            await this.cancelExecution();
        }

        this.isExecuting = true;

        if (this.useWorker) {
            // Mode Worker: utilise un Web Worker
            if(!this.worker) {
                console.log('[WorkflowManager] Creating a new worker');
                this.worker = this.createWorker();
            }

            try {
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
        } else {
            // Mode Main Thread: appel direct
            console.log('[WorkflowManager] Executing in main thread');

            try {
                // Import dynamique du module worker
                const workerModule = await import('./workflowWorker');

                // Créer un faux self qui redirige les messages
                const fakeSelf = {
                    postMessage: (msg: WorkerMessage) => {
                        this.handleWorkerMessage(msg);
                    }
                };

                // Remplacer temporairement self
                const originalSelf = (globalThis as any).self;
                (globalThis as any).self = fakeSelf;

                try {
                    // Simuler l'envoi du message au worker
                    const message: WorkerMessageExecute = {
                        type: 'execute',
                        nodes: nodes,
                        edges: edges,
                        entryNodeId: entryNodeId,
                        entryData: entryData,
                        nodeTypeConfig: nodeTypeConfig
                    };

                    // Appeler directement la fonction du worker
                    await (workerModule as any).handleMessage?.(message);
                } finally {
                    // Restaurer self
                    (globalThis as any).self = originalSelf;
                }
            } catch (error) {
                console.error('[WorkflowManager] Failed to execute in main thread:', error);
                this.handleWorkerError(error instanceof Error ? error.message : String(error));
            }
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
            this.currentCallbacks?.onLog?.(message.message, message.timestamp);
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