import {ActionType, Dispatch} from "../useCreateReducer";
import {createContext, useCallback} from "react";
import {
    Edge,
    Graph,
    Node,
    NodeType,
    NodeTypeConfig,
    NodeTypeEntryTypeConfig,
    NodeTypeHtmlConfig
} from "../../../utils/graph/graphType";
import {HtmlClass} from "../../../utils/html/htmlType";
import {HtmlRender, HtmlRenderOption} from "../../../process/html/HtmlRender";
import {Instruction, InstructionBuilder} from "../../../utils/sync/InstructionBuilder";
import {GraphInstructions} from "../../../utils/sync/wsObject";
import {DataTypeClass, EnumClass} from "../../../utils/dataType/dataType";

export interface ProjectContextProps {
    state: ProjectContextType;
    dispatch: Dispatch<ActionType<ProjectContextType>>
}

export const ProjectContext = createContext<ProjectContextProps>(undefined!);

export type EditedHtmlType = {node:Node<any>, html:HtmlClass, htmlRender:HtmlRender, pathOfRender:string[]}|undefined
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
    pathOfRender:string[],
    nodeId:string,
}

export interface ProjectContextType {
    loader: {
        active: boolean;
        opaque: boolean;
    },
    graph?:Graph,
    selectedSheetId?:string,
    html?:HtmlClass,
    editedHtml?: EditedHtmlType,
    updateHtml?:(instruction:Instruction, options?:UpdateHtmlOption) => Promise<ActionContext>,
    updateGraph?:(instructions:Array<GraphInstructions>) => Promise<ActionContext>,
    openHtmlClass?:(html:HtmlClass, graph?:Graph) => Promise<ActionContext>,

    initiateNewHtmlRenderer?: (node:Node<any>, id:string, container:HTMLElement, pathOfRender:string[], options?:HtmlRenderOption) => Promise<htmlRenderContext>,
    getHtmlRenderer?: (node:string|Node<any>) =>  Record<string, htmlRenderContext>,
    getHtmlAllRenderer?: () =>  Record<string, Record<string, htmlRenderContext>>,
    nodeTypeConfig:Record<NodeType, NodeTypeConfig>,
    generateUniqueId?:(amount:number) => Promise<string[]|undefined>,
    batchCreateElements?:(nodes: Node<any>[], edges: Edge[]) => Promise<ActionContext>,
    isSynchronized: boolean,

    dataTypes?: DataTypeClass[],
    currentEntryDataType?:DataTypeClass,
    refreshAvailableDataTypes?:() => Promise<void>,

    enumTypes?:EnumClass[],
    refreshAvailableEnums?:() => Promise<void>,

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
    }
}
