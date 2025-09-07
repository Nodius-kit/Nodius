import {CSSProperties} from "nodius_jsx/jsx-runtime";

export interface HtmlBase {
    id: number;
    tag: string;
    css:CSSProperties,
    name?:string,
    events?: Array<{
        name: string;
        call: string;
    }>
}

export type HtmlType = "block" | "text" | "list";

export interface HtmlDiv extends HtmlBase {
    type: "block",
    content?: HtmlObject,
}

export interface HtmlText extends HtmlBase{
    type: "text",
    content: Record<"en", string>
}

export interface HtmlList extends HtmlBase {
    type: "list",
    content: HtmlObject[],
}


export type HtmlObject = HtmlDiv | HtmlText | HtmlList;
export const HtmlClassTypeList = ["content"] as const;
export type HtmlClassType =  typeof HtmlClassTypeList[number];

export interface HtmlClass {
    object:HtmlObject,
    name:string,
    _key:string,
    type:HtmlClassType,
    category:string,
    permission:number,
}

export interface BuilderComponent {
    name:string,
    object:HtmlObject
}


export interface insertEvent {
    component?: BuilderComponent,
    preview?:boolean,
    cursorX: number,
    cursorY: number,
}