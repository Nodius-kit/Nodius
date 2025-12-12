import { HtmlObject } from "../../utils/html/htmlType";
import { HtmlRender } from "../html/HtmlRender";
import React from "react";
import { createRoot, Root } from "react-dom/client";

export interface ModalOptions {
    id?: string;
    nodeId: string;
    title?: string;
    content: HtmlObject | HTMLElement | string | React.ReactElement;
    width?: string;
    height?: string;
    onClose?: () => void;
    closeIfExists?: boolean; // If true, closes existing modal with same id instead of throwing error
}

interface ModalInstance {
    id: string;
    nodeId:string,
    element: HTMLElement;
    contentContainer: HTMLElement;
    htmlRender?: HtmlRender;
    reactRoot?: Root;
    onClose?: () => void;
    zIndex: number;
}

export class ModalManager {
    private static instance: ModalManager;
    private modals: Map<string, ModalInstance> = new Map();
    private container: HTMLElement | null = null;
    private currentZIndex: number = 10000;
    private dragState: {
        isDragging: boolean;
        modalId: string | null;
        startX: number;
        startY: number;
        offsetX: number;
        offsetY: number;
    } = {
        isDragging: false,
        modalId: null,
        startX: 0,
        startY: 0,
        offsetX: 0,
        offsetY: 0
    };

    private constructor() {
        this.init();
    }

    static getInstance(): ModalManager {
        if (!ModalManager.instance) {
            ModalManager.instance = new ModalManager();
        }
        return ModalManager.instance;
    }

    private init() {
        // Create container for modals
        this.container = document.createElement("div");
        this.container.id = "modal-manager-container";
        this.container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: 99999999;
        `;
        document.body.appendChild(this.container);

        // Add global event listeners for dragging
        document.addEventListener("mousemove", this.handleMouseMove.bind(this));
        document.addEventListener("mouseup", this.handleMouseUp.bind(this));
    }

    private generateId(): string {
        return `modal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    async open(options: ModalOptions): Promise<string> {
        const id = options.id || this.generateId();

        // Check if modal with this id already exists
        if (this.modals.has(id)) {
            if (options.closeIfExists !== false) {
                this.close(id);
            } else {
                throw new Error(`Modal with id "${id}" already exists`);
            }
        }

        // Create modal element
        const modalElement = this.createModalElement(id, options);

        // Create content container
        const contentContainer = modalElement.querySelector(".modal-content") as HTMLElement;

        // Setup content
        let htmlRender: HtmlRender | undefined;
        let reactRoot: Root | undefined;

        if (typeof options.content === "string") {
            contentContainer.innerHTML = options.content;
        } else if (options.content instanceof HTMLElement) {
            contentContainer.appendChild(options.content);
        } else if (React.isValidElement(options.content)) {
            // React element (JSX)
            reactRoot = createRoot(contentContainer);
            reactRoot.render(options.content);
        } else {
            // HtmlObject
            htmlRender = new HtmlRender(contentContainer);
            await htmlRender.render(options.content);
        }

        // Store modal instance
        const zIndex = this.currentZIndex++;
        modalElement.style.zIndex = zIndex.toString();

        this.modals.set(id, {
            id,
            nodeId: options.nodeId,
            element: modalElement,
            contentContainer,
            htmlRender,
            reactRoot,
            onClose: options.onClose,
            zIndex
        });

        // Append to container
        this.container!.appendChild(modalElement);

        // Center modal
        this.centerModal(modalElement);

        return id;
    }

    private createModalElement(id: string, options: ModalOptions): HTMLElement {
        const modal = document.createElement("div");
        modal.className = "modal-wrapper";
        modal.dataset.modalId = id;
        modal.style.cssText = `
            position: absolute;
            pointer-events: auto;
            background: var(--nodius-background-paper);
            border-radius: 8px;
            box-shadow: var(--nodius-shadow-4);
            display: flex;
            flex-direction: column;
            width: ${options.width || "600px"};
            height: ${options.height || "400px"};
            min-width: 300px;
            min-height: 200px;
        `;

        // Create header
        const header = document.createElement("div");
        header.className = "modal-header";
        header.style.cssText = `
            padding: 16px 16px 0px 16px;
            background: var(--nodius-background-default);
            border-radius: 8px 8px 0 0;
            cursor: move;
            user-select: none;
        `;

        const headerContainer = document.createElement("div");
        headerContainer.style.cssText = `
            border-bottom: 1px solid var(--nodius-text-divider);
            padding-bottom: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        header.appendChild(headerContainer);

        const title = document.createElement("div");
        title.className = "modal-title";
        title.textContent = options.title || "Modal";
        title.style.cssText = `
            color: var(--nodius-text-primary);
            font-size: 16px;
            font-weight: 500;
        `;

        const closeBtn = document.createElement("button");
        closeBtn.className = "modal-close-btn";
        closeBtn.textContent = "×";
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: var(--nodius-text-secondary);
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.2s;
        `;
        closeBtn.onmouseover = () => {
            closeBtn.style.color = "var(--nodius-text-primary)";
        };
        closeBtn.onmouseout = () => {
            closeBtn.style.color = "var(--nodius-text-secondary)";
        };
        closeBtn.onclick = () => this.close(id);

        headerContainer.appendChild(title);
        headerContainer.appendChild(closeBtn);

        // Add drag listeners
        header.addEventListener("mousedown", (e) => this.handleMouseDown(e, id));

        // Create content
        const content = document.createElement("div");
        content.className = "modal-content";
        content.style.cssText = `
            flex: 1;
            padding: 0px 16px 16px 16px;
            overflow: auto;
            color: var(--nodius-text-primary);
        `;

        modal.appendChild(header);
        modal.appendChild(content);

        // Bring to front on click
        modal.addEventListener("mousedown", () => this.bringToFront(id));

        return modal;
    }

    private centerModal(modalElement: HTMLElement) {
        const rect = modalElement.getBoundingClientRect();
        modalElement.style.left = `${(window.innerWidth - rect.width) / 2}px`;
        modalElement.style.top = `${(window.innerHeight - rect.height) / 2}px`;
    }

    private handleMouseDown(e: MouseEvent, modalId: string) {
        const modal = this.modals.get(modalId);
        if (!modal) return;

        this.bringToFront(modalId);

        const rect = modal.element.getBoundingClientRect();
        this.dragState = {
            isDragging: true,
            modalId,
            startX: e.clientX,
            startY: e.clientY,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top
        };

        e.preventDefault();
    }

    private handleMouseMove(e: MouseEvent) {
        if (!this.dragState.isDragging || !this.dragState.modalId) return;

        const modal = this.modals.get(this.dragState.modalId);
        if (!modal) return;

        const newX = e.clientX - this.dragState.offsetX;
        const newY = e.clientY - this.dragState.offsetY;

        // Constrain to viewport
        const rect = modal.element.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;

        modal.element.style.left = `${Math.max(0, Math.min(newX, maxX))}px`;
        modal.element.style.top = `${Math.max(0, Math.min(newY, maxY))}px`;
    }

    private handleMouseUp() {
        this.dragState.isDragging = false;
        this.dragState.modalId = null;
    }

    private bringToFront(modalId: string) {
        const modal = this.modals.get(modalId);
        if (!modal) return;

        // Get all modals sorted by z-index
        const modalsArray = Array.from(this.modals.values()).sort((a, b) => a.zIndex - b.zIndex);

        // If already at front, do nothing
        if (modalsArray[modalsArray.length - 1]?.id === modalId) return;

        // Update z-indices
        const newZIndex = this.currentZIndex++;
        modal.zIndex = newZIndex;
        modal.element.style.zIndex = newZIndex.toString();
    }

    close(id: string) {
        const modal = this.modals.get(id);
        if (!modal) return;

        // Cleanup React root if exists
        if (modal.reactRoot) {
            modal.reactRoot.unmount();
        }

        // Cleanup HtmlRender if exists
        if (modal.htmlRender) {
            modal.htmlRender.dispose();
        }

        // Call onClose callback
        if (modal.onClose) {
            modal.onClose();
        }

        // Remove from DOM
        modal.element.remove();

        // Remove from map
        this.modals.delete(id);

        // If dragging this modal, stop drag
        if (this.dragState.modalId === id) {
            this.dragState.isDragging = false;
            this.dragState.modalId = null;
        }
    }

    closeAll() {
        const ids = Array.from(this.modals.keys());
        ids.forEach(id => this.close(id));
    }

    async updateContent(id: string, content: HtmlObject | HTMLElement | string | React.ReactElement) {
        const modal = this.modals.get(id);
        if (!modal) {
            throw new Error(`Modal with id "${id}" not found`);
        }

        // Cleanup existing React root
        if (modal.reactRoot) {
            modal.reactRoot.unmount();
            modal.reactRoot = undefined;
        }

        // Cleanup existing HtmlRender
        if (modal.htmlRender) {
            modal.htmlRender.dispose();
            modal.htmlRender = undefined;
        }

        // Clear content container
        modal.contentContainer.innerHTML = "";

        // Setup new content
        if (typeof content === "string") {
            modal.contentContainer.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            modal.contentContainer.appendChild(content);
        } else if (React.isValidElement(content)) {
            // React element (JSX)
            modal.reactRoot = createRoot(modal.contentContainer);
            modal.reactRoot.render(content);
        } else {
            // HtmlObject
            modal.htmlRender = new HtmlRender(modal.contentContainer);
            await modal.htmlRender.render(content);
        }
    }

    isOpen(id: string): boolean {
        return this.modals.has(id);
    }

    getOpenModals(): ModalInstance[] {
        return Array.from(this.modals.values());
    }

    destroy() {
        this.closeAll();
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        document.removeEventListener("mousemove", this.handleMouseMove.bind(this));
        document.removeEventListener("mouseup", this.handleMouseUp.bind(this));
    }
}

// Export singleton instance
export const modalManager = ModalManager.getInstance();
