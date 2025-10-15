import {ActionType, Dispatch} from "../useCreateReducer";
import {createContext, useCallback} from "react";
import {Graph, Node, NodeType, NodeTypeConfig, NodeTypeHtmlConfig} from "../../../utils/graph/graphType";
import {HtmlClass} from "../../../utils/html/htmlType";
import {HtmlRender, HtmlRenderOption} from "../../../process/html/HtmlRender";
import {Instruction, InstructionBuilder} from "../../../utils/sync/InstructionBuilder";
import {GraphInstructions} from "../../../utils/sync/wsObject";

export interface ProjectContextProps {
    state: ProjectContextType;
    dispatch: Dispatch<ActionType<ProjectContextType>>
}

export const ProjectContext = createContext<ProjectContextProps>(undefined!);

export type EditedHtmlType = {node:Node<any>, html:HtmlClass, htmlRender:HtmlRender, pathToEdit:string[]}|undefined
export interface ActionContext {
    timeTaken: number;
    status: boolean;
    reason?: string;
}
export interface UpdateHtmlOption {
    targetedIdentifier?:string,
    noRedraw?:boolean,
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

    initiateNewHtmlRenderer?: (id:string, container:HTMLElement, options?:HtmlRenderOption) => void,
    getHtmlRenderer?: (id:string) => HtmlRender,
    getHtmlAllRenderer?: () =>  Record<string, HtmlRender>,
    nodeTypeConfig:Record<NodeType, NodeTypeConfig>,
    isSynchronized: boolean,

}
export const ProjectContextDefaultValue: ProjectContextType = {
    loader: {
        active: false,
        opaque: true,
    },
    isSynchronized: false,
    nodeTypeConfig: {
        "html": NodeTypeHtmlConfig as NodeTypeConfig
    }
}
