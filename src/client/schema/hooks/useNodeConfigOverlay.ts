/**
 * @file useNodeConfigOverlay.ts
 * @description Hook for managing interactive node handle configuration overlay
 * @module schema/hooks
 */

import {handleSide, Node} from "../../../utils/graph/graphType";
import { WebGpuMotor } from "../motor/webGpuMotor/index";
import {useCallback, useRef} from "react";
import {GraphInstructions} from "../../../utils/sync/wsObject";
import {ActionContext, EditedNodeTypeConfig} from "../../hooks/contexts/ProjectContext";

export interface useNodeConfigOverlayOptions {
    gpuMotor: WebGpuMotor;
    getNode: (nodeKey: string) => Node<any> | undefined;
    enabled: (nodeKey: string) => boolean;
    updateGraph: (instructions:Array<GraphInstructions>) => Promise<ActionContext>;
    onHandleClick: (nodeId: string, side: handleSide, pointIndex: number) => void;
    editedNodeConfig?:EditedNodeTypeConfig
}

interface HandleUI {
    container: HTMLElement;
}

/**
 * Hook for managing interactive node handle configuration overlay
 */
export function useNodeConfigOverlay(options: useNodeConfigOverlayOptions) {

    const activeOverlays = useRef<Map<string, HandleUI>>(new Map());


    const updateNodeConfigOverlay = useCallback((nodeId:string) => {

    }, [options]);

    const clearNodeConfigOverlay = useCallback((nodeId:string) => {

    }, [options])

    /*
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

    const addButtonClass = useDynamicClass(`
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

    const deleteButtonClass = useDynamicClass(`
        & {
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            pointer-events: all;
            font-size: 16px;
            color: var(--nodius-text-primary);
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

    const connectionPointClass = useDynamicClass(`
        & {
            position: absolute;
            pointer-events: all;
            background: transparent;
            width: 16px;
            height: 16px;
            cursor: pointer;
            z-index:9999;
        }
    `);


    const generateUniqueId = useCallback((node: Node<any>): string => {
        // Gather all IDs from every handle side
        const allIds = Object.values(node.handles || {})
            .flatMap(handle => handle.point.map(p => parseInt(p.id)))
            .filter(id => !isNaN(id));

        const maxId = allIds.length > 0 ? Math.max(...allIds) : -1;
        return (maxId + 1).toString();
    }, []);

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
                    element.style.top = -handleOffset+'px';
                    element.style.left = `${offset}px`;
                    element.style.transform = 'translate(-50%, -50%)';
                    break;
                case 'D':
                    element.style.bottom = -handleOffset+'px';
                    element.style.left = `${offset}px`;
                    element.style.transform = 'translate(-50%, 50%)';
                    break;
                case 'L':
                    element.style.left = -handleOffset+'px';
                    element.style.top = `${offset}px`;
                    element.style.transform = 'translate(-50%, -50%)';
                    break;
                case 'R':
                    element.style.right = -handleOffset+'px';
                    element.style.top = `${offset}px`;
                    element.style.transform = 'translate(50%, -50%)';
                    break;
            }
        } else {
            // Separate positioning - percentage based
            const percentage = offset * 100;
            switch (side) {
                case 'T':
                    element.style.top = -handleOffset+'px';
                    element.style.left = `${percentage}%`;
                    element.style.transform = 'translate(-50%, -50%)';
                    break;
                case 'D':
                    element.style.bottom = -handleOffset+'px';
                    element.style.left = `${percentage}%`;
                    element.style.transform = 'translate(-50%, 50%)';
                    break;
                case 'L':
                    element.style.left = -handleOffset+'px';
                    element.style.top = `${percentage}%`;
                    element.style.transform = 'translate(-50%, -50%)';
                    break;
                case 'R':
                    element.style.right = -handleOffset+'px';
                    element.style.top = `${percentage}%`;
                    element.style.transform = 'translate(50%, -50%)';
                    break;
            }
        }
    }, []);

    const createConnectionPointUI = useCallback((
        handleId: string,
        index: number,
        nodeId: string
    ): { element: HTMLElement; cleanup: () => void } => {

        const node = options.getNode(nodeId)!;

        let handleConfig = getHandleInfo(node, handleId);

        const container = document.createElement('div');
        container.className = connectionPointClass;

        // Position the point
        //positionConnectionPoint(container, side, handleConfig, index);

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
                        console.log("put to r");
                    } else if(newOffset === 0 && deltaY > changeSideThreeshold) {
                        // put to side L
                        console.log("put to l");
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
                (window as any).triggerNodeUpdate(nodeId);
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

    const createDeleteHandleButton = useCallback((
        side: handleSide,
        nodeId: string
    ): { button: HTMLElement; cleanup: () => void } => {
        const button = document.createElement('div');
        button.className = deleteButtonClass;
        button.textContent = '×';

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
    ): { pointElements: HTMLElement[]; cleanup: () => void } => {
        const pointElements: HTMLElement[] = [];
        const cleanupCallbacks: (() => void)[] = [];

        // Create UI for each connection point
        handleConfig.point.forEach((point: {id: string}, index: number) => {
            const pointUI = createConnectionPointUI(side, handleConfig, point, index, nodeId);
            pointElements.push(pointUI.element);
            cleanupCallbacks.push(pointUI.cleanup);
        });

        return {
            pointElements,
            cleanup: () => cleanupCallbacks.forEach(cb => cb())
        };
    }, [createConnectionPointUI]);

    const createAddHandleButton = useCallback((
        side: handleSide,
        nodeId: string
    ): { button: HTMLElement; cleanup: () => void } => {
        const button = document.createElement('div');
        button.className = addButtonClass;
        button.textContent = '+';

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
                        id: generateUniqueId(node),
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
    }, [generateUniqueId, options, addButtonClass]);

    const updateNodeConfigOverlay = useCallback(async (overlayHtml:HTMLElement, nodeId:string) => {
        // Clear existing overlay if present
        const existing = activeOverlays.current.get(nodeId);
        if (existing) {
            existing.cleanup();
            activeOverlays.current.delete(nodeId);
        }

        if(!options.editedNodeConfig) return;

        // Only create overlay if enabled
        if (!options.enabled(nodeId)) {
            return;
        }

        const node = options.getNode(nodeId);
        if (!node) return;

        if(node._key !== options.editedNodeConfig.node._key) return;

        // Create container for handle UI elements
        const handleUIContainer = document.createElement('div');
        handleUIContainer.className = 'node-handle-config-overlay';
        handleUIContainer.style.position = 'absolute';
        handleUIContainer.style.inset = '0';
        handleUIContainer.style.pointerEvents = 'none';
        overlayHtml.appendChild(handleUIContainer);

        const cleanupCallbacks: (() => void)[] = [];

        // Create centered menu for each side
        HANDLE_SIDES.forEach(side => {
            const isHorizontal = side === 'T' || side === 'D';

            // Create menu container
            const menu = document.createElement('div');
            menu.className = isHorizontal ? menuContainerHorizontal : menuContainerVertical;

            // Position menu on the side
            const offset = '-60px';
            switch (side) {
                case 'T':
                    menu.style.top = offset;
                    break;
                case 'D':
                    menu.style.bottom = offset;
                    break;
                case 'L':
                    menu.style.left = offset;
                    break;
                case 'R':
                    menu.style.right = offset;
                    break;
            }

            // Add "+" button
            const { button: addBtn, cleanup: addCleanup } = createAddHandleButton(side, nodeId);
            menu.appendChild(addBtn);
            cleanupCallbacks.push(addCleanup);

            // Add "×" button if handle exists
            if (node.handles[side]) {
                const { button: deleteBtn, cleanup: deleteCleanup } = createDeleteHandleButton(side, nodeId);
                menu.appendChild(deleteBtn);
                cleanupCallbacks.push(deleteCleanup);
            }

            handleUIContainer.appendChild(menu);
        });

        // Create UI for existing handles (connection points)
        Object.entries(node.handles).forEach(([side, handleConfig]) => {
            if (handleConfig) {
                const { pointElements, cleanup } = createHandleConfigUI(side as handleSide, handleConfig, nodeId);
                pointElements.forEach(el => handleUIContainer.appendChild(el));
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
    }, [options, menuContainerHorizontal, menuContainerVertical, createAddHandleButton, createDeleteHandleButton, createHandleConfigUI]);

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
    }*/

    return {

    }

}
