/**
 * @file inputHandler.ts
 * @description Mouse and keyboard input handling for the WebGPU graph motor
 * @module webGpuMotor
 *
 * Handles user input for camera control:
 * - Mouse drag panning (left mouse button)
 * - Mouse wheel zooming (with zoom centered on cursor position)
 * - Keyboard arrow key navigation (continuous movement with key repeat)
 * - Input enable/disable state management
 *
 * Zooming uses exponential scaling for smooth zoom feel and maintains
 * the world position under the cursor during zoom operations.
 *
 * Arrow key navigation uses intervals for smooth continuous movement.
 */

import { ViewTransform } from "../graphicalMotor";
import { documentHaveActiveElement } from "@nodius/utils";
import { KeyState } from "./types";

/**
 * Manages mouse and keyboard input for camera control
 */
export class InputHandler {
    private canvas: HTMLCanvasElement;
    private transform: ViewTransform;
    private isPanning: boolean = false;
    private lastMouseX: number = 0;
    private lastMouseY: number = 0;
    private pressed: KeyState = {};
    private minZoom: number;
    private maxZoom: number;
    private interactiveEnabled: boolean;
    private onDirty: () => void;
    private onPan: (transform: ViewTransform) => void;
    private onZoom: (transform: ViewTransform) => void;
    private onUserMove: () => void;
    private onConstrainTransform?: () => void;

    // Event listener references for cleanup
    private mouseDownListener: ((e: MouseEvent) => void) | null = null;
    private mouseMoveListener: ((e: MouseEvent) => void) | null = null;
    private mouseUpListener: ((e: MouseEvent) => void) | null = null;
    private mouseOutListener: (() => void) | null = null;
    private wheelListener: ((e: WheelEvent) => void) | null = null;

    public getIsPanning(): boolean {
        return this.isPanning;
    }

    constructor(
        canvas: HTMLCanvasElement,
        transform: ViewTransform,
        minZoom: number,
        maxZoom: number,
        interactiveEnabled: boolean,
        callbacks: {
            onDirty: () => void;
            onPan: (transform: ViewTransform) => void;
            onZoom: (transform: ViewTransform) => void;
            onUserMove: () => void;
            onConstrainTransform?: () => void;
        }
    ) {
        this.canvas = canvas;
        this.transform = transform;
        this.minZoom = minZoom;
        this.maxZoom = maxZoom;
        this.interactiveEnabled = interactiveEnabled;
        this.onDirty = callbacks.onDirty;
        this.onPan = callbacks.onPan;
        this.onZoom = callbacks.onZoom;
        this.onUserMove = callbacks.onUserMove;
        this.onConstrainTransform = callbacks.onConstrainTransform;
    }

    public setInteractiveEnabled(enabled: boolean): void {
        this.interactiveEnabled = enabled;
    }

    public setupMouseEvents(): void {
        this.mouseDownListener = (e: MouseEvent) => {
            if (!this.interactiveEnabled) return;
            if (e.button === 1) {
                this.isPanning = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.onUserMove();
            }
        };

        this.mouseMoveListener = (e: MouseEvent) => {
            if (!this.interactiveEnabled) {
                this.isPanning = false;
                return;
            }
            if (this.isPanning) {
                const dx = e.clientX - this.lastMouseX;
                const dy = e.clientY - this.lastMouseY;
                this.transform.translateX += dx;
                this.transform.translateY += dy;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.onConstrainTransform?.();
                this.onDirty();
                this.onPan(this.transform);
            }
        };

        this.mouseUpListener = (e: MouseEvent) => {
            if(e.button === 1) {
                if (!this.interactiveEnabled) return;
                this.isPanning = false;
            }
        };

        this.mouseOutListener = () => {
            if (!this.interactiveEnabled) return;
            this.isPanning = false;
        };

        this.wheelListener = (e: WheelEvent) => {
            if (!this.interactiveEnabled) return;
            e.preventDefault();

            const elements = document.elementsFromPoint(e.clientX, e.clientY);
            let hasScrollable = false;
            for (const el of elements) {
                if (el.tagName.toLowerCase() === 'canvas') break; // stop when we reach the canvas
                const style = getComputedStyle(el);
                const overflowY = style.overflowY;
                const overflowX = style.overflowX;

                const canScrollY = (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
                const canScrollX = (overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth;

                if (canScrollY || canScrollX) {
                    hasScrollable = true;
                    break;
                }
            }
            if(hasScrollable) {
                return;
            }

            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const wx = (mouseX - this.transform.translateX) / this.transform.scale;
            const wy = (mouseY - this.transform.translateY) / this.transform.scale;
            const delta = -e.deltaY * 0.001;
            const factor = Math.exp(delta);
            const newScale = Math.max(Math.min(this.transform.scale * factor, this.maxZoom), this.minZoom);

            this.transform.translateX = mouseX - wx * newScale;
            this.transform.translateY = mouseY - wy * newScale;
            this.transform.scale = newScale;
            this.onConstrainTransform?.();
            this.onUserMove();
            this.onDirty();
            this.onZoom(this.transform);
        };

        // Add event listeners
        this.canvas.addEventListener("mousedown", this.mouseDownListener);
        window.addEventListener("mousemove", this.mouseMoveListener);
        window.addEventListener("mouseup", this.mouseUpListener);
        window.addEventListener("mouseout", this.mouseOutListener);
        this.canvas.addEventListener("wheel", this.wheelListener, { passive: false });
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        if (!e.key.startsWith("Arrow")) return;
        if (documentHaveActiveElement()) return;
        if (this.pressed[e.key]) return;
        this.triggerAction(e.key);
        this.pressed[e.key] = window.setInterval(() => {
            this.triggerAction(e.key);
        }, 20);
    }

    private handleKeyUp = (e: KeyboardEvent) => {
        if (!e.key.startsWith("Arrow")) return;
        const id = this.pressed[e.key];
        if (id) {
            clearInterval(id);
            this.pressed[e.key] = undefined;
        }
    }

    private triggerAction(key: string) {
        const workValue = 22;
        if (key === "ArrowDown") {
            this.transform.translateY -= workValue;
        } else if (key === "ArrowUp") {
            this.transform.translateY += workValue;
        } else if (key === "ArrowLeft") {
            this.transform.translateX += workValue;
        } else if (key === "ArrowRight") {
            this.transform.translateX -= workValue;
        }
        this.onUserMove();
        this.onDirty();
        this.onPan(this.transform);
    }

    public initKeyboardShortcut(): void {
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
    }

    public disposeKeyboardShortcut(): void {
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
    }

    /**
     * Clean up all event listeners and intervals
     * Called during hot reload or component unmount
     */
    public dispose(): void {
        // Clear all keyboard intervals
        for (const key in this.pressed) {
            const id = this.pressed[key];
            if (id) {
                clearInterval(id);
            }
        }
        this.pressed = {};

        // Remove keyboard listeners
        this.disposeKeyboardShortcut();

        // Remove mouse event listeners
        if (this.mouseDownListener) {
            this.canvas.removeEventListener("mousedown", this.mouseDownListener);
            this.mouseDownListener = null;
        }
        if (this.mouseMoveListener) {
            window.removeEventListener("mousemove", this.mouseMoveListener);
            this.mouseMoveListener = null;
        }
        if (this.mouseUpListener) {
            window.removeEventListener("mouseup", this.mouseUpListener);
            this.mouseUpListener = null;
        }
        if (this.mouseOutListener) {
            window.removeEventListener("mouseout", this.mouseOutListener);
            this.mouseOutListener = null;
        }
        if (this.wheelListener) {
            this.canvas.removeEventListener("wheel", this.wheelListener);
            this.wheelListener = null;
        }

        // Reset panning state
        this.isPanning = false;
    }
}
