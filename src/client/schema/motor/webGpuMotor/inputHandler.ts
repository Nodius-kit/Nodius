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
import { documentHaveActiveElement } from "../../../../utils/objectUtils";
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
		this.canvas.addEventListener("mousedown", (e) => {
			if (!this.interactiveEnabled) return;
			if (e.button === 1) {
				this.isPanning = true;
				this.lastMouseX = e.clientX;
				this.lastMouseY = e.clientY;
				this.onUserMove();
			}
		});

		window.addEventListener("mousemove", (e) => {
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
		});


		window.addEventListener("mouseup", (e) => {
			if(e.button === 1) {
				if (!this.interactiveEnabled) return;
				this.isPanning = false;
			}
		});
		window.addEventListener("mouseout", () => {
			if (!this.interactiveEnabled) return;
			this.isPanning = false;
		});

		this.canvas.addEventListener("wheel", (e) => {
			if (!this.interactiveEnabled) return;
			e.preventDefault();



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
		}, { passive: false });
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
}
