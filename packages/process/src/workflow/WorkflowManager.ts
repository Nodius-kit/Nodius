import {Instruction} from "@nodius/utils";
import {HtmlObject} from "@nodius/utils";
import {Edge, Node, NodeType, NodeTypeConfig} from "@nodius/utils";
import * as workflowExecutor from './WorkflowWorker';

export interface WorkflowCallbacks {
    onData?: (nodeKey: string | undefined, data: any, timestamp: number) => void;
    onLog?: (message: string, timestamp: number) => void;
    onComplete?: (totalTimeMs: number, data:any) => void;
    onError?: (error: string, timestamp: number) => void;
    onInitHtml?: (html: HtmlObject, nodeKey: string, id?:string, containerSelector?:string) => void;
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
            workflowExecutor.handleIncomingMessage({ type: 'cancel' });
            this.isExecuting = false;
            // For simplicity, no waiting here; ongoing tasks may throw if they check isExecuting
        }
    }

    public sendDomEvent(nodeKey: string, pointId: string, eventType: string, eventData: any) {
        console.log('[WorkflowManager] Sending DOM event:', eventType, 'for node:', nodeKey, 'point:', pointId);
        if (this.currentCallbacks?.onDomEvent) {
            this.currentCallbacks.onDomEvent(nodeKey, pointId, eventType, eventData);
        }
        workflowExecutor.handleIncomingMessage({
            type: 'domEvent',
            nodeKey,
            pointId,
            eventType,
            eventData
        });
    }

    public async executeWorkflow(
        nodes: Node<any>[],
        edges: Edge[],
        entryNodeId: string,
        entryData: Record<string, any>,
        nodeTypeConfig: Record<NodeType, NodeTypeConfig>,
    ): Promise<any> {

        let output:any = undefined;

        console.log('[WorkflowManager] Starting workflow execution', {
            nodeCount: nodes.length,
            edgeCount: edges.length,
            entryData: entryData
        });

        if (this.isExecuting) {
            console.log('[WorkflowManager] Cancelling previous execution');
            await this.cancelExecution();
        }

        this.isExecuting = true;
        try {
            const ret = await workflowExecutor.executeWorkflow(
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

        return output;
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
        if (message.type === "log") {
            this.currentCallbacks?.onLog?.(message.message, message.timestamp);
        } else if (message.type === "complete") {
            this.isExecuting = false;
            console.log('[WorkflowManager] Execution completed in', message.totalTimeMs, 'ms');
            this.currentCallbacks?.onComplete?.(message.totalTimeMs, message.data);
        } else if (message.type === "initHtml") {
            console.log('[WorkflowManager] initHtml:', message.html, "with render id", message.id, "on element selector", message.containerSelector, "for node", message.nodeKey);
            this.currentCallbacks?.onInitHtml?.(message.html, message.nodeKey, message.id, message.containerSelector);
        } else if (message.type === "applyHtmlInstruction") {
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