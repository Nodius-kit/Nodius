import {CSSProperties} from "../../jsx-runtime/jsx-runtime";

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

export interface HtmlDiv extends HtmlBase {
    type: "block",
    content?: HtmlObject,
}

export interface HtmlText extends HtmlBase{
    type: "text",
    content: string
}


export type HtmlObject = HtmlDiv | HtmlText;
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
}