/**
 * @file api_workflow.type.ts
 * @description Type definitions for workflow and graph API requests
 * @module requests/type
 *
 * API request/response types for workflow and graph operations:
 * - api_category_*: Category management (list, create, delete, rename)
 * - api_graph_create: Create new HTML workflow with graph
 * - api_graph_delete: Delete workflow by HTML or graph token
 * - api_graph_html: Retrieve HTML classes and/or graphs with options
 *
 * Key features:
 * - Support for both workflow and nodeconfig category types
 * - Flexible graph retrieval with pagination and build options
 * - Token-based identification for workflows
 * - Omits auto-generated fields in create operations
 */

import {HtmlClass, HtmlObject} from "../../html/htmlType";
import {graphMetaData} from "../../graph/graphType";

export interface api_category_list {
    workspace: string;
    type: "workflow" | "nodeconfig" | "graph"
}

export interface api_category_create {
    workspace: string;
    category: string;
    type: "workflow" | "nodeconfig" | "graph"
}

export interface api_category_delete {
    workspace: string;
    _key: string;
}

export interface api_category_rename {
    workspace: string;
    _key: string;
    newName: string;
}


type api_graph_create_exclude = "graphKeyLinked" | "createdTime" | "lastUpdatedTime" | "_key" | "version" | "htmlNodeKey"
export interface api_graph_create {
    htmlClass?:Omit<HtmlClass, api_graph_create_exclude>,
    nodeKeyLinked?:string
    graph?:{name:string, workspace:string, },
    graphMetaData?:Partial<graphMetaData>;
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