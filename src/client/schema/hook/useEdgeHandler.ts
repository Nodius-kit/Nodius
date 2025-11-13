/*
 create at 5 am, don't ask me what im doing here, you need a beer and multiple hour to work on it

 update: 6am, it's even worse...

 ho btw, this handle dragged new edge to connect handle to another one
 */

import {WebGpuMotor} from "../motor/webGpuMotor";
import {disableTextSelection, enableTextSelection, Point} from "../../../utils/objectUtils";
import {useCallback, useContext, useEffect, useRef} from "react";
import {ActionContext, ProjectContext} from "../../hooks/contexts/ProjectContext";
import {Edge, Node, handleSide} from "../../../utils/graph/graphType";
import {getHandleInfo, getHandlePosition, HandleInfo} from "../../../utils/graph/handleUtils";

interface useEdgeHandlerOptions {
}

interface ClosestHandleResult {
    node: Node<any>;
    handleInfo: HandleInfo;
    pointId: string;
    distance: number;
    position: Point;
}

export const useEdgeHandler = ({
                               }:useEdgeHandlerOptions) => {

    const Project = useContext(ProjectContext);

    // Keep the latest Project context to avoid stale closures in window handlers
    const projectRef = useRef(Project);
    useEffect(() => {
        projectRef.current = Project;
    }, [Project]);

    const isValidConnection = (sourceNode:Node<any>, sourceHandle:HandleInfo, targetNode:Node<any>, targetHandle:HandleInfo) => {
        if(sourceNode._key === targetNode._key) return false; // obviously ...

        if((sourceHandle.point.accept != "any" && targetHandle.point.accept != "any") && (sourceHandle.point.accept !== targetHandle.point.accept)) return false; // must accept the same type

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
    const findClosestValidHandle = useCallback((cursorWorldPos: Point, fromNode: Node<any>, fromHandleInfo: HandleInfo, maxDistance: number): ClosestHandleResult | undefined => {
        const Project = projectRef.current;
        if(!Project.state.graph || !Project.state.selectedSheetId) return undefined;

        const sheet = Project.state.graph.sheets[Project.state.selectedSheetId];
        if(!sheet) return undefined;

        let closestResult: ClosestHandleResult | undefined;
        let closestDistanceSq = maxDistance * maxDistance;

        for (const node of sheet.nodeMap.values()) {
            if (node._key === fromNode._key) continue;

            const handles = node.handles;
            if(!handles) continue;

            for (const h of Object.values(handles)) {
                for (const point of h.point) {
                    const handleInfo = getHandleInfo(node, point.id);
                    if (!handleInfo) continue;

                    // Prevent connecting two outputs or two inputs
                    if (handleInfo.point.type === fromHandleInfo.point.type) continue;

                    const handlePos = getHandlePosition(node, point.id);
                    if (!handlePos) continue;

                    const dx = handlePos.x - cursorWorldPos.x;
                    const dy = handlePos.y - cursorWorldPos.y;
                    const distanceSq = dx * dx + dy * dy;

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
    }, []);

    const createATemporaryEdge = useCallback(async (e:MouseEvent, nodeId:string, pointId:string) => {

        if(!projectRef.current.state.generateUniqueId || !projectRef.current.state.graph || !projectRef.current.state.selectedSheetId || !projectRef.current.state.getMotor().getScene()?.edges) return;

        let node = projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId].nodeMap.get(nodeId);
        if(!node) return;

        let handleInfo = getHandleInfo(node, pointId);
        if(!handleInfo) return;


        e.stopPropagation();
        disableTextSelection();

        const uniqId = await projectRef.current.state.generateUniqueId(1);
        if(!uniqId) return;

        const temporaryEdge:Partial<Edge> = {
            _key: uniqId[0],
            graphKey: node.graphKey,
            sheet: node.sheet,
        }

        const gpuMotor = projectRef.current.state.getMotor();

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
                const P = projectRef.current;
                if(!P.state.graph || !P.state.selectedSheetId || !gpuMotor.getScene()?.edges) return;
                const cursorPos:Point = { x: e.clientX, y: e.clientY };
                let node = P.state.graph.sheets[P.state.selectedSheetId].nodeMap.get(nodeId);
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
            const P = projectRef.current;
            if(!P.state.graph || !P.state.selectedSheetId || !gpuMotor.getScene()?.edges || !P.state.batchCreateElements) return;

            window.removeEventListener('mousemove', mouseMove);
            window.removeEventListener('mouseup', mouseUp);
            enableTextSelection();

            let node = P.state.graph.sheets[P.state.selectedSheetId].nodeMap.get(nodeId);
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
                const output = await P.state.batchCreateElements([], [temporaryEdge as Edge]);
            }

            gpuMotor.requestRedraw();
        }
        window.addEventListener('mousemove', mouseMove);
        window.addEventListener('mouseup', mouseUp);
    }, [findClosestValidHandle]);


    return {
        createATemporaryEdge,
        findClosestValidHandle
    }
}