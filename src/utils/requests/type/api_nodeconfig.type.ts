/**
 * @file api_nodeconfig.type.ts
 * @description Type definitions for node configuration API requests
 * @module requests/type
 *
 * API request/response types for node configuration operations:
 * - api_node_config_list: List node configurations with optional category filter
 * - api_node_config_create: Create new node configuration
 * - api_node_config_update: Update existing node configuration
 * - api_node_config_delete: Delete node configuration by key
 * - api_node_config_get: Retrieve single node configuration
 * - api_node_category_*: Category management operations
 *
 * These types define the contract between client and server for
 * managing custom node type definitions and their categorization.
 */

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
