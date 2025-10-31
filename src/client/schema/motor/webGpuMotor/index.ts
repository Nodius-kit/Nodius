/**
 * @file index.ts
 * @description Main WebGPU Motor class - High-performance graph rendering engine
 * @module webGpuMotor
 *
 * WebGpuMotor is a modular graph visualization engine built on WebGPU.
 * It implements the GraphicalMotor interface and coordinates multiple specialized renderers:
 *
 * Architecture:
 * - NodeRenderer: Renders rectangular nodes using instanced quads
 * - EdgeRenderer: Renders connections with straight or curved bezier paths
 * - HandleRenderer: Renders circular connection points on nodes
 * - BackgroundRenderer: Renders dotted or solid backgrounds
 * - InputHandler: Manages mouse/keyboard input for panning and zooming
 * - CameraAnimator: Provides smooth camera transitions and fit operations
 *
 * Features:
 * - Hardware-accelerated WebGPU rendering with MSAA antialiasing
 * - Efficient visibility culling (only renders visible elements)
 * - Dirty flag rendering (only re-renders when needed)
 * - Real-time event system (zoom, pan, click events)
 * - Smooth camera animations with configurable easing
 * - Auto re-fit on canvas resize (when interactive is disabled)
 * - Multi-DPI support with device pixel ratio handling
 *
 * @example
 * const motor = new WebGpuMotor();
 * await motor.init(container, canvas, { minZoom: 0.5, maxZoom: 3 });
 * motor.setScene({ nodes: nodesMap, edges: edgesMap });
 * motor.smoothFitToNode(nodeId, { padding: 100 });
 */


/* we are into gpu now... wow! */

import {
	MotorScene,
	GraphicalMotorOptions,
	ViewTransform,
	MotorEventMap,
	GraphicalMotor,
	backgroundType
} from "../graphicalMotor";
import { Edge, Node } from "../../../../utils/graph/graphType";
import { Point } from "./types";
import { NodeRenderer } from "./nodeRenderer";
import { EdgeRenderer } from "./edgeRenderer";
import { BackgroundRenderer } from "./backgroundRenderer";
import { InputHandler } from "./inputHandler";
import { CameraAnimator } from "./cameraAnimator";
import { getHandlePosition } from "./handleUtils";
import {deepCopy} from "../../../../utils/objectUtils";

/**
 * WebGPU-based graph rendering motor with modular architecture
 * Implements the GraphicalMotor interface for rendering node-edge graphs
 */
export class WebGpuMotor implements GraphicalMotor {
	private device: GPUDevice | null = null;
	private context: GPUCanvasContext | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private format: GPUTextureFormat | null = null;
	private scene: MotorScene | undefined = undefined;
	private transform: ViewTransform = { scale: 1, translateX: 0, translateY: 0 };
	private eventListeners: { [K in keyof MotorEventMap]?: Array<MotorEventMap[K]> } = {};
	private dirty: boolean = false;
	private uniformBuffer: GPUBuffer | null = null;
	private bindGroup: GPUBindGroup | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private dpr: number = 1;
	private sampleCount: number = 4;
	private visibleNodes: Set<string> = new Set();
	private prevVisibleNodes: Set<string> = new Set();
	private relevantEdges: Edge[] = [];
	private interactiveEnabled: boolean = true;
	private hoveredEdge: Edge | null = null;
	private selectedEdges: Set<string> = new Set();
	private maxZoom: number = 1;
	private minZoom: number = 1;

	// Renderers
	private nodeRenderer: NodeRenderer | null = null;
	private edgeRenderer: EdgeRenderer | null = null;
	private backgroundRenderer: BackgroundRenderer | null = null;
	private inputHandler: InputHandler | null = null;
	private cameraAnimator: CameraAnimator | null = null;

	public async init(container: HTMLElement, canvas: HTMLCanvasElement, options?: GraphicalMotorOptions): Promise<void> {
		if (!navigator.gpu) {
			throw new Error("WebGPU is not supported in this browser.");
		}

		const adapter = await navigator.gpu.requestAdapter();
		if (!adapter) {
			throw new Error("No WebGPU adapter found.");
		}

		this.device = await adapter.requestDevice();
		this.canvas = canvas;
		this.canvas.style.width = "100%";
		this.canvas.style.height = "100%";

		this.context = this.canvas.getContext("webgpu") as GPUCanvasContext;
		this.format = navigator.gpu.getPreferredCanvasFormat();
		this.context.configure({
			device: this.device,
			format: this.format,
			alphaMode: "premultiplied",
		});

		this.minZoom = options?.minZoom ?? 0.2;
		this.maxZoom = options?.maxZoom ?? 3;

		this.dpr = options?.devicePixelRatio ?? window.devicePixelRatio ?? 1;
		const backgroundType = options?.backgroundType ?? "dotted";
		this.updateCanvasSize(container);

		this.resizeObserver = new ResizeObserver(() => {
			this.updateCanvasSize(container);
			this.dirty = true;
			// Re-apply last fit operation if conditions are met
			this.cameraAnimator?.reapplyFitIfNeeded(this.scene);
		});
		this.resizeObserver.observe(container);

		// Setup uniforms
		this.uniformBuffer = this.device.createBuffer({
			size: 32, // struct Uniforms size
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		const bindGroupLayout = this.device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: {},
				},
			],
		});

		this.bindGroup = this.device.createBindGroup({
			layout: bindGroupLayout,
			entries: [
				{
					binding: 0,
					resource: { buffer: this.uniformBuffer },
				},
			],
		});

		// Initialize renderers
		this.nodeRenderer = new NodeRenderer(this.device, this.format, this.sampleCount);
		this.nodeRenderer.init(bindGroupLayout);

		this.edgeRenderer = new EdgeRenderer(this.device, this.format, this.sampleCount, this.canvas, this.screenToWorld.bind(this));
		this.edgeRenderer.init(bindGroupLayout);

		this.backgroundRenderer = new BackgroundRenderer(this.device, this.format, this.sampleCount, backgroundType);
		this.backgroundRenderer.init(bindGroupLayout);

		// Initialize input handler
		this.inputHandler = new InputHandler(
			this.canvas,
			this.transform,
			this.minZoom,
			this.maxZoom,
			this.interactiveEnabled,
			{
				onDirty: () => this.dirty = true,
				onPan: (transform) => this.emit("pan", transform),
				onZoom: (transform) => this.emit("zoom", transform),
				onUserMove: () => this.cameraAnimator?.setUserHasMovedManually(true),
				onConstrainTransform: () => this.cameraAnimator?.enforceLockedAreaConstraints()
			}
		);
		this.inputHandler.setupMouseEvents();
		this.inputHandler.initKeyboardShortcut();

		// Initialize camera animator
		this.cameraAnimator = new CameraAnimator(
			this.canvas,
			this.transform,
			this.minZoom,
			this.maxZoom,
			{
				onDirty: () => this.dirty = true,
				onPan: (transform) => this.emit("pan", transform),
				onZoom: (transform) => this.emit("zoom", transform)
			}
		);
		this.cameraAnimator.setInteractiveEnabled(this.interactiveEnabled);

		// Setup click events
		this.setupClickEvents();

		// Start render loop
		this.dirty = true;
		requestAnimationFrame(this.renderLoop);
	}

	private updateCanvasSize(container: HTMLElement): void {
		if (this.canvas) {
			this.canvas.width = container.clientWidth * this.dpr;
			this.canvas.height = container.clientHeight * this.dpr;
		}
	}

	private setupClickEvents(): void {
		if (!this.canvas) return;

		// Mouse move for hover detection
		this.canvas.addEventListener("mousemove", (e) => {
			const rect = this.canvas!.getBoundingClientRect();
			const sx = e.clientX - rect.left;
			const sy = e.clientY - rect.top;
			const world = this.screenToWorld({ x: sx, y: sy });

			if (this.scene) {
				let foundEdge: Edge | null = null;

				// Check edges
				for (const edge of this.relevantEdges) {
					if (this.isPointNearEdge(world, edge)) {
						foundEdge = edge;
						break;
					}
				}

				// Update hover state
				if (foundEdge !== this.hoveredEdge) {
					this.hoveredEdge = foundEdge;
					this.canvas!.style.cursor = foundEdge ? "pointer" : "default";
					this.requestRedraw();
				}
			}
		});

		// Click for selection
		this.canvas.addEventListener("click", (e) => {
			const rect = this.canvas!.getBoundingClientRect();
			const sx = e.clientX - rect.left;
			const sy = e.clientY - rect.top;
			const world = this.screenToWorld({ x: sx, y: sy });

			this.computeVisibility();

			// Check edges first
			if (this.scene) {
				for (const edge of this.relevantEdges) {
					if (this.isPointNearEdge(world, edge)) {
						// Toggle selection
						this.toggleEdgeSelection(edge._key);
						this.emit("edgeClick", edge, edge._key);
						return;
					}
				}

				// Check nodes
				for (const id of this.visibleNodes) {
					const node = this.scene.nodes.get(id)!;
					if (
						typeof node.size !== "string" &&
						world.x >= node.posX &&
						world.x <= node.posX + node.size.width &&
						world.y >= node.posY &&
						world.y <= node.posY + node.size.height
					) {
						this.emit("nodeClick", node, node._key);
						return;
					}
				}
			}
		});
	}

	private isPointNearLine(p: Point, a: Point, b: Point, threshold: number): boolean {
		const abx = b.x - a.x;
		const aby = b.y - a.y;
		const len = Math.hypot(abx, aby);
		if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y) < threshold;
		const apx = p.x - a.x;
		const apy = p.y - a.y;
		let proj = (apx * abx + apy * aby) / (len * len);
		proj = Math.max(0, Math.min(1, proj));
		const cx = a.x + proj * abx;
		const cy = a.y + proj * aby;
		const dist = Math.hypot(p.x - cx, p.y - cy);
		return dist < threshold;
	}

	private isPointNearEdge(point: Point, edge: Edge): boolean {
		if (!this.scene) return false;
		const pathPoints = this.edgeRenderer!.getEdgePathPoints(this.scene, edge, 10);
		if (pathPoints.length < 2) return false;
		const threshold = 5 / this.transform.scale; // 5 pixels in screen space
		for (let i = 0; i < pathPoints.length - 1; i++) {
			if (this.isPointNearLine(point, pathPoints[i], pathPoints[i + 1], threshold)) {
				return true;
			}
		}
		return false;
	}

	private computeVisibility(): void {
		if (!this.scene || !this.canvas) return;

		const tl = this.screenToWorld({ x: 0, y: 0 });
		const br = this.screenToWorld({ x: this.canvas.width, y: this.canvas.height });
		const visMinX = Math.min(tl.x, br.x);
		const visMaxX = Math.max(tl.x, br.x);
		const visMinY = Math.min(tl.y, br.y);
		const visMaxY = Math.max(tl.y, br.y);
		this.prevVisibleNodes = new Set(this.visibleNodes);
		this.visibleNodes.clear();

		for (const [id, node] of this.scene.nodes) {
			const nMinX = node.posX;
			const nMaxX = node.posX + node.size.width;
			const nMinY = node.posY;
			const nMaxY = node.posY + node.size.height;
			if (nMaxX > visMinX && nMinX < visMaxX && nMaxY > visMinY && nMinY < visMaxY) {
				this.visibleNodes.add(id);
			}
		}
		for (const id of this.visibleNodes) {
			if (!this.prevVisibleNodes.has(id)) {
				this.emit("nodeEnter", this.scene.nodes.get(id)!, id);
			}
		}
		for (const id of this.prevVisibleNodes) {
			if (!this.visibleNodes.has(id)) {
				this.emit("nodeLeave", this.scene.nodes.get(id), id);
			}
		}

		this.relevantEdges = [];
		for (const [source, edges] of this.scene.edges) {
			for (const edge of edges) {
				if (this.visibleNodes.has(edge.target) || this.visibleNodes.has(edge.source)) {
					this.relevantEdges.push(edge);
				}
			}
		}
	}

	public resetScene(): void {
		this.emit("reset", undefined);
		this.scene = undefined;
		this.visibleNodes = new Set();
		this.prevVisibleNodes = new Set();
		this.requestRedraw();
	}

	private renderLoop = (): void => {
		if (!this.device || !this.context || !this.dirty) {
			requestAnimationFrame(this.renderLoop);
			return;
		}
		this.computeVisibility();
		if(this.scene) {
			this.nodeRenderer!.buildNodeBuffer(this.visibleNodes, this.scene!.nodes);
			this.edgeRenderer!.buildEdgeBuffer(this.scene!, this.relevantEdges);
		}
		this.dirty = false;

		// Update uniforms
		const uniformData = new Float32Array([
			this.transform.scale,
			0,
			this.transform.translateX,
			this.transform.translateY,
			this.canvas!.width,
			this.canvas!.height,
		]);
		this.device.queue.writeBuffer(this.uniformBuffer!, 0, uniformData);

		const colorTexture = this.context.getCurrentTexture();
		const colorTextureView = colorTexture.createView();

		let colorAttachment: GPURenderPassColorAttachment;
		let msTexture: GPUTexture | null = null;
		if (this.sampleCount > 1) {
			msTexture = this.device.createTexture({
				size: [colorTexture.width, colorTexture.height, 1],
				sampleCount: this.sampleCount,
				format: this.format!,
				usage: GPUTextureUsage.RENDER_ATTACHMENT,
			});
			colorAttachment = {
				view: msTexture.createView(),
				resolveTarget: colorTextureView,
				clearValue: [0, 0, 0, 0],
				loadOp: "clear",
				storeOp: "discard",
			};
		} else {
			colorAttachment = {
				view: colorTextureView,
				clearValue: [0, 0, 0, 0],
				loadOp: "clear",
				storeOp: "store",
			};
		}

		const commandEncoder = this.device.createCommandEncoder();
		const renderPassDescriptor: GPURenderPassDescriptor = {
			colorAttachments: [colorAttachment],
		};

		const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

		// Render background
		this.backgroundRenderer!.render(passEncoder, this.bindGroup!);

		// Draw nodes
		this.nodeRenderer!.render(passEncoder, this.bindGroup!, this.visibleNodes.size);

		// Draw edges
		this.edgeRenderer!.render(passEncoder, this.bindGroup!);

		passEncoder.end();
		this.device.queue.submit([commandEncoder.finish()]);

		if (msTexture) {
			msTexture.destroy();
		}

		requestAnimationFrame(this.renderLoop);
	};

	public dispose(): void {
		if (this.resizeObserver) this.resizeObserver.disconnect();
		if (this.canvas) this.canvas.remove();
		if (this.context) this.context.unconfigure();
		if (this.device) this.device.destroy();
		if (this.uniformBuffer) this.uniformBuffer.destroy();
		this.nodeRenderer?.dispose();
		this.edgeRenderer?.dispose();
		this.backgroundRenderer?.dispose();
		this.inputHandler?.disposeKeyboardShortcut();
		this.eventListeners = {};
	}

	public setScene(scene: MotorScene): void {
		this.scene = scene;
		requestAnimationFrame(() => {
			this.requestRedraw();
		});
	}

	public updateNode(id: string, updates: Partial<Pick<Node<any>, 'posX' | 'posY' | 'size'>>): void {
		if (!this.scene) return;
		const node = this.scene.nodes.get(id);
		if (!node) return;
		if (updates.posX !== undefined) node.posX = updates.posX;
		if (updates.posY !== undefined) node.posY = updates.posY;
		if (updates.size !== undefined && typeof updates.size !== "string") node.size = updates.size;
		this.dirty = true;
		this.emit("nodeChange", node, node._key);
	}

	public getScene(): MotorScene | undefined {
		return this.scene;
	}

	public setTransform(transform: Partial<ViewTransform>): void {
		const oldScale = this.transform.scale;
		const oldTranslateX = this.transform.translateX;
		const oldTranslateY = this.transform.translateY;

		if (transform.scale !== undefined) this.transform.scale = transform.scale;
		if (transform.translateX !== undefined) this.transform.translateX = transform.translateX;
		if (transform.translateY !== undefined) this.transform.translateY = transform.translateY;

		if (this.transform.scale !== oldScale) {
			this.emit("zoom", this.transform);
		}
		if (this.transform.translateX !== oldTranslateX || this.transform.translateY !== oldTranslateY) {
			this.emit("pan", this.transform);
		}
		this.dirty = true;
	}

	public getTransform(): ViewTransform {
		return { ...this.transform };
	}

	public on<K extends keyof MotorEventMap>(event: K, cb: MotorEventMap[K]): void {
		if (!this.eventListeners[event]) this.eventListeners[event] = [];
		this.eventListeners[event]!.push(cb);
	}

	public off<K extends keyof MotorEventMap>(event: K, cb: MotorEventMap[K]): void {
		const listeners = this.eventListeners[event];
		if (listeners) {
			this.eventListeners[event] = listeners.filter((l) => l !== cb) as any;
		}
	}

	private emit<K extends keyof MotorEventMap>(
		event: K,
		arg: Parameters<MotorEventMap[K]>[0]
	): void;
	private emit<K extends keyof MotorEventMap>(
		event: K,
		arg: Parameters<MotorEventMap[K]>[0],
		extra: Parameters<MotorEventMap[K]>[1]
	): void;
	private emit<K extends keyof MotorEventMap>(
		event: K,
		arg: any,
		extra?: any
	): void {
		const listeners = this.eventListeners[event];
		if (listeners) {
			listeners.forEach((cb) => (cb as any)(arg, extra));
		}
	}

	public worldToScreen(point: Point): Point {
		return {
			x: point.x * this.transform.scale + this.transform.translateX,
			y: point.y * this.transform.scale + this.transform.translateY,
		};
	}

	public screenToWorld(point: Point): Point {
		return {
			x: (point.x - this.transform.translateX) / this.transform.scale,
			y: (point.y - this.transform.translateY) / this.transform.scale,
		};
	}

	public requestRedraw(): void {
		this.dirty = true;
	}

	public initKeyboardShortcut(): void {
		this.inputHandler?.initKeyboardShortcut();
	}

	public disposeKeyboardShortcut(): void {
		this.inputHandler?.disposeKeyboardShortcut();
	}

	public getNodeScreenRect(nodeId: string): { x: number; y: number; width: number; height: number } | undefined {
		if (!this.scene) return;
		const node = this.scene.nodes.get(nodeId);
		if (!node || typeof node.size === "string") return undefined;
		const tl = this.worldToScreen({ x: node.posX, y: node.posY });
		const br = this.worldToScreen({ x: node.posX + node.size.width, y: node.posY + node.size.height });
		return {
			x: tl.x,
			y: tl.y,
			width: br.x - tl.x,
			height: br.y - tl.y,
		};
	}

	public getContainerDraw(): HTMLElement {
		return this.canvas as HTMLElement;
	}

	public enableInteractive(value: boolean): void {
		this.interactiveEnabled = value;
		this.inputHandler?.setInteractiveEnabled(value);
		this.cameraAnimator?.setInteractiveEnabled(value);
	}

	public isInteractive(): boolean {
		return this.interactiveEnabled;
	}

	public setSelectedEdges(edgeKeys: string[]): void {
		this.selectedEdges = new Set(edgeKeys);
		this.requestRedraw();
	}

	public getSelectedEdges(): string[] {
		return Array.from(this.selectedEdges);
	}

	public toggleEdgeSelection(edgeKey: string): void {
		if (this.selectedEdges.has(edgeKey)) {
			this.selectedEdges.delete(edgeKey);
		} else {
			this.selectedEdges.add(edgeKey);
		}
		this.requestRedraw();
	}

	public getHoveredEdge(): Edge | null {
		return this.hoveredEdge;
	}

	public resetViewport(): void {
		if (!this.canvas) return;
		const centerX = this.canvas.width / 2;
		const centerY = this.canvas.height / 2;
		this.setTransform({
			scale: 1,
			translateX: centerX,
			translateY: centerY
		});
	}

	public smoothTransitionTo(options: {
		x: number;
		y: number;
		zoom: number;
		duration?: number;
		easing?: (t: number) => number;
		onComplete?: () => void;
	}): void {
		this.cameraAnimator?.smoothTransitionTo(options);
	}

	public smoothFitToNode(nodeId: string, options?: {
		padding?: number;
		duration?: number;
		easing?: (t: number) => number;
		onComplete?: () => void;
	}): void {
		this.cameraAnimator?.smoothFitToNode(this.scene, nodeId, options);
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
		this.cameraAnimator?.smoothFitToArea(bounds, options);
	}

	public lockCameraToArea(bounds: {
		minX: number;
		minY: number;
		maxX: number;
		maxY: number;
	}): void {
		this.cameraAnimator?.lockCameraToArea(bounds);
	}

	public removeCameraAreaLock(): void {
		this.cameraAnimator?.removeCameraAreaLock();
	}
}
/*
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠹⢿⡿⠏⢻⢿⠉⣿⣰⡟⠈⠘⠀⠀⠀⠀⠀⠰⠁⠘⠀⠘⠀⣿⠏⠀⢸⠃⢁⡛⣼⣿⣿⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢟⠁⢱⠟⣻⢋⠎⡁
⣿⣿⣿⣿⣿⣿⣿⣯⣿⣿⣿⠿⣿⣿⣿⡽⠝⢿⣿⡄⠘⠃⠀⠟⠀⠀⠘⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠀⠀⠁⠀⠀⢁⡟⢃⠁⣻⣿⡿⣿⡏⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢿⣿⣿⣿⡿⠟⠋⡉⠿⢿⣿⣿⣿⡿⠁⠀⠀⠐⠀⠑⠁⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⡀⢻⣿⠇⠀⠈⠃⠇⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⢧⠙⢐⣿⣿⡿⣻⣿⣿⣿⣿⣿⣿⣿⣿⣿⢏⠔⣹⣿⡿⠏⠀⠔⠵⣾⡿⠏⣉⠉⡿⠁⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⢿⡈⠑⡀⠂⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⠀⣼⡟⡻⣷⣿⣿⣿⣿⣿⣿⣿⣿⡿⠣⢁⣮⡟⡡⠂⠀⠀⠀⠐⠀⠒⠀⠢⡤⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⡕⢷⢁⠀⠐⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠠⠀⠀⠠⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⢀⣿⢋⣾⣿⣿⣿⣿⣿⣿⡟⡀⠁⣶⠋⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣟⢿⢿⣷⣕⣌⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠐⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠐⠁⣽⢯⣾⣿⣿⣿⡟⡴⠰⠗⠸⠁⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣏⠿⣿⡧⡀⠢⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠠⠀⢀⠀⠀⠀⠀⠀⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣬⣿⣿⣿⣿⢸⡇⡻⡁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⢧⠈⣿⠘⠀⠀⠀⠀⠀⠀⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠄⠀⡠⠂⠀⠀⠀⠀⠀⠀⠁⠐⠀⠀⡀⠤⠀⠀⠀⠀⠀⠀⠉⠈⠀⠁⢀⠤⠀⠀⠘⠏⢸⢏⣽⣿⣞⢡⠃⡀⠀⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⡆⠀⠈⠅⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠄⡤⠆⠀⠀⠀⢠⠀⢀⠂⠀⠀⠀⠀⠀⠀⢀⠀⠀⢀⡀⠀⠀⠄⠀⠀⠀⠀⠀⢠⣄⠀⠰⢫⣿⣿⣿⣿⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣮⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠜⠀⠀⠀⠀⠂⠂⠀⠀⠀⠀⠀⠀⠂⠀⠐⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⠋⠀⠀⠀⢰⢷⠿⡿⡄⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⡟⠉⠉⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠠⠀⠀⡇⠠⢠⠋⠀⠀⠀⠀⠆⠀⢠⣴⣾⣿⣿⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠏⠠⠈⡄⠀⠘⢈⢰⢃⡌⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣷⣢⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⡠⢠⢃⣀⡾⠀⠀⠀⠀⠃⢀⣴⣿⣿⡿⠛⠀⢀⣀⣠⢤⡄⢀⣀⣀⠀⠀⠄⠀⠀⢀⠀⠀⠚⠀⠀⠀⠻⡀⠸⠘⠘⠀⠀⠀⠀⠀
⣿⣿⣿⣭⡥⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠁⠇⠀⡂⠁⠀⠀⠀⠀⠁⠀⣿⡿⠟⠉⢀⡴⢚⣋⡩⠅⡀⡀⡀⠉⠉⠙⠀⠀⡀⠑⠄⠀⠀⠀⠀⢠⡄⣠⡇⠀⠀⠀⠀⠀⠀⠠⠀⠀⠀⠀
⣿⣿⣿⡷⠤⣤⣀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡀⠀⠈⠢⠀⠂⠁⠀⠀⠀⠠⢄⠀⠀⠋⠀⠀⣠⣤⣶⣿⣮⣭⣗⣺⠶⠶⠦⣤⣄⡂⠀⠈⠤⠀⠂⠀⠀⡫⡀⠈⠁⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣤⣍⠑⠀⠀⠀⠀⠀⠀⠀⠤⣤⠐⠀⠀⠁⠀⠀⠀⡀⠔⡈⠐⢐⠂⢀⣠⣾⣿⣿⣿⣿⣿⣿⣿⡟⠻⢫⠔⣤⡉⠻⣄⢄⠀⠀⠀⠁⠐⠀⠀⠀⡈⠀⠀⢀⠠⡀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣟⣃⣀⠀⠀⠀⠀⠀⠀⢰⠔⠊⠋⠀⠀⠀⢀⢠⡠⢄⣨⣵⡴⠪⠴⡾⠿⠛⢿⣿⣟⡛⡛⠛⡭⠛⢛⡷⢦⡁⠈⠙⡢⡈⠑⢄⠠⠀⡀⠐⡀⠀⠀⠀⠀⠀⠸⣧⡱⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣷⣶⣁⣤⡠⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⣴⣤⣈⣙⣛⣁⣀⡁⠁⣤⣶⣾⣿⣿⣿⡿⠆⠂⠀⠀⠀⠈⠑⠪⠳⣄⠈⠂⣀⠈⠳⣔⠔⠀⠐⠀⠀⠀⠀⠁⠀⠹⣷⣷⠆⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣯⡤⠤⠀⠀⠀⠀⢀⣀⠤⣄⣤⡸⣿⡿⡏⢉⠉⠉⠉⢀⣸⣿⣿⠿⠟⠛⢁⣄⡀⠠⡠⡀⠀⠀⠀⢠⠐⠢⡑⡄⡈⠡⡀⠈⢎⠁⠀⢣⠐⡈⠀⠀⠀⠀⠘⡏⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⡀⠀⠀⣤⣶⣿⠟⠁⠀⠰⡑⠌⠁⠀⠒⠾⢿⡿⠛⣁⠌⣠⣤⣜⢿⣿⡆⠊⢪⣦⠑⠄⠀⠁⠈⠈⠪⣠⠂⡈⢀⠈⢢⢦⡡⢣⠡⠀⠀⣿⡄⢀⠡⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣋⣀⠀⢐⡻⡇⠰⠐⣠⣧⠡⠀⠄⢀⢀⠔⠁⠀⣠⣵⣦⡻⣿⣿⡦⠙⠮⢂⡁⠈⠀⠀⠀⠀⠀⠀⠢⠈⠩⠢⣀⠡⡀⢣⠀⠀⢂⠄⠀⠘⣷⡄⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⣿⣷⣌⠉⠰⣰⣱⣿⡏⠀⣾⣾⠟⠁⠀⣠⣄⢿⣿⣿⣷⠈⠛⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⢮⣦⡑⠠⢣⠀⢀⠈⠀⠀⠠⠇⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⠀⠅⣿⣿⡇⠰⣿⠁⠀⢄⡸⣿⣿⣦⠙⠃⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⡄⠀⠑⢄⢻⣯⡀⠈⢆⡀⠀⠀⠀⠀⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⠀⠿⣿⠇⠁⠃⠀⠀⢸⣷⡝⠟⠦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⠀⣀⣄⠁⠈⣥⡀⠐⠠⠙⣿⡀⠀⠆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⡀⠛⢈⠄⡀⠀⠀⢡⡻⠓⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠠⡀⢔⣶⣿⣶⠊⢻⠁⠀⣤⣙⢢⠀⠀⠘⢯⡄⠈⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣄⠀⠢⠈⠀⠀⠀⠡⠂⠀⣀⡀⡀⠀⠀⠀⠢⡀⡀⠀⢄⢀⣼⣿⣿⣏⠀⢀⠀⢸⣭⡙⠷⡁⠀⠀⠀⢻⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣄⠀⠈⠢⠀⠀⠀⠁⠈⠁⠀⠀⠀⠈⠀⠨⣮⣶⣤⣿⣿⣿⣿⡷⠀⠀⢲⣭⣛⢿⡀⠗⠀⠀⠀⠐⡁⠀⠀⢀⠀⠀⠀⠀⠀⠀⠀⢠⢠⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⣀⠈⠐⠠⠀⠀⠀⠀⠀⠀⠀⠀⢢⣿⣿⣿⣿⣿⣿⠙⠁⠀⠀⣯⠻⣿⣷⡡⡀⠀⠀⢀⢁⠀⠀⠀⢈⠀⠀⠀⠀⠀⠀⠀⠀⡆⠀⠀⠀⠀⠀⠀⠀⠀⠄⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣄⠀⠓⢄⠀⠀⠀⠀⠀⠀⠈⢿⣿⣿⡿⠛⢋⠂⢀⣄⠺⣿⣷⡘⣟⠃⠀⡀⠀⠠⠀⢀⠀⠀⠸⡀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠠⢀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠿⣿⣿⣦⡀⠡⠀⢀⠀⠀⠐⢄⢄⡉⠁⠅⢀⣠⡐⢿⣿⣦⠈⢿⠇⢀⣀⢢⠁⠀⠄⠀⠀⠀⠀⠘⡇⡀⠀⠀⠀⠀⠀⢰⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠛⢁⠙⣻⡿⠛⢛⣶⣄⠀⠀⡔⢄⠀⠳⣄⢆⡳⣤⡙⢿⣦⢙⠛⠈⢀⣴⣿⠿⠃⠀⠀⠀⠀⠂⠀⠀⢠⡇⠅⠀⠀⠀⠀⠀⡄⠀⠀⠀⠀⠀⠀⠀⢠⡇⢰⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟⣵⣿⣿⣿⣿⣿⣿⠃⠀⡌⡸⠟⠑⠀⢈⠁⠀⡰⢁⠈⢄⠃⢢⡈⠳⠝⢶⡩⠔⠉⢉⣤⣿⠿⠛⠁⠀⠀⣀⣴⡆⠨⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠃⠂⠀⠀⠀⠀⠀⠀⢸⡧⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠋⢰⠏⣽⣿⣿⣿⡿⡡⠀⠀⠀⠆⠃⠀⠀⢂⠀⠀⠃⠀⠀⠠⡙⢄⠝⢆⠀⠀⠁⢀⣴⡿⠟⠁⠀⠀⣀⣤⣼⣿⡿⠿⠀⠀⠀⠀⢀⢡⡌⠀⠀⠀⠀⠄⠀⠀⠀⠀⠀⠀⠀⠀⡘⠁⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀⡸⠏⣿⠋⢁⠄⠃⠀⠈⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠁⠀⠁⠀⠀⠉⠁⠀⠀⠀⣀⣼⣿⠿⠻⠉⠃⠀⠀⠀⠀⠀⠈⣡⠀⠀⠀⠀⡸⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⠀⠀⠀⠀⠁⠀⠀⠀⠀⠀⠂⠀⠀⠀⡀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣤⣿⢻⠋⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⡏⠀⠀⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⡾⠟⡀⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⠀⡀⠈⠢⣀⠀⠈⠀⢄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⠈⠻⢯⠀⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⡠⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡵⡀⠞⡁⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠐⠄⡀⠠⢀⠁⠠⢀⠀⠁⠂⠄⢂⠤⢀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⠂⢄⡀⠀⠀⠀⠀⠀⠀⢠⠀⠀⠀⠀⢀⠀⠀⠀⠀⠀⠀⠀⠠⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠠⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠁⠀⠀⠁⠀⠀⠀⠀⠄⠀⠀⠀⠀⠀⠀⠀⠀⠈⠁⠲⢤⣚⡳⢶⣤⣤⣤⣤⣤⣀⣤⠒⠀⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⡏⠀⠀⠀⠀⠀⠀⠐⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡀⠀⠀⠀⠀⠀⠀⠁⠀⠀⠲⠤⣄⣀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠓⠪⢑⡒⠂⠀⠠⣀⠀⠀⠀⠀⠀⠀⠂⠀⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡴⠋⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⡿⠿⠋⠵⡿⠁⢡⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠒⠀⠈⠉⠁⠐⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⠞⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣷⣿⢁⢱⠃⠰⠁⠀⠘⢆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⠀⠀⠀⠀⠀⠠⠤⠀⠀⠀⠀⠀⠀⠀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⡿⢸⢿⢸⠘⠀⡇⡎⠀⠀⠈⡀⢦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⠠⠤⠒⡢⠈⠕⠀⠂⠉⠀⠀⠀⠀⠀⠀⠀⠐⠀⠀⠀⠀⠀⠁⠀⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣷⠘⡆⢃⡀⠀⠀⢡⢀⠀⠀⠈⠀⠙⠳⠶⢦⣒⣒⣠⣀⡀⠠⢁⣒⠲⠉⠓⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⠀⡀⠜⠘⡄⢄⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⠀⠒⠒⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⡟⣿⡄⡰⠀⠐⠀⢌⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣴⠏⠒⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⡜⢧⡁⡀⢣⠀⠀⠱⣄⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⣶⠟⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
 */