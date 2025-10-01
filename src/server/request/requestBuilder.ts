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
                    name: "Container",
                    identifier: "0",
                    delimiter: true,
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
                    name: "Text",
                    identifier: "0",
                    delimiter: true,
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
                icon: "Rows3",
                htmlKeyLinked: "0",
                object: {
                    type: "list",
                    identifier: "0",
                    tag: "div",
                    name: "Column",
                    delimiter: true,
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
                    name:"Row",
                    delimiter: true,
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

            res.status(200).json(components);
        });
    }
}