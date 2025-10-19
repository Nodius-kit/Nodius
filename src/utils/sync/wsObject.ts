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

export interface WSApplyInstructionToNodeConfig {
    type: "applyInstructionToNodeConfig",
    instructions: Array<nodeConfigInstructions>,
}

export interface GraphInstructions {
    i:Instruction,
    nodeId?: string,
    edgeId?: string,
    applyUniqIdentifier?:string, // key to apply unique identifier
    targetedIdentifier?:string, // security check
    noRedraw?: boolean, // don't trigger a re render
    animatePos?:boolean, // animate pos change

    // don't apply instruction to the graph after sending it to the server, should be only used when working on non logic data (like node position)
    dontApplyToMySelf?:boolean
}

export interface nodeConfigInstructions {
    i:Instruction,
    applyUniqIdentifier?:string, // key to apply unique identifier
    targetedIdentifier?:string, // security check
    noRedraw?: boolean,
    animatePos?:boolean,
}

export interface WSRegisterUserOnGraph {
    type: "registerUserOnGraph",
    userId: string,
    name: string,
    sheetId: string,
    graphKey: string,
    fromTimestamp: number,
}

export interface WSDisconnedUserOnGraph {
    type: "disconnedUserOnGraph",
    userId: string,
    graphKey: string,
}

export interface WSRegisterUserOnNodeConfig {
    type: "registerUserOnNodeConfig",
    userId: string,
    name: string,
    nodeConfigKey: string,
    fromTimestamp: number,
}

export interface WSDisconnectUserOnNodeConfig {
    type: "disconnectUserOnNodeConfig",
    userId: string,
    nodeConfigKey: string,
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