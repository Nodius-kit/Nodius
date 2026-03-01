/**
 * @file requestCategory.ts
 * @description REST API endpoints for category management across different resource types
 * @module server/request
 *
 * Provides CRUD operations for categories used to organize workflows, nodes, and other resources.
 * Categories are workspace-scoped and type-specific (e.g., workflow categories vs builder categories).
 *
 * Endpoints:
 * - POST /api/category/list: List all categories for a workspace and type
 * - POST /api/category/create: Create a new category
 * - POST /api/category/rename: Rename an existing category
 * - POST /api/category/delete: Delete a category
 *
 * Features:
 * - **Multi-Type Support**: Categories can be for workflows, builders, etc. (via type field)
 * - **Workspace Isolation**: Each workspace has its own set of categories
 * - **Uniqueness Validation**: Prevents duplicate category names within same workspace/type
 * - **Safe Updates**: Validates existence before rename/delete operations
 * - **Security**: All user inputs are sanitized with escapeHTML
 *
 * Database Schema:
 * - Collection: nodius_category
 * - Fields: _key, workspace, type, category (name)
 * - Uniqueness constraint: workspace + type + category
 *
 * Use Cases:
 * - Organizing workflows into projects or modules
 * - Grouping builder components by function
 * - Categorizing node types for better discoverability
 */

import {HttpServer, Request, Response} from "../http/HttpServer";
import {DocumentCollection} from "arangojs/collections";
import {createUniqueToken, ensureCollection} from "../utils/arangoUtils";
import {
    api_category_create,
    api_category_delete,
    api_category_list,
    api_category_rename,
    CategoryData
} from "@nodius/utils";
import {aql} from "arangojs";
import {db} from "../server";
import escapeHTML from 'escape-html';
import {getUserWorkspace, verifyWorkspaceAccess} from "../auth/workspaceAccess";

export class RequestCategory {
    public static init = async (app: HttpServer) => {
        const category_collection: DocumentCollection = await ensureCollection("nodius_category");

        app.post("/api/category/list", async (req: Request, res: Response) => {
            const body: api_category_list = req.body;
            const { user, workspaces } = getUserWorkspace(req);

            // Determine collection based on type (default to workflow for backwards compatibility)
            const type = body.type || "workflow";

            let query = workspaces.length > 0 ? aql`
                FOR doc IN ${category_collection}
                FILTER doc.workspace IN ${workspaces}
                AND doc.type == ${escapeHTML(type)}
                RETURN {
                    _key: doc._key,
                    category: doc.category
                }
            ` : aql`
                FOR doc IN ${category_collection}
                FILTER doc.type == ${escapeHTML(type)}
                RETURN {
                    _key: doc._key,
                    category: doc.category
                }
            `;

            const cursor = await db.query(query);
            res.status(200).json(await cursor.all() as CategoryData[]);
        });

        app.post("/api/category/delete", async (req: Request, res: Response) => {
            const body: api_category_delete = req.body;
            const { user } = getUserWorkspace(req);

            const categoryKey = escapeHTML(body._key);

            // Fetch category first to verify workspace access
            const fetchCursor = await db.query(aql`
              FOR c IN ${category_collection}
                FILTER c._key == ${categoryKey}
                LIMIT 1
                RETURN c
            `);
            const existing = await fetchCursor.next();
            if (!existing) {
                return res.status(404).json({error: "Category not found"});
            }

            const access = verifyWorkspaceAccess(user, existing.workspace);
            if (!access.allowed) return res.status(403).json({ error: access.error });

            // Delete matching category by _key
            const cursor = await db.query(aql`
              FOR c IN ${category_collection}
                FILTER c._key == ${categoryKey}
                REMOVE c IN ${category_collection}
                RETURN OLD
            `);

            const deleted = await cursor.next();
            return res.status(200).json({success: true, deleted});
        });

        app.post("/api/category/rename", async (req: Request, res: Response) => {
            const body: api_category_rename = req.body;
            const { user } = getUserWorkspace(req);

            const categoryKey = escapeHTML(body._key);
            const newName = escapeHTML(body.newName);

            // Check if the category exists
            const checkCursor = await db.query(aql`
              FOR c IN ${category_collection}
                FILTER c._key == ${categoryKey}
                RETURN c
            `);

            const existingCategory = await checkCursor.next();
            if (!existingCategory) {
                return res.status(404).json({error: "Category not found"});
            }

            const access = verifyWorkspaceAccess(user, existingCategory.workspace);
            if (!access.allowed) return res.status(403).json({ error: access.error });

            // Check if new name already exists in this workspace and type
            const duplicateCursor = await db.query(aql`
              FOR c IN ${category_collection}
                FILTER c.workspace == ${existingCategory.workspace}
                AND c.category == ${newName}
                AND c.type == ${existingCategory.type}
                AND c._key != ${categoryKey}
                LIMIT 1
                RETURN c
            `);

            const duplicate = await duplicateCursor.next();
            if (duplicate) {
                return res.status(400).json({error: "A category with this name already exists"});
            }

            // Update the category name
            const updateCursor = await db.query(aql`
              FOR c IN ${category_collection}
                FILTER c._key == ${categoryKey}
                UPDATE c WITH { category: ${newName} } IN ${category_collection}
                RETURN NEW
            `);

            const updated = await updateCursor.next();
            return res.status(200).json({success: true, updated});
        });

        app.post("/api/category/create", async (req: Request, res: Response) => {
            const body: api_category_create = req.body;
            const { user } = getUserWorkspace(req);
            if (!body.workspace) return res.status(400).json({ error: "Missing workspace" });
            const access = verifyWorkspaceAccess(user, body.workspace);
            if (!access.allowed) return res.status(403).json({ error: access.error });

            // Sanitize inputs
            const workspace = escapeHTML(body.workspace);
            const categoryName = escapeHTML(body.category);

            // Determine collection based on type (default to workflow for backwards compatibility)
            const type = body.type || "workflow";

            // Check if category already exists
            const cursor = await db.query(aql`
              FOR c IN ${category_collection}
                FILTER c.workspace == ${workspace}
                AND c.category == ${categoryName}
                AND c.type == ${escapeHTML(type)}
                LIMIT 1
                RETURN c
            `);

            const existing = await cursor.next();

            if (existing) {
                return res.status(400).json({error: "Category already exists in this workspace"});
            }

            // Create unique key and save
            const token_category = await createUniqueToken(category_collection);
            const category = {
                _key: token_category,
                workspace: workspace,
                type: type,
                category: categoryName,
            };

            await category_collection.save(category);
            return res.status(200).json({success: true, _key: token_category});
        });
    };
}
