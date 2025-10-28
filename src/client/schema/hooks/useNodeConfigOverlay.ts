/**
 * @file useNodeDragDrop.ts
 * @description Hook for managing node drag and drop functionality
 * @module schema/hooks
 */

import {handleSide, Node} from "../../../utils/graph/graphType";
import { WebGpuMotor } from "../motor/webGpuMotor/index";
import {useCallback} from "react";
import {InstructionBuilder} from "../../../utils/sync/InstructionBuilder";
import {GraphInstructions} from "../../../utils/sync/wsObject";
import {ActionContext} from "../../hooks/contexts/ProjectContext";


export interface useNodeConfigOverlayOptions {
    gpuMotor: WebGpuMotor;

    getNode: (nodeKey: string) => Node<any> | undefined;
    enabled: (nodeKey: string) => boolean;
    updateGraph: (instructions:Array<GraphInstructions>) => Promise<ActionContext>
}

/**
 * Hook for managing drag and drop functionality for nodes
 */
export function useNodeConfigOverlay(options: useNodeConfigOverlayOptions) {


    const updateNodeConfigOverlay = useCallback(async (overlayHtml:HTMLElement, nodeId:string) => {
        // for each node side, + icon, when clicked add a side handler to the node:

        /*
        export interface Node<T> {
            _key: string,
            graphKey: string,

            undeletable?: boolean,

            type: NodeType,
            sheet:string,
            size: {
                width: number,
                height: number,
                dynamic?: boolean,
            },
            posX: number,
            posY: number,
            handles: Partial<Record<handleSide, {
                position: "separate" | "fix",
                point: Array<{
                    id: string,
                    offset?:number,
                    display?: string,
                    type: "in" | "out",
                    accept: string,
                }>
            }>>,
            data?: T
        }

         */

        // exemple

        const node = options.getNode(nodeId);
        if(!node) return;

        const side:handleSide = "T";

        const instruction = new InstructionBuilder();
        if(node.handles[side]) {
            // add it
            instruction.key("handles").key(side).key("point").arrayAdd({
                id: "0",
                type: "in",
                accept: "any",
            });
            await options.updateGraph([{
                nodeId: nodeId,
                i: instruction.instruction,
            }]);
        } else {
            // must create it
            const handle: {
                position: "separate" | "fix",
                point: Array<{
                    id: string,
                    offset?:number,
                    display?: string,
                    type: "in" | "out",
                    accept: string,
                }>
            } = {
                position: "separate",
                point: [{
                    id: "0",
                    type: "in",
                    accept: "any",
                }]
            }

            instruction.key("handles").key(side).set(handle);
            await options.updateGraph([{
                nodeId: nodeId,
                i: instruction.instruction,
            }]);
        }
        
        // next, user should be alowed to edit type "in"/"out", if "seperate" or "fix", if fix, "offset" is the pixel number for positionning, should be drag and drop calculated value
        // user can delete point and handle also

    }, [options]);

    return {
        updateNodeConfigOverlay
    }

}
