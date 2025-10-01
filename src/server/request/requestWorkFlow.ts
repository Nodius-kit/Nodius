import {HttpServer, Request, Response} from "../http/HttpServer";
import {DocumentCollection, EdgeCollection} from "arangojs/collections";
import {createUniqueToken, ensureCollection, safeArangoObject} from "../utils/arangoUtils";
import {
    api_category_create, api_category_delete,
    api_category_list,
    api_graph_create, api_graph_delete,
    api_graph_html
} from "../../utils/requests/type/api_workflow.type";
import {cleanEdge, cleanNode, Edge, Graph as GraphWF, Node} from "../../utils/graph/graphType";
import {aql} from "arangojs";
import {db} from "../server";
import escapeHTML from 'escape-html';
import {HtmlClass} from "../../utils/html/htmlType";

export class RequestWorkFlow {

    public static init = async (app:HttpServer) => {
        const class_collection:DocumentCollection = await ensureCollection("nodius_html_class");
        const category_collection:DocumentCollection = await ensureCollection("nodius_category");
        const graph_collection: DocumentCollection = await ensureCollection("nodius_graphs");
        const node_collection: DocumentCollection = await ensureCollection("nodius_nodes");

        const edge_collection: EdgeCollection = db.collection("nodius_edges");
        if (!(await edge_collection.exists())) {
            await db.createEdgeCollection("nodius_edges");
        }

        app.post("/api/category/list", async (req: Request, res: Response) => {
            const body: api_category_list = req.body;
            if(!body.workspace) {
                res.status(500).end();
                return;
            }

            let query = aql`
                FOR doc IN nodius_category
                FILTER doc.workspace == ${escapeHTML(body.workspace)}
                COLLECT category = doc.category
                RETURN category
            `;

            const cursor = await db.query(query);
            res.status(200).json(await cursor.all());
        });

        app.post("/api/category/delete", async (req: Request, res: Response) => {
            const body: api_category_delete = req.body;

            const workspace = escapeHTML(body.workspace);
            const key = escapeHTML(body._key);

            // Delete matching category
            const cursor = await db.query(aql`
              FOR c IN nodius_category
                FILTER c.workspace == ${workspace} 
                AND c._key == ${key}
                REMOVE c IN nodius_category
                RETURN OLD
            `);

            const deleted = await cursor.next();
            if (!deleted) {
                return res.status(404).json({ error: "Category not found" });
            }
            return res.status(200).json({ success: true, deleted });
        });

        app.post("/api/category/create", async (req: Request, res: Response) => {
            const body: api_category_create = req.body;

            // Sanitize inputs
            const workspace = escapeHTML(body.workspace);
            const categoryName = escapeHTML(body.category);

            // Check if category already exists
            const cursor = await db.query(aql`
              FOR c IN nodius_category
                FILTER c.workspace == ${workspace} 
                AND c.category == ${categoryName}
                LIMIT 1
                RETURN c
            `);

            const existing = await cursor.next();

            if (existing) {
                return res.status(400).json({ error: "Category already exists in this workspace" });
            }

            // Create unique key and save
            const token_category = await createUniqueToken(category_collection);
            const category = {
                _key: token_category,
                workspace,
                category: categoryName,
            };

            await category_collection.save(category);
            return res.status(200).json({ success: true, _key: token_category });
        })

        app.post("/api/graph/delete", async (req: Request, res: Response) => {
            const body = req.body as api_graph_delete;
            if(body.htmlToken) {
                let query = aql`
                        FOR doc IN nodius_html_class
                        FILTER doc._key == ${escapeHTML(body.htmlToken)}
                        RETURN doc
                    `;
                let cursor = await db.query(query);
                const html:HtmlClass = (await cursor.all())[0];
                if(!html) {
                    res.status(500).end();
                    return;
                }


                // Delete matching html
                cursor = await db.query(aql`
                  FOR doc IN nodius_html_class
                    FILTER doc._key == ${escapeHTML(body.htmlToken)}
                    REMOVE doc IN nodius_html_class
                `);

                if(html.graphKeyLinked) {
                    // Delete linked graph
                    cursor = await db.query(aql`
                      FOR doc IN nodius_graphs
                        FILTER doc._key == ${escapeHTML(html.graphKeyLinked)}
                        REMOVE doc IN nodius_graphs
                    `);

                    cursor = await db.query(aql`
                      FOR doc IN nodius_nodes
                        FILTER doc.graphKey == ${escapeHTML(html.graphKeyLinked)}
                        REMOVE doc IN nodius_nodes
                    `);

                    cursor = await db.query(aql`
                      FOR doc IN nodius_edges
                        FILTER doc.graphKey == ${escapeHTML(html.graphKeyLinked)}
                        REMOVE doc IN nodius_edges
                    `);
                }

                if(body.graphToken && body.graphToken  === html.graphKeyLinked) {
                    res.status(200).end();
                    return;
                }
            }


            if(body.graphToken) {
                let cursor = await db.query(aql`
                      FOR doc IN nodius_graphs
                        FILTER doc._key == ${escapeHTML(body.graphToken)}
                        REMOVE doc IN nodius_graphs
                    `);

                cursor = await db.query(aql`
                      FOR doc IN nodius_nodes
                        FILTER doc.graphKey == ${escapeHTML(body.graphToken)}
                        REMOVE doc IN nodius_nodes
                    `);

                cursor = await db.query(aql`
                      FOR doc IN nodius_edges
                        FILTER doc.graphKey == ${escapeHTML(body.graphToken)}
                        REMOVE doc IN nodius_edges
                    `);
            }
            res.status(200).end();
            return;
        })

        app.post("/api/graph/get", async (req: Request, res: Response) => {
            const body = req.body as api_graph_html;
            if(body.retrieveHtml) {
                if(body.retrieveHtml.token) {
                    let query = aql`
                        FOR doc IN nodius_html_class
                        FILTER doc._key == ${escapeHTML(body.retrieveHtml.token)} AND doc.workspace == ${escapeHTML(body.workspace)}
                        RETURN doc
                    `;
                    const cursor = await db.query(query);
                    const html:HtmlClass = (await cursor.all())[0];

                    if(!html) {
                        res.status(200).json(undefined);
                        return;
                    }
                    const graph = await this.buildGraph(
                        html.graphKeyLinked,
                        body.retrieveHtml?.buildGraph ?? false
                    );
                    res.status(200).json({
                        html: html,
                        graph: graph,
                    });
                } else {
                    // get all html class with offset/length for pagination
                    if(body.retrieveHtml.length == undefined || body.retrieveHtml.offset == undefined) {
                        res.status(500).end();
                        return;
                    }
                    let query = aql`
                        FOR doc IN nodius_html_class
                        FILTER doc.workspace == ${escapeHTML(body.workspace)}
                        SORT doc.lastUpdatedTime DESC
                        LIMIT ${parseInt(escapeHTML(body.retrieveHtml.offset+""))}, ${parseInt(escapeHTML(body.retrieveHtml.length+""))}
                        RETURN doc
                    `;
                    const cursor = await db.query(query);
                    const htmLClasses:HtmlClass[] = await cursor.all();
                    const output = await Promise.all(
                        htmLClasses.map(async (html) => {
                            const graph = await this.buildGraph(
                                html.graphKeyLinked,
                                body.retrieveHtml?.buildGraph ?? false
                            );

                            return {
                                html,
                                graph,
                            };
                        })
                    );
                    res.status(200).json(output);
                }
            } else if(body.retrieveGraph) {
                if(body.retrieveGraph.token) {
                    const graph = await this.buildGraph(
                        body.retrieveGraph.token,
                        body.retrieveGraph?.buildGraph ?? false
                    );
                    res.status(200).json(graph);
                } else {
                    if(body.retrieveGraph.length == undefined || body.retrieveGraph.offset == undefined) {
                        res.status(500).end();
                        return;
                    }
                    let query = aql`
                        FOR doc IN nodius_graphs
                        FILTER doc.htmlKeyLinked == null AND doc.workspace == ${escapeHTML(body.workspace)}
                        SORT doc.lastUpdatedTime DESC
                        LIMIT ${escapeHTML(body.retrieveGraph.offset+"")}, ${escapeHTML(body.retrieveGraph.length+"")}
                        RETURN doc
                    `;
                    const cursor = await db.query(query);
                    const graphs:GraphWF[] = await cursor.all();

                    if(body.retrieveGraph.buildGraph) {
                        const output = await Promise.all(
                            graphs.map(async (unBuildedGraph) => {
                                return await this.buildGraph(
                                    unBuildedGraph._key, true
                                );
                            })
                        );
                        res.status(200).json(output);
                        return;
                    }
                    res.status(200).json(graphs);
                }
            } else {
                res.status(500).end();
            }
        });

        app.post("/api/graph/create", async (req: Request, res: Response) => {
            const body = req.body as api_graph_create;

            if(body.htmlClass) {

                const token_graph = await createUniqueToken(graph_collection);
                const token_html = await createUniqueToken(class_collection);
                const classHtml: HtmlClass = {
                    ...safeArangoObject(body.htmlClass),
                    graphKeyLinked: token_graph,
                    _key: token_html,
                    createdTime: Date.now(),
                    lastUpdatedTime: Date.now(),
                    version: 0
                }
                await class_collection.save(classHtml);

                const graph: Omit<GraphWF, "sheets" | "_sheets"> = {
                    _key: token_graph,
                    name: body.htmlClass.name + "-graph",
                    category: "default",
                    htmlKeyLinked: token_html,
                    version: 0,
                    permission: 0,
                    workspace: body.htmlClass.workspace,
                    createdTime: Date.now(),
                    lastUpdatedTime: Date.now(),
                    sheetsList: ["main"]
                }
                await graph_collection.save(graph);

                const node: Node<any> = {
                    _key: token_graph+"-root",
                    graphKey: token_graph,
                    sheetIndex: 0,
                    type: "html",
                    handles: {
                        0: {
                            position: "fix",
                            point: [
                                {
                                    id: "0",
                                    type: "out",
                                    accept: "event[]"
                                }
                            ]
                        }
                    },
                    posX: 0,
                    posY: 0,
                    size: {
                        width: 640,
                        height: 360,
                        dynamic: true,
                    },
                };
                await node_collection.save(node);

                res.status(200).end();
            } else {
                res.status(500).end();
            }

        });
    }

    public static async buildGraph(graphKey:string, build:boolean):Promise<GraphWF> {
        const graphQuery = aql`
            FOR g IN nodius_graphs
            FILTER g._key == ${graphKey}
            RETURN g
        `;
        const graphCursor = await db.query(graphQuery);
        const graphData:GraphWF = (await graphCursor.all())[0];
        if(build) {
            const nodesQuery = aql`
                FOR n IN nodius_nodes
                FILTER n.graphKey == ${graphKey}
                SORT n.sheetIndex ASC
                RETURN n
            `;
            const nodesCursor = await db.query(nodesQuery);
            const allNodes:Node<any>[] = await nodesCursor.all();
            const edgesQuery = aql`
                FOR e IN nodius_edges
                FILTER e.graphKey == ${graphKey}
                SORT e.sheetIndex ASC
                RETURN e
            `;
            const edgesCursor = await db.query(edgesQuery);
            const allEdges:Edge[] = await edgesCursor.all();
            graphData._sheets = {};
            for(let i = 0; i < graphData.sheetsList.length; i++){
                graphData._sheets[graphData.sheetsList[i]] = {
                    nodes: allNodes.filter((node) => node.sheetIndex === i).map((node) => cleanNode(node)),
                    edges: allEdges.filter((edge) => edge.sheetIndex === i).map((edge) => cleanEdge(edge)),
                }
            }
        }


        return graphData;
    }
}