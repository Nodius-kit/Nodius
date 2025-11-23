/**
 * @file useNodeResize.ts
 * @description Hook for managing node resize functionality
 * @module schema/hooks
 */

import { useCallback } from "react";
import { Node } from "../../../utils/graph/graphType";
import { disableTextSelection, enableTextSelection } from "../../../utils/objectUtils";
import { InstructionBuilder } from "../../../utils/sync/InstructionBuilder";
import { GraphInstructions } from "../../../utils/sync/wsObject";
import { useStableProjectRef } from "../../hooks/useStableProjectRef";
import {ActionStorage} from "../../hooks/contexts/ProjectContext";

export interface NodeResizeConfig {
    sizeAnimationDelay?: number;
    minWidth?: number;
    minHeight?: number;
}

export interface UseNodeResizeOptions {
    getNode: (nodeKey: string) => Node<any> | undefined;
    config?: NodeResizeConfig;
    updateZIndex: (element: HTMLElement, currentZIndex: number) => number;
}

/**
 * Hook for managing resize functionality for nodes
 */
export function useNodeResize(options: UseNodeResizeOptions) {
    const {
        getNode,
        updateZIndex,
        config = {}
    } = options;

    const projectRef = useStableProjectRef();



    const sizeAnimationDelay = config.sizeAnimationDelay ?? 200;
    const minWidth = config.minWidth ?? 50;
    const minHeight = config.minHeight ?? 50;

    const createResizeHandler = useCallback((
        nodeKey: string,
        element: HTMLElement
    ) => {
        return async (evt: MouseEvent) => {
            evt.stopPropagation();
            const currentNode = getNode(nodeKey);
            if (!currentNode) return;


            if (!projectRef.current.state.getMotor().isInteractive()) {
                return;
            }

            updateZIndex(element, 0);

            let lastSavedWidth = currentNode.size.width;
            let lastSavedHeight = currentNode.size.height;
            let lastSaveTime = Date.now();
            let lastX = evt.clientX;
            let lastY = evt.clientY;
            let timeoutSave: NodeJS.Timeout | undefined;
            let animationFrame: number | undefined;
            let saveInProgress = false;
            let pendingSave: { node: Node<any>, oldWidth: number, oldHeight: number } | null = null;


            const sizeDisplayContainer = document.createElement("div");
            sizeDisplayContainer.style.position = "absolute";
            sizeDisplayContainer.style.width = "100%";
            sizeDisplayContainer.style.bottom = "-50px";
            sizeDisplayContainer.style.left = "0";
            sizeDisplayContainer.style.display = "flex";
            sizeDisplayContainer.style.alignItems = "center";
            sizeDisplayContainer.style.justifyContent = "center";
            sizeDisplayContainer.style.opacity = "0.8";

            const sizeDisplay = document.createElement("div");
            sizeDisplay.style.border = "1px solid var(--nodius-grey-500)";
            sizeDisplay.style.borderRadius = "6px";
            sizeDisplay.style.fontSize = "16px";
            sizeDisplay.style.backgroundColor = "var(--nodius-background-default)";
            sizeDisplay.style.padding = "5px 12px";
            sizeDisplay.innerText = Math.round(currentNode.size.width)+"x"+Math.round(currentNode.size.height);

            sizeDisplayContainer.appendChild(sizeDisplay);
            element.appendChild(sizeDisplayContainer);

            projectRef.current.state.getMotor().enableInteractive(false);
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
                        dontPutBackAction: true,
                    },
                    {
                        i: instructionsHeight.instruction,
                        nodeId: node._key,
                        animateSize: true,
                        dontApplyToMySelf: true,
                        dontPutBackAction: true,
                    }
                );

                output = await projectRef.current.state.updateGraph!(insts);
                if (!output.status) {
                    // Restore old size on failure
                    node.size.width = oldWidth;
                    node.size.height = oldHeight;
                    projectRef.current.state.getMotor().requestRedraw();
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

            const baseWidth = currentNode.size.width;
            const baseHeight = currentNode.size.height;
            const actions:ActionStorage = {
                ahead: async () => {
                    return false;
                },
                back: async () => {
                    const insts: GraphInstructions[] = [];

                    const instructionsWidth = new InstructionBuilder();
                    const instructionsHeight = new InstructionBuilder();
                    instructionsWidth.key("size").key("width").set(baseWidth);
                    instructionsHeight.key("size").key("height").set(baseHeight);

                    insts.push(
                        {
                            i: instructionsWidth.instruction,
                            nodeId: currentNode._key,
                            animateSize: true,
                            dontPutBackAction: true,
                        },
                        {
                            i: instructionsHeight.instruction,
                            nodeId: currentNode._key,
                            animateSize: true,
                            dontPutBackAction: true,
                        }
                    );
                    const output = await projectRef.current.state.updateGraph!(insts);
                    return output.status;
                }
            }

            const mouseMove = (evt: MouseEvent) => {
                if (animationFrame) cancelAnimationFrame(animationFrame);
                animationFrame = requestAnimationFrame(() => {
                    const currentNode = getNode(nodeKey);
                    if (!currentNode) return;

                    const newX = evt.clientX;
                    const newY = evt.clientY;
                    const deltaX = newX - lastX;
                    const deltaY = newY - lastY;

                    const worldDeltaX = deltaX / projectRef.current.state.getMotor().getTransform().scale;
                    const worldDeltaY = deltaY / projectRef.current.state.getMotor().getTransform().scale;

                    // Update size with minimum constraints
                    const newWidth = Math.max(minWidth, currentNode.size.width + worldDeltaX);
                    const newHeight = Math.max(minHeight, currentNode.size.height + worldDeltaY);

                    currentNode.size.width = newWidth;
                    currentNode.size.height = newHeight;

                    lastX = newX;
                    lastY = newY;

                    projectRef.current.state.getMotor().requestRedraw();

                    (window as any).triggerNodeUpdate(currentNode._key);

                    sizeDisplay.innerText = Math.round(currentNode.size.width)+"x"+Math.round(currentNode.size.height);

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

            const mouseUp = async (evt: MouseEvent) => {
                if (animationFrame) cancelAnimationFrame(animationFrame);
                if (timeoutSave) clearTimeout(timeoutSave);
                window.removeEventListener("mousemove", mouseMove);
                window.removeEventListener("mouseup", mouseUp);
                projectRef.current.state.getMotor().enableInteractive(true);
                enableTextSelection();

                sizeDisplayContainer.remove();

                const currentNode = getNode(nodeKey);
                if(!currentNode) return;
                if ((currentNode.size.width !== lastSavedWidth || currentNode.size.height !== lastSavedHeight)) {
                    // Final save on mouse up - if there's already a save in progress, queue it
                    if (saveInProgress) {
                        pendingSave = { node: currentNode, oldWidth: currentNode.size.width, oldHeight: currentNode.size.height };
                    } else {
                        saveNodeSize(currentNode);
                    }
                }

                actions.ahead = async () => {
                    const insts: GraphInstructions[] = [];

                    const instructionsWidth = new InstructionBuilder();
                    const instructionsHeight = new InstructionBuilder();
                    instructionsWidth.key("size").key("width").set(lastSavedWidth);
                    instructionsHeight.key("size").key("height").set(lastSavedHeight);

                    insts.push(
                        {
                            i: instructionsWidth.instruction,
                            nodeId: currentNode._key,
                            animateSize: true,
                            dontPutBackAction: true,
                        },
                        {
                            i: instructionsHeight.instruction,
                            nodeId: currentNode._key,
                            animateSize: true,
                            dontPutBackAction: true,
                        }
                    );
                    const output = await projectRef.current.state.updateGraph!(insts);
                    return output.status;
                }
                projectRef.current.state.addCancellableAction(actions);

                if(projectRef.current.state.editedNodeConfig && currentNode._key === "0") {
                    const padding = 500;
                    projectRef.current.state.getMotor().lockCameraToArea({
                        minX: currentNode.posX - padding,
                        minY: currentNode.posY - padding,
                        maxX: currentNode.posX + currentNode.size.width + padding,
                        maxY: currentNode.posY + currentNode.size.height + padding,
                    });
                    projectRef.current.state.getMotor().smoothFitToNode(currentNode._key, {
                        padding: padding
                    });
                }
            };

            window.addEventListener("mouseup", mouseUp);
            window.addEventListener("mousemove", mouseMove);
        };
    }, [sizeAnimationDelay, minWidth, minHeight]);

    return { createResizeHandler };
}
