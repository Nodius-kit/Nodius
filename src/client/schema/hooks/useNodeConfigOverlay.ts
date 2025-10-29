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
            const { button, cleanup } = createAddHandleButton(side, node, nodeId, options);
            handleUIContainer.appendChild(button);
            cleanupCallbacks.push(cleanup);
        });

        // Create UI for existing handles
        Object.entries(node.handles).forEach(([side, handleConfig]) => {
            if (handleConfig) {
                const { elements, cleanup } = createHandleConfigUI(side as handleSide, handleConfig, node, nodeId, options);
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
    }, [options]);

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

/**
 * Create a + button to add a handle on a specific side
 */
function createAddHandleButton(
    side: handleSide,
    node: Node<any>,
    nodeId: string,
    options: useNodeConfigOverlayOptions
): { button: HTMLElement; cleanup: () => void } {
    const button = document.createElement('div');
    button.className = 'add-handle-button';
    button.style.position = 'absolute';
    button.style.width = '12px';
    button.style.height = '12px';
    button.style.background = '#3b82f6';
    button.style.borderRadius = '2px';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.cursor = 'pointer';
    button.style.pointerEvents = 'all';
    button.style.fontSize = '10px';
    button.style.color = 'white';
    button.style.lineHeight = '1';
    button.style.transition = 'opacity 0.15s ease';
    button.style.opacity = '0.6';
    button.textContent = '+';

    // Position based on side - OUTSIDE the node border
    const offset = '-18px'; // Position outside the node
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

    // Hover effect
    const handleMouseEnter = () => {
        button.style.opacity = '1';
    };
    const handleMouseLeave = () => {
        button.style.opacity = '0.6';
    };

    button.addEventListener('mouseenter', handleMouseEnter);
    button.addEventListener('mouseleave', handleMouseLeave);

    // Click handler to add handle
    const handleClick = async (e: MouseEvent) => {
        e.stopPropagation();

        const instruction = new InstructionBuilder();

        if (node.handles[side]) {
            // Handle already exists, add a new point to it
            instruction.key("handles").key(side).key("point").arrayAdd({
                id: generateUniqueId(node, side),
                type: "in",
                accept: "any",
            });
        } else {
            // Create new handle
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
    };

    button.addEventListener('click', handleClick);

    return {
        button,
        cleanup: () => {
            button.removeEventListener('mouseenter', handleMouseEnter);
            button.removeEventListener('mouseleave', handleMouseLeave);
            button.removeEventListener('click', handleClick);
        }
    };
}

/**
 * Create UI for an existing handle configuration
 */
function createHandleConfigUI(
    side: handleSide,
    handleConfig: any,
    node: Node<any>,
    nodeId: string,
    options: useNodeConfigOverlayOptions
): { elements: HTMLElement[]; cleanup: () => void } {
    const elements: HTMLElement[] = [];
    const cleanupCallbacks: (() => void)[] = [];

    // Create UI for each connection point
    handleConfig.point.forEach((point: any, index: number) => {
        const pointUI = createConnectionPointUI(side, handleConfig, point, index, node, nodeId, options);
        elements.push(pointUI.element);
        cleanupCallbacks.push(pointUI.cleanup);
    });

    // Add delete handle button
    const deleteBtn = createDeleteHandleButton(side, node, nodeId, options);
    elements.push(deleteBtn.button);
    cleanupCallbacks.push(deleteBtn.cleanup);

    return {
        elements,
        cleanup: () => cleanupCallbacks.forEach(cb => cb())
    };
}

/**
 * Create UI for a single connection point
 */
function createConnectionPointUI(
    side: handleSide,
    handleConfig: any,
    point: any,
    index: number,
    node: Node<any>,
    nodeId: string,
    options: useNodeConfigOverlayOptions
): { element: HTMLElement; cleanup: () => void } {
    const container = document.createElement('div');
    container.className = 'connection-point-ui';
    container.style.position = 'absolute';
    container.style.pointerEvents = 'all';

    // Simple styling based on type
    if (point.type === 'in') {
        container.style.background = '#10b981';
    } else {
        container.style.background = '#ef4444';
    }

    container.style.width = '10px';
    container.style.height = '10px';
    container.style.borderRadius = '50%';
    container.style.cursor = 'pointer';
    container.style.border = '2px solid white';
    container.style.transition = 'opacity 0.15s ease';
    container.style.opacity = '0.8';

    // Position the point
    positionConnectionPoint(container, side, handleConfig, index, node);

    // Hover effect
    const baseTransform = container.style.transform;
    const handleMouseEnter = () => {
        container.style.transform = baseTransform + ' scale(1.3)';
        container.style.opacity = '1';
    };
    const handleMouseLeave = () => {
        container.style.transform = baseTransform;
        container.style.opacity = '0.8';
    };

    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);

    // Click to open side panel
    const handleClick = (e: MouseEvent) => {
        e.stopPropagation();
        options.onHandleClick(nodeId, side, index);
    };

    container.addEventListener('click', handleClick);

    // Drag-and-drop for fixed position mode with click detection
    let isDragging = false;
    let dragStarted = false;
    const DRAG_THRESHOLD = 3; // pixels

    const handleMouseDown = (e: MouseEvent) => {
        if (handleConfig.position !== 'fix') return;
        if (e.button !== 0) return; // Only left click

        e.stopPropagation();

        dragStarted = false;
        isDragging = false;

        const startX = e.clientX;
        const startY = e.clientY;
        const startOffset = point.offset || 0;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            // Only start dragging if movement exceeds threshold
            if (!dragStarted && distance > DRAG_THRESHOLD) {
                dragStarted = true;
                isDragging = true;
                e.preventDefault();
            }

            if (!isDragging) return;

            // Calculate new offset based on side and GPU motor scale
            const scale = options.gpuMotor.getTransform().scale;
            let newOffset = startOffset;

            switch (side) {
                case 'T':
                case 'D':
                    newOffset = startOffset + (deltaX / scale);
                    newOffset = Math.max(0, Math.min(node.size.width, newOffset));
                    break;
                case 'L':
                case 'R':
                    newOffset = startOffset + (deltaY / scale);
                    newOffset = Math.max(0, Math.min(node.size.height, newOffset));
                    break;
            }

            // Update visual position immediately
            point.offset = newOffset;
            positionConnectionPoint(container, side, handleConfig, index, node);
        };

        const handleMouseUp = async (e: MouseEvent) => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);

            // Only save if actually dragged
            if (isDragging) {
                const instruction = new InstructionBuilder();
                instruction.key("handles").key(side).key("point").index(index).key("offset").set(point.offset);
                await options.updateGraph([{ nodeId, i: instruction.instruction }]);
            }

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
            container.removeEventListener('mouseenter', handleMouseEnter);
            container.removeEventListener('mouseleave', handleMouseLeave);
            container.removeEventListener('click', handleClick);
            container.removeEventListener('mousedown', handleMouseDown);
        }
    };
}

/**
 * Position a connection point based on side and configuration
 * Matches the positioning logic from handleUtils.ts getHandlePosition
 */
function positionConnectionPoint(
    element: HTMLElement,
    side: handleSide,
    handleConfig: any,
    index: number,
    node: Node<any>
) {
    const point = handleConfig.point[index];
    let offset: number;

    // Calculate offset based on position mode
    if (handleConfig.position === 'fix' && point.offset !== undefined) {
        // Fixed position - offset is in pixels
        offset = point.offset;
    } else {
        // Separate position - calculate percentage offset
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
}

/**
 * Create delete handle button
 */
function createDeleteHandleButton(
    side: handleSide,
    node: Node<any>,
    nodeId: string,
    options: useNodeConfigOverlayOptions
): { button: HTMLElement; cleanup: () => void } {
    const button = document.createElement('div');
    button.className = 'delete-handle-button';
    button.style.position = 'absolute';
    button.style.width = '12px';
    button.style.height = '12px';
    button.style.background = '#ef4444';
    button.style.borderRadius = '2px';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.cursor = 'pointer';
    button.style.pointerEvents = 'all';
    button.style.fontSize = '10px';
    button.style.color = 'white';
    button.style.lineHeight = '1';
    button.style.transition = 'opacity 0.15s ease';
    button.style.opacity = '0.6';
    button.textContent = '×';

    // Position near the add button but offset - OUTSIDE the node
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

    const handleMouseEnter = () => {
        button.style.opacity = '1';
    };
    const handleMouseLeave = () => {
        button.style.opacity = '0.6';
    };

    button.addEventListener('mouseenter', handleMouseEnter);
    button.addEventListener('mouseleave', handleMouseLeave);

    const handleClick = async (e: MouseEvent) => {
        e.stopPropagation();

        const instruction = new InstructionBuilder();
        instruction.key("handles").key(side).remove();

        await options.updateGraph([{
            nodeId: nodeId,
            i: instruction.instruction,
        }]);
    };

    button.addEventListener('click', handleClick);

    return {
        button,
        cleanup: () => {
            button.removeEventListener('mouseenter', handleMouseEnter);
            button.removeEventListener('mouseleave', handleMouseLeave);
            button.removeEventListener('click', handleClick);
        }
    };
}

/**
 * Generate unique ID for new connection point
 */
function generateUniqueId(node: Node<any>, side: handleSide): string {
    const existingIds = node.handles[side]?.point.map(p => parseInt(p.id)).filter(id => !isNaN(id)) || [];
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : -1;
    return (maxId + 1).toString();
}
