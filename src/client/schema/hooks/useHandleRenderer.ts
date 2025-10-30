/**
 * @file useHandleRenderer.ts
 * @description Hook for rendering node handles (connection points) in DOM
 * @module schema/hooks
 *
 * Renders handles as visual indicators on nodes:
 * - Circles for "out" (output) handles
 * - Rectangles for "in" (input) handles
 * - Handles are offset from node edges
 * - Rectangle orientation matches the side (parallel to edge)
 */

import { handleSide, Node } from "../../../utils/graph/graphType";
import { WebGpuMotor } from "../motor/webGpuMotor/index";
import {useCallback, useEffect, useRef} from "react";
import { useDynamicClass } from "../../hooks/useDynamicClass";
import { getHandlePosition, getHandleInfo } from "../motor/webGpuMotor/handleUtils";
import {ActionContext, EditedNodeHandle, EditedNodeTypeConfig} from "../../hooks/contexts/ProjectContext";
import {GraphInstructions} from "../../../utils/sync/wsObject";
import {InstructionBuilder} from "../../../utils/sync/InstructionBuilder";
import {deepCopy, disableTextSelection, enableTextSelection} from "../../../utils/objectUtils";


export const rectangleWidth = 13;
export const rectangleHeight = 5;
export const handleOffset = 2;
export const circleWidth = 10;

export interface useHandleRendererOptions {
    gpuMotor: WebGpuMotor;
    getNode: (nodeKey: string) => Node<any> | undefined;
    setSelectedHandle: (handle:EditedNodeHandle) => void;
    editedNodeConfig: EditedNodeTypeConfig | undefined;
    onClickOnHandle: (editedHandle:EditedNodeHandle) => void,
    updateGraph: (instructions:Array<GraphInstructions>) => Promise<ActionContext>;
}

interface HandleOverlay {
    container: HTMLElement;
    side: Partial<Record<handleSide, Array<{
        id: string;
        element:HTMLElement;
        configElement?: HTMLElement;
    }>>>,
    cleanup: () => void;
}

interface sideConfigPane {
    side:handleSide,
    container:HTMLElement,
}

/**
 * Hook for rendering handles in DOM overlay
 */
export function useHandleRenderer(options: useHandleRendererOptions) {

    const activeOverlays = useRef<Map<string, HandleOverlay>>(new Map());
    const activeSideConfigPanel = useRef<sideConfigPane>(undefined);

    // Store latest options in ref so event handlers always use fresh values
    const optionsRef = useRef(options);
    useEffect(() => {
        optionsRef.current = options;
    }, [options]);

    // Menu container for horizontal sides (T, D)
    const menuContainerHorizontal = useDynamicClass(`
        & {
            position: absolute;
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 4px;
             background: var(--nodius-background-paper);
            border: 1px solid var(--nodius-text-divider);
            border-radius: 6px;
            padding: 2px 3px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            pointer-events: all;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10000;
        }
    `);

    // Menu container for vertical sides (L, R)
    const menuContainerVertical = useDynamicClass(`
        & {
            position: absolute;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            background: var(--nodius-background-paper);
            border: 1px solid var(--nodius-text-divider);
            border-radius: 6px;
            padding: 3px 2px;
            box-shadow: var(--nodius-shadow-2);
            pointer-events: all;
            top: 50%;
            transform: translateY(-50%);
            z-index: 10000;
        }
    `);

    const ButtonClass = useDynamicClass(`
        & {
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            pointer-events: all;
            color: var(--nodius-text-primary);
            font-size: 14px;
            transition: var(--nodius-transition-default);
            user-select: none;
            border-radius: 4px;
            font-weight: 200;
        }
        &:hover {
            background-color: var(--nodius-text-divider);
            transform: scale(1.1);
        }
        &:active {
            transform: scale(0.95);
        }
    `);


    const generateUniqueId = (node: Node<any>): string => {
        // Gather all IDs from every handle side
        const allIds = Object.values(node.handles || {})
            .flatMap(handle => handle.point.map(p => parseInt(p.id)))
            .filter(id => !isNaN(id));

        const maxId = allIds.length > 0 ? Math.max(...allIds) : -1;
        return (maxId + 1).toString();
    };

    const lastFrameId = useRef<number>(undefined);
    const mouseMove = useCallback((evt:MouseEvent) => {

        if(lastFrameId.current) cancelAnimationFrame(lastFrameId.current);

        lastFrameId.current = requestAnimationFrame(() => {

            if (!optionsRef.current.editedNodeConfig?.node) return;

            const posX = evt.clientX;
            const posY = evt.clientY;

            const nodeOverlay = document.querySelector('[data-node-overlay-key="' + optionsRef.current.editedNodeConfig.node._key + '"]');
            if (!nodeOverlay) return;

            const rect = nodeOverlay.getBoundingClientRect();

            // Check if cursor is outside
            const isOutside =
                posX < rect.left ||
                posX > rect.right ||
                posY < rect.top ||
                posY > rect.bottom;

            if (isOutside) {
                let direction: handleSide | null = null;

                const dxLeft = rect.left - posX;
                const dxRight = posX - rect.right;
                const dyTop = rect.top - posY;
                const dyBottom = posY - rect.bottom;

                // pick the direction of greatest overflow
                const maxDist = Math.max(dxLeft, dxRight, dyTop, dyBottom);

                if (maxDist === dxLeft) direction = 'L';
                else if (maxDist === dxRight) direction = 'R';
                else if (maxDist === dyTop) direction = 'T';
                else if (maxDist === dyBottom) direction = 'D';

                if (activeSideConfigPanel.current && activeSideConfigPanel.current.side !== direction) {
                    activeSideConfigPanel.current.container.remove();
                    activeSideConfigPanel.current = undefined;
                }
                if (!activeSideConfigPanel.current) {
                    const node = optionsRef.current.getNode(optionsRef.current.editedNodeConfig.node._key);
                    if(!node) return;

                    const container = document.createElement("div");

                    container.className = (direction === 'T' || direction === 'D') ? menuContainerHorizontal : menuContainerVertical;

                    const space = -50;

                    if(direction === 'T') {
                        container.style.top = space+"px"
                    } else if(direction === 'D') {
                        container.style.bottom = space+"px"
                    } else if(direction === 'L') {
                        container.style.left = space+"px"
                    } else if(direction === 'R') {
                        container.style.right = space+"px"
                    }

                    const addButton = document.createElement("div");
                    addButton.textContent = "+";
                    addButton.className = ButtonClass;

                    addButton.addEventListener("click", async (e:MouseEvent) => {
                        e.stopPropagation();

                        const _node = optionsRef.current.getNode(node._key)!;
                        if(!_node) return;

                        const instruction = new InstructionBuilder();

                        if (_node.handles[direction!]) {
                            instruction.key("handles").key(direction!).key("point").arrayAdd({
                                id: generateUniqueId(_node),
                                type: "in",
                                accept: "any",
                            });
                        } else {
                            const handle = {
                                position: "separate" as const,
                                point: [{
                                    id: generateUniqueId(_node),
                                    type: "in" as const,
                                    accept: "any",
                                }]
                            };
                            instruction.key("handles").key(direction!).set(handle);
                        }

                        await optionsRef.current.updateGraph([{
                            nodeId: node._key,
                            i: instruction.instruction,
                        }]);
                    })

                    container.appendChild(addButton);


                    if(node.handles[direction!] && node.handles[direction!]!.point.length > 0 ) {
                        const removeButton = document.createElement("div");
                        removeButton.textContent = "✖";
                        removeButton.className = ButtonClass;

                        removeButton.addEventListener("click",async (e:MouseEvent) => {
                            removeButton.remove();
                            e.stopPropagation();

                            const instruction = new InstructionBuilder();
                            instruction.key("handles").key(direction!).remove();

                            await optionsRef.current.updateGraph([{
                                nodeId: node._key,
                                i: instruction.instruction,
                            }]);
                            optionsRef.current.gpuMotor.requestRedraw();

                        })
                        container.appendChild(removeButton);
                    }

                    nodeOverlay.appendChild(container);


                    activeSideConfigPanel.current = {
                        side: direction!,
                        container: container,
                    }
                }
            } else if (activeSideConfigPanel.current) {
                activeSideConfigPanel.current.container.remove();
                activeSideConfigPanel.current = undefined;
            }
        });
    }, [menuContainerHorizontal, menuContainerVertical, ButtonClass]);


    useEffect(() => {
        if(optionsRef.current.editedNodeConfig) {
            window.addEventListener("mousemove", mouseMove);
        } else if(activeSideConfigPanel.current) {
            activeSideConfigPanel.current.container.remove();
            activeSideConfigPanel.current = undefined;
        }
        return () => {
            window.removeEventListener("mousemove", mouseMove);
        }
    }, [options.editedNodeConfig, mouseMove]);


    const classHandleContainer = useDynamicClass(`
        & {
            position: absolute;
            inset: 0;
            pointer-events:none;
            z-index: 9999;
            
        }
    `);

    // CSS classes for handle shapes
    const classCircleHandleClass = useDynamicClass(`
        & {
            position: absolute;
            background: var(--nodius-primary-dark);
            border-radius: 50%;
            pointer-events: all;
        }
    `);

    const classRectHandleClass = useDynamicClass(`
        & {
            position: absolute;
            background: var(--nodius-primary-dark);
            border-radius: 2px;
            pointer-events: all;
        }
    `);

    const connectionPointClass = useDynamicClass(`
        & {
            position: absolute;
            pointer-events: all;
            background: red;
            width: 16px;
            height: 16px;
            cursor: pointer;
            z-index:9999;
            
        }
    `);


    const createMoveableHandle = useCallback((nodeId:string, pointId:string) => {

        const container = document.createElement("div");
        container.className = connectionPointClass;

        let isDragging = false;
        let dragStarted = false;
        const DRAG_THRESHOLD = 3;

        container.addEventListener("click", (evt:MouseEvent)  => {
            evt.stopPropagation();
            const node = optionsRef.current.getNode(nodeId);
            if(!node) return;
            const handleInfo = getHandleInfo(node, pointId);
            if(!handleInfo) return;
            optionsRef.current.setSelectedHandle({
                nodeId: node._key,
                side:  handleInfo.side,
                pointId: handleInfo.point.id
            });
        });

        const handleMouseDown = (e: MouseEvent) => {
            e.stopPropagation();

            const node = optionsRef.current.getNode(nodeId);
            if(!node) return;
            let handleInfo = getHandleInfo(node, pointId);
            if(!handleInfo) return;

            if (e.button !== 0) return;

            e.stopPropagation();

            disableTextSelection();

            dragStarted = false;
            isDragging = false;

            let startX = e.clientX;
            let startY = e.clientY;
            const startOffset = handleInfo.offset || 0;

            let lastFrameId:number|undefined;

            const handleMouseMove = (e: MouseEvent) => {
                e.stopPropagation();
                if(lastFrameId!=undefined) cancelAnimationFrame(lastFrameId);

                lastFrameId = requestAnimationFrame(async () => {

                    const node = optionsRef.current.getNode(nodeId)!;
                    if (!node) return;

                    const nodeOverlay = document.querySelector('[data-node-overlay-key="' +node._key + '"]');
                    if(!nodeOverlay) return;

                    let handleInfo = getHandleInfo(node, pointId);
                    if(!handleInfo) return;

                    const deltaX = e.clientX - startX;
                    const deltaY = e.clientY - startY;
                    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                    if (!dragStarted && distance > DRAG_THRESHOLD) {
                        dragStarted = true;
                        isDragging = true;
                        e.preventDefault();
                    }

                    if (!isDragging) return;

                    const scale = optionsRef.current.gpuMotor.getTransform().scale;
                    let newOffset = startOffset;

                    const changeSideThreeshold = 50;

                    const currentHandle = node.handles[handleInfo.side]!.point[handleInfo.index];

                    let changeSide:handleSide|undefined = undefined;
                    let newChangeOffset:number = 0;

                    const rect = nodeOverlay.getBoundingClientRect();

                    if (handleInfo.side === 'T') {
                        newOffset = startOffset + (deltaX / scale);
                        newOffset = Math.max(0, Math.min(node.size.width, newOffset));

                        if (newOffset === node.size.width && (e.clientY > rect.top + changeSideThreeshold)) {
                            changeSide = "R";
                            // put to side R
                        } else if (newOffset === 0 && (e.clientY > rect.top + changeSideThreeshold)) {
                            changeSide = "L";
                            // put to side L
                        }

                    } else if (handleInfo.side === 'D') {
                        newOffset = startOffset + (deltaX / scale);
                        newOffset = Math.max(0, Math.min(node.size.width, newOffset));

                        if (newOffset === node.size.width && (e.clientY < rect.bottom - changeSideThreeshold)) {
                            changeSide = "R";
                            newChangeOffset = node.size.height;
                            // put to side R
                        } else if (newOffset === 0 && (e.clientY < rect.bottom - changeSideThreeshold)) {
                            changeSide = "L";
                            // put to side L
                        }

                    } else if (handleInfo.side === 'L') {
                        newOffset = startOffset + (deltaY / scale);
                        newOffset = Math.max(0, Math.min(node.size.height, newOffset));


                        if (newOffset === node.size.height && (e.clientX > rect.left + changeSideThreeshold)) {
                            changeSide = "D";
                            // put to side B
                        } else if (newOffset === 0 && (e.clientX > rect.left + changeSideThreeshold)) {
                            changeSide = "T";
                            // put to side T
                        }

                    } else if (handleInfo.side === 'R') {
                        newOffset = startOffset + (deltaY / scale);
                        newOffset = Math.max(0, Math.min(node.size.height, newOffset));


                        if (newOffset === node.size.height && (e.clientX < rect.right - changeSideThreeshold)) {
                            changeSide = "D";
                            newChangeOffset = node.size.width;
                            // put to side B
                        } else if (newOffset === 0 && (e.clientX < rect.right - changeSideThreeshold)) {
                            changeSide = "T";
                            newChangeOffset = node.size.width;
                            // put to side T
                        }
                    }

                    if(changeSide) {
                        const instructionRemove = new InstructionBuilder();
                        const instructionAdd = new InstructionBuilder();

                        instructionRemove.key("handles").key(handleInfo.side).key("point").arrayRemoveIndex(handleInfo.index);
                        const newHandle = deepCopy(currentHandle);
                        newHandle.offset=newChangeOffset;

                        if(node.handles[changeSide]) {
                            if(node.handles[changeSide]!.position === "separate") {
                                delete newHandle.offset;
                            }
                            instructionAdd.key("handles").key(changeSide).key("point").arrayAdd(newHandle);
                        } else {
                            instructionAdd.key("handles").key(changeSide).set({
                                point: [newHandle],
                                position: "fix"
                            });
                        }
                        await optionsRef.current.updateGraph([
                            {
                                nodeId: nodeId,
                                i: instructionRemove.instruction
                            },
                            {
                                nodeId: nodeId,
                                i: instructionAdd.instruction
                            }
                        ]);
                    }


                    if(handleInfo.position === 'fix') {
                        currentHandle.offset = newOffset;
                    }
                    (window as any).triggerNodeUpdate(nodeId);
                });
            };

            const handleMouseUp = async (e: MouseEvent) => {
                e.stopPropagation();
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);

                const node = optionsRef.current.getNode(nodeId);
                if(!node) return;
                const handleInfo = getHandleInfo(node, pointId);
                if(!handleInfo) return;

                if (isDragging) {
                    const instruction = new InstructionBuilder();
                    instruction.key("handles").key(handleInfo.side).key("point").index(handleInfo.index).key("offset").set(handleInfo.offset);
                    await optionsRef.current.updateGraph([{ nodeId, i: instruction.instruction }]);
                    optionsRef.current.gpuMotor.requestRedraw();
                }

                enableTextSelection();

                isDragging = false;
                dragStarted = false;
            };

            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        };

        container.addEventListener('mousedown', handleMouseDown);

        return container;
    }, [connectionPointClass])

    const updateHandleOverlay = useCallback((based_node:string|Node<any>, overlayHtml:HTMLElement) => {

        const node = typeof based_node === "string" ? optionsRef.current.getNode(based_node) : based_node;
        console.log(based_node, node);
        if(!node) return;
        const nodeId = node._key;

        if(!activeOverlays.current.has(nodeId)) {

            const handleContainer = document.createElement("div");

            handleContainer.className = classHandleContainer;

            overlayHtml.appendChild(handleContainer);

            const handleOverlay:HandleOverlay = {
                cleanup: () => {},
                side: {},
                container: handleContainer,
            }
            activeOverlays.current.set(nodeId, handleOverlay);
        }


        const overlay = activeOverlays.current.get(nodeId)!;

        // check for unused side
        for(const side of Object.keys(overlay.side)) {
            if (!Object.keys(node.handles).includes(side)) {
                overlay.side[side as handleSide]!.forEach((p) => {
                    console.log(p);
                    p.element.remove();
                    p.configElement?.remove();
                })
                delete overlay.side[side as handleSide];
            }
        }

        for (const sideStr in node.handles) {
            const side = sideStr as handleSide;
            const handleGroup = node.handles[side]!;

            // Initialize side array if not exists
            overlay.side[side] ??= [];

            // Remove deleted handles (not present in current node.handles)
            const currentPointIds = new Set(handleGroup.point.map(p => p.id));
            overlay.side[side] = overlay.side[side]!.filter(({ id, element,configElement }) => {
                if (!currentPointIds.has(id)) {
                    console.log("remove", id);
                    element.remove();
                    configElement?.remove();
                    return false;
                }
                return true;
            });

            // Add new handles
            const existingIds = new Set(overlay.side[side]!.map(h => h.id));
            const newHandles = handleGroup.point
                .filter(p => !existingIds.has(p.id))
                .map(point => {

                    const handleEl = document.createElement("div");
                    handleEl.dataset.handleId = point.id;
                    handleEl.dataset.nodeId = nodeId;
                    handleEl.dataset.side = side;

                    const moveableContainer = optionsRef.current.editedNodeConfig ? createMoveableHandle(nodeId, point.id) : undefined;

                    overlay.container.appendChild(handleEl);
                    if(moveableContainer) overlay.container.appendChild(moveableContainer);

                    return { id: point.id, element: handleEl, configElement:moveableContainer  };
                });
            overlay.side[side]!.push(...newHandles);

            //update
            overlay.side[side]!.forEach((point) => {
                const handleInfo = getHandleInfo(node, point.id);
                const pos = getHandlePosition(node, point.id)!;
                if(!handleInfo || !pos) return;



                if (handleInfo.point.type === "out") {
                    point.element.className = classCircleHandleClass;
                    point.element.style.left = `${pos.x - ( circleWidth / 2) + (handleInfo.side === "L" ? -handleOffset : (handleInfo.side === "R" ? handleOffset : 0))}px`;
                    point.element.style.top = `${pos.y - ( circleWidth / 2) + (handleInfo.side === "T" ? -handleOffset : (handleInfo.side === "D" ? handleOffset : 0))}px`;
                    point.element.style.width = circleWidth+"px";
                    point.element.style.height = circleWidth+"px";

                    if(point.configElement) {
                        point.configElement.style.left = point.element.style.left;
                        point.configElement.style.top = point.element.style.top;
                        point.configElement.style.width = point.element.style.width;
                        point.configElement.style.height = point.element.style.height;
                        point.configElement.style.scale = "2";
                    }
                } else {
                    point.element.className = classRectHandleClass;
                    point.element.style.left = `${pos.x - ((handleInfo.side === "T" || handleInfo.side === "D") ? rectangleWidth : rectangleHeight) / 2 + (handleInfo.side === "L" ? -handleOffset : (handleInfo.side === "R" ? handleOffset : 0))}px`;
                    point.element.style.top = `${pos.y - (!(handleInfo.side === "T" || handleInfo.side === "D") ? rectangleWidth : rectangleHeight) / 2 + (handleInfo.side === "T" ? -handleOffset : (handleInfo.side === "D" ? handleOffset : 0))}px`;
                    point.element.style.width = `${(handleInfo.side === "T" || handleInfo.side === "D") ? rectangleWidth : rectangleHeight}px`;
                    point.element.style.height = `${!(handleInfo.side === "T" || handleInfo.side === "D") ? rectangleWidth : rectangleHeight}px`;

                    if(point.configElement) {
                        point.configElement.style.left = point.element.style.left;
                        point.configElement.style.top = point.element.style.top;
                        point.configElement.style.width = point.element.style.width;
                        point.configElement.style.height = point.element.style.height;
                        point.configElement.style.scale = "2";
                    }
                }
            })
        }

    }, [classHandleContainer, classCircleHandleClass, classRectHandleClass, createMoveableHandle]);

    const cleanupHandleOverlay = useCallback((nodeId:string) => {
        const handle = activeOverlays.current.get(nodeId);
        if(!handle) return;
        handle.cleanup();
        handle.container.remove();
    }, [])



    return {
        updateHandleOverlay,
        cleanupHandleOverlay
    };
}
