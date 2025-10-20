import {HttpServer, Request, Response} from "../http/HttpServer";
import {DocumentCollection} from "arangojs/collections";
import {createUniqueToken, ensureCollection} from "../utils/arangoUtils";
import {
    api_category_create,
    api_category_delete,
    api_category_list,
    api_category_rename,
} from "../../utils/requests/type/api_workflow.type";
import {aql} from "arangojs";
import {db} from "../server";
import escapeHTML from 'escape-html';

export class RequestCategory {
    public static init = async (app: HttpServer) => {
        const category_collection: DocumentCollection = await ensureCollection("nodius_category");

        app.post("/api/category/list", async (req: Request, res: Response) => {
            const body: api_category_list = req.body;
            if (!body.workspace) {
                res.status(500).end();
                return;
            }

            // Determine collection based on type (default to workflow for backwards compatibility)
            const type = body.type || "workflow";

            let query = aql`
                FOR doc IN ${category_collection}
                FILTER doc.workspace == ${escapeHTML(body.workspace)}
                AND doc.type == ${escapeHTML(type)}
                RETURN {
                    _key: doc._key,
                    category: doc.category
                }
            `;

            const cursor = await db.query(query);
            res.status(200).json(await cursor.all());
        });

        app.post("/api/category/delete", async (req: Request, res: Response) => {
            const body: api_category_delete = req.body;

            const categoryKey = escapeHTML(body._key);

            // Delete matching category by _key
            const cursor = await db.query(aql`
              FOR c IN ${category_collection}
                FILTER c._key == ${categoryKey}
                REMOVE c IN ${category_collection}
                RETURN OLD
            `);

            const deleted = await cursor.next();
            if (!deleted) {
                return res.status(404).json({error: "Category not found"});
            }
            return res.status(200).json({success: true, deleted});
        });

        app.post("/api/category/rename", async (req: Request, res: Response) => {
            const body: api_category_rename = req.body;

            const categoryKey = escapeHTML(body._key);
            const newName = escapeHTML(body.newName);
            const workspace = escapeHTML(body.workspace);

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

            // Check if new name already exists in this workspace and type
            const duplicateCursor = await db.query(aql`
              FOR c IN ${category_collection}
                FILTER c.workspace == ${workspace}
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
