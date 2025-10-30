/**
 * @file ProjectContext.tsx
 * @description Global project state context for workflow and graph management
 * @module hooks/contexts
 *
 * Provides centralized state management for the entire project:
 * - ProjectContext: React context for project-wide state and operations
 * - Workflow editing: openHtmlClass, editedHtml, updateHtml operations
 * - Node configuration: openNodeConfig, editedNodeConfig management
 * - Graph operations: updateGraph, batch create/delete elements
 * - HTML rendering: Manages multiple HtmlRender instances per node
 * - Data types: Custom data types and enums management
 * - Synchronization: Real-time sync state and message handling
 *
 * Key features:
 * - Loader state for UI feedback during operations
 * - Node type configuration registry
 * - HTML renderer lifecycle management
 * - Unique ID generation for graph elements
 * - WebSocket message catch-up for reconnection scenarios
 */

import {ActionType, Dispatch} from "../useCreateReducer";
import {createContext, useCallback} from "react";
import {
    Edge,
    Graph,
    handleSide,
    Node,
    NodeType,
    NodeTypeConfig,
    NodeTypeEntryTypeConfig,
    NodeTypeHtmlConfig
} from "../../../utils/graph/graphType";
import {HtmlClass, HtmlObject} from "../../../utils/html/htmlType";
import {HtmlRender, HtmlRenderOption} from "../../../process/html/HtmlRender";
import {Instruction, InstructionBuilder} from "../../../utils/sync/InstructionBuilder";
import {GraphInstructions, nodeConfigInstructions, WSMessage} from "../../../utils/sync/wsObject";
import {DataTypeClass, EnumClass} from "../../../utils/dataType/dataType";
import {OpenHtmlEditorFct} from "../useSocketSync";
import {TextChangeInfo} from "../../../utils/objectUtils";

export interface ProjectContextProps {
    state: ProjectContextType;
    dispatch: Dispatch<ActionType<ProjectContextType>>
}

export const ProjectContext = createContext<ProjectContextProps>(undefined!);

export type EditedHtmlType =
    | {
    targetType: "node";
    target: Node<any>;
    html: HtmlObject;
    htmlRender: HtmlRender;
    pathOfRender: string[];
}
    | {
    targetType: "NodeTypeConfig";
    target: NodeTypeConfig;
    html: HtmlObject;
    htmlRender: HtmlRender;
    pathOfRender: string[];
}
    | undefined;
export type EditedNodeTypeConfig = {node:Node<any>, config:NodeTypeConfig}|undefined;

export type EditedNodeHandle = {
    nodeId: string;
    side: handleSide;
    pointId: string;
} | undefined;

export interface ActionContext {
    timeTaken: number;
    status: boolean;
    reason?: string;
}
export interface UpdateHtmlOption {
    targetedIdentifier?:string,
    noRedraw?:boolean,
}

export interface htmlRenderContext {
    htmlMotor:HtmlRender,
    pathOfRender:string[]|HtmlObject,
    nodeId:string,
}

export type DisabledNodeInteractionType = Record<string, Partial<{
    moving: boolean,
}>>;

export type getHtmlRendererType = (node:string|Node<any>) =>  Record<string, htmlRenderContext>;
export type initiateNewHtmlRendererType = (node:Node<any>, id:string, container:HTMLElement, pathOfRender:string[]|HtmlObject, options?:HtmlRenderOption) => Promise<htmlRenderContext|undefined>;

export interface ProjectContextType {
    loader: {
        active: boolean;
        opaque: boolean;
    },
    graph?:Graph,
    selectedSheetId?:string,
    //html?:HtmlClass,
    editedHtml?: EditedHtmlType,
    openHtmlClass?:(html:HtmlClass, graph?:Graph) => Promise<ActionContext>,
    onCloseEditor?:() => void,
    openHtmlEditor?:OpenHtmlEditorFct,

    editedNodeConfig?: EditedNodeTypeConfig,
    openNodeConfig?:(config:NodeTypeConfig) => Promise<ActionContext>,

    editedNodeHandle?: EditedNodeHandle,

    updateHtml?:(instruction:Instruction|Instruction[], options?:UpdateHtmlOption) => Promise<ActionContext>,
    updateGraph?:(instructions:Array<GraphInstructions>) => Promise<ActionContext>,
    updateNodeConfig?:(instructions:Array<nodeConfigInstructions>) => Promise<ActionContext>,

    initiateNewHtmlRenderer?: initiateNewHtmlRendererType,
    getHtmlRenderer?: getHtmlRendererType,
    getHtmlAllRenderer?: () =>  Record<string, Record<string, htmlRenderContext>>,
    nodeTypeConfig:Record<NodeType, NodeTypeConfig>,
    generateUniqueId?:(amount:number) => Promise<string[]|undefined>,
    batchCreateElements?:(nodes: Node<any>[], edges: Edge[]) => Promise<ActionContext>,
    batchDeleteElements?:(nodeKeys: string[], edgeKeys: string[]) => Promise<ActionContext>,
    isSynchronized: boolean,

    dataTypes?: DataTypeClass[],
    refreshAvailableDataTypes?:() => Promise<void>,

    currentEntryDataType?:DataTypeClass,
    refreshCurrentEntryDataType?:() => void,

    enumTypes?:EnumClass[],
    refreshAvailableEnums?:() => Promise<void>,

    caughtUpMessage?: WSMessage<any>[] // used to caught up missing message while connecting

    disabledNodeInteraction: DisabledNodeInteractionType,

    editedCode?: {
        path:string[],
        nodeId:string,
        baseText:string,
        applyChange?: (changes:TextChangeInfo|TextChangeInfo[]) => void,
    }

    selectedNode: string[],

}
export const ProjectContextDefaultValue: ProjectContextType = {
    loader: {
        active: false,
        opaque: true,
    },
    isSynchronized: false,
    nodeTypeConfig: {
        "html": NodeTypeHtmlConfig,
        "entryType": NodeTypeEntryTypeConfig
    },
    disabledNodeInteraction: {},
    selectedNode: [],
}
