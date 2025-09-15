import {HttpServer, Request, Response} from "../http/HttpServer";
import {DocumentCollection} from "arangojs/collections";
import {createUniqueToken, ensureCollection, safeArangoObject} from "../utils/arangoUtils";
import {api_category_list, api_graph_create, api_graph_html} from "../../utils/requests/type/api_workflow.type";
import {Graph as GraphWF, Node} from "../../utils/graph/graphType";
import {aql} from "arangojs";
import {db} from "../server";
import escapeHTML from "escape-html";

export class RequestWorkFlow {

    public static init = async (app:HttpServer) => {
        const class_collection:DocumentCollection = await ensureCollection("nodius_html_class");
        const category_collection:DocumentCollection = await ensureCollection("nodius_category");
        const graph_collection: DocumentCollection = await ensureCollection("nodius_graphs");
        const node_collection: DocumentCollection = await ensureCollection("nodius_nodes");

        app.post("/api/category/list", async (req: Request, res: Response) => {
            const body: api_category_list = req.body;
            if(!body.workspace) {
                res.status(500).end();
                return;
            }

            let query = aql`
                FOR doc IN nodius_category
                FILTER doc.workspace == ${body.workspace}
                COLLECT category = doc.category
                RETURN category
            `;

            const cursor = await db.query(query);
            res.status(200).json(await cursor.all());
        });

        app.post("/api/graph/get", async (req: Request, res: Response) => {
            const body = req.body as api_graph_html;

            // body.token is graph key
            // retrieve graph with this key,
            // build the Graph type only if body.buildGraph is true, else return only information
            // retrieve html_class with the htmlKeyLinked of the graph
            // if no body.token is provided, return all graph information with html

        });

        app.post("/api/graph/create", async (req: Request, res: Response) => {
            const body = req.body as api_graph_create;

            const token_graph = await createUniqueToken(graph_collection);
            const token_html = await createUniqueToken(class_collection);
            await class_collection.save({
                _key: token_html,
                ...safeArangoObject(req.body.htmlClass ?? {}),
                graphKeyLinked: token_graph

            });
            const graph:Omit<Omit<GraphWF, "sheets">, "_sheets">= {
                _key: token_graph,
                name: body.htmlClass.name+"-graph",
                category: "default",
                htmlKeyLinked: token_html,
                version: 0,
                permission: 0,
                workspace: body.htmlClass.workspace,
            }
            await graph_collection.save(graph);

            const node:Node<any> = {
                _key: token_graph+"-root",
                type: "html",
                handles: {
                    0: {
                        position:"fix",
                        point: [
                            {
                                id: "0"
                            }
                        ]
                    }
                },
                posX: 0,
                posY: 0,
                size: "auto",
            };
            await node_collection.save(node);

            res.status(200).json(graph);

        });
    }
}