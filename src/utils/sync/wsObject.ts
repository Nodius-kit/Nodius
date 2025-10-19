import {Instruction} from "./InstructionBuilder";
import {Node, Edge} from "../graph/graphType";

export type WSMessage<T> = T & {
    type: string;
    _id?: number, // auto applied, don't use manually
};

export type WSResponseMessage<T> = T & {
    _response: {
        status: boolean;
        message?: string;
    };
};

export interface WSPing {
    type: "ping"
}

export interface WSApplyInstructionToGraph {
    type: "applyInstructionToGraph",
    instructions: Array<GraphInstructions>,
}

export interface GraphInstructions {
    i:Instruction,
    nodeId?: string,
    edgeId?: string,
    applyUniqIdentifier?:string, // key to apply unique identifier
    targetedIdentifier?:string, // security check
    noRedraw?: boolean, // don't trigger a re render
    animatePos?:boolean, // animate pos change
}

export interface WSRegisterUser {
    type: "registerUser",
    userId: string,
    name: string,
    sheetId: string,
    graphKey: string,
}

export interface WSGenerateUniqueId {
    type: "generateUniqueId",
    ids: string[]
}

export interface WSBatchCreateElements {
    type: "batchCreateElements",
    sheetId: string,
    nodes: Array<Node<any>>,
    edges: Array<Edge>,
}

export interface WSBatchDeleteElements {
    type: "batchDeleteElements",
    sheetId: string,
    nodeKeys: Array<string>,
    edgeKeys: Array<string>,
}