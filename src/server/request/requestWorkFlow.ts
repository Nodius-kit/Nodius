import {HttpServer, Request, Response} from "../http/HttpServer";
import {DocumentCollection} from "arangojs/collections";
import {createUniqueToken, ensureCollection} from "../utils/arangoUtils";
import {api_category_list, api_graph_create} from "../../utils/requests/type/api_workflow.type";
import {Graph as GraphWF, Node} from "../../utils/graph/graphType";
import {aql} from "arangojs";
import {db} from "../server";

export class RequestWorkFlow {

    public static init = async (app:HttpServer) => {
        const class_collection:DocumentCollection = await ensureCollection("nodius_html_class");
        const category_collection:DocumentCollection = await ensureCollection("nodius_category");
        const graph_collection: DocumentCollection = await ensureCollection("nodius_graphs");
        const node_collection: DocumentCollection = await ensureCollection("nodius_nodes");

        app.post("/api/category/list", async (req: Request, res: Response) => {
            const body: api_category_list = req.body;


            let query = aql`
                FOR doc IN nodius_category
                COLLECT category = doc.category
                RETURN category
            `;

            const cursor = await db.query(query);
            res.status(200).json(await cursor.all());
        });

        app.post("/api/graph/create", async (req: Request, res: Response) => {
            const body = req.body as api_graph_create;
            if(body.fromHtml) {
                const token = await createUniqueToken(graph_collection);
                const graph:Omit<Omit<GraphWF, "sheets">, "_sheets">= {
                    _key: token,
                    name: body.fromHtml.name+"-graph",
                    category: "default",
                    htmlKeyLinked: body.fromHtml._key,
                    version: 0,
                    permission: 0,
                    workspace: body.fromHtml.workspace,
                }
                await graph_collection.save(graph);

                const node:Node<any> = {
                    _key: token+"-root",
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

            } else if(body.fromGraph) {

            } else {
                res.status(500).end();
            }
        });
    }
}