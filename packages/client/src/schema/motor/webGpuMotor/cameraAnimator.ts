/**
 * @file cameraAnimator.ts
 * @description Camera animation and smooth transitions for the WebGPU graph motor
 * @module webGpuMotor
 *
 * Provides smooth camera animations including:
 * - smoothTransitionTo: Low-level camera transition with configurable easing
 * - smoothFitToNode: Fit camera view to a specific node with padding
 * - smoothFitToArea: Fit camera view to a rectangular area
 * - reapplyFitIfNeeded: Auto re-fit on canvas resize when interactive is disabled
 *
 * The animator tracks the last fit operation and user manual movements to determine
 * whether to reapply fit operations on canvas resize events.
 *
 * @example
 * const animator = new CameraAnimator(canvas, transform, minZoom, maxZoom, callbacks);
 * animator.smoothFitToNode(scene, nodeId, { padding: 100, duration: 500 });
 */

import { ViewTransform, MotorScene } from "../graphicalMotor";

/**
 * Stores information about the last fit operation for potential re-application
 */
interface FitOperation {
    type: 'node' | 'area';
    nodeId?: string;
    bounds?: { minX: number; minY: number; maxX: number; maxY: number };
    options?: {
        padding?: number;
        duration?: number;
        easing?: (t: number) => number;
    };
}

/**
 * Stores the locked area bounds that the camera cannot escape
 */
interface LockedArea {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export class CameraAnimator {
    private canvas: HTMLCanvasElement;
    private transform: ViewTransform;
    private minZoom: number;
    private maxZoom: number;
    private animationFrameId: number | null = null;
    private lastFitOperation: FitOperation | null = null;
    private userHasMovedManually: boolean = false;
    private interactiveEnabled: boolean = true;
    private lockedArea: LockedArea | null = null;
    private onDirty: () => void;
    private onPan: (transform: ViewTransform) => void;
    private onZoom: (transform: ViewTransform) => void;

    constructor(
        canvas: HTMLCanvasElement,
        transform: ViewTransform,
        minZoom: number,
        maxZoom: number,
        callbacks: {
            onDirty: () => void;
            onPan: (transform: ViewTransform) => void;
            onZoom: (transform: ViewTransform) => void;
        }
    ) {
        this.canvas = canvas;
        this.transform = transform;
        this.minZoom = minZoom;
        this.maxZoom = maxZoom;
        this.onDirty = callbacks.onDirty;
        this.onPan = callbacks.onPan;
        this.onZoom = callbacks.onZoom;
    }

    public setMaxZoom(max:number):void {
        this.maxZoom = max;
    }
    public setMinZoom(min:number):void {
        this.minZoom = min;
    }
    public getMaxZoom():number {
        return this.maxZoom;
    }
    public getMinZoom():number {
        return this.minZoom;
    }

    public setInteractiveEnabled(enabled: boolean): void {
        this.interactiveEnabled = enabled;
    }

    public setUserHasMovedManually(moved: boolean): void {
        this.userHasMovedManually = moved;
    }


    public smoothTransitionTo(options: {
        x: number;
        y: number;
        zoom: number;
        duration?: number;
        easing?: (t: number) => number;
        onComplete?: () => void;
    }): void {
        const duration = options.duration ?? 500; // Default 500ms
        const easing = options.easing ?? ((t: number) => t * t * (3 - 2 * t)); // Default smooth step

        // Cancel any existing animation
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Calculate target position in screen space
        // We want the world point (x, y) to be at the center of the canvas after transition
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;

        // Store starting values
        const startScale = this.transform.scale;
        const startTranslateX = this.transform.translateX;
        const startTranslateY = this.transform.translateY;

        // Store target values, clamped to valid zoom range
        let targetScale = Math.max(this.minZoom, Math.min(this.maxZoom, options.zoom));

        // Apply locked area constraints to target zoom if area is locked
        if (this.lockedArea) {
            const area = this.lockedArea;
            const areaWidth = area.maxX - area.minX;
            const areaHeight = area.maxY - area.minY;
            const minZoomX = this.canvas.width / areaWidth;
            const minZoomY = this.canvas.height / areaHeight;
            const minAllowedZoom = Math.min(minZoomX, minZoomY);
            const clampedMinZoom = Math.max(this.minZoom, minAllowedZoom);
            targetScale = Math.max(clampedMinZoom, targetScale);
        }

        // Calculate what the translate values should be to center on the target point
        // Use the clamped targetScale instead of options.zoom for accurate positioning
        const targetTranslateX = centerX - options.x * targetScale;
        const targetTranslateY = centerY - options.y * targetScale;

        const startTime = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = duration <= 0 ? 1 : Math.min(elapsed / duration, 1);
            const easedProgress = easing(progress);

            // Interpolate values
            this.transform.scale = startScale + (targetScale - startScale) * easedProgress;
            this.transform.translateX = startTranslateX + (targetTranslateX - startTranslateX) * easedProgress;
            this.transform.translateY = startTranslateY + (targetTranslateY - startTranslateY) * easedProgress;

            // Enforce locked area constraints during animation
            if (this.lockedArea) {
                this.enforceLockedAreaConstraints();
            }

            this.onDirty();

            // Emit events
            this.onZoom(this.transform);
            this.onPan(this.transform);

            if (progress < 1) {
                this.animationFrameId = requestAnimationFrame(animate);
            } else {
                this.animationFrameId = null;
                if (options.onComplete) {
                    options.onComplete();
                }
            }
        };
        if (duration <= 0) {
            animate(startTime);
        } else {
            this.animationFrameId = requestAnimationFrame(animate);
        }
    }

    public smoothFitToNode(scene: MotorScene | undefined, nodeId: string, options?: {
        padding?: number;
        duration?: number;
        easing?: (t: number) => number;
        onComplete?: () => void;
    }): void {
        if (!scene) return;
        const node = scene.nodes.get(nodeId);
        if (!node || typeof node.size === "string") return;

        // Store this operation for potential re-application on resize
        this.lastFitOperation = {
            type: 'node',
            nodeId: nodeId,
            options: {
                padding: options?.padding,
                duration: options?.duration,
                easing: options?.easing
            }
        };
        this.userHasMovedManually = false;

        const padding = options?.padding ?? 50;

        // Calculate the zoom level to fit the node with padding
        const availableWidth = this.canvas.width - 2 * padding;
        const availableHeight = this.canvas.height - 2 * padding;

        const scaleX = availableWidth / node.size.width;
        const scaleY = availableHeight / node.size.height;
        const targetZoom = Math.min(scaleX, scaleY);

        // Calculate center of the node
        const nodeCenterX = node.posX + node.size.width / 2;
        const nodeCenterY = node.posY + node.size.height / 2;

        this.smoothTransitionTo({
            x: nodeCenterX,
            y: nodeCenterY,
            zoom: targetZoom,
            duration: options?.duration,
            easing: options?.easing,
            onComplete: options?.onComplete
        });
    }

    public smoothFitToArea(bounds: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    }, options?: {
        padding?: number;
        duration?: number;
        easing?: (t: number) => number;
        onComplete?: () => void;
    }): void {
        // Store this operation for potential re-application on resize
        this.lastFitOperation = {
            type: 'area',
            bounds: { ...bounds },
            options: {
                padding: options?.padding,
                duration: options?.duration,
                easing: options?.easing
            }
        };
        this.userHasMovedManually = false;

        const padding = options?.padding ?? 0;

        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;

        const availableWidth = this.canvas.width - 2 * padding;
        const availableHeight = this.canvas.height - 2 * padding;

        const scaleX = availableWidth / width;
        const scaleY = availableHeight / height;
        const targetZoom = Math.min(scaleX, scaleY); // Cap at 2x zoom

        this.smoothTransitionTo({
            x: centerX,
            y: centerY,
            zoom: targetZoom,
            duration: options?.duration,
            easing: options?.easing,
            onComplete: options?.onComplete
        });
    }

    public reapplyFitIfNeeded(scene: MotorScene | undefined): void {
        // Handle locked area resize adjustments
        if (this.lockedArea && !this.interactiveEnabled) {
            this.enforceLockedAreaConstraints();
        }

        // Check if all conditions are met to re-apply the fit
        if (!this.interactiveEnabled &&
            this.lastFitOperation &&
            !this.userHasMovedManually) {

            // Re-apply the last fit operation without animation (duration: 0)
            if (this.lastFitOperation.type === 'node' && this.lastFitOperation.nodeId) {
                // Call smoothFitToNode without triggering a new storage
                // We need to temporarily prevent re-storing
                const savedOp = this.lastFitOperation;
                const savedUserMoved = this.userHasMovedManually;

                this.smoothFitToNode(scene, this.lastFitOperation.nodeId, {
                    padding: this.lastFitOperation.options?.padding,
                    duration: 0, // Instant transition on resize
                    easing: this.lastFitOperation.options?.easing
                });

                // Restore the saved state (because smoothFitToNode resets these)
                this.lastFitOperation = savedOp;
                this.userHasMovedManually = savedUserMoved;
            } else if (this.lastFitOperation.type === 'area' && this.lastFitOperation.bounds) {
                // Call smoothFitToArea without triggering a new storage
                const savedOp = this.lastFitOperation;
                const savedUserMoved = this.userHasMovedManually;

                this.smoothFitToArea(this.lastFitOperation.bounds, {
                    padding: this.lastFitOperation.options?.padding,
                    duration: 0, // Instant transition on resize
                    easing: this.lastFitOperation.options?.easing
                });

                // Restore the saved state
                this.lastFitOperation = savedOp;
                this.userHasMovedManually = savedUserMoved;
            }
        }
    }

    /**
     * Lock the camera to a specific area. The camera cannot zoom out beyond
     * this area or pan outside of it, but can zoom in and move within it.
     *
     * When interactive is disabled, the camera will automatically adjust
     * to maintain the locked area constraints when the screen is resized.
     *
     * @param bounds - The area boundaries in world coordinates
     */
    public lockCameraToArea(bounds: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    }): void {
        this.lockedArea = { ...bounds };
        // Immediately apply constraints
        this.enforceLockedAreaConstraints();
    }

    /**
     * Remove the camera area lock, allowing free movement and zoom again.
     */
    public removeCameraAreaLock(): void {
        this.lockedArea = null;
    }

    /**
     * Enforce the locked area constraints on the current camera position.
     * This ensures the camera cannot see outside the locked area.
     */
    public enforceLockedAreaConstraints(): void {
        if (!this.lockedArea) return;

        const area = this.lockedArea;
        const areaWidth = area.maxX - area.minX;
        const areaHeight = area.maxY - area.minY;

        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;

        // Calculate the minimum zoom level where the entire area fits in the view
        const minZoomX = canvasWidth / areaWidth;
        const minZoomY = canvasHeight / areaHeight;
        const minAllowedZoom = Math.min(minZoomX, minZoomY);

        // Clamp zoom to not zoom out beyond showing the entire area
        const clampedMinZoom = Math.max(this.minZoom, minAllowedZoom);
        if (this.transform.scale < clampedMinZoom) {
            this.transform.scale = clampedMinZoom;
        }

        // Calculate the visible world bounds at current zoom
        const visibleWorldWidth = canvasWidth / this.transform.scale;
        const visibleWorldHeight = canvasHeight / this.transform.scale;

        // Calculate the camera center in world coordinates
        const cameraCenterX = (canvasWidth / 2 - this.transform.translateX) / this.transform.scale;
        const cameraCenterY = (canvasHeight / 2 - this.transform.translateY) / this.transform.scale;

        // Calculate allowed center bounds (ensuring view stays within area)
        const minCenterX = area.minX + visibleWorldWidth / 2;
        const maxCenterX = area.maxX - visibleWorldWidth / 2;
        const minCenterY = area.minY + visibleWorldHeight / 2;
        const maxCenterY = area.maxY - visibleWorldHeight / 2;

        // Clamp camera center
        let clampedCenterX = cameraCenterX;
        let clampedCenterY = cameraCenterY;

        // If the visible area is larger than the locked area in X, center it
        if (visibleWorldWidth >= areaWidth) {
            clampedCenterX = (area.minX + area.maxX) / 2;
        } else {
            clampedCenterX = Math.max(minCenterX, Math.min(maxCenterX, cameraCenterX));
        }

        // If the visible area is larger than the locked area in Y, center it
        if (visibleWorldHeight >= areaHeight) {
            clampedCenterY = (area.minY + area.maxY) / 2;
        } else {
            clampedCenterY = Math.max(minCenterY, Math.min(maxCenterY, cameraCenterY));
        }

        // Convert back to translate values
        this.transform.translateX = canvasWidth / 2 - clampedCenterX * this.transform.scale;
        this.transform.translateY = canvasHeight / 2 - clampedCenterY * this.transform.scale;

        this.onDirty();
        this.onZoom(this.transform);
        this.onPan(this.transform);
    }
}
