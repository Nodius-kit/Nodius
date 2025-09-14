import {HttpServer, Request, Response} from "../http/HttpServer";
import {aql} from "arangojs";
import {DocumentCollection, EdgeCollection} from "arangojs/collections";
import {createUniqueToken, ensureCollection} from "../utils/arangoUtils";
import {db} from "../server";
import {api_graph_create} from "../../utils/requests/type/api_workflow.type";
import {Graph as GraphWF, NodeTypeHtml, Node} from "../../utils/graph/graphType";

export class requestGraph {
    public static init = async (app: HttpServer) => {
        const graph_collection: DocumentCollection = await ensureCollection("nodius_graphs");
        const node_collection: DocumentCollection = await ensureCollection("nodius_nodes");

        const edge_collection_name = "nodius_edges";
        const edge_collection: EdgeCollection = db.collection("nodius_edges");
        if (!(await edge_collection.exists())) {
            await db.createEdgeCollection(edge_collection_name);
        }

        app.post("/api/graph/list/:category?", async (req: Request, res: Response) => {
            const category = req.params?.category;
            let query;
            if (category) {
                query = aql`
                    FOR doc IN nodius_graphs
                    FILTER doc.category == ${category}
                    RETURN doc
                `;
            } else {
                query = aql`
                    FOR doc IN nodius_graphs
                    RETURN doc
                `;
            }
            // list all graph with category, or if category is null list all

        });


        app.post("/api/graph/categories", async (req: Request, res: Response) => {
            // list all graph categories

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
        app.post("/api/graph/update", async (req: Request, res: Response) => {
            // update an entirely graph
        });
        app.post("/api/htmlclass/delete", async (req: Request, res: Response) => {
            // delete a graph
        });
    }
}
