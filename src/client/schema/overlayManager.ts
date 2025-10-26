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
    private gpuMotor: WebGpuMotor;

    constructor(gpuMotor: WebGpuMotor) {
        this.gpuMotor = gpuMotor;
    }

    /**
     * Add an overlay element to be managed
     */
    addOverlay(overlay: OverlayElement): void {
        this.overlays.push(overlay);
    }

    /**
     * Remove an overlay element
     */
    removeOverlay(nodeKey: string): OverlayElement | undefined {
        const index = this.overlays.findIndex(o => o.nodeKey === nodeKey);
        if (index !== -1) {
            return this.overlays.splice(index, 1)[0];
        }
        return undefined;
    }

    /**
     * Get an overlay by node key
     */
    getOverlay(nodeKey: string): OverlayElement | undefined {
        return this.overlays.find(o => o.nodeKey === nodeKey);
    }

    /**
     * Get all overlays
     */
    getAllOverlays(): OverlayElement[] {
        return [...this.overlays];
    }

    /**
     * Clear all overlays
     */
    clearOverlays(): void {
        this.overlays = [];
    }

    /**
     * Update all overlay positions and sizes
     */
    updateOverlays(): void {
        const transform = this.gpuMotor.getTransform();

        for (const overlay of this.overlays) {
            const rect = this.gpuMotor.getNodeScreenRect(overlay.nodeKey);
            if (!rect) continue;

            const scale = transform.scale;
            overlay.element.style.zoom = scale + "";
            overlay.overElement.style.zoom = scale + "";

            overlay.element.style.left = `${rect.x / scale}px`;
            overlay.element.style.top = `${rect.y / scale}px`;
            overlay.element.style.width = `${rect.width / scale}px`;
            overlay.element.style.height = `${rect.height / scale}px`;

            overlay.overElement.style.left = `${rect.x / scale}px`;
            overlay.overElement.style.top = `${rect.y / scale}px`;
            overlay.overElement.style.width = `${rect.width / scale}px`;
            overlay.overElement.style.height = `${rect.height / scale}px`;
        }
    }

    /**
     * Request an overlay update (throttled using requestAnimationFrame)
     */
    requestUpdate(): void {
        if (this.updateFrameId) {
            cancelAnimationFrame(this.updateFrameId);
        }
        this.updateFrameId = requestAnimationFrame(() => {
            this.updateOverlays();
            this.updateFrameId = undefined;
        });
    }

    /**
     * Cancel any pending update
     */
    cancelUpdate(): void {
        if (this.updateFrameId) {
            cancelAnimationFrame(this.updateFrameId);
            this.updateFrameId = undefined;
        }
    }

    /**
     * Cleanup
     */
    dispose(): void {
        this.cancelUpdate();
        this.overlays = [];
    }
}
