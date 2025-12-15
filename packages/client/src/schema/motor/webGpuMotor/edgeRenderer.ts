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

import { Edge, Node } from "@nodius/utils";
import { MotorScene } from "../graphicalMotor";
import {Point} from "@nodius/utils";
import {getDir, getHandleInfo, getHandlePosition} from "@nodius/utils";

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
    private selectedEdges: Set<string> = new Set();
    private hoveredEdge: string | null = null;

    // Shadow/glow effect for selected edges
    private shadowPipeline: GPURenderPipeline | null = null;
    private selectedEdgeVertexBuffer: GPUBuffer | null = null;
    private selectedEdgeBufferSize: number = 0;
    private selectedEdgeVertexCount: number = 0;

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

    public getHoverEdge = () => this.hoveredEdge;
    public getSelectedEdges = () => this.selectedEdges;
    public getCursorPosition = () => this.cursorPosition;

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

        // Create shadow/glow pipeline for selected edges
        // Uses triangle-list to render thick lines with glow effect
        const shadowShaderCode = /* wgsl */ `
      struct Uniforms {
        scale: f32,
        padding: f32,
        translate: vec2<f32>,
        viewport: vec2<f32>,
      };

      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) alpha: f32,
      };

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      @vertex
      fn vs(
        @location(0) world_pos: vec2<f32>,
        @location(1) offset: vec2<f32>,
        @location(2) alpha_val: f32
      ) -> VertexOutput {
        let offset_world = world_pos + offset;
        let screen_pos = offset_world * uniforms.scale + uniforms.translate;
        let clip_x = 2.0 * screen_pos.x / uniforms.viewport.x - 1.0;
        let clip_y = 1.0 - 2.0 * screen_pos.y / uniforms.viewport.y;

        var output: VertexOutput;
        output.position = vec4<f32>(clip_x, clip_y, 0.0, 1.0);
        output.alpha = alpha_val;
        return output;
      }

      @fragment
      fn fs(input: VertexOutput) -> @location(0) vec4<f32> {
        // Alpha varies based on distance from center for glow effect
        return vec4<f32>(0.2, 0.2, 0.2, input.alpha);
      }
    `;
        const shadowModule = this.device.createShaderModule({ code: shadowShaderCode });
        this.shadowPipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
            vertex: {
                module: shadowModule,
                entryPoint: "vs",
                buffers: [
                    {
                        // Position
                        arrayStride: 20, // vec2 pos + vec2 offset + f32 alpha = 8 + 8 + 4 = 20
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: "float32x2" }, // world_pos
                            { shaderLocation: 1, offset: 8, format: "float32x2" }, // offset
                            { shaderLocation: 2, offset: 16, format: "float32" }, // alpha
                        ],
                    },
                ],
            },
            fragment: {
                module: shadowModule,
                entryPoint: "fs",
                targets: [{
                    format: this.format,
                    blend: {
                        color: {
                            srcFactor: "src-alpha",
                            dstFactor: "one-minus-src-alpha",
                            operation: "add",
                        },
                        alpha: {
                            srcFactor: "one",
                            dstFactor: "one-minus-src-alpha",
                            operation: "add",
                        },
                    },
                }],
            },
            primitive: { topology: "triangle-list" },
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

    /**
     * Creates a thick line segment with glow effect as a quad (2 triangles)
     * Similar to CSS box-shadow with multiple layers
     */
    private createGlowLineSegment(p1: Point, p2: Point, width: number, alpha: number, vertices: number[]): void {
        // Calculate perpendicular direction for line thickness
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.001) return; // Skip degenerate segments

        const perpX = (-dy / len) * width;
        const perpY = (dx / len) * width;

        // Create quad vertices (2 triangles = 6 vertices)
        // Each vertex: posX, posY, offsetX, offsetY, alpha

        // Triangle 1: top-left, bottom-left, top-right
        // Top-left
        vertices.push(p1.x, p1.y, perpX, perpY, alpha);
        // Bottom-left
        vertices.push(p1.x, p1.y, -perpX, -perpY, alpha);
        // Top-right
        vertices.push(p2.x, p2.y, perpX, perpY, alpha);

        // Triangle 2: bottom-left, bottom-right, top-right
        // Bottom-left
        vertices.push(p1.x, p1.y, -perpX, -perpY, alpha);
        // Bottom-right
        vertices.push(p2.x, p2.y, -perpX, -perpY, alpha);
        // Top-right
        vertices.push(p2.x, p2.y, perpX, perpY, alpha);
    }

    public getEdgePathPoints(scene: MotorScene, edge: Edge, segments: number = 10): Point[] {
        const sourceNode = edge.source !== undefined ? scene.nodes.get(edge.source) : undefined;
        const targetNode = edge.target !== undefined ? scene.nodes.get(edge.target) : undefined;

        const isTemporary = edge.source === undefined || edge.target === undefined;

        // if edge.source or edge.target is undefined, the edge is temporary (dragged by user) and missing end uses cursor position
        const sourcePos = !sourceNode && isTemporary
            ? this.screenToWorld(this.cursorPosition)
            : (sourceNode ? getHandlePosition(sourceNode, edge.sourceHandle) : null);
        const targetPos = !targetNode && isTemporary
            ? this.screenToWorld(this.cursorPosition)
            : (targetNode ? getHandlePosition(targetNode, edge.targetHandle) : null);

        if (!sourcePos || !targetPos) return [];

        const points: Point[] = [];

            const sourceInfo = sourceNode ? getHandleInfo(sourceNode, edge.sourceHandle)! : undefined;
            const targetInfo = targetNode ? getHandleInfo(targetNode, edge.targetHandle)! : undefined;
            const dist = Math.hypot(targetPos.x - sourcePos.x, targetPos.y - sourcePos.y);
            const curveStrength = dist * 0.4;
            const sourceDir = sourceInfo ? getDir(sourceInfo.side, sourceInfo.point.type) : {dx: 0, dy: 0};
            const targetDir = targetInfo ? getDir(targetInfo.side, targetInfo.point.type) : {dx: 0, dy: 0};
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

        return points;
    }

    public buildEdgeBuffer(edgesMap:Map<string, Edge[]>, nodesMap:Map<string, Node<any>>): void {
        const edgeVertices: number[] = [];
        const selectedEdgeVertices: number[] = [];
        const segments = 20;
        for(const edges of edgesMap.values()) {
            for(const edge of edges) {
                const sourceNode = edge.source !== undefined ? nodesMap.get(edge.source) : undefined;
                const targetNode = edge.target !== undefined ? nodesMap.get(edge.target) : undefined;

                const isTemporary = edge.source === undefined || edge.target === undefined;

                // Handle temporary edges (one end is undefined, using cursor position)
                const sourcePos = !sourceNode && isTemporary
                    ? this.screenToWorld(this.cursorPosition)
                    : (sourceNode ? getHandlePosition(sourceNode, edge.sourceHandle) : null);
                const targetPos = !targetNode && isTemporary
                    ? this.screenToWorld(this.cursorPosition)
                    : (targetNode ? getHandlePosition(targetNode, edge.targetHandle) : null);

                if (!sourcePos || !targetPos) continue;

                const isSelected = this.selectedEdges.has(edge._key);


                const sourceInfo = sourceNode ? getHandleInfo(sourceNode, edge.sourceHandle)! : undefined;
                const targetInfo = targetNode ? getHandleInfo(targetNode, edge.targetHandle)! : undefined;
                const dist = Math.hypot(targetPos.x - sourcePos.x, targetPos.y - sourcePos.y);
                const curveStrength = dist * 0.4;
                const sourceDir = sourceInfo ? getDir(sourceInfo.side, sourceInfo.point.type) : {dx: 0, dy: 0};
                const targetDir = targetInfo ? getDir(targetInfo.side, targetInfo.point.type) : {dx: 0, dy: 0};
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

                    if (isSelected) {
                        // Create multi-layer glow effect for each segment
                        this.createGlowLineSegment(p1, p2, 8, 0.15 / 10, selectedEdgeVertices);
                        this.createGlowLineSegment(p1, p2, 5, 0.3 / 10, selectedEdgeVertices);
                        this.createGlowLineSegment(p1, p2, 3, 0.5 / 10, selectedEdgeVertices);
                        this.createGlowLineSegment(p1, p2, 1.5, 0.8 / 10, selectedEdgeVertices);
                    } else {
                        edgeVertices.push(p1.x, p1.y, p2.x, p2.y);
                    }
                }
            }
        }
        // Update normal edge buffer
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

        // Update selected edge buffer
        const selectedEdgeData = new Float32Array(selectedEdgeVertices);
        const selectedRequiredSize = Math.max(8, selectedEdgeData.byteLength);
        if (selectedRequiredSize > this.selectedEdgeBufferSize || !this.selectedEdgeVertexBuffer) {
            if (this.selectedEdgeVertexBuffer) this.selectedEdgeVertexBuffer.destroy();
            this.selectedEdgeBufferSize = Math.max(this.selectedEdgeBufferSize * 2, selectedRequiredSize);
            this.selectedEdgeVertexBuffer = this.device.createBuffer({
                size: this.selectedEdgeBufferSize,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
        }
        this.device.queue.writeBuffer(this.selectedEdgeVertexBuffer!, 0, selectedEdgeData);
        // Each vertex has 5 floats (posX, posY, offsetX, offsetY, alpha)
        this.selectedEdgeVertexCount = selectedEdgeVertices.length / 5;
    }

    public render(passEncoder: GPURenderPassEncoder, bindGroup: GPUBindGroup): void {
        // Render normal edges first
        if (this.edgePipeline && this.edgeVertexBuffer && this.edgeVertexCount > 0) {
            passEncoder.setPipeline(this.edgePipeline);
            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.setVertexBuffer(0, this.edgeVertexBuffer);
            passEncoder.draw(this.edgeVertexCount);
        }

        // Render selected edges with glow effect
        // Multi-layer rendering (outer glow, mid glow, inner glow, core line)
        // Similar to CSS box-shadow layers for selected nodes
        if (this.shadowPipeline && this.selectedEdgeVertexBuffer && this.selectedEdgeVertexCount > 0) {
            passEncoder.setPipeline(this.shadowPipeline);
            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.setVertexBuffer(0, this.selectedEdgeVertexBuffer);
            passEncoder.draw(this.selectedEdgeVertexCount);
        }
    }

    public setSelectedEdges(edgeKeys: string[]): void {
        this.selectedEdges = new Set(edgeKeys);
    }

    public setHoveredEdge(edgeKey: string | null): void {
        this.hoveredEdge = edgeKey;
    }

    public dispose(): void {
        if (this.edgeVertexBuffer) this.edgeVertexBuffer.destroy();
        if (this.selectedEdgeVertexBuffer) this.selectedEdgeVertexBuffer.destroy();
        this.canvas.removeEventListener("mousemove",this.cursorEvent);
    }
}
