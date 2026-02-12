/**
 * @file requestWorkFlow.ts
 * @description REST API endpoints for workflow/graph management and HTML class integration
 * @module server/request
 *
 * Manages visual workflows (graphs) and their associated HTML classes. Workflows are
 * node-based diagrams where each node represents an operation or data transformation.
 * HTML classes can have linked workflows for dynamic behavior.
 *
 * Endpoints:
 * - POST /api/graph/get: Retrieve graphs or HTML classes with optional graph building
 * - POST /api/graph/create: Create new HTML class with linked graph
 * - POST /api/graph/delete: Delete graph and/or HTML class with cascade
 *
 * Features:
 * - **Dual Retrieval Modes**: Get HTML classes or standalone graphs
 * - **Pagination Support**: List with offset/length for large datasets
 * - **Graph Building**: Optional expansion of graph with nodes and edges
 * - **Sheet Support**: Multi-sheet graphs (multiple canvases per workflow)
 * - **Cascade Deletion**: Deleting HTML class also removes linked graph, nodes, edges
 * - **Linked Architecture**: HTML classes reference graphs, graphs reference HTML node
 * - **Versioning**: Tracks creation/update timestamps and version numbers
 * - **Security**: All inputs sanitized with escapeHTML
 *
 * Database Collections:
 * - nodius_graphs: Graph metadata (name, category, sheets list)
 * - nodius_nodes: Individual workflow nodes
 * - nodius_edges: Connections between nodes
 * - nodius_html_class: HTML templates with optional linked workflows
 *
 * Graph Structure:
 * - Graph contains metadata + sheetsList (map of sheet IDs to names)
 * - When built, _sheets is populated with nodes and edges per sheet
 * - cleanNode/cleanEdge remove internal metadata before sending to client
 * - onlyFirstSheet option limits building to main sheet for performance
 *
 * HTML-Graph Relationship:
 * - HTML class has graphKeyLinked pointing to graph _key
 * - Graph has htmlKeyLinked pointing back to HTML class _key
 * - Graph has htmlNodeKey pointing to the node containing HTML object data
 * - Bidirectional relationship allows navigation both ways
 *
 * Use Cases:
 * - Creating interactive HTML components with workflow logic
 * - Building standalone automation workflows
 * - Managing reusable HTML templates
 * - Paginated browsing of user's workflows and components
 */

import {HttpServer, Request, Response} from "../http/HttpServer";
import {DocumentCollection, EdgeCollection} from "arangojs/collections";
import {createUniqueToken, ensureCollection, safeArangoObject} from "../utils/arangoUtils";

import {
    api_graph_create, api_graph_delete,
    api_graph_html,
    cleanEdge,
    cleanNode,
    Edge,
    Graph as GraphWF,
    Node,
    NodeTypeEntryType,
    NodeTypeEntryTypeConfig, NodeTypeHtmlConfig,
    HtmlClass,
    deepCopy,
    createNodeFromConfig,
    NodeTypeStarterConfig,
    NodeTypeReturnConfig,
    flatEdgeMap,
    getGraphBounds,
    generateGraphSVGString
} from "@nodius/utils";

import {aql} from "arangojs";
import {db, webSocketManager} from "../server";
import escapeHTML from 'escape-html';

import {CloudAlert} from "lucide-static"

export class RequestWorkFlow {

    public static init = async (app:HttpServer) => {
        const class_collection:DocumentCollection = await ensureCollection("nodius_html_class");
        const graph_collection: DocumentCollection = await ensureCollection("nodius_graphs");
        const node_collection: DocumentCollection = await ensureCollection("nodius_nodes");

        const edge_collection: EdgeCollection = db.collection("nodius_edges");
        if (!(await edge_collection.exists())) {
            await db.createEdgeCollection("nodius_edges");
        }

        app.post("/api/graph/rename", async (req: Request, res: Response) => {
            try {
                const body = req.body as { htmlToken?: string; graphToken?: string; newName: string };

                if (!body.newName || (!body.htmlToken && !body.graphToken)) {
                    return res.status(400).json({ error: "Missing token or newName" });
                }

                if (body.htmlToken) {
                    // Rename HTML class
                    const query = aql`
                        FOR doc IN nodius_html_class
                        FILTER doc._key == ${escapeHTML(body.htmlToken)}
                        RETURN doc
                    `;
                    const cursor = await db.query(query);
                    const html: HtmlClass = (await cursor.all())[0];

                    if (!html) {
                        return res.status(404).json({ error: "HTML class not found" });
                    }

                    const conflictQuery = aql`
                        FOR doc IN nodius_html_class
                        FILTER doc.workspace == ${escapeHTML(html.workspace)}
                            AND doc.name == ${escapeHTML(body.newName)}
                            AND doc._key != ${escapeHTML(body.htmlToken)}
                        LIMIT 1
                        RETURN doc
                    `;
                    const conflictCursor = await db.query(conflictQuery);
                    const conflict = await conflictCursor.next();

                    if (conflict) {
                        return res.status(409).json({ error: "HTML class with this name already exists in workspace" });
                    }

                    await class_collection.update(body.htmlToken, {
                        name: escapeHTML(body.newName),
                        lastUpdatedTime: Date.now()
                    });

                    return res.status(200).json({ success: true });
                } else if (body.graphToken) {
                    // Rename standalone graph
                    const query = aql`
                        FOR doc IN nodius_graphs
                        FILTER doc._key == ${escapeHTML(body.graphToken)}
                        RETURN doc
                    `;
                    const cursor = await db.query(query);
                    const graph = (await cursor.all())[0];

                    if (!graph) {
                        return res.status(404).json({ error: "Graph not found" });
                    }

                    const conflictQuery = aql`
                        FOR doc IN nodius_graphs
                        FILTER doc.workspace == ${escapeHTML(graph.workspace)}
                            AND doc.name == ${escapeHTML(body.newName)}
                            AND doc._key != ${escapeHTML(body.graphToken)}
                            AND doc.htmlKeyLinked == null
                        LIMIT 1
                        RETURN doc
                    `;
                    const conflictCursor = await db.query(conflictQuery);
                    const conflict = await conflictCursor.next();

                    if (conflict) {
                        return res.status(409).json({ error: "Graph with this name already exists in workspace" });
                    }

                    await graph_collection.update(body.graphToken, {
                        name: escapeHTML(body.newName),
                        lastUpdatedTime: Date.now()
                    });

                    return res.status(200).json({ success: true });
                }
            } catch (err) {
                console.error("Error renaming:", err);
                return res.status(500).json({ error: "Internal Server Error" });
            }
        });

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
                    let cursor = await db.query(query);
                    const html:HtmlClass = (await cursor.all())[0];

                    if(!html) {
                        res.status(200).json(undefined);
                        return;
                    }

                    const nodeKey = html.htmlNodeKey;
                    query = aql`
                        FOR doc IN nodius_nodes
                        FILTER doc._key == ${escapeHTML(nodeKey)}
                        RETURN doc
                    `;
                    cursor = await db.query(query);
                    const nodeHtml:Node<any> = (await cursor.all())[0];
                    html.object = nodeHtml.data;

                    const graph = await this.buildGraph(
                        html.graphKeyLinked,
                        {
                            build: body.retrieveHtml.buildGraph ?? false,
                            onlyFirstSheet: body.retrieveGraph?.onlyFirstSheet ?? false
                        }
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
                    let cursor = await db.query(query);
                    const htmLClasses:HtmlClass[] = await cursor.all();
                    const output = await Promise.all(
                        htmLClasses.map(async (html) => {
                            const graph = await this.buildGraph(
                                html.graphKeyLinked,
                                {
                                    build: body.retrieveHtml?.buildGraph ?? false,
                                    onlyFirstSheet: body.retrieveGraph?.onlyFirstSheet ?? false
                                }
                            );

                            const nodeKey = html.htmlNodeKey;
                            query = aql`
                                FOR doc IN nodius_nodes
                                FILTER doc._key == ${escapeHTML(nodeKey)}
                                RETURN doc
                            `;
                            cursor = await db.query(query);
                            const nodeHtml:Node<any> = (await cursor.all())[0];
                            html.object = nodeHtml.data;

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
                        {
                            build:  body.retrieveGraph?.buildGraph ?? false,
                            onlyFirstSheet: body.retrieveGraph?.onlyFirstSheet ?? false
                        }
                    );
                    res.status(200).json(graph);
                } else {
                    if(body.retrieveGraph.length == undefined || body.retrieveGraph.offset == undefined) {
                        res.status(500).end();
                        return;
                    }

                    const offset = Number(body.retrieveGraph.offset);
                    const limit = Number(body.retrieveGraph.length);

                    if (!Number.isInteger(offset) || !Number.isInteger(limit) || offset < 0 || limit < 1) {
                        res.status(400).json({ error: "Invalid pagination parameters" });
                        return;
                    }

                    const query = aql`
                        FOR doc IN nodius_graphs
                            FILTER doc.htmlKeyLinked == null
                            AND doc.workspace == ${escapeHTML(body.workspace)}
                            AND doc.metadata.invisible != true
                            SORT doc.lastUpdatedTime DESC
                            LIMIT ${offset}, ${limit}
                            RETURN doc
                    `;

                    const cursor = await db.query(query);
                    const graphs:GraphWF[] = await cursor.all();

                    if(body.retrieveGraph.buildGraph) {
                        const output = await Promise.all(
                            graphs.map(async (unBuildedGraph) => {
                                return await this.buildGraph(
                                    unBuildedGraph._key,
                                    {
                                        build: body.retrieveGraph?.buildGraph ?? false,
                                        onlyFirstSheet: body.retrieveGraph?.onlyFirstSheet ?? false
                                    }
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

                const htmlObject = deepCopy(body.htmlClass.object);
                delete (body.htmlClass as any).object;

                const graph: Omit<GraphWF, "sheets" | "_sheets"> = {
                    _key: token_graph,
                    name: body.htmlClass.name + "-graph",
                    category: "default",
                    nodeKeyLinked: body.nodeKeyLinked,
                    htmlKeyLinked: token_html,
                    version: 0,
                    permission: 0,
                    workspace: body.htmlClass.workspace,
                    createdTime: Date.now(),
                    lastUpdatedTime: Date.now(),
                    sheetsList: {"0": "main"},
                    metadata: body.graphMetaData
                }
                await graph_collection.save(graph);

                const nodeRoot = createNodeFromConfig<any>(
                    NodeTypeHtmlConfig,
                    token_graph+"-root",
                    token_graph,
                    "0"
                );
                nodeRoot.data = htmlObject;
                await node_collection.save(nodeRoot);


                const classHtml: HtmlClass = {
                    ...safeArangoObject(body.htmlClass),
                    htmlNodeKey: nodeRoot._key,
                    graphKeyLinked: token_graph,
                    _key: token_html,
                    createdTime: Date.now(),
                    lastUpdatedTime: Date.now(),
                    version: 0
                }
                await class_collection.save(classHtml);

                res.status(200).json(graph);
            } else if(body.graph) {
                const token_graph = await createUniqueToken(graph_collection);

                const graph: Omit<GraphWF, "sheets" | "_sheets" | "htmlKeyLinked"> = {
                    _key: token_graph,
                    name: body.graph.name,
                    nodeKeyLinked: body.nodeKeyLinked,
                    category: "default",
                    version: 0,
                    permission: 0,
                    workspace: body.graph.workspace,
                    createdTime: Date.now(),
                    lastUpdatedTime: Date.now(),
                    sheetsList: {"0": "main"},
                    metadata: body.graphMetaData
                }
                await graph_collection.save(graph);

                const nodeStarter = createNodeFromConfig<any>(
                    NodeTypeStarterConfig,
                    token_graph+"-root",
                    token_graph,
                    "0"
                );

                const nodeReturn = createNodeFromConfig<any>(
                    NodeTypeReturnConfig,
                    token_graph+"-return",
                    token_graph,
                    "0"
                );

                nodeReturn.posX += 300;

                await node_collection.save(nodeStarter);
                await node_collection.save(nodeReturn);

                res.status(200).json(graph);
            } else {
                res.status(500).end();
            }

        });

        app.get("/api/graph/minimap/:token", async (req: Request, res: Response) => {
            const token = req.params?.token as string;
            const theme = "light"  as "light" | "dark";
            if(!token) {
                res.status(500).end();
            }

            res.setHeader('Content-Type', 'image/svg+xml');
            res.setHeader('Cache-Control', 'public, max-age=360');

            const graph = await this.buildGraph(
                token,
                {
                    build:  true,
                    onlyFirstSheet: true
                }
            );
            if(!graph) {
                res.status(400).send(CloudAlert);
            }else {
                const nodes = graph._sheets[Object.keys(graph.sheetsList)[0]].nodes;
                const edges = graph._sheets[Object.keys(graph.sheetsList)[0]].edges;

                const bounds = getGraphBounds(nodes);
                const svgString = generateGraphSVGString(nodes, edges, bounds, theme);
                res.status(200).send(svgString);
            }
        });
    }

    public static async buildGraph(graphKey:string,options?:{build:boolean, onlyFirstSheet?:boolean, avoidCheckingWebSocket?:boolean}):Promise<GraphWF> {
        const graphQuery = aql`
            FOR g IN nodius_graphs
            FILTER g._key == ${escapeHTML(graphKey)}
            RETURN g
        `;
        const graphCursor = await db.query(graphQuery);
        const graphData:GraphWF = (await graphCursor.all())[0];
        if(options?.build) {

            // can t work in cluster system, user should retrieve last instruction since last save

            // Check if graph is already managed in webSocketManager
            /*const managedSheets = webSocketManager.getManagedGraphSheets(graphKey);

            if (managedSheets && !options?.avoidCheckingWebSocket) {
                // Graph is open in webSocketManager, use it instead of querying ArangoDB
                console.log(`Using managed graph from webSocketManager for key: ${graphKey}`);
                graphData._sheets = {};

                for (const sheetId of Object.keys(graphData.sheetsList)) {
                    if(options?.onlyFirstSheet && sheetId !== Object.keys(graphData.sheetsList)[0]) continue;

                    const managedSheet = managedSheets[sheetId];
                    if (managedSheet) {
                        // Convert Map to array
                        const allNodes: Node<any>[] = Array.from(managedSheet.nodeMap.values());
                        const allEdges: Edge[] = [];

                        // Flatten edge map to array
                        for (const edgeList of managedSheet.edgeMap.values()) {
                            if (Array.isArray(edgeList)) {
                                allEdges.push(...edgeList);
                            }
                        }

                        // Remove duplicates from edges (since edge map stores them by source/target)
                        const uniqueEdges = Array.from(
                            new Map(allEdges.map(edge => [edge._key, edge])).values()
                        );

                        graphData._sheets[sheetId] = {
                            nodes: allNodes.map((node) => cleanNode(node)),
                            edges: uniqueEdges.map((edge) => cleanEdge(edge)),
                        };
                    }
                }
            } else {*/
                // Graph not in webSocketManager, query from ArangoDB as before
                graphData._sheets = {};
                for (const sheetId of Object.keys(graphData.sheetsList)) {
                    if(options?.onlyFirstSheet && sheetId !== Object.keys(graphData.sheetsList)[0]) continue;
                    const nodesQuery = aql`
                        FOR n IN nodius_nodes
                        FILTER n.graphKey == ${graphKey} && n.sheet == ${sheetId}
                        RETURN n
                      `;
                    const nodesCursor = await db.query(nodesQuery);
                    const allNodes = (await nodesCursor.all() as Node<any>[]).map((node) => {
                        const splittedKey = node._key.split("-");
                        return {
                            ...node,
                            _key: splittedKey.length > 1 ? splittedKey[1] : splittedKey[0],
                        }
                    });

                    const edgesQuery = aql`
                        FOR e IN nodius_edges
                        FILTER e.graphKey == ${graphKey} && e.sheet == ${sheetId}
                        RETURN e
                      `;
                    const edgesCursor = await db.query(edgesQuery);
                    const allEdges = (await edgesCursor.all() as Edge[]).map((edge) => {
                        const splittedKey = edge._key.split("-");
                        return {
                            ...edge,
                            _key: splittedKey.length > 1 ? splittedKey[1] : splittedKey[0],
                        }
                    });

                    graphData._sheets[sheetId] = {
                        nodes: allNodes.map((node) => cleanNode(node)),
                        edges: allEdges.map((edge) => cleanEdge(edge)),
                    };
                }
            //}
        }
        return graphData;
    }
}