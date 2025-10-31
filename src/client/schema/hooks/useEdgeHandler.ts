


/*
 create at 5 am, don't ask me what im doing here, you need a beer and multiple hour to work on it

 update: 6am, it's even worse...

 ho btw, this handle dragged new edge to connect handle to another one
 */

import {WebGpuMotor} from "../motor/webGpuMotor";
import {disableTextSelection, enableTextSelection} from "../../../utils/objectUtils";
import {useContext} from "react";
import {ProjectContext} from "../../hooks/contexts/ProjectContext";
import {getHandleInfo} from "../motor/webGpuMotor/handleUtils";
import {Edge, Node} from "../../../utils/graph/graphType";
import {HandleInfo} from "../motor/webGpuMotor/types";

interface useEdgeHandlerOptions {
    gpuMotor: WebGpuMotor;
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

        console.log("created", temporaryEdge);

        gpuMotor.requestRedraw();

        let frameId:number|undefined = undefined;
        const mouseMove = (e:MouseEvent) => {
            if(frameId) cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(() => {
                gpuMotor.requestRedraw();
            });
        }
        const mouseUp = (e:MouseEvent) => {
            if(!Project.state.graph || !Project.state.selectedSheetId || !gpuMotor.getScene()?.edges) return;

            window.removeEventListener('mousemove', mouseMove);
            window.removeEventListener('mouseup', mouseUp);
            enableTextSelection();

            let node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(nodeId);
            if(!node) return;

            let handleInfo = getHandleInfo(node, pointId);
            if(!handleInfo) return;

            if(handleInfo.point.type === "out") {
                let edges = gpuMotor.getScene()!.edges.get("source-"+nodeId) ?? [];
                edges = edges.filter((e) => e._key !== temporaryEdge._key);
                if(edges.length === 0) {
                    gpuMotor.getScene()!.edges.delete("source-"+nodeId);
                } else {
                    gpuMotor.getScene()!.edges.set("source-"+nodeId, edges);
                }
            } else {
                let edges = gpuMotor.getScene()!.edges.get("target-"+nodeId) ?? [];
                edges = edges.filter((e) => e._key !== temporaryEdge._key);
                if(edges.length === 0) {
                    gpuMotor.getScene()!.edges.delete("target-"+nodeId);
                } else {
                    gpuMotor.getScene()!.edges.set("target-"+nodeId, edges);
                }
            }


            gpuMotor.requestRedraw();

        }
        window.addEventListener('mousemove', mouseMove);
        window.addEventListener('mouseup', mouseUp);
    }

    return {
        createATemporaryEdge
    }
}