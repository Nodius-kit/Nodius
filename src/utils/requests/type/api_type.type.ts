/**
 * @file api_type.type.ts
 * @description Type definitions for custom type and enum API requests
 * @module requests/type
 *
 * API request/response types for managing custom types and enums:
 * - api_type_list: List all custom types in workspace
 * - api_type_delete: Delete custom type by key
 * - api_enum_list: List all enums in workspace
 * - api_enum_delete: Delete enum by key
 *
 * These types enable type-safe communication for custom data type
 * and enumeration management in the workflow system.
 */

export interface api_type_list {
    workspace: string;
}


export interface api_type_delete  {
    key: string,
    workspace: string
}


export interface api_enum_list {
    workspace: string;
}


export interface api_enum_delete  {
    key: string,
    workspace: string
}