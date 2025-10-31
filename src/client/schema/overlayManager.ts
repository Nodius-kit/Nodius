/**
 * @file overlayManager.ts
 * @description Manages HTML overlays positioning and updates for graph nodes
 * @module schema
 */

import { WebGpuMotor } from "./motor/webGpuMotor/index";

export interface OverlayElement {
    nodeKey: string;
    element: HTMLElement;
    overElement: HTMLElement;
}

/**
 * Manages HTML overlay positioning synchronized with WebGPU canvas
 */
export class OverlayManager {
    private overlays: OverlayElement[] = [];
    private updateFrameId?: number;
    private pendingKeys?: Set<string>;   // keys scheduled for the next frame
    private gpuMotor: WebGpuMotor;

    constructor(gpuMotor: WebGpuMotor) {
        this.gpuMotor = gpuMotor;
    }

    /** Add an overlay element to be managed */
    addOverlay(overlay: OverlayElement): void {
        this.overlays.push(overlay);
    }

    /** Remove an overlay element */
    removeOverlay(nodeKey: string): OverlayElement | undefined {
        const index = this.overlays.findIndex(o => o.nodeKey === nodeKey);
        if (index !== -1) {
            return this.overlays.splice(index, 1)[0];
        }
        return undefined;
    }

    /** Get an overlay by node key */
    getOverlay(nodeKey: string): OverlayElement | undefined {
        return this.overlays.find(o => o.nodeKey === nodeKey);
    }

    /** Get all overlays */
    getAllOverlays(): OverlayElement[] {
        return [...this.overlays];
    }

    /** Clear all overlays */
    clearOverlays(): void {
        this.overlays = [];
    }

    /**
     * Resolve which overlays must be refreshed.
     * @param nodeKeys optional key(s) – if omitted → all overlays
     */
    private getOverlaysToUpdate(nodeKeys?: string | string[]): OverlayElement[] {
        if (!nodeKeys) return this.overlays;

        const keys = Array.isArray(nodeKeys) ? nodeKeys : [nodeKeys];
        const set = new Set(keys);

        return this.overlays.filter(o => set.has(o.nodeKey));
    }

    /**
     * Update overlay positions and sizes.
     * @param nodeKeys optional – update only these keys (or all if omitted)
     */
    private updateOverlays(nodeKeys?: string | string[]): void {
        const transform = this.gpuMotor.getTransform();
        const scale = transform.scale;
        const toUpdate = this.getOverlaysToUpdate(nodeKeys);

        for (const overlay of toUpdate) {
            const rect = this.gpuMotor.getNodeScreenRect(overlay.nodeKey);
            if (!rect) continue;

            const inv = 1 / scale;
            const left = `${rect.x * inv}px`;
            const top  = `${rect.y * inv}px`;
            const w    = `${rect.width * inv}px`;
            const h    = `${rect.height * inv}px`;

            // element
            overlay.element.style.zoom   = scale + "";
            overlay.element.style.left   = left;
            overlay.element.style.top    = top;
            overlay.element.style.width  = w;
            overlay.element.style.height = h;

            // overElement
            overlay.overElement.style.zoom   = scale + "";
            overlay.overElement.style.left   = left;
            overlay.overElement.style.top    = top;
            overlay.overElement.style.width  = w;
            overlay.overElement.style.height = h;
        }
    }

    /**
     * Request an overlay update (throttled with requestAnimationFrame).
     * @param nodeKeys optional – only these keys will be refreshed
     */
    requestUpdate(nodeKeys?: string | string[]): void {
        // Merge new keys with any already pending ones
        if (nodeKeys) {
            const keys = Array.isArray(nodeKeys) ? nodeKeys : [nodeKeys];
            if (!this.pendingKeys) this.pendingKeys = new Set();
            keys.forEach(k => this.pendingKeys!.add(k));
        }

        if (this.updateFrameId) {
            cancelAnimationFrame(this.updateFrameId);
        }

        this.updateFrameId = requestAnimationFrame(() => {
            const keysToUpdate = this.pendingKeys
                ? Array.from(this.pendingKeys)
                : undefined;

            this.updateOverlays(keysToUpdate);
            this.updateFrameId = undefined;
            this.pendingKeys = undefined;
        });
    }

    /** Cancel any pending update */
    cancelUpdate(): void {
        if (this.updateFrameId) {
            cancelAnimationFrame(this.updateFrameId);
            this.updateFrameId = undefined;
        }
        this.pendingKeys = undefined;
    }

    /** Cleanup */
    dispose(): void {
        this.cancelUpdate();
        this.overlays = [];
    }
}