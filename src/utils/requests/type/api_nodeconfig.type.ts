import {NodeTypeConfig} from "../../graph/graphType";

export interface api_node_config_list {
    workspace: string;
    category?: string; // optional filter by category
}

export interface api_node_config_create {
    nodeConfig: Omit<NodeTypeConfig, "_key">;
}

export interface api_node_config_update {
    nodeConfig: NodeTypeConfig;
}

export interface api_node_config_delete {
    workspace: string;
    _key: string;
}

export interface api_node_config_get {
    workspace: string;
    _key: string;
}

// Category management
export interface api_node_category_list {
    workspace: string;
}

export interface api_node_category_create {
    workspace: string;
    category: string;
}

export interface api_node_category_delete {
    workspace: string;
    _key: string;
}
