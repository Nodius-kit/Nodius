


/*
 create at 5 am, don't ask me what im doing here, you need a beer and multiple hour to work on it

 update: 6am, it's even worse...

 ho btw, this handle dragged new edge to connect handle to another one
 */

import {WebGpuMotor} from "../motor/webGpuMotor";
import {disableTextSelection, enableTextSelection} from "../../../utils/objectUtils";
import {useContext, useEffect} from "react";
import {ActionContext, ProjectContext} from "../../hooks/contexts/ProjectContext";
import {getHandleInfo, getHandlePosition} from "../motor/webGpuMotor/handleUtils";
import {Edge, Node, handleSide} from "../../../utils/graph/graphType";
import {HandleInfo, Point} from "../motor/webGpuMotor/types";

interface useEdgeHandlerOptions {
    gpuMotor: WebGpuMotor;
}

interface ClosestHandleResult {
    node: Node<any>;
    handleInfo: HandleInfo;
    pointId: string;
    distance: number;
    position: Point;
}

export const useEdgeHandler = ({
    gpuMotor
}:useEdgeHandlerOptions) => {

    const Project = useContext(ProjectContext);

    const isValidConnection = (sourceNode:Node<any>, sourceHandle:HandleInfo, targetNode:Node<any>, targetHandle:HandleInfo) => {
        if(sourceNode._key === targetNode._key) return false; // obviously ...

        if(sourceHandle.point.accept !== targetHandle.point.accept) return false; // must accept the same type

        return true;
    }

    /**
     * Finds the closest valid handle near the cursor position
     * Optimized with spatial culling and early exit
     *
     * @param cursorWorldPos - Cursor position in world coordinates
     * @param baseNode - The node we're dragging from
     * @param baseHandleInfo - The handle info of the point we're dragging from
     * @param maxDistance - Maximum search distance in world units (default: 150)
     * @returns ClosestHandleResult or null if no valid handle found
     */
    const findClosestValidHandle = (
        cursorWorldPos: Point,
        baseNode: Node<any>,
        baseHandleInfo: HandleInfo,
        maxDistance: number = 150
    ): ClosestHandleResult | null => {
        const scene = gpuMotor.getScene();
        if (!scene || !Project.state.graph || !Project.state.selectedSheetId) return null;

        const sheet = Project.state.graph.sheets[Project.state.selectedSheetId];
        if (!sheet) return null;

        // Determine what type we're looking for (opposite of base)
        const lookingForType: "in" | "out" = baseHandleInfo.point.type === "out" ? "in" : "out";

        let closestResult: ClosestHandleResult | null = null;
        let closestDistanceSq = maxDistance * maxDistance; // Use squared distance to avoid sqrt

        // Iterate through visible nodes only (spatial optimization)
        const visibleNodeIds = Array.from(scene.nodes.keys());

        for (const nodeId of visibleNodeIds) {
            const node = scene.nodes.get(nodeId)!;

            // Skip the base node
            if (node._key === baseNode._key) continue;

            // Skip if node is string-sized (can't calculate position)
            if (typeof node.size === "string") continue;

            // Quick AABB check: is cursor even close to this node?
            const nodeMinX = node.posX;
            const nodeMaxX = node.posX + node.size.width;
            const nodeMinY = node.posY;
            const nodeMaxY = node.posY + node.size.height;

            // Expand bounds by maxDistance for quick rejection
            if (
                cursorWorldPos.x < nodeMinX - maxDistance ||
                cursorWorldPos.x > nodeMaxX + maxDistance ||
                cursorWorldPos.y < nodeMinY - maxDistance ||
                cursorWorldPos.y > nodeMaxY + maxDistance
            ) {
                continue; // Skip this node, cursor is too far
            }

            // Check all handles on this node
            for (const [sideKey, handleGroup] of Object.entries(node.handles)) {
                const side = sideKey as handleSide;
                if (side === "0") continue; // Skip center handles

                for (let i = 0; i < handleGroup.point.length; i++) {
                    const point = handleGroup.point[i];

                    // Type check: must be opposite type
                    if (point.type !== lookingForType) continue;

                    // Validation check
                    const handleInfo: HandleInfo = {
                        side,
                        offset: point.offset ?? (handleGroup.position === "separate" ? (i + 0.5) / handleGroup.point.length : 0.5),
                        point,
                        position: handleGroup.position,
                        index: i
                    };

                    if (!isValidConnection(baseNode, baseHandleInfo, node, handleInfo)) {
                        continue;
                    }

                    // Calculate handle position
                    const handlePos = getHandlePosition(node, point.id);
                    if (!handlePos) continue;

                    // Calculate squared distance (faster than sqrt)
                    const dx = handlePos.x - cursorWorldPos.x;
                    const dy = handlePos.y - cursorWorldPos.y;
                    const distanceSq = dx * dx + dy * dy;

                    // Update closest if this is nearer
                    if (distanceSq < closestDistanceSq) {
                        closestDistanceSq = distanceSq;
                        closestResult = {
                            node,
                            handleInfo,
                            pointId: point.id,
                            distance: Math.sqrt(distanceSq),
                            position: handlePos
                        };
                    }
                }
            }
        }

        return closestResult;
    }

    const createATemporaryEdge = async (e:MouseEvent, nodeId:string, pointId:string) => {
        if(!Project.state.generateUniqueId || !Project.state.graph || !Project.state.selectedSheetId || !gpuMotor.getScene()?.edges) return;

        let node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(nodeId);
        if(!node) return;

        let handleInfo = getHandleInfo(node, pointId);
        if(!handleInfo) return;


        e.stopPropagation();
        disableTextSelection();

        const uniqId = await Project.state.generateUniqueId(1);
        if(!uniqId) return;

        const temporaryEdge:Partial<Edge> = {
            _key: uniqId[0],
            graphKey: node.graphKey,
            sheet: node.sheet,
        }

        if(handleInfo.point.type === "out") {
            temporaryEdge.source = nodeId;
            temporaryEdge.sourceHandle = pointId;
            temporaryEdge.target = undefined;
            temporaryEdge.targetHandle = undefined;

            const edges = gpuMotor.getScene()!.edges.get("source-"+nodeId) ?? [];
            edges.push(temporaryEdge as Edge);
            gpuMotor.getScene()!.edges.set("source-"+nodeId, edges);

        } else {
            temporaryEdge.source = undefined;
            temporaryEdge.sourceHandle = undefined;
            temporaryEdge.target = nodeId;
            temporaryEdge.targetHandle = pointId;

            const edges = gpuMotor.getScene()!.edges.get("target-"+nodeId) ?? [];
            edges.push(temporaryEdge as Edge);
            gpuMotor.getScene()!.edges.set("target-"+nodeId, edges);
        }

        gpuMotor.requestRedraw();

        let frameId:number|undefined = undefined;
        let previousFound = false;
        const mouseMove = (e:MouseEvent) => {
            if(frameId) cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(() => {
                if(!Project.state.graph || !Project.state.selectedSheetId || !gpuMotor.getScene()?.edges) return;
                const cursorPos:Point = {
                    x: e.clientX,
                    y: e.clientY
                }
                let node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(nodeId);
                if(!node) return;

                let handleInfo = getHandleInfo(node, pointId);
                if(!handleInfo) return;

                const closedHandle = findClosestValidHandle(gpuMotor.screenToWorld(cursorPos), node, handleInfo, 50);
                if(closedHandle) {
                    previousFound = true;
                    if(handleInfo.point.type === "out") {
                        temporaryEdge.target = closedHandle.node._key;
                        temporaryEdge.targetHandle = closedHandle.pointId;
                    } else {
                        temporaryEdge.source = closedHandle.node._key;
                        temporaryEdge.sourceHandle = closedHandle.pointId;

                    }
                } else if(previousFound){

                    // remove temporary point
                    if(handleInfo.point.type === "out") {
                        temporaryEdge.target = undefined;
                        temporaryEdge.targetHandle = undefined;
                    } else {
                        temporaryEdge.source = undefined;
                        temporaryEdge.sourceHandle = undefined;

                    }

                    previousFound = false;
                }

                gpuMotor.requestRedraw();
            });
        }
        const mouseUp = async (e:MouseEvent) => {
            if(!Project.state.graph || !Project.state.selectedSheetId || !gpuMotor.getScene()?.edges || !Project.state.batchCreateElements) return;

            window.removeEventListener('mousemove', mouseMove);
            window.removeEventListener('mouseup', mouseUp);
            enableTextSelection();

            let node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(nodeId);
            if(!node) return;

            let handleInfo = getHandleInfo(node, pointId);
            if(!handleInfo) return;

            if (handleInfo.point.type === "out") {
                let edges = gpuMotor.getScene()!.edges.get("source-" + nodeId) ?? [];
                edges = edges.filter((e) => e._key !== temporaryEdge._key);
                if (edges.length === 0) {
                    gpuMotor.getScene()!.edges.delete("source-" + nodeId);
                } else {
                    gpuMotor.getScene()!.edges.set("source-" + nodeId, edges);
                }
            } else {
                let edges = gpuMotor.getScene()!.edges.get("target-" + nodeId) ?? [];
                edges = edges.filter((e) => e._key !== temporaryEdge._key);
                if (edges.length === 0) {
                    gpuMotor.getScene()!.edges.delete("target-" + nodeId);
                } else {
                    gpuMotor.getScene()!.edges.set("target-" + nodeId, edges);
                }
            }

            if(previousFound) {
                const output = await Project.state.batchCreateElements([], [temporaryEdge as Edge]);
            }


            gpuMotor.requestRedraw();

        }
        window.addEventListener('mousemove', mouseMove);
        window.addEventListener('mouseup', mouseUp);
    }


    return {
        createATemporaryEdge,
        findClosestValidHandle
    }
}