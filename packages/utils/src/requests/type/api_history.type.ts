/**
 * @file api_history.type.ts
 * @description Type definitions for history API endpoints
 * @module utils/requests/type
 *
 * Request and response types for graph history API endpoints.
 */

/**
 * Request to list graph history with pagination
 */
export interface api_history_list_request {
    /** The graph or node config key to get history for */
    graphKey: string;
    /** Type of history: "WF" for workflow, "node" for node config */
    type: "WF" | "node";
    /** Number of entries to skip (default: 0) */
    offset?: number;
    /** Maximum number of entries to return (default: 20, max: 100) */
    limit?: number;
}

/**
 * Individual history entry item in the response
 */
export interface api_history_list_item {
    /** Unique key of the history entry */
    _key: string;
    /** The graph or node config key this history belongs to */
    graphKey: string;
    /** Type of history: "WF" for workflow, "node" for node config */
    type: "WF" | "node";
    /** Timestamp when this batch of changes was saved */
    timestamp: number;
    /** Human-readable description of the modifications */
    description: string;
    /** Users involved in this batch of changes */
    users: Array<{
        userId: string;
        username: string;
    }>;
    /** Number of individual history entries in this batch */
    historyCount: number;
}

/**
 * Response from listing graph history
 */
export interface api_history_list_response {
    /** Array of history entries */
    items: api_history_list_item[];
    /** Total number of history entries available */
    total: number;
    /** Offset used in the query */
    offset: number;
    /** Limit used in the query */
    limit: number;
}
