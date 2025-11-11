/**
 * @file useNodeDragDrop.ts
 * @description Hook for managing node drag and drop functionality
 * @module schema/hooks
 */

import { useRef, useCallback } from "react";
import { disableTextSelection, enableTextSelection } from "../../../utils/objectUtils";
import { InstructionBuilder } from "../../../utils/sync/InstructionBuilder";
import { GraphInstructions } from "../../../utils/sync/wsObject";
import { Node } from "../../../utils/graph/graphType";
import {useStableProjectRef} from "../../hooks/useStableProjectRef";

export interface NodeDragDropConfig {
    posAnimationDelay?: number;
}

export interface UseNodeDragDropOptions {
    isNodeAnimating: (nodeKey: string) => boolean;
    getNode: (nodeKey: string) => Node<any> | undefined;
    updateZIndex: (element: HTMLElement,currentZIndex: number) => number;
    config?: NodeDragDropConfig;
}

/**
 * Hook for managing drag and drop functionality for nodes
 */
export function useNodeDragDrop(options: UseNodeDragDropOptions) {
    const {
        isNodeAnimating,
        updateZIndex,
        config = {},
        getNode
    } = options;

    const posAnimationDelay = config.posAnimationDelay ?? 200;

    const projectRef = useStableProjectRef();

    const createDragHandler = useCallback((
        nodeKey: string,
        element: HTMLElement
    ) => {
        return async (evt: MouseEvent) => {

            if(evt.button !== 0) return;

            const elements = document.elementsFromPoint(evt.clientX, evt.clientY);
            if(elements.length > 0 && (
                elements[0].tagName.toLowerCase() === "input" ||
                elements[0].tagName.toLowerCase() === "button" ||
                elements[0].tagName.toLowerCase() === "checkbox" ||
                elements[0].tagName.toLowerCase() === "select" ||
                elements[0].tagName.toLowerCase() === "option" ||
                elements[0].tagName.toLowerCase() === "textarea"
            )) {
                return;
            }

            const currentNode = getNode(nodeKey);
            if (!currentNode) return;


            if (!projectRef.current.state.getMotor().isInteractive()) {
                return;
            }

            // Update z-index
            updateZIndex(element, 0);

            // Don't allow dragging if node is animating to a target position
            if (isNodeAnimating(nodeKey)) {
                return;
            }

            // Get selected nodes - if current node is not selected, only move it
            const selectedNodeIds = projectRef.current.state.selectedNode.includes(nodeKey)
                ? projectRef.current.state.selectedNode
                : [nodeKey];

            // Track last saved positions for all nodes
            const lastSavedPositions = new Map<string, { x: number, y: number }>();
            selectedNodeIds.forEach(id => {
                const node = getNode(id);
                if (node) {
                    lastSavedPositions.set(id, { x: node.posX, y: node.posY });
                }
            });

            let lastSaveTime = Date.now();
            let lastX = evt.clientX;
            let lastY = evt.clientY;
            let timeoutSave: NodeJS.Timeout | undefined;
            let animationFrame: number | undefined;
            let saveInProgress = false;
            let pendingSave: Map<string, { posX: number, posY: number }> | null = null;
            let hasDragged = false; // Track if actual dragging occurred

            projectRef.current.state.getMotor().enableInteractive(false);
            disableTextSelection();

            const saveNodePositions = async (nodeIds: string[]) => {
                // Queue save if one is already in progress
                if (saveInProgress) {
                    pendingSave = new Map();
                    nodeIds.forEach(id => {
                        const node = getNode(id);
                        if (node) {
                            pendingSave!.set(id, { posX: node.posX, posY: node.posY });
                        }
                    });
                    return;
                }

                saveInProgress = true;

                const insts: GraphInstructions[] = [];
                const oldPositions = new Map<string, { x: number, y: number }>();

                // Build instructions for all nodes
                for (const id of nodeIds) {
                    const node = getNode(id);
                    if (!node) continue;

                    oldPositions.set(id, { x: node.posX, y: node.posY });

                    const instructionsX = new InstructionBuilder();
                    const instructionsY = new InstructionBuilder();
                    instructionsX.key("posX").set(node.posX);
                    instructionsY.key("posY").set(node.posY);

                    lastSavedPositions.set(id, { x: node.posX, y: node.posY });

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
                }

                const output = await projectRef.current.state.updateGraph!(insts);
                if (!output.status) {
                    // Restore old positions on failure
                    oldPositions.forEach((pos, id) => {
                        const node = getNode(id);
                        if (node) {
                            node.posX = pos.x;
                            node.posY = pos.y;
                        }
                    });
                    projectRef.current.state.getMotor().requestRedraw();
                    console.error("Failed to save node positions:", output.reason);
                }
                lastSaveTime = Date.now();
                saveInProgress = false;

                // Process pending save if exists
                if (pendingSave) {
                    const nodeIdsToSave = Array.from(pendingSave.keys());
                    pendingSave = null;
                    saveNodePositions(nodeIdsToSave);
                }
            };

            const mouseMove = (evt: MouseEvent) => {

                if (animationFrame) cancelAnimationFrame(animationFrame);
                animationFrame = requestAnimationFrame(() => {

                    const newX = evt.clientX;
                    const newY = evt.clientY;
                    const deltaX = newX - lastX;
                    const deltaY = newY - lastY;

                    // Mark as dragged if moved more than 3 pixels
                    if (!hasDragged && (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3)) {
                        hasDragged = true;
                    }

                    const worldDeltaX = deltaX / projectRef.current.state.getMotor().getTransform().scale;
                    const worldDeltaY = deltaY / projectRef.current.state.getMotor().getTransform().scale;

                    // Move all selected nodes
                    let hasChanges = false;
                    selectedNodeIds.forEach(id => {
                        const node = getNode(id);
                        if (!node) return;

                        node.posX += worldDeltaX;
                        node.posY += worldDeltaY;

                        (window as any).triggerNodeUpdate(node._key, {dontUpdateRender: true});

                        // Check if position changed from last saved
                        const lastSaved = lastSavedPositions.get(id);
                        if (lastSaved && (node.posX !== lastSaved.x || node.posY !== lastSaved.y)) {
                            hasChanges = true;
                        }
                    });

                    lastX = newX;
                    lastY = newY;

                    projectRef.current.state.getMotor().requestRedraw();

                    // Only schedule save if there's no save in progress and there are changes
                    if (!saveInProgress && hasChanges) {
                        const now = Date.now();
                        if (now - lastSaveTime >= posAnimationDelay) {
                            saveNodePositions(selectedNodeIds);
                        } else {
                            if (timeoutSave) clearTimeout(timeoutSave);
                            timeoutSave = setTimeout(() => {
                                // Check again if save is still needed and not in progress
                                if (!saveInProgress) {
                                    saveNodePositions(selectedNodeIds);
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
                projectRef.current.state.getMotor().enableInteractive(true);
                enableTextSelection();

                // If dragged, prevent click event from triggering node selection
                if (hasDragged) {
                    const preventClick = (e: MouseEvent) => {
                        e.stopPropagation();
                        e.preventDefault();
                    };

                    // Add click blocker in capture phase for all affected nodes
                    selectedNodeIds.forEach(id => {
                        const nodeElement = document.querySelector(`[data-node-key="${id}"]`);
                        const overlayElement = document.querySelector(`[data-node-overlay-key="${id}"]`);

                        if (nodeElement) {
                            nodeElement.addEventListener("click" as any, preventClick, { capture: true, once: true });
                        }
                        if (overlayElement) {
                            overlayElement.addEventListener("click" as any, preventClick, { capture: true, once: true });
                        }
                    });
                }

                // Check if any selected node has unsaved changes
                let hasUnsavedChanges = false;
                selectedNodeIds.forEach(id => {
                    const node = getNode(id);
                    const lastSaved = lastSavedPositions.get(id);
                    if (node && lastSaved && (node.posX !== lastSaved.x || node.posY !== lastSaved.y)) {
                        hasUnsavedChanges = true;
                    }
                });

                if (hasUnsavedChanges) {
                    // Final save on mouse up - if there's already a save in progress, queue it
                    if (saveInProgress) {
                        pendingSave = new Map();
                        selectedNodeIds.forEach(id => {
                            const node = getNode(id);
                            if (node) {
                                pendingSave!.set(id, { posX: node.posX, posY: node.posY });
                            }
                        });
                    } else {
                        saveNodePositions(selectedNodeIds);
                    }
                }
            };

            window.addEventListener("mouseup", mouseUp);
            window.addEventListener("mousemove", mouseMove);
        };
    }, [isNodeAnimating, updateZIndex, posAnimationDelay]);

    return { createDragHandler };
}
