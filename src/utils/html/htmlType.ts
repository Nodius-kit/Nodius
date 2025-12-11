import {CSSBlock} from "./htmlCss";

export const HTMLWorkflowEvent = ["nodeUpdate", "graphUpdate", "nodeEnter", "entryDataTypeUpdate"] as const;

export interface HTMLDomEvent<T> {
    name: T;
    description?: string;
    call: string;
}


export interface HtmlBase {
    identifier: string; // auto generated
    id?: string; // user generated
    tag: string;
    css:CSSBlock[],
    domEvents: Array<HTMLDomEvent<keyof HTMLElementEventMap | typeof HTMLWorkflowEvent[number]>>,
    //workflowEvents: Array<HTMLWorkFlowEvent<HTMLWorkflowEventType>>,
    name:string,
    temporary?:boolean,
    attribute?: Record<string, string>,
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
    content: Record<string, string>
}

export interface HtmlList extends HtmlBase {
    type: "list",
    content: HtmlObject[],
}

export interface HtmlInner extends HtmlBase {
    type: "html",
    content: string,
}

export interface HtmlIcon extends HtmlBase {
    type: "icon",
    content: string,
}

export interface HtmlImage extends HtmlBase {
    type: "image",
    content: [string, string] // first is alt, then src
}

export interface HtmlLink extends HtmlBase {
    type: "link",
    content: {
        url: string,
        text: Record<string, string>
    }
}

export type HtmlObject = HtmlDiv | HtmlText | HtmlList | HtmlInner | HtmlArray | HtmlIcon | HtmlImage | HtmlLink;
export interface HtmlClass {
    htmlNodeKey: string;
    object:HtmlObject,
    version: number;
    // html related info
    name:string,
    description?:string,

    // bdd unique identifier
    _key:string,
    graphKeyLinked: string,


    // aditional info
    category:string,
    permission:number,

    // html unique info
    workspace:string, // user-id or workspace-id


    createdTime: number,
    lastUpdatedTime: number,
}


/* ------------ HTML BUILDER --------------- */
export const HtmlBuilderCategory = ["Most Used Components", "Layout Components"] as const
export type HtmlBuilderCategoryType = typeof HtmlBuilderCategory[number];
export interface HtmlBuilderComponent {
    _keys: string,
    icon: string, // lucide icon name,
    htmlKeyLinked: string,
    workspace: string,
    category: HtmlBuilderCategoryType,
    object: HtmlObject,
}