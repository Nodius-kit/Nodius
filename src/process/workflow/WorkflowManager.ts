import {Instruction} from "../../utils/sync/InstructionBuilder";
import {HtmlObject} from "../../utils/html/htmlType";
import {Edge, Node, NodeType, NodeTypeConfig} from "../../utils/graph/graphType";
import * as workflowExecutor from './WorkflowWorker';

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
    private isExecuting: boolean = false;
    private currentCallbacks?: WorkflowCallbacks;

    constructor(callbacks?: WorkflowCallbacks) {
        this.currentCallbacks = callbacks;
        // Set up message handler for workflow executor
        workflowExecutor.setMessageHandler((message: any) => {
            this.handleMessage(message);
        });
    }

    public async cancelExecution() {
        if (this.isExecuting) {
            console.log('[WorkflowManager] Cancelling execution');
            this.isExecuting = false;
            // wait end
        }
    }


    public sendDomEvent(nodeKey: string, pointId: string, eventType: string, eventData: any) {
        if (!this.isExecuting) {
            console.warn('[WorkflowManager] Cannot send DOM event: workflow not executing');
            return;
        }
        console.log('[WorkflowManager] Sending DOM event:', eventType, 'for node:', nodeKey, 'point:', pointId);

    }

    public async executeWorkflow(
        nodes: Node<any>[],
        edges: Edge[],
        entryNodeId: string,
        entryData: Record<string, any>,
        nodeTypeConfig:Record<NodeType, NodeTypeConfig>,
    ) {
        console.log('[WorkflowManager] Starting workflow execution', {
            nodeCount: nodes.length,
            edgeCount: edges.length
        });

        if (this.isExecuting) {
            console.log('[WorkflowManager] Cancelling previous execution');
            await this.cancelExecution();
        }

        this.isExecuting = true;
        try {
            await workflowExecutor.executeWorkflow(
                nodes,
                edges,
                entryNodeId,
                entryData,
                nodeTypeConfig
            );
        } catch (error) {
            console.error('[WorkflowManager] Failed to execute workflow:', error);
            this.handleError(error instanceof Error ? error.message : String(error));
        }
    }


    /**
     * Handle workflow errors
     */
    private handleError(error: string) {
        this.isExecuting = false;
        console.error('[WorkflowManager] Workflow error:', error);
        this.currentCallbacks?.onError?.(error, Date.now());
    }

    /**
     * Handle messages from workflow executor
     */
    private handleMessage(message: any) {
        if(message.type === "log") {
            this.currentCallbacks?.onLog?.(message.message, message.timestamp);
        } else if(message.type === "complete") {
            this.isExecuting = false;
            console.log('[WorkflowManager] Execution completed in', message.totalTimeMs, 'ms');
            this.currentCallbacks?.onComplete?.(message.totalTimeMs, message.data);
        }  if(message.type === "initHtml") {
            console.log('[WorkflowManager] initHtml:', message.html, "with render id",message.id,"on element selector",message.containerSelector);
            this.currentCallbacks?.onInitHtml?.(message.html, message.id, message.containerSelector);
        } else if(message.type === "applyHtmlInstruction") {
            console.log('[WorkflowManager] applyHtmlInstruction: ', message.instructions, "on render id", message.id);
            this.currentCallbacks?.onUpdateHtml?.(message.instructions, message.id);
        }
    }

    public dispose() {
        console.log('[WorkflowManager] Disposing workflow manager');
        this.isExecuting = false;
        this.currentCallbacks = undefined;
        workflowExecutor.dispose();
    }

}