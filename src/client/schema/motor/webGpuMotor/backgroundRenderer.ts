/**
 * @file backgroundRenderer.ts
 * @description WebGPU background renderer for the graph canvas
 * @module webGpuMotor
 *
 * Renders the canvas background with support for:
 * - Dotted grid pattern (with world-space dots that zoom with camera)
 * - Solid color background
 *
 * Uses a full-screen triangle technique for efficient rendering.
 * The shader transforms screen coordinates to world coordinates to maintain
 * grid alignment during pan/zoom operations.
 */

import { backgroundType } from "../graphicalMotor";

/**
 * Renders the background of the graph canvas using WebGPU
 */
export class BackgroundRenderer {
	private device: GPUDevice;
	private format: GPUTextureFormat;
	private sampleCount: number;
	private backgroundType: typeof backgroundType[number];
	private fullScreenTriangleBuffer: GPUBuffer | null = null;
	private backgroundPipeline: GPURenderPipeline | null = null;

	constructor(device: GPUDevice, format: GPUTextureFormat, sampleCount: number, bgType: typeof backgroundType[number]) {
		this.device = device;
		this.format = format;
		this.sampleCount = sampleCount;
		this.backgroundType = bgType;
	}

	/**
	 * Initializes the background renderer with WebGPU pipeline and buffers
	 * @param bindGroupLayout - The bind group layout for uniforms
	 */
	public init(bindGroupLayout: GPUBindGroupLayout): void {
		// Full-screen triangle for background (covers entire viewport with just 3 vertices)
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
	}

	public render(passEncoder: GPURenderPassEncoder, bindGroup: GPUBindGroup): void {
		if (this.backgroundType === "dotted" && this.backgroundPipeline && this.fullScreenTriangleBuffer) {
			passEncoder.setPipeline(this.backgroundPipeline);
			passEncoder.setBindGroup(0, bindGroup);
			passEncoder.setVertexBuffer(0, this.fullScreenTriangleBuffer);
			passEncoder.draw(3);
		}
	}

	public dispose(): void {
		if (this.fullScreenTriangleBuffer) this.fullScreenTriangleBuffer.destroy();
	}
}
