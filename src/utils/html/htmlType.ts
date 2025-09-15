import {CSSProperties} from "react";

export const HTMLWorkflowEvent = ["variableChange"] as const;
export type HTMLWorkflowEventType = typeof HTMLWorkflowEvent[number];

export interface HTMLDomEvent<T> {
    name: T;
    description?: string;
    call: string;
}

export interface HTMLWorkFlowEvent<T> {
    name: T;
    description?: string;
    call: string;
}

export interface HtmlBase {
    identifier: string; // auto generated
    id?: string; // user generated
    tag: string;
    css:CSSProperties,
    domEvents?: Array<HTMLDomEvent<keyof HTMLElementEventMap>>,
    workflowEvents?: Array<HTMLWorkFlowEvent<HTMLWorkflowEventType>>
}

export interface HtmlArray extends HtmlBase {
    type: "array",
    content: {
        content?: HtmlObject,
        noContent?: HtmlObject,
        numberOfContent: string,
        indexVariableName: string,
    },
}

export interface HtmlDiv extends HtmlBase {
    type: "block",
    content?: HtmlObject,
}

export interface HtmlText extends HtmlBase{
    type: "text",
    content: Record<Language, string>
}

export interface HtmlList extends HtmlBase {
    type: "list",
    content: HtmlObject[],
}

export interface HtmlInner extends HtmlBase {
    type: "html",
    content: string,
}
export type HtmlObject = HtmlDiv | HtmlText | HtmlList | HtmlInner | HtmlArray;
export interface HtmlClass {
    object:HtmlObject,

    version: number;

    // html related info
    name:string,
    description?:string,
    owner:string,

    // bdd unique identifier
    _key:string,
    graphKeyLinked: string,


    // aditional info
    category:string,
    permission:number,

    // html unique info
    workspace:string, // user-id or workspace-id
}
