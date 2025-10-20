import {HtmlClass, HtmlObject} from "../../html/htmlType";
import {Graph} from "../../graph/graphType";

export interface api_category_list {
    workspace: string;
    type: "workflow" | "nodeconfig"
}

export interface api_category_create {
    workspace: string;
    category: string;
    type: "workflow" | "nodeconfig"
}

export interface api_category_delete {
    workspace: string;
    _key: string;
}


type api_graph_create_exclude = "graphKeyLinked" | "createdTime" | "lastUpdatedTime" | "_key" | "version" | "htmlNodeKey"
export interface api_graph_create {
    htmlClass:Omit<HtmlClass, api_graph_create_exclude>,
}

export interface api_graph_delete {
    htmlToken?: string;
    graphToken?: string;
}

export interface api_graph_html {
    workspace: string;
    retrieveHtml?: {
        token?: string,
        buildGraph?:boolean,
        offset?:number,
        length?:number,
        onlyFirstSheet?:boolean,
    },
    retrieveGraph?: {
        token?: string,
        buildGraph?:boolean,
        offset?:number,
        length?:number,
        onlyFirstSheet?:boolean,
    }
}