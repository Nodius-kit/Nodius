/**
 * @file api_sync.type.ts
 * @description Type definitions for synchronization API requests
 * @module requests/type
 *
 * API request/response types for real-time synchronization:
 * - api_sync: WebSocket sync request with instance identifier
 * - api_sync_info: Server connection information (host and port)
 *
 * These types support real-time collaboration and data synchronization
 * between multiple clients and server instances.
 */

export interface api_sync {
    instanceId: string;
}

export interface api_sync_info {
    host:string,
    port:number,
    /** Whether to use secure WebSocket (wss://) */
    secure?: boolean,
    /** WebSocket path (e.g., '/ws' when attached to HTTPS server) */
    path?: string,
}