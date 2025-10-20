import {
	MotorScene,
	GraphicalMotorOptions,
	ViewTransform,
	MotorEventMap,
	GraphicalMotor,
	backgroundType
} from "./graphicalMotor"
import {handleSide, Edge, Node} from "../../../utils/graph/graphType";
import {deepCopy, documentHaveActiveElement} from "../../../utils/objectUtils";

interface HandleInfo {
	side: handleSide;
	offset: number;
	point: { id: string; offset?: number; display?: string };
}

interface Point {
	x: number;
	y: number;
}

type KeyState = {
	[key: string]: number | undefined; // stores interval IDs
};

/*
Reminder of type:
export interface MotorScene {
	nodes: Map<string, Node<any>>;
	edges: Map<string, Edge[]>;
}
 */

export class WebGpuMotor implements GraphicalMotor {
	private device: GPUDevice | null = null;
	private context: GPUCanvasContext | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private format: GPUTextureFormat | null = null;
	private scene: MotorScene | undefined = undefined;
	private transform: ViewTransform = { scale: 1, translateX: 0, translateY: 0 };
	private eventListeners: { [K in keyof MotorEventMap]?: Array<MotorEventMap[K]> } = {};
	private backgroundType: typeof backgroundType[number] = "dotted";
	private fullScreenTriangleBuffer: GPUBuffer | null = null;
	private backgroundPipeline: GPURenderPipeline | null = null;
	private dirty: boolean = false;
	private uniformBuffer: GPUBuffer | null = null;
	private bindGroup: GPUBindGroup | null = null;
	private quadBuffer: GPUBuffer | null = null;
	private circleQuadBuffer: GPUBuffer | null = null;
	private instanceBuffer: GPUBuffer | null = null;
	private nodePipeline: GPURenderPipeline | null = null;
	private handleInstanceBuffer: GPUBuffer | null = null;
	private handlePipeline: GPURenderPipeline | null = null;
	private handleCount: number = 0;
	private edgeVertexBuffer: GPUBuffer | null = null;
	private edgeBufferSize: number = 0;
	private edgePipeline: GPURenderPipeline | null = null;
	private edgeVertexCount: number = 0;
	private resizeObserver: ResizeObserver | null = null;
	private isPanning: boolean = false;
	private lastMouseX: number = 0;
	private lastMouseY: number = 0;
	private dpr: number = 1;
	private sampleCount: number = 4;
	private nodeIndices: Map<string, number> = new Map();
	private visibleNodes: Set<string> = new Set();
	private prevVisibleNodes: Set<string> = new Set();
	private relevantEdges: Edge[] = [];
	private interactiveEnabled:boolean = true;
	private animationFrameId:number|null=null;
	private maxZoom:number = 1;
	private minZoom:number = 1;
	private pressed: KeyState = {}
	private lastFitOperation: {
		type: 'node' | 'area';
		nodeId?: string;
		bounds?: { minX: number; minY: number; maxX: number; maxY: number };
		options?: {
			padding?: number;
			duration?: number;
			easing?: (t: number) => number;
		};
	} | null = null;
	private userHasMovedManually: boolean = false;

	public async init(container: HTMLElement, convas:HTMLCanvasElement, options?: GraphicalMotorOptions): Promise<void> {
		if (!navigator.gpu) {
			throw new Error("WebGPU is not supported in this browser.");
		}

		const adapter = await navigator.gpu.requestAdapter();
		if (!adapter) {
			throw new Error("No WebGPU adapter found.");
		}

		this.initKeyboardShortcut();

		this.device = await adapter.requestDevice();
		this.canvas = convas;
		this.canvas.style.width = "100%";
		this.canvas.style.height = "100%";

		this.context = this.canvas.getContext("webgpu") as GPUCanvasContext;
		this.format = navigator.gpu.getPreferredCanvasFormat();
		this.context.configure({
			device: this.device,
			format: this.format,
			alphaMode: "premultiplied",
		});

		this.minZoom = options?.minZoom ?? 0.5;
		this.maxZoom = options?.maxZoom ?? 3;

		this.dpr = options?.devicePixelRatio ?? window.devicePixelRatio ?? 1;
		this.backgroundType = options?.backgroundType ?? "dotted";
		this.updateCanvasSize(container);

		this.resizeObserver = new ResizeObserver(() => {
			this.updateCanvasSize(container);
			this.dirty = true;

			// Re-apply last fit operation if conditions are met
			this.reapplyFitIfNeeded();
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

		// Quad buffer for nodes
		const quadVertices = new Float32Array([
			0, 0, 1, 0, 0, 1, // triangle 1
			0, 1, 1, 0, 1, 1, // triangle 2
		]);
		this.quadBuffer = this.device.createBuffer({
			size: quadVertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		this.device.queue.writeBuffer(this.quadBuffer, 0, quadVertices);

		// Circle quad buffer for handles
		const circleQuadVertices = new Float32Array([
			-1, -1, 1, -1, -1, 1, // triangle 1
			-1, 1, 1, -1, 1, 1, // triangle 2
		]);
		this.circleQuadBuffer = this.device.createBuffer({
			size: circleQuadVertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		this.device.queue.writeBuffer(this.circleQuadBuffer, 0, circleQuadVertices);

		// Node pipeline
		const nodeShaderCode = /* wgsl */ `
      struct Uniforms {
        scale: f32,
        padding: f32,
        translate: vec2<f32>,
        viewport: vec2<f32>,
      };

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      @vertex
      fn vs(
        @location(0) local_pos: vec2<f32>,
        @location(1) instance_pos: vec2<f32>,
        @location(2) instance_size: vec2<f32>
      ) -> @builtin(position) vec4<f32> {
        let world_pos = local_pos * instance_size + instance_pos;
        let screen_pos = world_pos * uniforms.scale + uniforms.translate;
        let clip_x = 2.0 * screen_pos.x / uniforms.viewport.x - 1.0;
        let clip_y = 1.0 - 2.0 * screen_pos.y / uniforms.viewport.y;
        return vec4<f32>(clip_x, clip_y, 0.0, 1.0);
      }

      @fragment
      fn fs() -> @location(0) vec4<f32> {
        return vec4<f32>(0.8, 0.8, 0.8, 1.0); // Light gray for nodes
      }
    `;
		const nodeModule = this.device.createShaderModule({ code: nodeShaderCode });
		this.nodePipeline = this.device.createRenderPipeline({
			layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
			vertex: {
				module: nodeModule,
				entryPoint: "vs",
				buffers: [
					{
						arrayStride: 8,
						attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
					},
					{
						arrayStride: 16,
						stepMode: "instance",
						attributes: [
							{ shaderLocation: 1, offset: 0, format: "float32x2" },
							{ shaderLocation: 2, offset: 8, format: "float32x2" },
						],
					},
				],
			},
			fragment: {
				module: nodeModule,
				entryPoint: "fs",
				targets: [{ format: this.format }],
			},
			primitive: { topology: "triangle-list" },
			multisample: { count: this.sampleCount },
		});

		// Handle pipeline
		const handleShaderCode = /* wgsl */ `
      struct Uniforms {
        scale: f32,
        padding: f32,
        translate: vec2<f32>,
        viewport: vec2<f32>,
      };

      struct VertexOutput {
        @builtin(position) pos: vec4<f32>,
        @location(0) uv: vec2<f32>,
      };

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      @vertex
      fn vs(
        @location(0) local_pos: vec2<f32>,
        @location(1) instance_pos: vec2<f32>,
        @location(2) instance_radius: f32
      ) -> VertexOutput {
        var out: VertexOutput;
        let world_pos = local_pos * instance_radius + instance_pos;
        let screen_pos = world_pos * uniforms.scale + uniforms.translate;
        let clip_x = 2.0 * screen_pos.x / uniforms.viewport.x - 1.0;
        let clip_y = 1.0 - 2.0 * screen_pos.y / uniforms.viewport.y;
        out.pos = vec4<f32>(clip_x, clip_y, 0.0, 1.0);
        out.uv = local_pos;
        return out;
      }

      @fragment
      fn fs(in: VertexOutput) -> @location(0) vec4<f32> {
        let dist = length(in.uv);
        if (dist > 1.0) {
          discard;
        }
        let alpha = 1.0 - smoothstep(0.9, 1.0, dist);
        return vec4<f32>(0.2, 0.2, 0.8, alpha); // Blue for handles with AA
      }
    `;
		const handleModule = this.device.createShaderModule({ code: handleShaderCode });
		this.handlePipeline = this.device.createRenderPipeline({
			layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
			vertex: {
				module: handleModule,
				entryPoint: "vs",
				buffers: [
					{
						arrayStride: 8,
						attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
					},
					{
						arrayStride: 12,
						stepMode: "instance",
						attributes: [
							{ shaderLocation: 1, offset: 0, format: "float32x2" },
							{ shaderLocation: 2, offset: 8, format: "float32" },
						],
					},
				],
			},
			fragment: {
				module: handleModule,
				entryPoint: "fs",
				targets: [{ format: this.format }],
			},
			primitive: { topology: "triangle-list" },
			multisample: { count: this.sampleCount },
		});

		// Edge pipeline
		const edgeShaderCode = /* wgsl */ `
      struct Uniforms {
        scale: f32,
        padding: f32,
        translate: vec2<f32>,
        viewport: vec2<f32>,
      };

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      @vertex
      fn vs(
        @location(0) world_pos: vec2<f32>
      ) -> @builtin(position) vec4<f32> {
        let screen_pos = world_pos * uniforms.scale + uniforms.translate;
        let clip_x = 2.0 * screen_pos.x / uniforms.viewport.x - 1.0;
        let clip_y = 1.0 - 2.0 * screen_pos.y / uniforms.viewport.y;
        return vec4<f32>(clip_x, clip_y, 0.0, 1.0);
      }

      @fragment
      fn fs() -> @location(0) vec4<f32> {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0); // Black for edges
      }
    `;
		const edgeModule = this.device.createShaderModule({ code: edgeShaderCode });
		this.edgePipeline = this.device.createRenderPipeline({
			layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
			vertex: {
				module: edgeModule,
				entryPoint: "vs",
				buffers: [
					{
						arrayStride: 8,
						attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
					},
				],
			},
			fragment: {
				module: edgeModule,
				entryPoint: "fs",
				targets: [{ format: this.format }],
			},
			primitive: { topology: "line-list" },
			multisample: { count: this.sampleCount },
		});

		// Full-screen triangle for background
		const fullScreenVertices = new Float32Array([
			-1, -1,
			3, -1,
			-1, 3
		]);
		this.fullScreenTriangleBuffer = this.device.createBuffer({
			size: fullScreenVertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		this.device.queue.writeBuffer(this.fullScreenTriangleBuffer, 0, fullScreenVertices);

		// Dotted background shader
		const bgShaderCode = /* wgsl */ `
		  struct Uniforms {
			scale: f32,
			padding: f32,
			translate: vec2<f32>,
			viewport: vec2<f32>,
		  };
		
		  @group(0) @binding(0) var<uniform> uniforms: Uniforms;
		
		  @vertex
		  fn vs(@location(0) pos: vec2<f32>) -> @builtin(position) vec4<f32> {
			return vec4<f32>(pos, 0.0, 1.0);
		  }
		
		  @fragment
		  fn fs(@builtin(position) coord: vec4<f32>) -> @location(0) vec4<f32> {
			let screen_pos = coord.xy;
			let world_pos = (screen_pos - uniforms.translate) / uniforms.scale;
			let spacing = 20.0;
			let radius = 1.0;
			let frac = fract(world_pos / spacing);
			let offset = frac - vec2<f32>(0.5);
			let dist = length(offset) * spacing;
			if (dist < radius) {
			  return vec4<f32>(0.7, 0.7, 0.7, 1.0); // Light gray dots
			}
			return vec4<f32>(1.0, 1.0, 1.0, 1.0);
		  }
		`;
		const bgModule = this.device.createShaderModule({ code: bgShaderCode });
		this.backgroundPipeline = this.device.createRenderPipeline({
			layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
			vertex: {
				module: bgModule,
				entryPoint: "vs",
				buffers: [
					{
						arrayStride: 8,
						attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
					},
				],
			},
			fragment: {
				module: bgModule,
				entryPoint: "fs",
				targets: [{ format: this.format }],
			},
			primitive: { topology: "triangle-list" },
			multisample: { count: this.sampleCount },
		});

		// Input events
		this.setupInputEvents();

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

	private reapplyFitIfNeeded(): void {
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

				this.smoothFitToNode(this.lastFitOperation.nodeId, {
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

	private setupInputEvents(): void {
		if (!this.canvas) return;


		this.canvas.addEventListener("mousedown", (e) => {
			if(!this.interactiveEnabled) return;
			if (e.button === 0) {
				this.isPanning = true;
				this.lastMouseX = e.clientX;
				this.lastMouseY = e.clientY;
				this.userHasMovedManually = true;
			}
		});

		this.canvas.addEventListener("mousemove", (e) => {
			if(!this.interactiveEnabled) {
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
				this.dirty = true;
				this.emit("pan", this.transform);
			}
		});



		const mouseUp = () => {
			if(!this.interactiveEnabled) return;
			this.isPanning = false;
		};
		this.canvas.addEventListener("mouseup", mouseUp);
		this.canvas.addEventListener("mouseout", mouseUp);

		this.canvas.addEventListener("wheel", (e) => {
			if(!this.interactiveEnabled) return;
			e.preventDefault();
			const rect = this.canvas!.getBoundingClientRect();
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
			this.userHasMovedManually = true;
			this.dirty = true;
			this.emit("zoom", this.transform);
		}, { passive: false });

		this.canvas.addEventListener("click", (e) => {
			const rect = this.canvas!.getBoundingClientRect();
			const sx = e.clientX - rect.left;
			const sy = e.clientY - rect.top;
			const world = this.screenToWorld({ x: sx, y: sy });

			this.computeVisibility();

			// Check edges first
			if(this.scene) {
				for (const edge of this.relevantEdges) {
					if (this.isPointNearEdge(world, edge)) {
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

	private getHandleInfo(node: Node<any>, handleId: string): HandleInfo | undefined {
		for (const [side, handle] of Object.entries(node.handles)) {
			const index = handle.point.findIndex((p) => p.id === handleId);
			if (index !== -1) {
				const point = handle.point[index]!;
				let offset = point.offset;
				if (handle.position === "separate" && offset === undefined) {
					offset = (index + 0.5) / handle.point.length;
				} else if (offset === undefined) {
					offset = 0.5;
				}
				return {
					side: side as handleSide,
					offset,
					point,
				};
			}
		}
		return undefined;
	}

	private getHandlePosition(node: Node<any>, handleId: string): Point | undefined {
		const info = this.getHandleInfo(node, handleId);
		if (!info || typeof node.size === "string") return undefined;

		const { width, height } = node.size;
		const { side, offset } = info;
		const config = node.handles[side]!;

		if (config.position === "fix") {
			let x = node.posX;
			let y = node.posY;
			switch (side) {
				case "T":
					x += offset;
					break;
				case "D":
					y += height;
					x += offset;
					break;
				case "L":
					y += offset;
					break;
				case "R":
					x += width;
					y += offset;
					break;
				case "0":
					x += width / 2;
					y += height / 2;
					break;
			}
			return { x, y };
		} else {
			switch (side) {
				case "L":
					return { x: node.posX, y: node.posY + offset * height };
				case "R":
					return { x: node.posX + width, y: node.posY + offset * height };
				case "T":
					return { x: node.posX + offset * width, y: node.posY };
				case "D":
					return { x: node.posX + offset * width, y: node.posY + height };
				case "0":
					return { x: node.posX + 0.5 * width, y: node.posY + 0.5 * height };
			}
		}
	}

	private getDir(side: handleSide): { dx: number; dy: number } {
		switch (side) {
			case "L":
				return { dx: -1, dy: 0 };
			case "R":
				return { dx: 1, dy: 0 };
			case "T":
				return { dx: 0, dy: -1 };
			case "D":
				return { dx: 0, dy: 1 };
			case "0":
				return { dx: 0, dy: 0 };
		}
	}

	private bezierPoint(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
		const u = 1 - t;
		const uu = u * u;
		const uuu = uu * u;
		const tt = t * t;
		const ttt = tt * t;
		return {
			x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
			y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
		};
	}

	private getEdgePathPoints(edge: Edge, segments: number = 10): Point[] {
		const sourceNode = this.scene!.nodes.get(edge.source);
		const targetNode = this.scene!.nodes.get(edge.target);
		if (!sourceNode || !targetNode) return [];
		const sourcePos = this.getHandlePosition(sourceNode, edge.sourceHandle);
		const targetPos = this.getHandlePosition(targetNode, edge.targetHandle);
		if (!sourcePos || !targetPos) return [];

		const points: Point[] = [];
		if (edge.style === "straight") {
			points.push(sourcePos, targetPos);
		} else {
			const sourceInfo = this.getHandleInfo(sourceNode, edge.sourceHandle)!;
			const targetInfo = this.getHandleInfo(targetNode, edge.targetHandle)!;
			const dist = Math.hypot(targetPos.x - sourcePos.x, targetPos.y - sourcePos.y);
			const curveStrength = dist * 0.4;
			const sourceDir = this.getDir(sourceInfo.side);
			const targetDir = this.getDir(targetInfo.side);
			const control1 = {
				x: sourcePos.x + sourceDir.dx * curveStrength,
				y: sourcePos.y + sourceDir.dy * curveStrength,
			};
			const control2 = {
				x: targetPos.x - targetDir.dx * curveStrength,
				y: targetPos.y - targetDir.dy * curveStrength,
			};
			for (let i = 0; i <= segments; i++) {
				const t = i / segments;
				points.push(this.bezierPoint(t, sourcePos, control1, control2, targetPos));
			}
		}
		return points;
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
		const pathPoints = this.getEdgePathPoints(edge, 10);
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
				if(this.visibleNodes.has(edge.target) || this.visibleNodes.has(edge.source)) {
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

	private buildNodeBuffer(): void {
		if (!this.scene) return;
		const instanceData = new Float32Array(this.visibleNodes.size * 4);
		let i = 0;
		this.nodeIndices.clear();
		for (const id of this.visibleNodes) {
			const node = this.scene.nodes.get(id)!;
			instanceData[i * 4] = node.posX;
			instanceData[i * 4 + 1] = node.posY;
			instanceData[i * 4 + 2] = (node.size as { width: number; height: number }).width;
			instanceData[i * 4 + 3] = (node.size as { width: number; height: number }).height;
			this.nodeIndices.set(id, i);
			i++;
		}
		if (this.instanceBuffer) this.instanceBuffer.destroy();
		this.instanceBuffer = this.device!.createBuffer({
			size: Math.max(16, instanceData.byteLength),
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		this.device!.queue.writeBuffer(this.instanceBuffer, 0, instanceData);
	}

	private buildHandleBuffer(): void {
		if (!this.scene) return;
		const handleRadius = 2;
		const handleData: number[] = [];
		this.handleCount = 0;
		for (const id of this.visibleNodes) {
			const node = this.scene!.nodes.get(id)!;
			if (typeof node.size === "string") continue;
			for (const side in node.handles) {
				const s = side as handleSide;
				const config = node.handles[s];
				for (const point of config!.point) {
					const pos = this.getHandlePosition(node, point.id);
					if (pos) {
						handleData.push(pos.x, pos.y, handleRadius);
						this.handleCount++;
					}
				}
			}
		}
		const handleArray = new Float32Array(handleData);
		if (this.handleInstanceBuffer) this.handleInstanceBuffer.destroy();
		this.handleInstanceBuffer = this.device!.createBuffer({
			size: Math.max(12, handleArray.byteLength),
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		this.device!.queue.writeBuffer(this.handleInstanceBuffer, 0, handleArray);
	}

	private buildEdgeBuffer(): void {
		const edgeVertices: number[] = [];
		const segments = 20;
		for (const edge of this.relevantEdges) {
			const sourceNode = this.scene!.nodes.get(edge.source);
			const targetNode = this.scene!.nodes.get(edge.target);
			if (!sourceNode || !targetNode) continue;
			const sourcePos = this.getHandlePosition(sourceNode, edge.sourceHandle);
			const targetPos = this.getHandlePosition(targetNode, edge.targetHandle);
			if (!sourcePos || !targetPos) continue;

			if (edge.style === "straight") {
				edgeVertices.push(sourcePos.x, sourcePos.y, targetPos.x, targetPos.y);
			} else {
				const sourceInfo = this.getHandleInfo(sourceNode, edge.sourceHandle)!;
				const targetInfo = this.getHandleInfo(targetNode, edge.targetHandle)!;
				const dist = Math.hypot(targetPos.x - sourcePos.x, targetPos.y - sourcePos.y);
				const curveStrength = dist * 0.4;
				const sourceDir = this.getDir(sourceInfo.side);
				const targetDir = this.getDir(targetInfo.side);
				const control1 = {
					x: sourcePos.x + sourceDir.dx * curveStrength,
					y: sourcePos.y + sourceDir.dy * curveStrength,
				};
				const control2 = {
					x: targetPos.x - targetDir.dx * curveStrength,
					y: targetPos.y - targetDir.dy * curveStrength,
				};
				for (let i = 0; i < segments; i++) {
					const t1 = i / segments;
					const t2 = (i + 1) / segments;
					const p1 = this.bezierPoint(t1, sourcePos, control1, control2, targetPos);
					const p2 = this.bezierPoint(t2, sourcePos, control1, control2, targetPos);
					edgeVertices.push(p1.x, p1.y, p2.x, p2.y);
				}
			}
		}
		const edgeData = new Float32Array(edgeVertices);
		const requiredSize = Math.max(8, edgeData.byteLength);
		if (requiredSize > this.edgeBufferSize || !this.edgeVertexBuffer) {
			if (this.edgeVertexBuffer) this.edgeVertexBuffer.destroy();
			this.edgeBufferSize = Math.max(this.edgeBufferSize * 2, requiredSize);
			this.edgeVertexBuffer = this.device!.createBuffer({
				size: this.edgeBufferSize,
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			});
		}
		this.device!.queue.writeBuffer(this.edgeVertexBuffer!, 0, edgeData);
		this.edgeVertexCount = edgeVertices.length / 2;
	}

	private renderLoop = (): void => {
		if (!this.device || !this.context || !this.dirty) {
			requestAnimationFrame(this.renderLoop);
			return;
		}
		this.computeVisibility();
		this.buildNodeBuffer();
		this.buildHandleBuffer();
		this.buildEdgeBuffer();
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

		if (this.backgroundType === "dotted" && this.backgroundPipeline && this.fullScreenTriangleBuffer) {
			passEncoder.setPipeline(this.backgroundPipeline);
			passEncoder.setBindGroup(0, this.bindGroup!);
			passEncoder.setVertexBuffer(0, this.fullScreenTriangleBuffer);
			passEncoder.draw(3);
		}

		// Draw nodes
		if (this.nodePipeline && this.instanceBuffer && this.visibleNodes.size) {
			passEncoder.setPipeline(this.nodePipeline);
			passEncoder.setBindGroup(0, this.bindGroup!);
			passEncoder.setVertexBuffer(0, this.quadBuffer);
			passEncoder.setVertexBuffer(1, this.instanceBuffer);
			passEncoder.draw(6, this.visibleNodes.size);
		}

		// Draw handles
		if (this.handlePipeline && this.handleInstanceBuffer && this.handleCount > 0) {
			passEncoder.setPipeline(this.handlePipeline);
			passEncoder.setBindGroup(0, this.bindGroup!);
			passEncoder.setVertexBuffer(0, this.circleQuadBuffer);
			passEncoder.setVertexBuffer(1, this.handleInstanceBuffer);
			passEncoder.draw(6, this.handleCount);
		}

		// Draw edges
		if (this.edgePipeline && this.edgeVertexBuffer && this.edgeVertexCount > 0) {
			passEncoder.setPipeline(this.edgePipeline);
			passEncoder.setBindGroup(0, this.bindGroup!);
			passEncoder.setVertexBuffer(0, this.edgeVertexBuffer);
			passEncoder.draw(this.edgeVertexCount);
		}

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
		if (this.quadBuffer) this.quadBuffer.destroy();
		if (this.circleQuadBuffer) this.circleQuadBuffer.destroy();
		if (this.instanceBuffer) this.instanceBuffer.destroy();
		if (this.handleInstanceBuffer) this.handleInstanceBuffer.destroy();
		if (this.edgeVertexBuffer) this.edgeVertexBuffer.destroy();
		if (this.fullScreenTriangleBuffer) this.fullScreenTriangleBuffer.destroy();
		this.disposeKeyboardShortcut();
		this.eventListeners = {};
	}

	public setScene(scene: MotorScene): void {
		this.scene = scene;
		this.dirty = true;
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

	public worldToScreen(point: { x: number; y: number }): { x: number; y: number } {
		return {
			x: point.x * this.transform.scale + this.transform.translateX,
			y: point.y * this.transform.scale + this.transform.translateY,
		};
	}

	public screenToWorld(point: { x: number; y: number }): { x: number; y: number } {
		return {
			x: (point.x - this.transform.translateX) / this.transform.scale,
			y: (point.y - this.transform.translateY) / this.transform.scale,
		};
	}

	public requestRedraw(): void {
		this.dirty = true;
	}

	private handleKeyDown = (e: KeyboardEvent) =>{
		if (!e.key.startsWith("Arrow")) return;
		if(documentHaveActiveElement()) return;
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
		if(key === "ArrowDown") {
			this.transform.translateY -= workValue;
		} else if(key === "ArrowUp") {
			this.transform.translateY += workValue;
		} else if(key === "ArrowLeft") {
			this.transform.translateX += workValue;
		} else if(key === "ArrowRight") {
			this.transform.translateX -= workValue;
		}
		this.userHasMovedManually = true;
		this.requestRedraw();
		this.emit("pan", this.transform);
	}

	public initKeyboardShortcut(): void {
		window.addEventListener("keydown", this.handleKeyDown);
		window.addEventListener("keyup", this.handleKeyUp);
	}
	public disposeKeyboardShortcut(): void {
		window.removeEventListener("keydown", this.handleKeyDown);
		window.removeEventListener("keyup", this.handleKeyUp);
	}

	public getNodeScreenRect(nodeId: string): { x: number; y: number; width: number; height: number } | undefined {
		if(!this.scene) return;
		const node = this.scene!.nodes.get(nodeId);
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

	public getContainerDraw():HTMLElement {
		return this.canvas as HTMLElement;
	}

	public enableInteractive(value:boolean): void {
		this.interactiveEnabled = value;
	}

	public isInteractive(): boolean {
		return this.interactiveEnabled;
	}

	public resetViewport():void {
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
		const duration = options.duration ?? 500; // Default 500ms
		const easing = options.easing ?? ((t: number) => t * t * (3 - 2 * t)); // Default smooth step

		// Cancel any existing animation
		if (this.animationFrameId) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}

		// Calculate target position in screen space
		// We want the world point (x, y) to be at the center of the canvas after transition
		const centerX = this.canvas!.width / 2;
		const centerY = this.canvas!.height / 2;

		// Store starting values
		const startScale = this.transform.scale;
		const startTranslateX = this.transform.translateX;
		const startTranslateY = this.transform.translateY;

		// Store target values, clamped to valid zoom range
		const targetScale = Math.max(this.minZoom, Math.min(this.maxZoom, options.zoom));

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

			this.dirty = true;

			// Emit events
			this.emit("zoom", this.transform);
			this.emit("pan", this.transform);

			if (progress < 1) {
				this.animationFrameId = requestAnimationFrame(animate);
			} else {
				this.animationFrameId = null;
				if (options.onComplete) {
					options.onComplete();
				}
			}
		};
		if(duration <= 0) {
			animate(startTime);
		}  else {
			this.animationFrameId = requestAnimationFrame(animate);
		}
	}

	//  Smooth transition to fit a specific node or area
	public smoothFitToNode(nodeId: string, options?: {
		padding?: number;
		duration?: number;
		easing?: (t: number) => number;
		onComplete?: () => void;
	}): void {
		if (!this.scene) return;
		const node = this.scene.nodes.get(nodeId);
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
		const availableWidth = this.canvas!.width - 2 * padding;
		const availableHeight = this.canvas!.height - 2 * padding;

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

	// Smooth transition to fit multiple nodes/area
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

		const padding = options?.padding ?? 50;

		const width = bounds.maxX - bounds.minX;
		const height = bounds.maxY - bounds.minY;
		const centerX = (bounds.minX + bounds.maxX) / 2;
		const centerY = (bounds.minY + bounds.maxY) / 2;

		const availableWidth = this.canvas!.width - 2 * padding;
		const availableHeight = this.canvas!.height - 2 * padding;

		const scaleX = availableWidth / width;
		const scaleY = availableHeight / height;
		const targetZoom = Math.min(scaleX, scaleY, 2); // Cap at 2x zoom

		this.smoothTransitionTo({
			x: centerX,
			y: centerY,
			zoom: targetZoom,
			duration: options?.duration,
			easing: options?.easing,
			onComplete: options?.onComplete
		});
	}
}

