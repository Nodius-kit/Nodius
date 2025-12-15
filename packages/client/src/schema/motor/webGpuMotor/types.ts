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

/**
 * Tracks keyboard key states for continuous movement
 * Maps key names to interval IDs for repeat actions
 */
export type KeyState = {
    [key: string]: number | undefined; // stores interval IDs
};
