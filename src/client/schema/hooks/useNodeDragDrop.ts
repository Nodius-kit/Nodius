/**
 * @file useNodeDragDrop.ts
 * @description Hook for managing node drag and drop functionality
 * @module schema/hooks
 */

import { useRef, useCallback } from "react";
import { Node } from "../../../utils/graph/graphType";
import { WebGpuMotor } from "../motor/webGpuMotor/index";
import { disableTextSelection, enableTextSelection } from "../../../utils/objectUtils";
import { InstructionBuilder } from "../../../utils/sync/InstructionBuilder";
import { GraphInstructions } from "../../../utils/sync/wsObject";

export interface NodeDragDropConfig {
    posAnimationDelay?: number;
    onUpdate?: () => void;
}

export interface UseNodeDragDropOptions {
    gpuMotor: WebGpuMotor;
    getNode: (nodeKey: string) => Node<any> | undefined;
    updateGraph: (insts: GraphInstructions[]) => Promise<{ status: boolean; reason?: string }>;
    isNodeInteractionDisabled: (nodeKey: string) => boolean;
    isNodeAnimating: (nodeKey: string) => boolean;
    updateZIndex: (element: HTMLElement, overlay: HTMLElement, currentZIndex: number) => number;
    config?: NodeDragDropConfig;
}

/**
 * Hook for managing drag and drop functionality for nodes
 */
export function useNodeDragDrop(options: UseNodeDragDropOptions) {
    const {
        gpuMotor,
        getNode,
        updateGraph,
        isNodeInteractionDisabled,
        isNodeAnimating,
        updateZIndex,
        config = {}
    } = options;

    const posAnimationDelay = config.posAnimationDelay ?? 200;

    const createDragHandler = useCallback((
        nodeKey: string,
        overlay: HTMLElement,
        element: HTMLElement
    ) => {
        return async (evt: MouseEvent) => {
            const currentNode = getNode(nodeKey);
            if (!currentNode) return;

            if (!gpuMotor.isInteractive() || isNodeInteractionDisabled(nodeKey)) {
                return;
            }

            // Update z-index
            updateZIndex(element, overlay, 0);

            // Don't allow dragging if node is animating to a target position
            if (isNodeAnimating(nodeKey)) {
                return;
            }

            let lastSavedX = currentNode.posX;
            let lastSavedY = currentNode.posY;
            let lastSaveTime = Date.now();
            let lastX = evt.clientX;
            let lastY = evt.clientY;
            let timeoutSave: NodeJS.Timeout | undefined;
            let animationFrame: number | undefined;
            let saveInProgress = false;
            let pendingSave: { node: Node<any>, oldPosX: number, oldPosY: number } | null = null;

            gpuMotor.enableInteractive(false);
            disableTextSelection();

            const saveNodePosition = async (node: Node<any>) => {
                const oldPosX = node.posX;
                const oldPosY = node.posY;

                // Queue save if one is already in progress
                if (saveInProgress) {
                    pendingSave = { node, oldPosX, oldPosY };
                    return;
                }

                saveInProgress = true;

                const insts: GraphInstructions[] = [];
                const instructionsX = new InstructionBuilder();
                const instructionsY = new InstructionBuilder();
                instructionsX.key("posX").set(node.posX);
                instructionsY.key("posY").set(node.posY);

                lastSavedX = node.posX;
                lastSavedY = node.posY;
                insts.push(
                    {
                        i: instructionsX.instruction,
                        nodeId: node._key,
                        animatePos: true,
                        dontApplyToMySelf: true,
                    },
                    {
                        i: instructionsY.instruction,
                        nodeId: node._key,
                        animatePos: true,
                        dontApplyToMySelf: true,
                    }
                );

                const output = await updateGraph(insts);
                if (!output.status) {
                    // Restore old position on failure
                    node.posX = oldPosX;
                    node.posY = oldPosY;
                    gpuMotor.requestRedraw();
                    config.onUpdate?.();
                    console.error("Failed to save node position:", output.reason);
                }
                lastSaveTime = Date.now();
                saveInProgress = false;

                // Process pending save if exists
                if (pendingSave) {
                    const { node: pendingNode } = pendingSave;
                    pendingSave = null;
                    saveNodePosition(pendingNode);
                }
            };

            const mouseMove = (evt: MouseEvent) => {

                if (animationFrame) cancelAnimationFrame(animationFrame);
                animationFrame = requestAnimationFrame(() => {
                    const currentNode = getNode(nodeKey);
                    if (!currentNode) return;

                    const newX = evt.clientX;
                    const newY = evt.clientY;
                    const deltaX = newX - lastX;
                    const deltaY = newY - lastY;

                    const worldDeltaX = deltaX / gpuMotor.getTransform().scale;
                    const worldDeltaY = deltaY / gpuMotor.getTransform().scale;

                    currentNode.posX += worldDeltaX;
                    currentNode.posY += worldDeltaY;

                    lastX = newX;
                    lastY = newY;

                    gpuMotor.requestRedraw();
                    config.onUpdate?.();

                    if (currentNode.posX !== lastSavedX || currentNode.posY !== lastSavedY) {
                        const now = Date.now();
                        if (now - lastSaveTime >= posAnimationDelay) {
                            saveNodePosition(currentNode);
                        } else {
                            if (timeoutSave) clearTimeout(timeoutSave);
                            timeoutSave = setTimeout(() => {
                                saveNodePosition(currentNode);
                            }, posAnimationDelay - (now - lastSaveTime));
                        }
                    }
                });
            };

            const mouseUp = (evt: MouseEvent) => {
                if (animationFrame) cancelAnimationFrame(animationFrame);
                window.removeEventListener("mousemove", mouseMove);
                window.removeEventListener("mouseup", mouseUp);
                gpuMotor.enableInteractive(true);
                enableTextSelection();

                const currentNode = getNode(nodeKey);
                if (currentNode && (currentNode.posX !== lastSavedX || currentNode.posY !== lastSavedY)) {
                    saveNodePosition(currentNode);
                }
            };

            window.addEventListener("mouseup", mouseUp);
            window.addEventListener("mousemove", mouseMove);
        };
    }, [gpuMotor, getNode, updateGraph, isNodeInteractionDisabled, isNodeAnimating, updateZIndex, posAnimationDelay, config]);

    return { createDragHandler };
}
