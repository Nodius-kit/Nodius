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
import { ProjectContextProps } from "../../hooks/contexts/ProjectContext";

export interface NodeDragDropConfig {
    posAnimationDelay?: number;
}

export interface UseNodeDragDropOptions {
    gpuMotor: WebGpuMotor;
    getNode: (nodeKey: string) => Node<any> | undefined;
    getProjectRef: () => ProjectContextProps; // Stable getter for fresh Project state
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
        getProjectRef,
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

            const Project = getProjectRef();
            const isDisabled = Project.state.disabledNodeInteraction[nodeKey]?.moving ?? false;

            if (!gpuMotor.isInteractive() || isDisabled) {
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
                        dontTriggerUpdateNode: true,
                    },
                    {
                        i: instructionsY.instruction,
                        nodeId: node._key,
                        animatePos: true,
                        dontApplyToMySelf: true,
                        dontTriggerUpdateNode: true,
                    }
                );

                const output = await getProjectRef().state.updateGraph!(insts);
                if (!output.status) {
                    // Restore old position on failure
                    node.posX = oldPosX;
                    node.posY = oldPosY;
                    gpuMotor.requestRedraw();
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
                    (window as any).triggerNodeUpdate(currentNode._key, {dontUpdateRender: true});


                    // Only schedule save if there's no save in progress
                    if (!saveInProgress && (currentNode.posX !== lastSavedX || currentNode.posY !== lastSavedY)) {
                        const now = Date.now();
                        if (now - lastSaveTime >= posAnimationDelay) {
                            saveNodePosition(currentNode);
                        } else {
                            if (timeoutSave) clearTimeout(timeoutSave);
                            timeoutSave = setTimeout(() => {
                                // Check again if save is still needed and not in progress
                                if (!saveInProgress) {
                                    const node = getNode(nodeKey);
                                    if (node && (node.posX !== lastSavedX || node.posY !== lastSavedY)) {
                                        saveNodePosition(node);
                                    }
                                }
                            }, posAnimationDelay - (now - lastSaveTime));
                        }
                    }
                });
            };

            const mouseUp = (evt: MouseEvent) => {
                if (animationFrame) cancelAnimationFrame(animationFrame);
                if (timeoutSave) clearTimeout(timeoutSave);
                window.removeEventListener("mousemove", mouseMove);
                window.removeEventListener("mouseup", mouseUp);
                gpuMotor.enableInteractive(true);
                enableTextSelection();

                const currentNode = getNode(nodeKey);
                if (currentNode && (currentNode.posX !== lastSavedX || currentNode.posY !== lastSavedY)) {
                    // Final save on mouse up - if there's already a save in progress, queue it
                    if (saveInProgress) {
                        pendingSave = { node: currentNode, oldPosX: currentNode.posX, oldPosY: currentNode.posY };
                    } else {
                        saveNodePosition(currentNode);
                    }
                }
            };

            window.addEventListener("mouseup", mouseUp);
            window.addEventListener("mousemove", mouseMove);
        };
    }, [gpuMotor, getNode, getProjectRef, isNodeAnimating, updateZIndex, posAnimationDelay]);

    return { createDragHandler };
}
