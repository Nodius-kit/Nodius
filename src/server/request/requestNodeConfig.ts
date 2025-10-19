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
    api_node_config_update
} from "../../utils/requests/type/api_nodeconfig.type";
import {aql} from "arangojs";
import {db} from "../server";
import escapeHTML from 'escape-html';
import {NodeTypeConfig} from "../../utils/graph/graphType";

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

        // ==================== NODE CATEGORY ENDPOINTS ====================

        /**
         * List all node categories for a workspace
         */
        app.post("/api/nodeconfig/category/list", async (req: Request, res: Response) => {
            try {
                const body: api_node_category_list = req.body;

                if (!body.workspace) {
                    return res.status(400).json({error: "Missing workspace field"});
                }

                const query = aql`
                  FOR doc IN nodius_node_category
                  FILTER doc.workspace == ${escapeHTML(body.workspace)}
                  COLLECT category = doc.category
                  RETURN category
                `;

                const cursor = await db.query(query);
                const categories = await cursor.all();
                return res.status(200).json(categories);
            } catch (err) {
                console.error("Error listing node categories:", err);
                return res.status(500).json({error: "Internal Server Error"});
            }
        });

        /**
         * Create a new node category
         */
        app.post("/api/nodeconfig/category/create", async (req: Request, res: Response) => {
            try {
                const body: api_node_category_create = req.body;

                // Sanitize inputs
                const workspace = escapeHTML(body.workspace);
                const categoryName = escapeHTML(body.category);

                if (!workspace || !categoryName) {
                    return res.status(400).json({error: "Missing required fields"});
                }

                // Check if category already exists
                const cursor = await db.query(aql`
                  FOR c IN nodius_node_category
                    FILTER c.workspace == ${workspace}
                    AND c.category == ${categoryName}
                    LIMIT 1
                    RETURN c
                `);

                const existing = await cursor.next();

                if (existing) {
                    return res.status(400).json({error: "Category already exists in this workspace"});
                }

                // Create unique key and save
                const token_category = await createUniqueToken(nodeCategory_collection);
                const category = {
                    _key: token_category,
                    workspace,
                    category: categoryName,
                };

                await nodeCategory_collection.save(category);
                return res.status(200).json({success: true, _key: token_category, category: categoryName});
            } catch (err) {
                console.error("Error creating node category:", err);
                return res.status(500).json({error: "Internal Server Error"});
            }
        });

        /**
         * Delete a node category
         */
        app.post("/api/nodeconfig/category/delete", async (req: Request, res: Response) => {
            try {
                const body: api_node_category_delete = req.body;

                const workspace = escapeHTML(body.workspace);
                const key = escapeHTML(body._key);

                if (!workspace || !key) {
                    return res.status(400).json({error: "Missing required fields"});
                }

                // Delete matching category
                const cursor = await db.query(aql`
                  FOR c IN nodius_node_category
                    FILTER c.workspace == ${workspace}
                    AND c._key == ${key}
                    REMOVE c IN nodius_node_category
                    RETURN OLD
                `);

                const deleted = await cursor.next();
                if (!deleted) {
                    return res.status(404).json({error: "Category not found"});
                }

                return res.status(200).json({success: true, deleted});
            } catch (err) {
                console.error("Error deleting node category:", err);
                return res.status(500).json({error: "Internal Server Error"});
            }
        });
    }
}
