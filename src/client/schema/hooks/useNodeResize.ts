/**
 * @file useNodeResize.ts
 * @description Hook for managing node resize functionality
 * @module schema/hooks
 */

import { useCallback } from "react";
import { Node } from "../../../utils/graph/graphType";
import { WebGpuMotor } from "../motor/webGpuMotor/index";
import { disableTextSelection, enableTextSelection } from "../../../utils/objectUtils";
import { InstructionBuilder } from "../../../utils/sync/InstructionBuilder";
import { GraphInstructions } from "../../../utils/sync/wsObject";
import { ProjectContextProps } from "../../hooks/contexts/ProjectContext";

export interface NodeResizeConfig {
    sizeAnimationDelay?: number;
    minWidth?: number;
    minHeight?: number;
}

export interface UseNodeResizeOptions {
    gpuMotor: WebGpuMotor;
    getNode: (nodeKey: string) => Node<any> | undefined;
    getProjectRef: () => ProjectContextProps; // Stable getter for fresh Project state
    config?: NodeResizeConfig;
    updateZIndex: (element: HTMLElement, overlay: HTMLElement, currentZIndex: number) => number;
}

/**
 * Hook for managing resize functionality for nodes
 */
export function useNodeResize(options: UseNodeResizeOptions) {
    const {
        gpuMotor,
        getNode,
        getProjectRef,
        updateZIndex,
        config = {}
    } = options;

    const sizeAnimationDelay = config.sizeAnimationDelay ?? 200;
    const minWidth = config.minWidth ?? 50;
    const minHeight = config.minHeight ?? 50;

    const createResizeHandler = useCallback((
        nodeKey: string,
        overlay: HTMLElement,
        element: HTMLElement
    ) => {
        return async (evt: MouseEvent) => {
            evt.stopPropagation();
            const currentNode = getNode(nodeKey);
            if (!currentNode) return;

            const Project = getProjectRef();
            const isDisabled = (Project.state.disabledNodeInteraction[nodeKey]?.moving ?? false) &&
                              (!Project.state.editedNodeConfig || Project.state.editedNodeConfig.node._key !== nodeKey);

            if (!gpuMotor.isInteractive() || isDisabled) {
                return;
            }

            updateZIndex(element, overlay, 0);

            let lastSavedWidth = currentNode.size.width;
            let lastSavedHeight = currentNode.size.height;
            let lastSaveTime = Date.now();
            let lastX = evt.clientX;
            let lastY = evt.clientY;
            let timeoutSave: NodeJS.Timeout | undefined;
            let animationFrame: number | undefined;
            let saveInProgress = false;
            let pendingSave: { node: Node<any>, oldWidth: number, oldHeight: number } | null = null;

            gpuMotor.enableInteractive(false);
            disableTextSelection();

            const saveNodeSize = async (node: Node<any>) => {
                const oldWidth = node.size.width;
                const oldHeight = node.size.height;

                // Queue save if one is already in progress
                if (saveInProgress) {
                    pendingSave = { node, oldWidth, oldHeight };
                    return;
                }

                saveInProgress = true;

                const instructionsWidth = new InstructionBuilder();
                const instructionsHeight = new InstructionBuilder();
                instructionsWidth.key("size").key("width").set(node.size.width);
                instructionsHeight.key("size").key("height").set(node.size.height);

                lastSavedWidth = node.size.width;
                lastSavedHeight = node.size.height;

                let output:any;
                const insts: GraphInstructions[] = [];
                insts.push(
                    {
                        i: instructionsWidth.instruction,
                        nodeId: node._key,
                        animateSize: true,
                        dontApplyToMySelf: true,
                    },
                    {
                        i: instructionsHeight.instruction,
                        nodeId: node._key,
                        animateSize: true,
                        dontApplyToMySelf: true,
                    }
                );

                output = await getProjectRef().state.updateGraph!(insts);
                if (!output.status) {
                    // Restore old size on failure
                    node.size.width = oldWidth;
                    node.size.height = oldHeight;
                    gpuMotor.requestRedraw();
                    console.error("Failed to save node size:", output.reason);
                }
                lastSaveTime = Date.now();
                saveInProgress = false;

                // Process pending save if exists
                if (pendingSave) {
                    const { node: pendingNode } = pendingSave;
                    pendingSave = null;
                    saveNodeSize(pendingNode);
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

                    // Update size with minimum constraints
                    const newWidth = Math.max(minWidth, currentNode.size.width + worldDeltaX);
                    const newHeight = Math.max(minHeight, currentNode.size.height + worldDeltaY);

                    currentNode.size.width = newWidth;
                    currentNode.size.height = newHeight;

                    lastX = newX;
                    lastY = newY;

                    gpuMotor.requestRedraw();
                    (window as any).triggerNodeUpdate(currentNode._key);

                    // Only schedule save if there's no save in progress
                    if (!saveInProgress && (currentNode.size.width !== lastSavedWidth || currentNode.size.height !== lastSavedHeight)) {
                        const now = Date.now();
                        if (now - lastSaveTime >= sizeAnimationDelay) {
                            saveNodeSize(currentNode);
                        } else {
                            if (timeoutSave) clearTimeout(timeoutSave);
                            timeoutSave = setTimeout(() => {
                                // Check again if save is still needed and not in progress
                                if (!saveInProgress) {
                                    const node = getNode(nodeKey);
                                    if (node && (node.size.width !== lastSavedWidth || node.size.height !== lastSavedHeight)) {
                                        saveNodeSize(node);
                                    }
                                }
                            }, sizeAnimationDelay - (now - lastSaveTime));
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
                if (currentNode && (currentNode.size.width !== lastSavedWidth || currentNode.size.height !== lastSavedHeight)) {
                    // Final save on mouse up - if there's already a save in progress, queue it
                    if (saveInProgress) {
                        pendingSave = { node: currentNode, oldWidth: currentNode.size.width, oldHeight: currentNode.size.height };
                    } else {
                        saveNodeSize(currentNode);
                    }
                }
            };

            window.addEventListener("mouseup", mouseUp);
            window.addEventListener("mousemove", mouseMove);
        };
    }, [gpuMotor, getNode, getProjectRef, sizeAnimationDelay, minWidth, minHeight]);

    return { createResizeHandler };
}
