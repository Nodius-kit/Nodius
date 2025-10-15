import {Instruction} from "./InstructionBuilder";

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
    noRedraw?: boolean,
}

export interface WSRegisterUser {
    type: "registerUser",
    userId: string,
    name: string,
    sheetId: string,
    graphKey: string,
}