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
import {HandleInfo} from "../motor/webGpuMotor/types";

export const rectangleWidth = 13;
export const rectangleHeight = 5;
export const handleOffset = 2;
export const circleWidth = 10;

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

    const updateHandleOverlay = useCallback((based_node:string|Node<any>, overlayHtml:HTMLElement) => {

        const node = typeof based_node === "string" ? options.getNode(based_node) : based_node;
        console.log(node);
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
            overlay.side[side] = overlay.side[side]!.filter(({ id, element }) => {
                if (!currentPointIds.has(id)) {
                    console.log("remove", id);
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

                    const handleEl = document.createElement("div");
                    handleEl.dataset.handleId = point.id;
                    handleEl.dataset.nodeId = nodeId;
                    handleEl.dataset.side = side;


                    overlay.container.appendChild(handleEl);

                    return { id: point.id, element: handleEl };
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
                } else {
                    point.element.className = classRectHandleClass;
                    point.element.style.left = `${pos.x - ((handleInfo.side === "T" || handleInfo.side === "D") ? rectangleWidth : rectangleHeight) / 2 + (handleInfo.side === "L" ? -handleOffset : (handleInfo.side === "R" ? handleOffset : 0))}px`;
                    point.element.style.top = `${pos.y - (!(handleInfo.side === "T" || handleInfo.side === "D") ? rectangleWidth : rectangleHeight) / 2 + (handleInfo.side === "T" ? -handleOffset : (handleInfo.side === "D" ? handleOffset : 0))}px`;
                    point.element.style.width = `${(handleInfo.side === "T" || handleInfo.side === "D") ? rectangleWidth : rectangleHeight}px`;
                    point.element.style.height = `${!(handleInfo.side === "T" || handleInfo.side === "D") ? rectangleWidth : rectangleHeight}px`;
                }
            })
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
