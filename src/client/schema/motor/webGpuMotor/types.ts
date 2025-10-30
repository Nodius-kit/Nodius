/**
 * @file types.ts
 * @description Type definitions for the WebGPU motor module
 * @module webGpuMotor
 *
 * Contains core type definitions used across the WebGPU motor:
 * - HandleInfo: Information about a node handle (connection point)
 * - Point: 2D coordinate representation
 * - KeyState: Keyboard state tracking for arrow key navigation
 */

import { handleSide } from "../../../../utils/graph/graphType";

/**
 * Information about a node handle (connection point on a node)
 * Used to calculate handle positions and directions for edge rendering
 */
export interface HandleInfo {
	side: handleSide;
	offset: number;
	point: { id: string; offset?: number; display?: string; type?: "in" | "out", accept:string };
	position: "fix" | "separate",
	index: number;
}

/**
 * Represents a 2D point in world or screen coordinates
 */
export interface Point {
	x: number;
	y: number;
}

/**
 * Tracks keyboard key states for continuous movement
 * Maps key names to interval IDs for repeat actions
 */
export type KeyState = {
	[key: string]: number | undefined; // stores interval IDs
};
