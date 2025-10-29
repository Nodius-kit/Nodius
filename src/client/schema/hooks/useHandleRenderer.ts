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
import { useCallback, useRef } from "react";
import { useDynamicClass } from "../../hooks/useDynamicClass";
import { getHandlePosition, getHandleInfo } from "../motor/webGpuMotor/handleUtils";
import {EditedNodeHandle} from "../../hooks/contexts/ProjectContext";

export interface useHandleRendererOptions {
    gpuMotor: WebGpuMotor;
    getNode: (nodeKey: string) => Node<any> | undefined;
    setSelectedHandle: (handle:EditedNodeHandle) => void;

}

interface HandleOverlay {
    container: HTMLElement;
    side: Partial<Record<handleSide, Array<{
        id: string;
        element:HTMLElement;
    }>>>,
    cleanup: () => void;
}

/**
 * Hook for rendering handles in DOM overlay
 */
export function useHandleRenderer(options: useHandleRendererOptions) {

    const activeOverlays = useRef<Map<string, HandleOverlay>>(new Map());

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
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: rgba(255, 102, 51, 0.9);
            border: 2px solid rgba(255, 255, 255, 0.8);
            pointer-events: none;
            transform: translate(-50%, -50%);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
    `);

    const classRectHandleClass = useDynamicClass(`
        & {
            position: absolute;
            background: rgba(51, 204, 102, 0.9);
            border: 2px solid rgba(255, 255, 255, 0.8);
            pointer-events: none;
            transform-origin: center center;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
    `);

    const updateHandleOverlay = useCallback((nodeId:string, overlayHtml:HTMLElement) => {
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
        const node = options.getNode(nodeId);
        console.log(node);
        if(!node) return;
        // check for unused side
        for(const side of Object.keys(overlay.side)) {
            if (!Object.keys(node.handles).includes(side)) {
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
            overlay.side[side] = overlay.side[side]!.filter(({ id, element }) => {
                if (!currentPointIds.has(id)) {
                    element.remove();
                    return false;
                }
                return true;
            });

            // Add new handles
            const existingIds = new Set(overlay.side[side]!.map(h => h.id));
            const newHandles = handleGroup.point
                .filter(p => !existingIds.has(p.id))
                .map(point => {
                    const handleInfo = getHandleInfo(node, point.id);
                    const pos = getHandlePosition(node, point.id);

                    console.log(point, handleInfo, pos);

                    const handleEl = document.createElement("div");
                    handleEl.dataset.handleId = point.id;
                    handleEl.dataset.nodeId = nodeId;
                    handleEl.dataset.side = side;

                    // Apply shape class based on handle type
                    /*if (handleGroup.type === "out") {
                        handleEl.className = classCircleHandleClass;
                        handleEl.style.left = `${pos.x}px`;
                        handleEl.style.top = `${pos.y}px`;
                    } else {
                        handleEl.className = classRectHandleClass;
                        handleEl.style.left = `${pos.x - handleInfo.width / 2}px`;
                        handleEl.style.top = `${pos.y - handleInfo.height / 2}px`;
                        handleEl.style.width = `${handleInfo.width}px`;
                        handleEl.style.height = `${handleInfo.height}px`;
                        handleEl.style.transform = `translate(0, 0) rotate(${handleInfo.rotation}deg)`;
                    }*/

                    // Optional: Add interaction (even if pointer-events: none on container, we can enable per handle if needed)
                    // handleEl.style.pointerEvents = 'auto';
                    // handleEl.addEventListener('click', () => options.setSelectedHandle({ nodeId, side, pointId: point.id }));

                    overlay.container.appendChild(handleEl);

                    return { id: point.id, element: handleEl };
                });

            overlay.side[side]!.push(...newHandles);
        }

    }, [classHandleContainer, classCircleHandleClass, classRectHandleClass, options.getNode, options.setSelectedHandle, options.gpuMotor ]);

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
