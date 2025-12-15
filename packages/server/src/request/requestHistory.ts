/**
 * @file requestHistory.ts
 * @description REST API endpoints for graph history
 * @module server/request
 *
 * Provides endpoints to retrieve graph modification history with user information.
 * History entries track all changes to workflows and node configurations.
 *
 * Endpoints:
 * - POST /api/history/list: List history entries with pagination
 *
 * Features:
 * - **Pagination Support**: Offset/limit for efficient loading
 * - **User Info**: Joins with nodius_users to get username
 * - **Type Filtering**: Filter by "WF" (workflow) or "node" (node config)
 * - **Graph Filtering**: Filter by specific graphKey
 * - **Modification Summaries**: Human-readable descriptions of changes
 * - **Timestamp Sorting**: Returns newest entries first
 *
 * Database Collections:
 * - nodius_graphs_history: History entries with modifications
 * - nodius_users: User information for attribution
 */

import { HttpServer, Request, Response } from "../http/HttpServer";
import { DocumentCollection } from "arangojs/collections";
import { ensureCollection } from "../utils/arangoUtils";
import { GraphHistoryBase, generateHistoryDescription, api_history_list_request, api_history_list_response  } from "@nodius/utils";
import { aql } from "arangojs";
import { db } from "../server";
import escapeHTML from 'escape-html';

export class RequestHistory {
    public static init = async (app: HttpServer) => {
        const history_collection: DocumentCollection = await ensureCollection("nodius_graphs_history");

        /**
         * POST /api/history/list
         * List graph history entries with pagination and user information
         *
         * Request body:
         * - graphKey: The graph or node config key to get history for
         * - type: "WF" or "node" - type of history to retrieve
         * - offset: Number of entries to skip (default: 0)
         * - limit: Maximum number of entries to return (default: 20, max: 100)
         *
         * Response:
         * - items: Array of history entries with user info and descriptions
         * - total: Total number of history entries for this graph
         * - offset: The offset used in the query
         * - limit: The limit used in the query
         */
        app.post("/api/history/list", async (req: Request, res: Response) => {
            try {
                const body = req.body as api_history_list_request;

                // Validate required fields
                if (!body.graphKey || !body.type) {
                    return res.status(400).json({
                        error: "Missing required fields: graphKey and type"
                    });
                }

                // Validate type
                if (body.type !== "WF" && body.type !== "node") {
                    return res.status(400).json({
                        error: "Invalid type. Must be 'WF' or 'node'"
                    });
                }

                // Set pagination defaults and limits
                const offset = Math.max(0, body.offset ?? 0);
                const limit = Math.min(100, Math.max(1, body.limit ?? 20));

                const graphKey = escapeHTML(body.graphKey);
                const type = body.type;

                // Query to get total count
                const countQuery = aql`
                    FOR history IN nodius_graphs_history
                    FILTER history.graphKey == ${graphKey}
                    FILTER history.type == ${type}
                    COLLECT WITH COUNT INTO total
                    RETURN total
                `;
                const countCursor = await db.query(countQuery);
                const total = (await countCursor.all())[0] || 0;

                // Query to get paginated history with user information
                // Sort by timestamp descending (newest first)
                const historyQuery = aql`
                    FOR history IN nodius_graphs_history
                    FILTER history.graphKey == ${graphKey}
                    FILTER history.type == ${type}
                    SORT history.timestamp DESC
                    LIMIT ${offset}, ${limit}
                    LET uniqueUserIds = UNIQUE(
                        FOR entry IN history.history
                        RETURN entry.userId
                    )
                    LET users = (
                        FOR userId IN uniqueUserIds
                        LET user = FIRST(
                            FOR u IN nodius_users
                            FILTER u._key == userId
                            RETURN {
                                userId: u._key,
                                username: u.username
                            }
                        )
                        RETURN user != null ? user : {
                            userId: userId,
                            username: "<user removed>"
                        }
                    )
                    RETURN {
                        _key: history._key,
                        graphKey: history.graphKey,
                        type: history.type,
                        timestamp: history.timestamp,
                        history: history.history,
                        users: users
                    }
                `;

                const historyCursor = await db.query(historyQuery);
                const historyEntries = await historyCursor.all() as Array<GraphHistoryBase & {
                    users: Array<{ userId: string, username: string }>
                }>;

                // Generate descriptions for each history entry
                const items = historyEntries.map((entry) => {
                    const description = generateHistoryDescription(entry.history);

                    // Create a map of userId to username for quick lookup
                    // Filter out any null users (though the AQL query should prevent this)
                    const userMap = new Map(
                        entry.users
                            .filter(u => u != null)
                            .map(u => [u.userId, u.username])
                    );

                    // Get unique users involved in this history entry
                    const involvedUsers = Array.from(new Set(entry.history.map(h => h.userId)))
                        .map(userId => ({
                            userId,
                            username: userMap.get(userId) || '<user removed>'
                        }));

                    return {
                        _key: entry._key,
                        graphKey: entry.graphKey,
                        type: entry.type,
                        timestamp: entry.timestamp,
                        description,
                        users: involvedUsers,
                        historyCount: entry.history.length
                    };
                });

                const response: api_history_list_response = {
                    items,
                    total,
                    offset,
                    limit
                };

                return res.status(200).json(response);
            } catch (error) {
                console.error("Error listing history:", error);
                return res.status(500).json({
                    error: "Failed to retrieve history"
                });
            }
        });
    };
}
