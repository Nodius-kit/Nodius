/**
 * @file handleUtils.ts
 * @description Utility functions for node handle positioning and information
 * @module webGpuMotor
 *
 * Provides functions to:
 * - getHandleInfo: Retrieve handle metadata from a node
 * - getHandlePosition: Calculate screen/world position of a handle
 * - getDir: Get direction vector for a handle side (for bezier curve control points)
 *
 * Handle sides: T (Top), D (Down), L (Left), R (Right), 0 (Center)
 */

import { handleSide, Node } from "../../../../utils/graph/graphType";
import { HandleInfo, Point } from "./types";

/**
 * Retrieves handle information from a node by handle ID
 * @param node - The node containing the handle
 * @param handleId - The unique identifier of the handle to find
 * @returns HandleInfo object with side, offset, and point data, or undefined if not found
 */
export function getHandleInfo(node: Node<any>, handleId: string): HandleInfo | undefined {
	for (const [side, handle] of Object.entries(node.handles)) {
		const index = handle.point.findIndex((p) => p.id === handleId);
		if (index !== -1) {
			const point = handle.point[index]!;
			let offset = point.offset;
			// Calculate offset for "separate" position mode (evenly distributed)
			if (handle.position === "separate" && offset === undefined) {
				offset = (index + 0.5) / handle.point.length;
			} else if (offset === undefined) {
				// Default to center position
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

/**
 * Calculates the world position of a handle on a node
 * @param node - The node containing the handle
 * @param handleId - The unique identifier of the handle
 * @returns Point with x, y coordinates in world space, or undefined if handle not found
 */
export function getHandlePosition(node: Node<any>, handleId: string): Point | undefined {
	if(!node) return undefined;
	const info = getHandleInfo(node, handleId);
	if (!info || typeof node.size === "string") return undefined;

	const { width, height } = node.size;
	const { side, offset } = info;
	const config = node.handles[side]!;

	// For "fix" position mode, handle is at a fixed pixel offset
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
		// For "separate" position mode, handle is positioned as a percentage of node size
		switch (side) {
			case "L": // Left side, offset along height
				return { x: node.posX, y: node.posY + offset * height };
			case "R": // Right side, offset along height
				return { x: node.posX + width, y: node.posY + offset * height };
			case "T": // Top side, offset along width
				return { x: node.posX + offset * width, y: node.posY };
			case "D": // Down side, offset along width
				return { x: node.posX + offset * width, y: node.posY + height };
			case "0": // Center position
				return { x: node.posX + 0.5 * width, y: node.posY + 0.5 * height };
		}
	}
}

/**
 * Returns the direction vector for a handle side
 * Used to calculate control points for bezier curves in edge rendering
 * @param side - The side of the handle (T, D, L, R, 0)
 * @returns Direction vector with dx and dy components
 */
export function getDir(side: handleSide): { dx: number; dy: number } {
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
