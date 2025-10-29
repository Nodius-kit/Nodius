/**
 * @file handleRenderer.ts
 * @description WebGPU renderer for node handles (connection points)
 * @module webGpuMotor
 *
 * Renders handles as connection points on nodes:
 * - Circles for "out" (output) handles
 * - Rectangles for "in" (input) handles
 * - Uses fragment shader for smooth edges with anti-aliasing
 * - Handles are positioned based on node size and handle configuration
 * - Supports handles on all sides (T, D, L, R) and center (0)
 */

import { handleSide } from "../../../../utils/graph/graphType";
import { getHandlePosition } from "./handleUtils";

/**
 * Renders node handles (connection points) with different shapes based on type
 */
export class HandleRenderer {
	private device: GPUDevice;
	private format: GPUTextureFormat;
	private sampleCount: number;
	private quadBuffer: GPUBuffer | null = null;
	private handleInstanceBuffer: GPUBuffer | null = null;
	private handlePipeline: GPURenderPipeline | null = null;
	private handleCount: number = 0;

	constructor(device: GPUDevice, format: GPUTextureFormat, sampleCount: number) {
		this.device = device;
		this.format = format;
		this.sampleCount = sampleCount;
	}

	public init(bindGroupLayout: GPUBindGroupLayout): void {
		// Quad buffer for handles (used for both circles and rectangles)
		const quadVertices = new Float32Array([
			-1, -1, 1, -1, -1, 1, // triangle 1
			-1, 1, 1, -1, 1, 1, // triangle 2
		]);
		this.quadBuffer = this.device.createBuffer({
			size: quadVertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		this.device.queue.writeBuffer(this.quadBuffer, 0, quadVertices);

		// Handle pipeline with shape differentiation
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
        @location(1) @interpolate(flat) shape_type: u32, // 0 = circle (out), 1 = rectangle (in)
      };

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      @vertex
      fn vs(
        @location(0) local_pos: vec2<f32>,
        @location(1) instance_pos: vec2<f32>,
        @location(2) instance_radius: f32,
        @location(3) shape_type: u32
      ) -> VertexOutput {
        var out: VertexOutput;
        let world_pos = local_pos * instance_radius + instance_pos;
        let screen_pos = world_pos * uniforms.scale + uniforms.translate;
        let clip_x = 2.0 * screen_pos.x / uniforms.viewport.x - 1.0;
        let clip_y = 1.0 - 2.0 * screen_pos.y / uniforms.viewport.y;
        out.pos = vec4<f32>(clip_x, clip_y, 0.0, 1.0);
        out.uv = local_pos;
        out.shape_type = shape_type;
        return out;
      }

      @fragment
      fn fs(in: VertexOutput) -> @location(0) vec4<f32> {
        var alpha: f32;

        if (in.shape_type == 0u) {
          // Circle shape for "out" handles
          let dist = length(in.uv);
          if (dist > 1.0) {
            discard;
          }
          alpha = 1.0 - smoothstep(0.85, 1.0, dist);
          return vec4<f32>(1.0, 0.4, 0.2, alpha); // Bright red/orange for output
        } else {
          // Rectangle shape for "in" handles
          let max_dist = max(abs(in.uv.x), abs(in.uv.y));
          if (max_dist > 1.0) {
            discard;
          }
          alpha = 1.0 - smoothstep(0.85, 1.0, max_dist);
          return vec4<f32>(0.2, 0.8, 0.4, alpha); // Bright green for input
        }
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
						arrayStride: 16,
						stepMode: "instance",
						attributes: [
							{ shaderLocation: 1, offset: 0, format: "float32x2" },
							{ shaderLocation: 2, offset: 8, format: "float32" },
							{ shaderLocation: 3, offset: 12, format: "uint32" },
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
		const handleRadius = 5; // Increased from 2 to 5 for better visibility
		const handleData: number[] = [];
		this.handleCount = 0;
		for (const id of visibleNodes) {
			const node = scene.get(id)!;
			for (const side in node.handles) {
				const s = side as handleSide;
				const config = node.handles[s];
				for (const point of config!.point) {
					const pos = getHandlePosition(node, point.id);
					if (pos) {
						// Determine shape type: 0 = circle (out), 1 = rectangle (in)
						const shapeType = point.type === "out" ? 0 : 1;
						handleData.push(pos.x, pos.y, handleRadius, shapeType);
						this.handleCount++;
					}
				}
			}
		}
		const handleArray = new Float32Array(handleData);
		if (this.handleInstanceBuffer) this.handleInstanceBuffer.destroy();
		this.handleInstanceBuffer = this.device.createBuffer({
			size: Math.max(16, handleArray.byteLength),
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		this.device.queue.writeBuffer(this.handleInstanceBuffer, 0, handleArray);
	}

	public render(passEncoder: GPURenderPassEncoder, bindGroup: GPUBindGroup): void {
		if (this.handlePipeline && this.handleInstanceBuffer && this.handleCount > 0) {
			passEncoder.setPipeline(this.handlePipeline);
			passEncoder.setBindGroup(0, bindGroup);
			passEncoder.setVertexBuffer(0, this.quadBuffer);
			passEncoder.setVertexBuffer(1, this.handleInstanceBuffer);
			passEncoder.draw(6, this.handleCount);
		}
	}

	public dispose(): void {
		if (this.quadBuffer) this.quadBuffer.destroy();
		if (this.handleInstanceBuffer) this.handleInstanceBuffer.destroy();
	}
}
