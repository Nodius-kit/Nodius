/**
 * @file nodeEventManager.ts
 * @description Manages DOM event listeners for graph nodes with dynamic updates
 * @module schema
 */

import { AsyncFunction } from "../../process/html/HtmlRender";
import { Node } from "../../utils/graph/graphType";
import { WebGpuMotor } from "./motor/webGpuMotor/index";

export interface NodeEventContext {
    gpuMotor: WebGpuMotor;
    getNode: () => Node<any> | undefined;
    openHtmlEditor: any;
    getHtmlRenderer: any;
    initiateNewHtmlRenderer: any;
    getHtmlAllRenderer: any;
    container: HTMLElement;
    overlayContainer: HTMLElement;
    triggerEventOnNode: (nodeId: string, eventName: string) => void;
}

export interface DomEventConfig {
    name: string;
    call: string;
}

/**
 * Manages event listeners for a single node with proper cleanup and re-attachment
 */
export class NodeEventManager {
    private eventListeners = new Map<string, (event: any) => void>();
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
                    this.context.getHtmlAllRenderer,
                    this.container,
                    this.overlay,
                    this.context.triggerEventOnNode
                );
            };

            this.eventListeners.set(domEvent.name, eventHandler);

            if (domEvent.name === "load") {
                eventHandler(new Event("load", { bubbles: true }));
            } else {
                this.overlay.addEventListener(domEvent.name, eventHandler);
                this.container.addEventListener(domEvent.name, eventHandler);
            }
        }
    }

    /**
     * Remove all attached events
     */
    removeEvents(): void {
        this.eventListeners.forEach((listener, eventName) => {
            this.overlay.removeEventListener(eventName, listener);
            this.container.removeEventListener(eventName, listener);
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
