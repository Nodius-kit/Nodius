/**
 * @file edgeRenderer.ts
 * @description WebGPU renderer for graph edges (connections between nodes)
 * @module webGpuMotor
 *
 * Renders edges with support for:
 * - Straight lines between handles
 * - Curved bezier paths with automatic control points
 * - Dynamic buffer resizing for varying edge counts
 * - Edge path calculation for click detection
 *
 * Uses cubic bezier curves for smooth curved edges, with control points
 * calculated based on handle directions and distance.
 */

import { Edge } from "../../../../utils/graph/graphType";
import { MotorScene } from "../graphicalMotor";
import { Point } from "./types";
import { getHandleInfo, getHandlePosition, getDir } from "./handleUtils";

/**
 * Renders graph edges (connections between nodes) using WebGPU
 */
export class EdgeRenderer {
	private device: GPUDevice;
	private format: GPUTextureFormat;
	private sampleCount: number;
	private edgeVertexBuffer: GPUBuffer | null = null;
	private edgeBufferSize: number = 0;
	private edgePipeline: GPURenderPipeline | null = null;
	private edgeVertexCount: number = 0;
	private canvas: HTMLCanvasElement;
	private cursorPosition: Point = {x:0, y:0};
	private cursorEvent: ((e:MouseEvent) => void);
	private screenToWorld:((point: Point) => Point );

	constructor(device: GPUDevice, format: GPUTextureFormat, sampleCount: number, canvas: HTMLCanvasElement, screenToWorld:((point: Point) => Point )) {
		this.device = device;
		this.format = format;
		this.sampleCount = sampleCount;
		this.canvas = canvas;

		this.cursorEvent = (evt:MouseEvent) => {
			this.cursorPosition = {
				x: evt.clientX,
				y: evt.clientY,
			}
		}

		this.canvas.addEventListener("mousemove",this.cursorEvent);
		this.screenToWorld = screenToWorld;
	}

	public init(bindGroupLayout: GPUBindGroupLayout): void {
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

	public getEdgePathPoints(scene: MotorScene, edge: Edge, segments: number = 10): Point[] {
		const sourceNode = scene.nodes.get(edge.source);
		const targetNode = scene.nodes.get(edge.target);

		const isTemporary = edge.source === undefined || edge.target === undefined;


		const sourcePos = sourceNode && edge.source ? getHandlePosition(sourceNode, edge.sourceHandle) : this.screenToWorld(this.cursorPosition);
		const targetPos = !(sourceNode && edge.source) ? undefined : ((targetNode && edge.target)  ? getHandlePosition(targetNode, edge.targetHandle) : this.screenToWorld(this.cursorPosition));

		if (!sourcePos || !targetPos) return [];

		const points: Point[] = [];
		if (edge.style === "straight") {
			points.push(sourcePos, targetPos);
		} else {
			const sourceInfo = sourceNode ? getHandleInfo(sourceNode, edge.sourceHandle)! : undefined;
			const targetInfo = targetNode ? getHandleInfo(targetNode, edge.targetHandle)! : undefined;
			const dist = Math.hypot(targetPos.x - sourcePos.x, targetPos.y - sourcePos.y);
			const curveStrength = dist * 0.4;
			const sourceDir = sourceInfo ? getDir(sourceInfo.side) : {dx: 0, dy: 0};
			const targetDir = targetInfo ? getDir(targetInfo.side) : {dx: 0, dy: 0};;
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

	public buildEdgeBuffer(scene: MotorScene, relevantEdges: Edge[]): void {
		const edgeVertices: number[] = [];
		const segments = 20;
		for (const edge of relevantEdges) {
			const sourceNode = scene.nodes.get(edge.source);
			const targetNode = scene.nodes.get(edge.target);
			if (!sourceNode || !targetNode) continue;
			const sourcePos = getHandlePosition(sourceNode, edge.sourceHandle);
			const targetPos = getHandlePosition(targetNode, edge.targetHandle);
			if (!sourcePos || !targetPos) continue;

			if (edge.style === "straight") {
				edgeVertices.push(sourcePos.x, sourcePos.y, targetPos.x, targetPos.y);
			} else {
				const sourceInfo = getHandleInfo(sourceNode, edge.sourceHandle)!;
				const targetInfo = getHandleInfo(targetNode, edge.targetHandle)!;
				const dist = Math.hypot(targetPos.x - sourcePos.x, targetPos.y - sourcePos.y);
				const curveStrength = dist * 0.4;
				const sourceDir = getDir(sourceInfo.side);
				const targetDir = getDir(targetInfo.side);
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
			this.edgeVertexBuffer = this.device.createBuffer({
				size: this.edgeBufferSize,
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			});
		}
		this.device.queue.writeBuffer(this.edgeVertexBuffer!, 0, edgeData);
		this.edgeVertexCount = edgeVertices.length / 2;
	}

	public render(passEncoder: GPURenderPassEncoder, bindGroup: GPUBindGroup): void {
		if (this.edgePipeline && this.edgeVertexBuffer && this.edgeVertexCount > 0) {
			passEncoder.setPipeline(this.edgePipeline);
			passEncoder.setBindGroup(0, bindGroup);
			passEncoder.setVertexBuffer(0, this.edgeVertexBuffer);
			passEncoder.draw(this.edgeVertexCount);
		}
	}

	public dispose(): void {
		if (this.edgeVertexBuffer) this.edgeVertexBuffer.destroy();
		this.canvas.removeEventListener("mousemove",this.cursorEvent);
	}
}
