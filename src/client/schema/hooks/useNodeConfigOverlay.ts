/**
 * @file useNodeConfigOverlay.ts
 * @description Hook for managing interactive node handle configuration overlay
 * @module schema/hooks
 */

import {handleSide, Node} from "../../../utils/graph/graphType";
import { WebGpuMotor } from "../motor/webGpuMotor/index";
import {useCallback, useRef} from "react";
import {InstructionBuilder} from "../../../utils/sync/InstructionBuilder";
import {GraphInstructions} from "../../../utils/sync/wsObject";
import {ActionContext} from "../../hooks/contexts/ProjectContext";
import {useDynamicClass} from "../../hooks/useDynamicClass";
import {disableTextSelection, enableTextSelection} from "../../../utils/objectUtils";


export interface useNodeConfigOverlayOptions {
    gpuMotor: WebGpuMotor;
    getNode: (nodeKey: string) => Node<any> | undefined;
    enabled: (nodeKey: string) => boolean;
    updateGraph: (instructions:Array<GraphInstructions>) => Promise<ActionContext>;
    onHandleClick: (nodeId: string, side: handleSide, pointIndex: number) => void;
}

interface HandleUI {
    container: HTMLElement;
    cleanup: () => void;
}

const HANDLE_SIDES: handleSide[] = ["T", "D", "L", "R"];

/**
 * Hook for managing interactive node handle configuration overlay
 */
export function useNodeConfigOverlay(options: useNodeConfigOverlayOptions) {

    const activeOverlays = useRef<Map<string, HandleUI>>(new Map());

    const addButtonClassHorizontal = useDynamicClass(`
        & {
            position: absolute;
            width: 16px;
            height: 16px;
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            pointer-events: all;
            font-size: 12px;
            color: #3b82f6;
            line-height: 1;
            transition: transform 0.15s ease;
            font-weight: bold;
            user-select: none;
        }
        &:hover {
            transform: translateX(-50%) scale(1.3);
        }
    `);

    const addButtonClassVertical = useDynamicClass(`
        & {
            position: absolute;
            width: 16px;
            height: 16px;
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            pointer-events: all;
            font-size: 12px;
            color: #3b82f6;
            line-height: 1;
            transition: transform 0.15s ease;
            font-weight: bold;
            user-select: none;
        }
        &:hover {
            transform: translateY(-50%) scale(1.3);
        }
    `);

    const deleteButtonClass = useDynamicClass(`
        & {
            position: absolute;
            width: 16px;
            height: 16px;
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            pointer-events: all;
            font-size: 14px;
            color: #ef4444;
            line-height: 1;
            transition: transform 0.15s ease;
            font-weight: bold;
            user-select: none;
        }
        &:hover {
            transform: scale(1.3);
        }
    `);

    const connectionPointClass = useDynamicClass(`
        & {
            position: absolute;
            pointer-events: all;
            background: transparent;
            width: 16px;
            height: 16px;
            cursor: pointer;
        }
    `);

    /**
     * Generate unique ID for new connection point
     */
    const generateUniqueId = useCallback((node: Node<any>): string => {
        // Gather all IDs from every handle side
        const allIds = Object.values(node.handles || {})
            .flatMap(handle => handle.point.map(p => parseInt(p.id)))
            .filter(id => !isNaN(id));

        const maxId = allIds.length > 0 ? Math.max(...allIds) : -1;
        return (maxId + 1).toString();
    }, []);

    /**
     * Position a connection point based on side and configuration
     */
    const positionConnectionPoint = useCallback((
        element: HTMLElement,
        side: handleSide,
        handleConfig: any,
        index: number,
    ) => {
        const point = handleConfig.point[index];
        let offset: number;

        // Calculate offset based on position mode
        if (handleConfig.position === 'fix' && point.offset !== undefined) {
            offset = point.offset;
        } else {
            offset = (index + 0.5) / handleConfig.point.length;
        }

        if (handleConfig.position === 'fix') {
            // Fixed pixel positioning
            switch (side) {
                case 'T':
                    element.style.top = '0';
                    element.style.left = `${offset}px`;
                    element.style.transform = 'translate(-50%, -50%)';
                    break;
                case 'D':
                    element.style.bottom = '0';
                    element.style.left = `${offset}px`;
                    element.style.transform = 'translate(-50%, 50%)';
                    break;
                case 'L':
                    element.style.left = '0';
                    element.style.top = `${offset}px`;
                    element.style.transform = 'translate(-50%, -50%)';
                    break;
                case 'R':
                    element.style.right = '0';
                    element.style.top = `${offset}px`;
                    element.style.transform = 'translate(50%, -50%)';
                    break;
            }
        } else {
            // Separate positioning - percentage based
            const percentage = offset * 100;
            switch (side) {
                case 'T':
                    element.style.top = '0';
                    element.style.left = `${percentage}%`;
                    element.style.transform = 'translate(-50%, -50%)';
                    break;
                case 'D':
                    element.style.bottom = '0';
                    element.style.left = `${percentage}%`;
                    element.style.transform = 'translate(-50%, 50%)';
                    break;
                case 'L':
                    element.style.left = '0';
                    element.style.top = `${percentage}%`;
                    element.style.transform = 'translate(-50%, -50%)';
                    break;
                case 'R':
                    element.style.right = '0';
                    element.style.top = `${percentage}%`;
                    element.style.transform = 'translate(50%, -50%)';
                    break;
            }
        }
    }, []);

    /**
     * Create UI for a single connection point
     */
    const createConnectionPointUI = useCallback((
        side: handleSide,
        handleConfig: {
            position: "separate" | "fix",
            point: Array<{
                id: string,
                offset?:number,
                display?: string,
                type: "in" | "out",
                accept: string,
            }>
        },
        point: {
            id: string,
            offset?:number,
            display?: string,
            type: "in" | "out",
            accept: string,
        },
        index: number,
        nodeId: string
    ): { element: HTMLElement; cleanup: () => void } => {



        const container = document.createElement('div');
        container.className = connectionPointClass;

        // Position the point
        positionConnectionPoint(container, side, handleConfig, index);

        // Click to open side panel
        const handleClick = (e: MouseEvent) => {
            e.stopPropagation();
            options.onHandleClick(nodeId, side, index);
        };

        container.addEventListener('click', handleClick);

        // Drag-and-drop for fixed position mode
        let isDragging = false;
        let dragStarted = false;
        const DRAG_THRESHOLD = 3;

        const handleMouseDown = (e: MouseEvent) => {
            if (handleConfig.position !== 'fix') return;
            if (e.button !== 0) return;

            e.stopPropagation();

            disableTextSelection();

            dragStarted = false;
            isDragging = false;

            const startX = e.clientX;
            const startY = e.clientY;
            const startOffset = point.offset || 0;

            const handleMouseMove = (e: MouseEvent) => {

                const node = options.getNode(nodeId)!;
                if(!node) return;

                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                if (!dragStarted && distance > DRAG_THRESHOLD) {
                    dragStarted = true;
                    isDragging = true;
                    e.preventDefault();
                }

                if (!isDragging) return;

                const scale = options.gpuMotor.getTransform().scale;
                let newOffset = startOffset;

                const changeSideThreeshold = 50;


                if(side === 'T') {
                    newOffset = startOffset + (deltaX / scale);
                    newOffset = Math.max(0, Math.min(node.size.width, newOffset));


                    if(newOffset === node.size.width && deltaY > changeSideThreeshold) {
                        // put to side R
                    } else if(newOffset === 0 && deltaY > changeSideThreeshold) {
                        // put to side L
                    }

                } else if(side === 'D') {
                    newOffset = startOffset + (deltaX / scale);
                    newOffset = Math.max(0, Math.min(node.size.width, newOffset));

                    if(newOffset === node.size.width && deltaY < changeSideThreeshold) {
                        // put to side R
                    } else if(newOffset === 0 && deltaY < changeSideThreeshold) {
                        // put to side L
                    }

                } else if(side === 'L') {
                    newOffset = startOffset + (deltaY / scale);
                    newOffset = Math.max(0, Math.min(node.size.height, newOffset));

                    if(newOffset === node.size.height && deltaX > changeSideThreeshold) {
                        // put to side B
                    } else if(newOffset === 0 && deltaX > changeSideThreeshold) {
                        // put to side T
                    }

                } else if(side === 'R') {
                    newOffset = startOffset + (deltaY / scale);
                    newOffset = Math.max(0, Math.min(node.size.height, newOffset));

                    if(newOffset === node.size.height && deltaX < changeSideThreeshold) {
                        // put to side B
                    } else if(newOffset === 0 && deltaX < changeSideThreeshold) {
                        // put to side T
                    }
                }



                point.offset = newOffset;
                positionConnectionPoint(container, side, handleConfig, index);
                options.gpuMotor.requestRedraw();
            };

            const handleMouseUp = async (e: MouseEvent) => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);

                if (isDragging) {
                    const instruction = new InstructionBuilder();
                    instruction.key("handles").key(side).key("point").index(index).key("offset").set(point.offset);
                    await options.updateGraph([{ nodeId, i: instruction.instruction }]);
                    options.gpuMotor.requestRedraw();
                }

                enableTextSelection();

                isDragging = false;
                dragStarted = false;
            };

            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        };

        container.addEventListener('mousedown', handleMouseDown);

        return {
            element: container,
            cleanup: () => {
                container.removeEventListener('click', handleClick);
                container.removeEventListener('mousedown', handleMouseDown);
            }
        };
    }, [connectionPointClass, options, positionConnectionPoint]);

    /**
     * Create delete handle button
     */
    const createDeleteHandleButton = useCallback((
        side: handleSide,
        nodeId: string
    ): { button: HTMLElement; cleanup: () => void } => {
        const button = document.createElement('div');
        button.className = deleteButtonClass;
        button.textContent = '×';

        const mainOffset = '-18px';
        const sideOffset = '16px';
        switch (side) {
            case 'T':
                button.style.top = mainOffset;
                button.style.left = `calc(50% + ${sideOffset})`;
                break;
            case 'D':
                button.style.bottom = mainOffset;
                button.style.left = `calc(50% + ${sideOffset})`;
                break;
            case 'L':
                button.style.left = mainOffset;
                button.style.top = `calc(50% + ${sideOffset})`;
                break;
            case 'R':
                button.style.right = mainOffset;
                button.style.top = `calc(50% + ${sideOffset})`;
                break;
        }

        const handleClick = async (e: MouseEvent) => {
            e.stopPropagation();

            const instruction = new InstructionBuilder();
            instruction.key("handles").key(side).remove();

            await options.updateGraph([{
                nodeId: nodeId,
                i: instruction.instruction,
            }]);
            options.gpuMotor.requestRedraw();
        };

        button.addEventListener('click', handleClick);

        return {
            button,
            cleanup: () => {
                button.removeEventListener('click', handleClick);
            }
        };
    }, [deleteButtonClass, options]);

    /**
     * Create UI for an existing handle configuration
     */
    const createHandleConfigUI = useCallback((
        side: handleSide,
        handleConfig: {
            position: "separate" | "fix",
            point: Array<{
                id: string,
                offset?:number,
                display?: string,
                type: "in" | "out",
                accept: string,
            }>
        },
        nodeId: string
    ): { elements: HTMLElement[]; cleanup: () => void } => {
        const elements: HTMLElement[] = [];
        const cleanupCallbacks: (() => void)[] = [];

        // Create UI for each connection point
        handleConfig.point.forEach((point: any, index: number) => {
            const pointUI = createConnectionPointUI(side, handleConfig, point, index, nodeId);
            elements.push(pointUI.element);
            cleanupCallbacks.push(pointUI.cleanup);
        });

        // Add delete handle button
        const deleteBtn = createDeleteHandleButton(side, nodeId);
        elements.push(deleteBtn.button);
        cleanupCallbacks.push(deleteBtn.cleanup);

        return {
            elements,
            cleanup: () => cleanupCallbacks.forEach(cb => cb())
        };
    }, [createConnectionPointUI, createDeleteHandleButton]);

    /**
     * Create a + button to add a handle on a specific side
     */
    const createAddHandleButton = useCallback((
        side: handleSide,
        nodeId: string,
        cssClass: string
    ): { button: HTMLElement; cleanup: () => void } => {
        const button = document.createElement('div');
        button.className = cssClass;
        button.textContent = '+';

        const offset = '-18px';
        switch (side) {
            case 'T':
                button.style.top = offset;
                button.style.left = '50%';
                button.style.transform = 'translateX(-50%)';
                break;
            case 'D':
                button.style.bottom = offset;
                button.style.left = '50%';
                button.style.transform = 'translateX(-50%)';
                break;
            case 'L':
                button.style.left = offset;
                button.style.top = '50%';
                button.style.transform = 'translateY(-50%)';
                break;
            case 'R':
                button.style.right = offset;
                button.style.top = '50%';
                button.style.transform = 'translateY(-50%)';
                break;
        }

        const handleClick = async (e: MouseEvent) => {
            e.stopPropagation();

            const node = options.getNode(nodeId)!;
            if(!node) return;

            const instruction = new InstructionBuilder();

            if (node.handles[side]) {
                instruction.key("handles").key(side).key("point").arrayAdd({
                    id: generateUniqueId(node),
                    type: "in",
                    accept: "any",
                });
            } else {
                const handle = {
                    position: "separate" as const,
                    point: [{
                        id: "0",
                        type: "in" as const,
                        accept: "any",
                    }]
                };
                instruction.key("handles").key(side).set(handle);
            }

            await options.updateGraph([{
                nodeId: nodeId,
                i: instruction.instruction,
            }]);
            options.gpuMotor.requestRedraw();
        };

        button.addEventListener('click', handleClick);

        return {
            button,
            cleanup: () => {
                button.removeEventListener('click', handleClick);
            }
        };
    }, [generateUniqueId, options]);

    const updateNodeConfigOverlay = useCallback(async (overlayHtml:HTMLElement, nodeId:string) => {
        // Clear existing overlay if present
        const existing = activeOverlays.current.get(nodeId);
        if (existing) {
            existing.cleanup();
            activeOverlays.current.delete(nodeId);
        }

        // Only create overlay if enabled
        if (!options.enabled(nodeId)) {
            return;
        }

        const node = options.getNode(nodeId);
        if (!node) return;

        // Create container for handle UI elements
        const handleUIContainer = document.createElement('div');
        handleUIContainer.className = 'node-handle-config-overlay';
        handleUIContainer.style.position = 'absolute';
        handleUIContainer.style.inset = '0';
        handleUIContainer.style.pointerEvents = 'none';
        overlayHtml.appendChild(handleUIContainer);

        const cleanupCallbacks: (() => void)[] = [];

        // Create + button for each side
        HANDLE_SIDES.forEach(side => {
            const cssClass = (side === 'T' || side === 'D') ? addButtonClassHorizontal : addButtonClassVertical;
            const { button, cleanup } = createAddHandleButton(side, nodeId, cssClass);
            handleUIContainer.appendChild(button);
            cleanupCallbacks.push(cleanup);
        });

        // Create UI for existing handles
        Object.entries(node.handles).forEach(([side, handleConfig]) => {
            if (handleConfig) {
                const { elements, cleanup } = createHandleConfigUI(side as handleSide, handleConfig, nodeId);
                elements.forEach(el => handleUIContainer.appendChild(el));
                cleanupCallbacks.push(cleanup);
            }
        });

        // Store cleanup function
        activeOverlays.current.set(nodeId, {
            container: handleUIContainer,
            cleanup: () => {
                cleanupCallbacks.forEach(cb => cb());
                handleUIContainer.remove();
            }
        });
    }, [options, addButtonClassHorizontal, addButtonClassVertical, createAddHandleButton, createHandleConfigUI]);

    const clearOverlay = useCallback((nodeId: string) => {
        const existing = activeOverlays.current.get(nodeId);
        if (existing) {
            existing.cleanup();
            activeOverlays.current.delete(nodeId);
        }
    }, []);

    return {
        updateNodeConfigOverlay,
        clearOverlay
    }

}
