/**
 * @file requestBuilder.ts
 * @description REST API endpoints for HTML builder component management
 * @module server/request
 *
 * Handles requests for retrieving HTML builder components used in the visual HTML editor.
 * These components are draggable UI elements that users can add to their pages.
 *
 * Endpoints:
 * - POST /api/builder/components: Get all builder components for a workspace
 *
 * Features:
 * - **Component Library**: Retrieves user-defined components from ArangoDB
 * - **Built-in Components**: Adds default components (Container, Text, Column, Row)
 * - **Workspace Filtering**: Returns only components for the specified workspace
 * - **HTML Class Merging**: Joins component metadata with actual HTML object from nodius_html_class
 * - **Security**: Uses escapeHTML to prevent injection attacks
 *
 * Component Structure:
 * - Each component has metadata (_key, category, icon, workspace)
 * - Linked to an HTML class object via htmlKeyLinked
 * - HTML object contains the actual DOM structure, CSS, and content
 *
 * Built-in Components:
 * - Container: Flexbox block with red outline for visibility
 * - Text: Paragraph element with placeholder text
 * - Column: Flex column layout
 * - Row: Flex row layout
 */

import {HttpServer, Request, Response} from "../http/HttpServer";
import {DocumentCollection} from "arangojs/collections";
import {ensureCollection} from "../utils/arangoUtils";
import {api_category_list} from "../../utils/requests/type/api_workflow.type";
import {aql} from "arangojs";
import escapeHTML from "escape-html";
import {db} from "../server";
import {api_builder_components} from "../../utils/requests/type/api_builder.type";
import {HtmlBuilderComponent} from "../../utils/html/htmlType";

export class RequestBuilder {

    public static init = async (app: HttpServer) => {
        const builderComponent_collection:DocumentCollection = await ensureCollection("nodius_builder_component");
        const class_collection:DocumentCollection = await ensureCollection("nodius_html_class");

        app.post("/api/builder/components", async (req: Request, res: Response) => {
            const body: api_builder_components = req.body;
            if(!body.workspace) {
                res.status(500).end();
                return;
            }

            let query = aql`
                FOR doc IN nodius_builder_component
                FILTER doc.workspace == ${escapeHTML(body.workspace)}
                LET htmlClass = FIRST(
                  FOR obj IN nodius_html_class
                    FILTER obj._key == doc.htmlKeyLinked
                    RETURN obj
                )
                RETURN MERGE(doc, { object: htmlClass.object })
            `;

            const cursor = await db.query(query);
            const components = await cursor.all() as HtmlBuilderComponent[];

            components.push({
                _keys: "0",
                category: "Most Used Components",
                workspace: "root",
                icon: "Square",
                htmlKeyLinked: "0",
                object: {
                    type: "block",
                    domEvents: [],
                    name: "Container",
                    identifier: "0",
                    css:[
                        {
                            selector: "&",
                            rules: [
                                ["outline", "2px solid red"],
                                ["padding", "5px"],
                                ["min-height", "50px"]
                            ]
                        }
                    ],
                    tag: "div",
                },
            });

            components.push({
                _keys: "0",
                category: "Most Used Components",
                workspace: "root",
                icon: "Type",
                htmlKeyLinked: "0",
                object: {
                    type: "text",
                    domEvents: [],
                    name: "Text",
                    identifier: "0",
                    css: [],
                    tag: "p",
                    content: {
                        "en": "Your text here..."
                    },
                }
            });

            components.push({
                _keys: "0",
                category: "Most Used Components",
                workspace: "root",
                icon: "CodeXml",
                htmlKeyLinked: "0",
                object: {
                    type: "html",
                    domEvents: [],
                    name: "Html",
                    identifier: "0",
                    css: [],
                    tag: "div",
                    content: "",
                }
            });

            components.push({
                _keys: "0",
                category: "Most Used Components",
                workspace: "root",
                icon: "Rows3",
                htmlKeyLinked: "0",
                object: {
                    type: "list",
                    identifier: "0",
                    domEvents: [],
                    tag: "div",
                    name: "Column",
                    css: [
                        {
                            selector: "&",
                            rules: [
                                ["display", "flex"],
                                ["flex-direction", "column"],
                                ["outline", "2px solid red"],
                                ["padding", "5px"],
                                ["gap", "10px"],
                                ["min-height", "50px"]
                            ]
                        }
                    ],
                    content: [],
                }
            });
            components.push({
                _keys: "0",
                category: "Most Used Components",
                workspace: "root",
                icon: "Columns3",
                htmlKeyLinked: "0",
                object: {
                    type: "list",
                    identifier: "0",
                    tag: "div",
                    domEvents: [],
                    name:"Row",
                    css: [
                        {
                            selector: "&",
                            rules: [
                                ["display", "flex"],
                                ["flex-direction", "row"],
                                ["outline", "2px solid red"],
                                ["padding", "5px"],
                                ["gap", "10px"],
                                ["min-height", "50px"]
                            ],

                        }
                    ],
                    content: [],
                }
            });

            components.push({
                _keys: "0",
                category: "Most Used Components",
                workspace: "root",
                icon: "Settings",
                htmlKeyLinked: "0",
                object: {
                    type: "icon",
                    identifier: "0",
                    tag: "span",
                    domEvents: [],
                    name:"Icon",
                    css: [
                        {
                            selector: "&",
                            rules: [
                                ["width", "40px"],
                                ["height", "40px"],
                                ["stroke-width", "1.5px"],
                                ["color", "var(--nodius-primary-main)"]
                            ]
                        }
                    ],
                    content: "Settings",
                }
            });

            res.status(200).json(components);
        });
    }
}