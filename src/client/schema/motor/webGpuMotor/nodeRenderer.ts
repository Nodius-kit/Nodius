/**
 * @file nodeRenderer.ts
 * @description WebGPU renderer for graph nodes (rectangular boxes)
 * @module webGpuMotor
 *
 * Renders nodes as instanced rectangles using WebGPU:
 * - Uses instance rendering for efficient batch drawing
 * - Renders nodes as simple quads (6 vertices per instance)
 * - Maintains node indices map for quick lookups
 * - Only renders visible nodes (culled by computeVisibility)
 */

/**
 * Renders graph nodes as rectangles using WebGPU instancing
 */

import { Node } from "../../../../utils/graph/graphType";
import {ViewTransform} from "../graphicalMotor";

export class NodeRenderer {
    private device: GPUDevice;
    private format: GPUTextureFormat;
    private sampleCount: number;
    private quadBuffer: GPUBuffer | null = null;
    private instanceBuffer: GPUBuffer | null = null;
    private nodePipeline: GPURenderPipeline | null = null;
    public nodeIndices: Map<string, number> = new Map();
    private transform: ViewTransform;

    constructor(device: GPUDevice, format: GPUTextureFormat, sampleCount: number, transform: ViewTransform) {
        this.device = device;
        this.format = format;
        this.sampleCount = sampleCount;
        this.transform = transform;
    }

    public init(bindGroupLayout: GPUBindGroupLayout): void {
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
    }

    public buildNodeBuffer(scene: Map<string, Node<any>>): void {
        const instanceData = new Float32Array(scene.size * 4);
        let i = 0;
        this.nodeIndices.clear();
        const scale = 1;
        for (const node of scene.values()) {
            instanceData[i * 4] = node.posX * scale;
            instanceData[i * 4 + 1] = node.posY * scale;
            instanceData[i * 4 + 2] = (node.size as { width: number; height: number }).width * scale;
            instanceData[i * 4 + 3] = (node.size as { width: number; height: number }).height * scale;
            this.nodeIndices.set(node._key, i);
            i++;
        }
        if (this.instanceBuffer) this.instanceBuffer.destroy();
        this.instanceBuffer = this.device.createBuffer({
            size: Math.max(16, instanceData.byteLength),
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.instanceBuffer, 0, instanceData);
    }

    public render(passEncoder: GPURenderPassEncoder, bindGroup: GPUBindGroup, nodeCount: number): void {
        if (this.nodePipeline && this.instanceBuffer && nodeCount > 0) {
            passEncoder.setPipeline(this.nodePipeline);
            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.setVertexBuffer(0, this.quadBuffer);
            passEncoder.setVertexBuffer(1, this.instanceBuffer);
            passEncoder.draw(6, nodeCount);
        }
    }

    public dispose(): void {
        if (this.quadBuffer) this.quadBuffer.destroy();
        if (this.instanceBuffer) this.instanceBuffer.destroy();
    }
}
