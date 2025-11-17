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
import {createContext, Dispatch, JSX, MemoExoticComponent, useCallback} from "react";
import {ActionType} from "../useCreateReducer";
import {GraphicalMotor} from "../../schema/motor/graphicalMotor";
import {HomeWorkflow} from "../../menu/homeWorkflow/HomeWorkflow";
import {GraphInstructions, nodeConfigInstructions, WSMessage} from "../../../utils/sync/wsObject";
import {HtmlClass, HtmlObject} from "../../../utils/html/htmlType";
import {
    Edge,
    Node,
    Graph,
    NodeType,
    NodeTypeConfig,
    NodeTypeEntryTypeConfig,
    NodeTypeHtmlConfig, handleSide
} from "../../../utils/graph/graphType";
import {DataTypeClass, EnumClass} from "../../../utils/dataType/dataType";
import {Instruction} from "../../../utils/sync/InstructionBuilder";
import {HtmlRender} from "../../../process/html/HtmlRender";

export interface ActionContext {
    timeTaken: number;
    status: boolean;
    reason?: string;
}

export interface ProjectContextProps {
    state: ProjectContextType;
    dispatch: Dispatch<ActionType<ProjectContextType>>;
}

export interface AppMenu {
    element:(({}: AppMenuProps) => JSX.Element)|MemoExoticComponent<({}: AppMenuProps) => JSX.Element>,
    pointerEvent:boolean,
    id:string
}

export type DisabledNodeInteractionType = Record<string, Partial<{
    moving: boolean,
}>>;

export interface AppMenuProps {
}

export type EditedNodeHandle = {
    nodeId: string;
    side: handleSide;
    pointId: string;
};

export interface EditedCodeContext {
    title: string;
    nodeId: string,
    onChange: (instruction:Instruction|Instruction[]) => Promise<boolean>;
    retrieveText: (node:Node<any>) => string;
    onOutsideChange?: () => void;
    type?: "JS" | "HTML"
}

export interface htmlRenderContext {
    nodeId: string,
    renderId: string,
    retrieveNode: () => (Node<any>|undefined),
    retrieveHtmlObject: (node:Node<any>) => HtmlObject,
    htmlRender: HtmlRender,
}

export interface EditedHtmlType {
    htmlRenderContext: htmlRenderContext,
    updateHtmlObject: (graphInstructions:GraphInstructions[]) => Promise<ActionContext>,
}

export interface WorkFlowState {
    active: boolean;
    executing: boolean;
    entryData?:Record<string, any>,
    global?:Record<string, any>
}

export const ProjectContext = createContext<ProjectContextProps>(undefined!);

export interface ProjectContextType {
    selectedNode: string[],
    selectedEdge: string[],
    activeAppMenuId: string,
    appMenu:Array<AppMenu>,
    getMotor: () => GraphicalMotor,
    caughtUpMessage?: WSMessage<any>[],

    editedNodeHandle?: EditedNodeHandle,

    initiateNewHtmlRender: (context:htmlRenderContext) => htmlRenderContext|undefined,
    getHtmlRenderWithId: (nodeId:string, renderId:string) => htmlRenderContext|undefined,
    getHtmlRenderOfNode: (nodeId:string) => htmlRenderContext[],
    getAllHtmlRender: () => htmlRenderContext[],
    removeHtmlRender: (nodeId:string, renderId:string) => void,

    editedHtml?: EditedHtmlType,
    openHtmlEditor?: (context: htmlRenderContext, pathOfEdit:string[]) => Promise<EditedHtmlType>,
    closeHtmlEditor?: () => Promise<void>,

    openHtmlClass?:(html:HtmlClass, graph?:Graph) => Promise<ActionContext>,
    openNodeConfig?:(config:NodeTypeConfig) => Promise<ActionContext>,

    selectedSheetId?:string,
    graph?:Graph,
    nodeTypeConfig:Record<NodeType, NodeTypeConfig>,
    updateGraph?:(instructions:Array<GraphInstructions>) => Promise<ActionContext>,
    updateNodeConfig?:(instructions:Array<nodeConfigInstructions>) => Promise<ActionContext>,

    dataTypes?: DataTypeClass[],
    refreshAvailableDataTypes?:() => Promise<void>,

    editedNodeConfig?: string,

    generateUniqueId?:(amount:number) => Promise<string[]|undefined>,

    editedCode: Array<EditedCodeContext>,

    enumTypes?:EnumClass[],
    refreshAvailableEnums?:() => Promise<void>,

    batchCreateElements?:(nodes: Node<any>[], edges: Edge[]) => Promise<ActionContext>,
    batchDeleteElements?:(nodeKeys: string[], edgeKeys: string[]) => Promise<ActionContext>,

    currentEntryDataType?:DataTypeClass,
    refreshCurrentEntryDataType?:() => void,

    disabledNodeInteraction: DisabledNodeInteractionType,

    computeVisibility?: () => void,
    fetchMissingNodeConfig?: (nodeType: string, workspace: string) => Promise<NodeTypeConfig | undefined>,

    workFlowState: WorkFlowState,
}
export const ProjectContextDefaultValue: ProjectContextType = {
    selectedNode: [],
    selectedEdge: [],
    getMotor: () => undefined!,
    activeAppMenuId: "home",
    appMenu:[],
    nodeTypeConfig: {
        "html": NodeTypeHtmlConfig,
        "entryType": NodeTypeEntryTypeConfig
    },

    initiateNewHtmlRender: (context:htmlRenderContext) => undefined!,
    getHtmlRenderWithId: (nodeId:string, renderId:string) => undefined!,
    getHtmlRenderOfNode: (nodeId:string) => undefined!,
    getAllHtmlRender: () => undefined!,
    removeHtmlRender: (nodeId:string, renderId:string) => undefined!,

    disabledNodeInteraction: {},

    editedCode: [],

    workFlowState: {
        active: false,
        executing: false,
    }
}
