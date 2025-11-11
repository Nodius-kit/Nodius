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
import {createContext, Dispatch, JSX, MemoExoticComponent} from "react";
import {ActionType} from "../useCreateReducer";
import {GraphicalMotor} from "../../schema/motor/graphicalMotor";
import {HomeWorkflow} from "../../menu/homeWorkflow/HomeWorkflow";
import {GraphInstructions, WSMessage} from "../../../utils/sync/wsObject";
import {HtmlClass} from "../../../utils/html/htmlType";
import {
    Graph,
    NodeType,
    NodeTypeConfig,
    NodeTypeEntryTypeConfig,
    NodeTypeHtmlConfig
} from "../../../utils/graph/graphType";
import {DataTypeClass, EnumClass} from "../../../utils/dataType/dataType";

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

export interface AppMenuProps {
}

export const ProjectContext = createContext<ProjectContextProps>(undefined!);

export interface ProjectContextType {
    selectedNode: string[],
    selectedEdge: string[],
    activeAppMenuId: string,
    appMenu:Array<AppMenu>,
    getMotor: () => GraphicalMotor,
    caughtUpMessage?: WSMessage<any>[],
    openHtmlClass?:(html:HtmlClass, graph?:Graph) => Promise<ActionContext>,
    selectedSheetId?:string,
    graph?:Graph,
    nodeTypeConfig:Record<NodeType, NodeTypeConfig>,
    updateGraph?:(instructions:Array<GraphInstructions>) => Promise<ActionContext>,

    dataTypes?: DataTypeClass[],
    refreshAvailableDataTypes?:() => Promise<void>,

    enumTypes?:EnumClass[],
    refreshAvailableEnums?:() => Promise<void>,
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
}
