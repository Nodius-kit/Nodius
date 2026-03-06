/**
 * Auto-layout — computes new positions for a set of nodes using @nodius/layouting.
 *
 * Called by the AI when the user asks to reorganize/tidy up node positions.
 * Converts Nodius Node/Edge types to @nodius/layouting input format,
 * runs the Sugiyama-based layout algorithm, and returns new positions.
 */

import type { Node, Edge } from "@nodius/utils";
import { layout } from "@nodius/layouting";
import type { NodeInput, EdgeInput, HandleInput, LayoutOptions, HandleSide as LayoutHandleSide, HandleType as LayoutHandleType } from "@nodius/layouting";

export interface LayoutResult {
    nodeKey: string;
    posX: number;
    posY: number;
}

/** Map Nodius handleSide ("T","D","R","L","0") to @nodius/layouting HandleSide */
function mapHandleSide(side: string): LayoutHandleSide {
    switch (side) {
        case "T": return "top";
        case "D": return "bottom";
        case "R": return "right";
        case "L": return "left";
        default: return "bottom"; // "0" (middle) → default to bottom
    }
}

/** Map Nodius handle type ("in","out") to @nodius/layouting HandleType */
function mapHandleType(type: string): LayoutHandleType {
    return type === "out" ? "output" : "input";
}

/** Convert a Nodius Node to @nodius/layouting NodeInput */
function toNodeInput(node: Node<unknown>): NodeInput {
    const handles: HandleInput[] = [];

    if (node.handles) {
        for (const [side, sideData] of Object.entries(node.handles)) {
            if (!sideData?.point) continue;
            const layoutSide = mapHandleSide(side);
            const pointCount = sideData.point.length;

            for (let i = 0; i < pointCount; i++) {
                const pt = sideData.point[i];
                let offset: number;
                if (sideData.position === "fix" && pt.offset != null) {
                    // "fix" mode: offset in pixels → convert to 0-1 ratio
                    const dimension = (side === "T" || side === "D") ? node.size.width : node.size.height;
                    offset = dimension > 0 ? pt.offset / dimension : 0.5;
                } else if (pt.offset != null) {
                    // "separate" mode: already 0-1
                    offset = pt.offset;
                } else {
                    // Default: evenly distributed
                    offset = pointCount === 1 ? 0.5 : (i + 1) / (pointCount + 1);
                }

                handles.push({
                    id: pt.id,
                    type: mapHandleType(pt.type),
                    position: layoutSide,
                    offset: Math.max(0, Math.min(1, offset)),
                });
            }
        }
    }

    return {
        id: node._key,
        width: node.size?.width ?? 200,
        height: node.size?.height ?? 100,
        handles,
    };
}

/** Convert a Nodius Edge to @nodius/layouting EdgeInput */
function toEdgeInput(edge: Edge): EdgeInput {
    return {
        id: edge._key,
        from: edge.source,
        to: edge.target,
        fromHandle: edge.sourceHandle,
        toHandle: edge.targetHandle,
    };
}

/** Map strategy string to LayoutOptions */
function strategyToOptions(strategy?: string): LayoutOptions {
    switch (strategy) {
        case "vertical":
        case "tree":
            return { direction: "TB", nodeSpacing: 100, layerSpacing: 160 };
        case "horizontal":
            return { direction: "LR", nodeSpacing: 100, layerSpacing: 160 };
        default:
            // Default: left-to-right (matches typical workflow direction)
            return { direction: "LR", nodeSpacing: 100, layerSpacing: 160 };
    }
}

export function computeAutoLayout(
    nodes: Node<unknown>[],
    edges: Edge[],
    strategy?: string,
): LayoutResult[] {
    if (nodes.length === 0) return [];

    const nodeSet = new Set(nodes.map(n => n._key));

    // Convert to layouting input format
    const layoutNodes = nodes.map(toNodeInput);
    const layoutEdges = edges
        .filter(e => nodeSet.has(e.source) && nodeSet.has(e.target))
        .map(toEdgeInput);

    const options = strategyToOptions(strategy);

    const result = layout({ nodes: layoutNodes, edges: layoutEdges }, options);

    return result.nodes.map(n => ({
        nodeKey: n.id,
        posX: Math.round(n.x),
        posY: Math.round(n.y),
    }));
}
