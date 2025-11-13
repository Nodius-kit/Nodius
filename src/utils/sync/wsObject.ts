/**
 * @file wsObject.ts
 * @description WebSocket message type definitions for real-time collaboration
 * @module sync
 *
 * Defines all WebSocket message types for client-server communication:
 * - WSMessage: Base message type with auto-applied ID
 * - WSResponseMessage: Response wrapper with status
 * - Graph operations: Apply instructions, register/disconnect users
 * - Node config operations: Instruction application for node configs
 * - Utility operations: Ping, unique ID generation, batch create/delete
 *
 * Key message types:
 * - WSApplyInstructionToGraph: Apply modifications to graph
 * - WSRegisterUserOnGraph: User session registration
 * - WSGenerateUniqueId: Request unique identifiers
 * - WSBatchCreateElements: Bulk node/edge creation
 * - WSBatchDeleteElements: Bulk node/edge deletion
 */

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

    animatePos?:boolean, // animate pos change
    animateSize?:boolean, // animate size change

    dontTriggerUpdateNode?:boolean,

    triggerHtmlRender?:boolean,

    // don't apply instruction to the graph after sending it to the server, should be only used when working on non logic data rapidly (like node position or size)
    dontApplyToMySelf?:boolean
}

export interface nodeConfigInstructions {
    i:Instruction,
    applyUniqIdentifier?:string, // key to apply unique identifier
    targetedIdentifier?:string, // security check
    animatePos?:boolean,
    animateSize?:boolean,

    triggerHtmlRender?:boolean,

    // don't apply instruction to the graph after sending it to the server, should be only used when working on non logic data rapidly (like node position or size)
    dontApplyToMySelf?:boolean
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