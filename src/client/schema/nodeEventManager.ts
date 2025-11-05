/**
 * @file nodeEventManager.ts
 * @description Manages DOM event listeners for graph nodes with dynamic updates
 * @module schema
 *
 * REFACTORED: Now uses a context getter function instead of copying context values.
 * This prevents stale closures and eliminates the need to call updateContext() frequently.
 */

import { AsyncFunction } from "../../process/html/HtmlRender";
import { Node } from "../../utils/graph/graphType";
import { WebGpuMotor } from "./motor/webGpuMotor/index";
import {
    ActionContext,
    EditedHtmlType,
    EditedNodeTypeConfig,
    getHtmlRendererType,
    htmlRenderContext, initiateNewHtmlRendererType, removeHtmlRendererType
} from "../hooks/contexts/ProjectContext";
import {OpenHtmlEditorFct} from "../hooks/useSocketSync";
import {DataTypeClass} from "../../utils/dataType/dataType";
import {deepCopy} from "../../utils/objectUtils";
import {toast} from "react-hot-toast";
import {GraphWorkflowMemory} from "./SchemaDisplay";

export interface NodeEventContext {
    gpuMotor: WebGpuMotor;
    getNode: () => Node<any> | undefined;
    openHtmlEditor: OpenHtmlEditorFct;
    getHtmlRenderer: getHtmlRendererType;
    initiateNewHtmlRenderer: initiateNewHtmlRendererType;
    removeHtmlRenderer: removeHtmlRendererType;
    getHtmlAllRenderer: () =>  Record<string, Record<string, htmlRenderContext>>;
    container: HTMLElement;
    overlayContainer: HTMLElement;
    triggerEventOnNode: (nodeId: string, eventName: string) => void;
    editedHtml: EditedHtmlType;
    editedNodeConfig: EditedNodeTypeConfig;
    selectedNode: string[],
    dataTypes:DataTypeClass[],
    addSelectedNode: (nodeId:string, ctrlKey:boolean) => void;
    currentEntryDataType?:DataTypeClass,
    updateNode: (node:Node<any>) => Promise<ActionContext>;
    graphMemoryWorkflow: GraphWorkflowMemory

}

/**
 * Stable context for NodeEventManager - only contains functions and elements that don't change
 */
export interface NodeEventStableContext {
    gpuMotor: WebGpuMotor;
    getNode: () => Node<any> | undefined;
    container: HTMLElement;
    overlayContainer: HTMLElement;
    triggerEventOnNode: (nodeId: string, eventName: string) => void;
}

/**
 * Getter function type - returns fresh context on each call
 */
export type NodeEventContextGetter = () => NodeEventContext;

export interface DomEventConfig {
    name: string;
    call: string;
}

/**
 * Manages event listeners for a single node with proper cleanup and re-attachment
 *
 * REFACTORED: Uses a getter function for context to avoid stale closures.
 * The getter is called each time an event fires, ensuring fresh state.
 */
export class NodeEventManager {
    private eventListeners = new Map<string, ((event: any) => void)[]>();
    private container: HTMLElement;
    private overlay: HTMLElement;
    private getContext: NodeEventContextGetter;
    private stableContext: NodeEventStableContext;

    constructor(
        container: HTMLElement,
        overlay: HTMLElement,
        getContext: NodeEventContextGetter,
        stableContext: NodeEventStableContext
    ) {
        this.container = container;
        this.overlay = overlay;
        this.getContext = getContext;
        this.stableContext = stableContext;
    }

    /**
     * Attach DOM events from configuration
     */
    attachEvents(domEvents: DomEventConfig[]): void {

        // Reset cursor
        this.container.style.cursor = "default";

        // Get fresh context for event setup
        const context = this.getContext();

        if(context.editedNodeConfig && context.editedNodeConfig.node._key === this.stableContext.getNode()?._key) {
            const triggerNodeConfig = () => {
                // Always get fresh context when event fires
                const ctx = this.getContext();
                const htmlRenderer = ctx.getHtmlRenderer(this.stableContext.getNode()?._key!);
                if(htmlRenderer && htmlRenderer[""]) {
                    htmlRenderer[""].htmlMotor.setBuildingMode(true);
                    ctx.openHtmlEditor(this.stableContext.getNode()?._key!, htmlRenderer[""], () => {
                        htmlRenderer[""].htmlMotor.setBuildingMode(false);
                    })
                }
            }
            const list = this.eventListeners.get("dblclick") ?? [];
            list.push(triggerNodeConfig);
            this.eventListeners.set("dblclick", list);
            this.overlay.addEventListener("dblclick", triggerNodeConfig);
            this.container.addEventListener("dblclick", triggerNodeConfig);
        }

        for (const domEvent of domEvents) {
            if (domEvent.name === "click" || domEvent.name === "dblclick") {
                this.container.style.cursor = "pointer";
            }

            const eventHandler = async (event: any) => {
                // Get fresh context every time the event fires
                const currentNode = this.stableContext.getNode();
                if (!currentNode) return;

                const ctx = this.getContext();

                const fct = new AsyncFunction(
                    "event",
                    ...Object.keys(this.getAsyncFunctionContext()),
                    domEvent.call
                );

                await fct(
                    event,
                    ...Object.values(this.getAsyncFunctionContext()),
                );
            };


            if (domEvent.name === "load") {
                eventHandler(new Event("load", { bubbles: true }));
            } else {
                const list = this.eventListeners.get(domEvent.name) ?? [];
                list.push(eventHandler);
                this.eventListeners.set(domEvent.name, list);
                this.overlay.addEventListener(domEvent.name, eventHandler);
                this.container.addEventListener(domEvent.name, eventHandler);
            }
        }

        const list = this.eventListeners.get("click") ?? [];

        const selectNode = (e:MouseEvent) => {
            // Get fresh context when click fires
            const node = this.stableContext.getNode();
            if(!node) return;
            const ctx = this.getContext();
            ctx.addSelectedNode(node._key, e.ctrlKey);
        }

        list.push(selectNode);
        this.eventListeners.set("click", list);
        this.overlay.addEventListener("click", selectNode);
        this.container.addEventListener("click", selectNode);

    }

    /**
     * Remove all attached events
     */
    removeEvents(): void {
        this.eventListeners.forEach((listeners, eventName) => {
            listeners.forEach((listener) => {
                this.overlay.removeEventListener(eventName, listener);
                this.container.removeEventListener(eventName, listener);
            })
        });
        this.eventListeners.clear();
    }

    /**
     * Update events with new configuration
     */
    updateEvents(domEvents: DomEventConfig[]): void {
        this.removeEvents();
        this.attachEvents(domEvents);
    }

    /**
     * Get the async function context for node event handlers
     * Returns the environment object that will be available in async functions
     * @returns The context object with all available variables
     */
    public getAsyncFunctionContext(): Record<string, any> {
        const ctx = this.getContext();
        const currentNode = this.stableContext.getNode();

        return {
            event: null, // Will be provided at runtime for DOM events
            gpuMotor: this.stableContext.gpuMotor,
            node: deepCopy(currentNode),
            openHtmlEditor: ctx.openHtmlEditor,
            getHtmlRenderer: ctx.getHtmlRenderer,
            initiateNewHtmlRenderer: ctx.initiateNewHtmlRenderer,
            removeHtmlRenderer: ctx.removeHtmlRenderer,
            getHtmlAllRenderer: ctx.getHtmlAllRenderer,
            container: this.container,
            overlayContainer: this.overlay,
            triggerEventOnNode: this.stableContext.triggerEventOnNode,
            currentEntryDataType: ctx.currentEntryDataType,
            updateNode: ctx.updateNode,
            dataTypes: ctx.dataTypes,
            storage: ctx.graphMemoryWorkflow.storage,
            toast: toast
        };
    }

    /**
     * Get a map of context variables with their descriptions
     * Useful for code editor autocomplete and documentation
     * @returns A map of variable names to their descriptions
     */
    public getContextVariablesDescription(): Map<string, string> {
        const descriptions = new Map<string, string>();

        // Event variable
        descriptions.set("event", "DOM Event object (available in event handlers)");

        // GPU Motor
        descriptions.set("gpuMotor", "WebGpuMotor instance for canvas operations and transformations");

        // Node data
        descriptions.set("node", "The current Node object with all its properties and data");

        // HTML Editor functions
        descriptions.set("openHtmlEditor", "Function to open HTML editor: openHtmlEditor(nodeId: string, context: htmlRenderContext, onClose: () => void)");
        descriptions.set("getHtmlRenderer", "Function to get HTML renderer for a node: getHtmlRenderer(nodeId: string) => Record<string, htmlRenderContext>");
        descriptions.set("initiateNewHtmlRenderer", "Function to create new HTML renderer: initiateNewHtmlRenderer(nodeId: string, key: string, html: HtmlObject, option?: HtmlRenderOption)");
        descriptions.set("removeHtmlRenderer", "Function to remove HTML renderer: removeHtmlRenderer(nodeId: string, key?: string)");
        descriptions.set("getHtmlAllRenderer", "Function to get all HTML renderers: getHtmlAllRenderer() => Record<string, Record<string, htmlRenderContext>>");

        // DOM containers
        descriptions.set("container", "The main HTML container element for the node");
        descriptions.set("overlayContainer", "The overlay HTML container element for the node");

        // Event trigger
        descriptions.set("triggerEventOnNode", "Function to trigger event on another node: triggerEventOnNode(nodeId: string, eventName: string)");

        return descriptions;
    }

    /**
     * Cleanup
     */
    dispose(): void {
        this.removeEvents();
    }
}
