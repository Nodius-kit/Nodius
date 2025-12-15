/**
 * @file requestDataType.ts
 * @description REST API endpoints for custom data type and enum management
 * @module server/request
 *
 * Provides CRUD operations for user-defined data types and enums used throughout the Nodius platform.
 * These types define the structure of data that flows through workflows and nodes.
 *
 * Endpoints - Data Types:
 * - POST /api/type/list: List all custom data types for a workspace
 * - POST /api/type/create: Create a new data type definition
 * - POST /api/type/update: Update an existing data type
 * - POST /api/type/delete: Delete a data type
 *
 * Endpoints - Enums:
 * - POST /api/enum/list: List all enums for a workspace
 * - POST /api/enum/create: Create a new enum
 * - POST /api/enum/update: Update an existing enum
 * - POST /api/enum/delete: Delete an enum
 *
 * Features:
 * - **Custom Types**: Users can define complex object structures with typed fields
 * - **Enums**: Define sets of allowed string values
 * - **Workspace Isolation**: Types are scoped to workspaces
 * - **Uniqueness Validation**: Type/enum names must be unique within workspace
 * - **Validation**: Checks for required fields and minimum name length
 * - **Safe Updates**: Uses replace operation to fully update documents
 * - **Security**: Sanitizes all inputs and uses safeArangoObject to prevent injection
 *
 * Database Collections:
 * - nodius_data_type: Stores DataTypeClass objects
 * - nodius_enum: Stores EnumClass objects
 *
 * Use Cases:
 * - Defining API response structures
 * - Creating typed node inputs/outputs
 * - Setting up form field types
 * - Configuring dropdown options with enums
 */

import {HttpServer, Request, Response} from "../http/HttpServer";
import {DocumentCollection} from "arangojs/collections";
import {createUniqueToken, ensureCollection, safeArangoObject} from "../utils/arangoUtils";
import {aql} from "arangojs";
import {db} from "../server";
import {api_enum_delete, api_enum_list, api_type_delete, api_type_list, DataTypeClass, EnumClass} from "@nodius/utils";

export class RequestDataType {
    public static init = async (app: HttpServer) => {
        const dataType_collection: DocumentCollection = await ensureCollection("nodius_data_type");
        const enum_collection: DocumentCollection = await ensureCollection("nodius_enum");

        app.post("/api/type/list", async (req: Request, res: Response) => {
            const body: api_type_list = req.body;

            if (!body.workspace) {
                res.status(500).end();
                return;
            }

            let filters = [aql`doc.workspace == ${body.workspace}`];

            let combinedFilter = filters.reduce(
                (acc, cond) => (acc ? aql`${acc} AND ${cond}` : cond),
                null as any
            );

            const query = aql`
              FOR doc IN nodius_data_type
              FILTER ${combinedFilter} 
              RETURN doc
            `;

            const cursor = await db.query(query);
            const dataType = await cursor.all() as DataTypeClass[];
            res.status(200).json(dataType);
        });

        app.post("/api/type/create", async (req: Request, res: Response) => {
            try {
                const body: Omit<DataTypeClass, "_key"> = req.body;

                // basic validation
                if (!body.workspace || !body.types || !body.name || body.description == undefined) {
                    return res.status(400).json({error: "Missing required fields"});
                }

                // check uniqueness within workspace
                const cursor = await db.query(aql`
                  FOR doc IN nodius_data_type
                  FILTER doc.workspace == ${body.workspace}
                    AND doc.name == ${body.name}
                  LIMIT 1
                  RETURN doc
                `);

                if ((await cursor.all()).length > 0) {
                    return res.status(409).json({error: "Name already exists in workspace"});
                }

                // generate unique token
                const token_type = await createUniqueToken(dataType_collection);

                // create document
                const meta = await dataType_collection.save({
                    ...safeArangoObject(body),
                    _key: token_type,
                });

                return res.status(200).json({...body, _key: meta._key});
            } catch (err) {
                console.error("Error creating type:", err);
                return res.status(500).json({error: "Internal Server Error"});
            }
        });

        app.post("/api/type/update", async (req: Request, res: Response) => {
            try {
                const body: DataTypeClass= req.body;

                // basic validation
                if (!body.workspace || !body.types || !body.name || body.name.length < 2 || body.description == undefined || !body._key) {
                    return res.status(400).json({error: "Missing required fields"});
                }

                // Ensure the doc exists
                const exists = await dataType_collection.documentExists(body._key);
                if (!exists) {
                    return res.status(404).json({error: "Document not found"});
                }

                // Replace (overwrites all fields except system ones)
                const meta = await dataType_collection.replace(body._key, {
                    ...safeArangoObject(body)
                });

                return res.status(200).json({...body, _key: body._key, _rev: meta._rev});
            } catch (err) {
                console.error("Error updating type:", err);
                return res.status(500).json({error: "Internal Server Error"});
            }
        });

        app.post("/api/type/delete", async (req: Request, res: Response) => {
            try {
                const body: api_type_delete = req.body;

                // basic validation
                if (!body.key || !body.workspace) {
                    return res.status(400).json({error: "Missing _key field"});
                }

                // Check if document exists
                const exists = await dataType_collection.documentExists(body.key);
                if (!exists) {
                    return res.status(404).json({error: "Document not found"});
                }

                // Delete the document
                await dataType_collection.remove(body.key);

                return res.status(200).json({success: true, _key: body.key});
            } catch (err) {
                console.error("Error deleting type:", err);
                return res.status(500).json({error: "Internal Server Error"});
            }
        });





        app.post("/api/enum/list", async (req: Request, res: Response) => {
            const body: api_enum_list = req.body;

            if (!body.workspace) {
                res.status(500).end();
                return;
            }

            let filters = [aql`doc.workspace == ${body.workspace}`];

            let combinedFilter = filters.reduce(
                (acc, cond) => (acc ? aql`${acc} AND ${cond}` : cond),
                null as any
            );

            const query = aql`
              FOR doc IN nodius_enum
              FILTER ${combinedFilter}
              RETURN doc
            `;

            const cursor = await db.query(query);
            const dataType = await cursor.all() as EnumClass[];
            res.status(200).json(dataType);
        });

        app.post("/api/enum/create", async (req: Request, res: Response) => {
            try {
                const body: Omit<EnumClass, "_key"> = req.body;

                // basic validation
                if (!body.workspace || !body.enum || !body.name || body.description == undefined) {
                    return res.status(400).json({error: "Missing required fields"});
                }

                // check uniqueness within workspace
                const cursor = await db.query(aql`
                  FOR doc IN nodius_enum
                  FILTER doc.workspace == ${body.workspace}
                    AND doc.name == ${body.name}
                  LIMIT 1
                  RETURN doc
                `);

                if ((await cursor.all()).length > 0) {
                    return res.status(409).json({error: "Name already exists in workspace"});
                }

                // generate unique token
                const token_type = await createUniqueToken(enum_collection);

                // create document
                const meta = await enum_collection.save({
                    ...safeArangoObject(body),
                    _key: token_type,
                });

                return res.status(200).json({...body, _key: meta._key});
            } catch (err) {
                console.error("Error creating type:", err);
                return res.status(500).json({error: "Internal Server Error"});
            }
        });

        app.post("/api/enum/update", async (req: Request, res: Response) => {
            try {
                const body: EnumClass= req.body;

                // basic validation
                if (!body.workspace || !body.enum || !body.name || body.name.length < 2 || body.description == undefined || !body._key) {
                    return res.status(400).json({error: "Missing required fields"});
                }

                // Ensure the doc exists
                const exists = await enum_collection.documentExists(body._key);
                if (!exists) {
                    return res.status(404).json({error: "Document not found"});
                }

                // Replace (overwrites all fields except system ones)
                const meta = await enum_collection.replace(body._key, {
                    ...safeArangoObject(body)
                });

                return res.status(200).json({...body, _key: body._key, _rev: meta._rev});
            } catch (err) {
                console.error("Error updating enum:", err);
                return res.status(500).json({error: "Internal Server Error"});
            }
        });

        app.post("/api/enum/delete", async (req: Request, res: Response) => {
            try {
                const body: api_enum_delete = req.body;

                // basic validation
                if (!body.key || !body.workspace) {
                    return res.status(400).json({error: "Missing _key field"});
                }

                // Check if document exists
                const exists = await enum_collection.documentExists(body.key);
                if (!exists) {
                    return res.status(404).json({error: "Document not found"});
                }

                // Delete the document
                await enum_collection.remove(body.key);

                return res.status(200).json({success: true, _key: body.key});
            } catch (err) {
                console.error("Error deleting enum:", err);
                return res.status(500).json({error: "Internal Server Error"});
            }
        });
    }
}