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
    updateGraph: (instructions:Array<GraphInstructions>) => Promise<ActionContext>
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

    // Click to show edit menu
    let menu: HTMLElement | null = null;
    let closeMenuListener: ((evt: MouseEvent) => void) | null = null;

    const handleClick = (e: MouseEvent) => {
        e.stopPropagation();

        // Close existing menu if any
        if (menu) {
            menu.remove();
            menu = null;
            if (closeMenuListener) {
                document.removeEventListener('mousedown', closeMenuListener);
                closeMenuListener = null;
            }
            return;
        }

        // Create menu
        menu = createEditMenu(side, index, point, nodeId, options, () => {
            // Close callback
            if (menu) {
                menu.remove();
                menu = null;
            }
            if (closeMenuListener) {
                document.removeEventListener('mousedown', closeMenuListener);
                closeMenuListener = null;
            }
        });

        // Position menu near the point
        menu.style.position = 'fixed';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        menu.style.zIndex = '100000';

        document.body.appendChild(menu);

        // Close menu on outside click
        closeMenuListener = (evt: MouseEvent) => {
            if (menu && !menu.contains(evt.target as any)) {
                menu.remove();
                menu = null;
                if (closeMenuListener) {
                    document.removeEventListener('mousedown', closeMenuListener);
                    closeMenuListener = null;
                }
            }
        };
        setTimeout(() => {
            if (closeMenuListener) {
                document.addEventListener('mousedown', closeMenuListener);
            }
        }, 0);
    };

    container.addEventListener('click', handleClick);

    return {
        element: container,
        cleanup: () => {
            container.removeEventListener('mouseenter', handleMouseEnter);
            container.removeEventListener('mouseleave', handleMouseLeave);
            container.removeEventListener('click', handleClick);
            if (menu) {
                menu.remove();
                menu = null;
            }
            if (closeMenuListener) {
                document.removeEventListener('mousedown', closeMenuListener);
                closeMenuListener = null;
            }
        }
    };
}

/**
 * Position a connection point based on side and configuration
 */
function positionConnectionPoint(
    element: HTMLElement,
    side: handleSide,
    handleConfig: any,
    index: number,
    node: Node<any>
) {
    if (handleConfig.position === 'fix' && handleConfig.point[index].offset !== undefined) {
        // Fixed position with offset
        const offset = handleConfig.point[index].offset;
        switch (side) {
            case 'T':
                element.style.top = '-5px';
                element.style.left = `${offset}px`;
                element.style.transform = 'translateX(-50%)';
                break;
            case 'D':
                element.style.bottom = '-5px';
                element.style.left = `${offset}px`;
                element.style.transform = 'translateX(-50%)';
                break;
            case 'L':
                element.style.left = '-5px';
                element.style.top = `${offset}px`;
                element.style.transform = 'translateY(-50%)';
                break;
            case 'R':
                element.style.right = '-5px';
                element.style.top = `${offset}px`;
                element.style.transform = 'translateY(-50%)';
                break;
        }
    } else {
        // Separate positioning - distribute evenly
        const totalPoints = handleConfig.point.length;
        const spacing = 100 / (totalPoints + 1);
        const position = spacing * (index + 1);

        switch (side) {
            case 'T':
                element.style.top = '-5px';
                element.style.left = `${position}%`;
                element.style.transform = 'translateX(-50%)';
                break;
            case 'D':
                element.style.bottom = '-5px';
                element.style.left = `${position}%`;
                element.style.transform = 'translateX(-50%)';
                break;
            case 'L':
                element.style.left = '-5px';
                element.style.top = `${position}%`;
                element.style.transform = 'translateY(-50%)';
                break;
            case 'R':
                element.style.right = '-5px';
                element.style.top = `${position}%`;
                element.style.transform = 'translateY(-50%)';
                break;
        }
    }
}

/**
 * Create minimalist edit menu for connection point
 */
function createEditMenu(
    side: handleSide,
    index: number,
    point: any,
    nodeId: string,
    options: useNodeConfigOverlayOptions,
    onClose: () => void
): HTMLElement {
    const menu = document.createElement('div');
    menu.className = 'connection-point-menu';
    menu.style.background = 'white';
    menu.style.border = '1px solid #e5e7eb';
    menu.style.borderRadius = '4px';
    menu.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    menu.style.padding = '4px';
    menu.style.display = 'flex';
    menu.style.flexDirection = 'column';
    menu.style.gap = '2px';
    menu.style.minWidth = '80px';
    menu.style.fontSize = '11px';

    // Type buttons
    const typeContainer = document.createElement('div');
    typeContainer.style.display = 'flex';
    typeContainer.style.gap = '2px';

    const inButton = createMenuButton('IN', point.type === 'in', async () => {
        const instruction = new InstructionBuilder();
        instruction.key("handles").key(side).key("point").index(index).key("type").set("in");
        await options.updateGraph([{ nodeId, i: instruction.instruction }]);
        onClose();
    });

    const outButton = createMenuButton('OUT', point.type === 'out', async () => {
        const instruction = new InstructionBuilder();
        instruction.key("handles").key(side).key("point").index(index).key("type").set("out");
        await options.updateGraph([{ nodeId, i: instruction.instruction }]);
        onClose();
    });

    typeContainer.appendChild(inButton);
    typeContainer.appendChild(outButton);
    menu.appendChild(typeContainer);

    // Separator
    const separator = document.createElement('div');
    separator.style.height = '1px';
    separator.style.background = '#e5e7eb';
    separator.style.margin = '2px 0';
    menu.appendChild(separator);

    // Delete button
    const deleteButton = createMenuButton('Delete', false, async () => {
        const instruction = new InstructionBuilder();
        instruction.key("handles").key(side).key("point").arrayRemoveIndex(index);
        await options.updateGraph([{ nodeId, i: instruction.instruction }]);
        onClose();
    }, '#ef4444');

    menu.appendChild(deleteButton);

    return menu;
}

/**
 * Create a menu button
 */
function createMenuButton(
    label: string,
    active: boolean,
    onClick: () => void,
    color?: string
): HTMLElement {
    const button = document.createElement('div');
    button.textContent = label;
    button.style.padding = '4px 8px';
    button.style.cursor = 'pointer';
    button.style.borderRadius = '2px';
    button.style.transition = 'background 0.1s ease';
    button.style.userSelect = 'none';
    button.style.textAlign = 'center';
    button.style.fontSize = '11px';
    button.style.fontWeight = '500';

    if (active) {
        button.style.background = color || '#3b82f6';
        button.style.color = 'white';
    } else {
        button.style.background = 'transparent';
        button.style.color = color || '#374151';
    }

    button.addEventListener('mouseenter', () => {
        if (!active) {
            button.style.background = '#f3f4f6';
        }
    });

    button.addEventListener('mouseleave', () => {
        if (!active) {
            button.style.background = 'transparent';
        }
    });

    button.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
    });

    return button;
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
