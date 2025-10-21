/**
 * @file handleRenderer.ts
 * @description WebGPU renderer for node handles (connection points)
 * @module webGpuMotor
 *
 * Renders handles as circular connection points on nodes:
 * - Renders handles as instanced circles with anti-aliasing
 * - Uses fragment shader for smooth circular edges
 * - Handles are positioned based on node size and handle configuration
 * - Supports handles on all sides (T, D, L, R) and center (0)
 */

import { handleSide } from "../../../../utils/graph/graphType";
import { getHandlePosition } from "./handleUtils";

/**
 * Renders node handles (connection points) as circles using WebGPU
 */
export class HandleRenderer {
	private device: GPUDevice;
	private format: GPUTextureFormat;
	private sampleCount: number;
	private circleQuadBuffer: GPUBuffer | null = null;
	private handleInstanceBuffer: GPUBuffer | null = null;
	private handlePipeline: GPURenderPipeline | null = null;
	private handleCount: number = 0;

	constructor(device: GPUDevice, format: GPUTextureFormat, sampleCount: number) {
		this.device = device;
		this.format = format;
		this.sampleCount = sampleCount;
	}

	public init(bindGroupLayout: GPUBindGroupLayout): void {
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
	}

	public buildHandleBuffer(visibleNodes: Set<string>, scene: Map<string, any>): void {
		const handleRadius = 2;
		const handleData: number[] = [];
		this.handleCount = 0;
		for (const id of visibleNodes) {
			const node = scene.get(id)!;
			if (typeof node.size === "string") continue;
			for (const side in node.handles) {
				const s = side as handleSide;
				const config = node.handles[s];
				for (const point of config!.point) {
					const pos = getHandlePosition(node, point.id);
					if (pos) {
						handleData.push(pos.x, pos.y, handleRadius);
						this.handleCount++;
					}
				}
			}
		}
		const handleArray = new Float32Array(handleData);
		if (this.handleInstanceBuffer) this.handleInstanceBuffer.destroy();
		this.handleInstanceBuffer = this.device.createBuffer({
			size: Math.max(12, handleArray.byteLength),
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		this.device.queue.writeBuffer(this.handleInstanceBuffer, 0, handleArray);
	}

	public render(passEncoder: GPURenderPassEncoder, bindGroup: GPUBindGroup): void {
		if (this.handlePipeline && this.handleInstanceBuffer && this.handleCount > 0) {
			passEncoder.setPipeline(this.handlePipeline);
			passEncoder.setBindGroup(0, bindGroup);
			passEncoder.setVertexBuffer(0, this.circleQuadBuffer);
			passEncoder.setVertexBuffer(1, this.handleInstanceBuffer);
			passEncoder.draw(6, this.handleCount);
		}
	}

	public dispose(): void {
		if (this.circleQuadBuffer) this.circleQuadBuffer.destroy();
		if (this.handleInstanceBuffer) this.handleInstanceBuffer.destroy();
	}
}
