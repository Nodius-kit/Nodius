/**
 * @file nodeEventManager.ts
 * @description Manages DOM event listeners for graph nodes with dynamic updates
 * @module schema
 */

import { AsyncFunction } from "../../process/html/HtmlRender";
import { Node } from "../../utils/graph/graphType";
import { WebGpuMotor } from "./motor/webGpuMotor/index";
import {
    EditedHtmlType,
    EditedNodeTypeConfig,
    getHtmlRendererType,
    htmlRenderContext, initiateNewHtmlRendererType, removeHtmlRendererType
} from "../hooks/contexts/ProjectContext";
import {OpenHtmlEditorFct} from "../hooks/useSocketSync";

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
    addSelectedNode: (nodeId:string) => void;

}

export interface DomEventConfig {
    name: string;
    call: string;
}

/**
 * Manages event listeners for a single node with proper cleanup and re-attachment
 */
export class NodeEventManager {
    private eventListeners = new Map<string, ((event: any) => void)[]>();
    private container: HTMLElement;
    private overlay: HTMLElement;
    private context: NodeEventContext;

    constructor(
        container: HTMLElement,
        overlay: HTMLElement,
        context: NodeEventContext
    ) {
        this.container = container;
        this.overlay = overlay;
        this.context = context;
    }

    /**
     * Attach DOM events from configuration
     */
    attachEvents(domEvents: DomEventConfig[]): void {
        // Reset cursor
        this.container.style.cursor = "default";


        if(this.context.editedNodeConfig && this.context.editedNodeConfig.node._key === this.context.getNode()?._key) {
            const triggerNodeConfig = () => {
                const htmlRenderer = this.context.getHtmlRenderer(this.context.getNode()?._key!);
                if(htmlRenderer && htmlRenderer[""]) {
                    htmlRenderer[""].htmlMotor.setBuildingMode(true);
                    this.context.openHtmlEditor(this.context.getNode()?._key!, htmlRenderer[""], () => {

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
                const currentNode = this.context.getNode();
                if (!currentNode) return;

                const fct = new AsyncFunction(
                    "event",
                    "gpuMotor",
                    "node",
                    "openHtmlEditor",
                    "getHtmlRenderer",
                    "initiateNewHtmlRenderer",
                    "removeHtmlRenderer",
                    "getHtmlAllRenderer",
                    "container",
                    "overlayContainer",
                    "triggerEventOnNode",
                    domEvent.call
                );

                await fct(
                    event,
                    this.context.gpuMotor,
                    currentNode,
                    this.context.openHtmlEditor,
                    this.context.getHtmlRenderer,
                    this.context.initiateNewHtmlRenderer,
                    this.context.removeHtmlRenderer,
                    this.context.getHtmlAllRenderer,
                    this.container,
                    this.overlay,
                    this.context.triggerEventOnNode
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

        const selectNode = () => {
            const node = this.context.getNode();
            if(!node) return;
            this.context.addSelectedNode(node._key);
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
     * Update context (useful when callbacks need to reference latest state)
     */
    updateContext(context: Partial<NodeEventContext>): void {
        this.context = { ...this.context, ...context };
    }

    /**
     * Cleanup
     */
    dispose(): void {
        this.removeEvents();
    }
}
