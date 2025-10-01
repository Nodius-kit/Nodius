import {ActionType, Dispatch} from "../useCreateReducer";
import {createContext} from "react";
import {Graph, Node} from "../../../utils/graph/graphType";
import {HtmlClass} from "../../../utils/html/htmlType";
import {HtmlRender} from "../../../process/html/HtmlRender";

export interface ProjectContextProps {
    state: ProjectContextType;
    dispatch: Dispatch<ActionType<ProjectContextType>>
}

export const ProjectContext = createContext<ProjectContextProps>(undefined!);

export type EditedHtmlType = {node:Node<any>, html:HtmlClass, htmlRender:HtmlRender}|undefined

export interface ProjectContextType {
    loader: {
        active: boolean;
        opaque: boolean;
    },
    graph?:Graph,
    html?:HtmlClass,
    editedHtml?: EditedHtmlType
}
export const ProjectContextDefaultValue: ProjectContextType = {
    loader: {
        active: false,
        opaque: true,
    }
}
