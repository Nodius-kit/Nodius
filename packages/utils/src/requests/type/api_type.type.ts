/**
 * @file api_type.type.ts
 * @description Type definitions for custom type and enum API requests
 * @module requests/type
 *
 * API request/response types for managing custom types and enums:
 * - api_type_list: List all custom types (server filters by user.workspaces)
 * - api_type_delete: Delete custom type by key (server verifies workspace from doc)
 * - api_enum_list: List all enums (server filters by user.workspaces)
 * - api_enum_delete: Delete enum by key (server verifies workspace from doc)
 *
 * These types enable type-safe communication for custom data type
 * and enumeration management in the workflow system.
 */

export interface api_type_list {
    workspace?: string;
}


export interface api_type_delete  {
    key: string,
}


export interface api_enum_list {
    workspace?: string;
}


export interface api_enum_delete  {
    key: string,
}
