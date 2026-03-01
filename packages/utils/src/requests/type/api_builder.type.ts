/**
 * @file api_builder.type.ts
 * @description Type definitions for HTML builder API requests
 * @module requests/type
 *
 * API request/response types for HTML builder component operations:
 * - api_builder_components: Request to fetch available HTML builder components
 *   (server filters by user.workspaces)
 *
 * These types ensure type safety for client-server communication
 * regarding HTML component library and builder functionality.
 */

export interface api_builder_components {
    workspace?: string;
}
