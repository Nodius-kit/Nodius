import {HtmlClass} from "../../html/htmlType";
import {Graph} from "../../graph/graphType";

export interface api_category_list {
    workspace: string;
}

export interface api_graph_create {
    htmlClass:Omit<HtmlClass, "graphKeyLinked">
}

export interface api_graph_html {
    retrieveHtml?: {
        token?: string,
        buildGraph?:boolean,
        offset?:number,
        length?:number,
    },
    retrieveGraph?: {
        token?: string,
        buildGraph?:boolean,
        offset?:number,
        length?:number,
    }
}