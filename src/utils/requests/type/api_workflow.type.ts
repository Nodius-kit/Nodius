import {HtmlClass} from "../../html/htmlType";
import {Graph} from "../../graph/graphType";

export interface api_category_list {
    user: string;
    workspace: string;
}

export interface api_graph_create {
    fromHtml?: Omit<HtmlClass, "object">,
    fromGraph?: Graph
}
