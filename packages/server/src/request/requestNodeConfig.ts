/**
 * @file requestNodeConfig.ts
 * @description REST API endpoints for visual workflow node configuration management
 * @module server/request
 *
 * Manages configuration for custom node types in the visual workflow editor.
 * Each node config defines the behavior, inputs, outputs, and appearance of a node type.
 *
 * Endpoints:
 * - POST /api/nodeconfig/list: List all node configs for a workspace (optionally filtered by category)
 * - POST /api/nodeconfig/get: Get a specific node config by key
 * - POST /api/nodeconfig/create: Create a new node type configuration
 * - POST /api/nodeconfig/update: Update an existing node config
 * - POST /api/nodeconfig/delete: Delete a node config
 *
 * Features:
 * - **Node Type Definitions**: Configure inputs, outputs, entry types, and execution logic
 * - **Workspace Scoping**: Node configs are isolated per workspace
 * - **Category Organization**: Nodes can be grouped into categories
 * - **Uniqueness Validation**: displayName must be unique within workspace
 * - **Timestamps**: Tracks creation and last update times
 * - **Conflict Prevention**: Prevents duplicate names during create/rename
 * - **Security**: All inputs sanitized with escapeHTML
 *
 * Node Config Structure:
 * - displayName: Human-readable name shown in UI
 * - category: Organization category
 * - node: Base node structure with type, inputs, outputs
 * - entryType: Configuration for data entry when node is selected
 * - workspace: Workspace identifier
 * - _key: Unique identifier (also used as node.type)
 *
 * Database Collection:
 * - nodius_node_config: Stores NodeTypeConfig objects
 *
 * Use Cases:
 * - Creating custom API call nodes
 * - Defining data transformation nodes
 * - Building workflow control flow nodes (if/else, loops)
 * - Configuring integration nodes for external services
 */

import {HttpServer, Request, Response} from "../http/HttpServer";
import {DocumentCollection} from "arangojs/collections";
import {createUniqueToken, ensureCollection, safeArangoObject} from "../utils/arangoUtils";
import {
    api_node_category_create,
    api_node_category_delete,
    api_node_category_list,
    api_node_config_create,
    api_node_config_delete,
    api_node_config_get,
    api_node_config_list,
    api_node_config_update,
    NodeTypeConfig,
    NodeTypeReturnConfig
} from "@nodius/utils";
import {aql} from "arangojs";
import {db} from "../server";
import escapeHTML from 'escape-html';

export class RequestNodeConfig {

    public static init = async (app: HttpServer) => {
        const nodeConfig_collection: DocumentCollection = await ensureCollection("nodius_node_config");
        const nodeCategory_collection: DocumentCollection = await ensureCollection("nodius_node_category");

        // ==================== NODE CONFIG ENDPOINTS ====================

        /**
         * List all node configs for a workspace, optionally filtered by category
         */
        app.post("/api/nodeconfig/list", async (req: Request, res: Response) => {
            try {
                const body: api_node_config_list = req.body;

                if (!body.workspace) {
                    return res.status(400).json({error: "Missing workspace field"});
                }

                let filters = [aql`doc.workspace == ${escapeHTML(body.workspace)}`];

                // Add category filter if provided
                if (body.category) {
                    filters.push(aql`doc.category == ${escapeHTML(body.category)}`);
                }

                let combinedFilter = filters.reduce(
                    (acc, cond) => (acc ? aql`${acc} AND ${cond}` : cond),
                    null as any
                );

                const query = aql`
                  FOR doc IN nodius_node_config
                  FILTER ${combinedFilter}
                  RETURN doc
                `;

                const cursor = await db.query(query);
                const nodeConfigs = await cursor.all() as NodeTypeConfig[];

                // add return node config
                if(!body.category || body.category === "default") {
                    nodeConfigs.push(NodeTypeReturnConfig);
                }

                return res.status(200).json(nodeConfigs);
            } catch (err) {
                console.error("Error listing node configs:", err);
                return res.status(500).json({error: "Internal Server Error"});
            }
        });

        /**
         * Get a specific node config by key
         */
        app.post("/api/nodeconfig/get", async (req: Request, res: Response) => {
            try {
                const body: api_node_config_get = req.body;

                if (!body.workspace || !body._key) {
                    return res.status(400).json({error: "Missing required fields"});
                }

                const query = aql`
                  FOR doc IN nodius_node_config
                  FILTER doc._key == ${escapeHTML(body._key)}
                    AND doc.workspace == ${escapeHTML(body.workspace)}
                  LIMIT 1
                  RETURN doc
                `;

                const cursor = await db.query(query);
                const nodeConfig = await cursor.next();

                if (!nodeConfig) {
                    return res.status(404).json({error: "Node config not found"});
                }

                return res.status(200).json(nodeConfig);
            } catch (err) {
                console.error("Error getting node config:", err);
                return res.status(500).json({error: "Internal Server Error"});
            }
        });

        /**
         * Create a new empty node config
         */
        app.post("/api/nodeconfig/create", async (req: Request, res: Response) => {
            try {
                const body: api_node_config_create = req.body;

                // Basic validation
                if (!body.nodeConfig || !body.nodeConfig.workspace) {
                    return res.status(400).json({error: "Missing required fields"});
                }

                if (!body.nodeConfig.displayName || !body.nodeConfig.category) {
                    return res.status(400).json({error: "Missing displayName or category in nodeConfig"});
                }

                // Check uniqueness of displayName within workspace
                const cursor = await db.query(aql`
                  FOR doc IN nodius_node_config
                  FILTER doc.workspace == ${escapeHTML(body.nodeConfig.workspace)}
                    AND doc.displayName == ${escapeHTML(body.nodeConfig.displayName)}
                  LIMIT 1
                  RETURN doc
                `);

                if ((await cursor.all()).length > 0) {
                    return res.status(409).json({error: "Node config with this displayName already exists in workspace"});
                }

                // Generate unique token
                const token_nodeConfig = await createUniqueToken(nodeConfig_collection);

                body.nodeConfig.node.type = token_nodeConfig;
                // Create the node config document
                const now = Date.now();
                const nodeConfigDoc = {
                    ...safeArangoObject(body.nodeConfig),
                    _key: token_nodeConfig,
                    workspace: escapeHTML(body.nodeConfig.workspace),
                    createdTime: now,
                    lastUpdatedTime: now,
                };

                const meta = await nodeConfig_collection.save(nodeConfigDoc);

                return res.status(200).json({...nodeConfigDoc, _key: meta._key});
            } catch (err) {
                console.error("Error creating node config:", err);
                return res.status(500).json({error: "Internal Server Error"});
            }
        });

        /**
         * Update an existing node config
         */
        app.post("/api/nodeconfig/update", async (req: Request, res: Response) => {
            try {
                const body: api_node_config_update = req.body;

                // Basic validation
                if (!body.nodeConfig || !body.nodeConfig._key || !body.nodeConfig.workspace) {
                    return res.status(400).json({error: "Missing required fields"});
                }

                if (!body.nodeConfig.displayName || !body.nodeConfig.category) {
                    return res.status(400).json({error: "Missing displayName or category in nodeConfig"});
                }

                // Ensure the document exists in the workspace
                const existsQuery = aql`
                  FOR doc IN nodius_node_config
                  FILTER doc._key == ${escapeHTML(body.nodeConfig._key)}
                    AND doc.workspace == ${escapeHTML(body.nodeConfig.workspace)}
                  LIMIT 1
                  RETURN doc
                `;
                const existsCursor = await db.query(existsQuery);
                const existing = await existsCursor.next();

                if (!existing) {
                    return res.status(404).json({error: "Node config not found in this workspace"});
                }

                // Check if displayName is being changed and conflicts with another doc
                if (existing.displayName !== body.nodeConfig.displayName) {
                    const conflictQuery = aql`
                      FOR doc IN nodius_node_config
                      FILTER doc.workspace == ${escapeHTML(body.nodeConfig.workspace)}
                        AND doc.displayName == ${escapeHTML(body.nodeConfig.displayName)}
                        AND doc._key != ${escapeHTML(body.nodeConfig._key)}
                      LIMIT 1
                      RETURN doc
                    `;
                    const conflictCursor = await db.query(conflictQuery);
                    const conflict = await conflictCursor.next();

                    if (conflict) {
                        return res.status(409).json({error: "Node config with this displayName already exists in workspace"});
                    }
                }

                // Replace (overwrites all fields except system ones)
                const updatedConfig = {
                    ...safeArangoObject(body.nodeConfig),
                    lastUpdatedTime: Date.now(),
                };
                const meta = await nodeConfig_collection.replace(body.nodeConfig._key, updatedConfig);

                return res.status(200).json({...updatedConfig, _rev: meta._rev});
            } catch (err) {
                console.error("Error updating node config:", err);
                return res.status(500).json({error: "Internal Server Error"});
            }
        });

        /**
         * Change a node config icon
         */
        app.post("/api/nodeconfig/icon", async (req: Request, res: Response) => {
            try {
                const body = req.body as { workspace: string; _key: string; newIcon: string };

                // Basic validation
                if (!body._key || !body.workspace || !body.newIcon) {
                    return res.status(400).json({ error: "Missing required fields" });
                }

                // Check if document exists in workspace
                const existsQuery = aql`
                  FOR doc IN nodius_node_config
                  FILTER doc._key == ${escapeHTML(body._key)}
                    AND doc.workspace == ${escapeHTML(body.workspace)}
                  LIMIT 1
                  RETURN doc
                `;
                const existsCursor = await db.query(existsQuery);
                const existing = await existsCursor.next();

                if (!existing) {
                    return res.status(404).json({ error: "Node config not found in this workspace" });
                }

                // Update the icon
                await nodeConfig_collection.update(body._key, {
                    icon: escapeHTML(body.newIcon),
                    //lastUpdatedTime: Date.now()
                });

                return res.status(200).json({ success: true });
            } catch (err) {
                console.error("Error changing node config icon:", err);
                return res.status(500).json({ error: "Internal Server Error" });
            }
        });

        /**
         * Rename a node config (update displayName)
         */
        app.post("/api/nodeconfig/rename", async (req: Request, res: Response) => {
            try {
                const body = req.body as { workspace: string; _key: string; newDisplayName: string };

                // Basic validation
                if (!body._key || !body.workspace || !body.newDisplayName) {
                    return res.status(400).json({ error: "Missing required fields" });
                }

                // Check if document exists in workspace
                const existsQuery = aql`
                  FOR doc IN nodius_node_config
                  FILTER doc._key == ${escapeHTML(body._key)}
                    AND doc.workspace == ${escapeHTML(body.workspace)}
                  LIMIT 1
                  RETURN doc
                `;
                const existsCursor = await db.query(existsQuery);
                const existing = await existsCursor.next();

                if (!existing) {
                    return res.status(404).json({ error: "Node config not found in this workspace" });
                }

                // Check if new displayName conflicts with another node config
                const conflictQuery = aql`
                  FOR doc IN nodius_node_config
                  FILTER doc.workspace == ${escapeHTML(body.workspace)}
                    AND doc.displayName == ${escapeHTML(body.newDisplayName)}
                    AND doc._key != ${escapeHTML(body._key)}
                  LIMIT 1
                  RETURN doc
                `;
                const conflictCursor = await db.query(conflictQuery);
                const conflict = await conflictCursor.next();

                if (conflict) {
                    return res.status(409).json({ error: "Node config with this displayName already exists in workspace" });
                }

                // Update the displayName
                await nodeConfig_collection.update(body._key, {
                    displayName: escapeHTML(body.newDisplayName),
                    //lastUpdatedTime: Date.now()
                });

                return res.status(200).json({ success: true });
            } catch (err) {
                console.error("Error renaming node config:", err);
                return res.status(500).json({ error: "Internal Server Error" });
            }
        });

        /**
         * Delete a node config
         */
        app.post("/api/nodeconfig/delete", async (req: Request, res: Response) => {
            try {
                const body: api_node_config_delete = req.body;

                // Basic validation
                if (!body._key || !body.workspace) {
                    return res.status(400).json({error: "Missing required fields"});
                }

                // Check if document exists in workspace
                const existsQuery = aql`
                  FOR doc IN nodius_node_config
                  FILTER doc._key == ${escapeHTML(body._key)}
                    AND doc.workspace == ${escapeHTML(body.workspace)}
                  LIMIT 1
                  RETURN doc
                `;
                const existsCursor = await db.query(existsQuery);
                const existing = await existsCursor.next();

                if (!existing) {
                    return res.status(404).json({error: "Node config not found in this workspace"});
                }

                // Delete the document
                await nodeConfig_collection.remove(body._key);

                return res.status(200).json({success: true, _key: body._key});
            } catch (err) {
                console.error("Error deleting node config:", err);
                return res.status(500).json({error: "Internal Server Error"});
            }
        });

    }
}
