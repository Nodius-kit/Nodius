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
    addSelectedNode: (nodeId:string, ctrlKey:boolean) => void;

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
                    this.stableContext.gpuMotor,
                    currentNode,
                    ctx.openHtmlEditor,
                    ctx.getHtmlRenderer,
                    ctx.initiateNewHtmlRenderer,
                    ctx.removeHtmlRenderer,
                    ctx.getHtmlAllRenderer,
                    this.container,
                    this.overlay,
                    this.stableContext.triggerEventOnNode
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
     * Cleanup
     */
    dispose(): void {
        this.removeEvents();
    }
}
