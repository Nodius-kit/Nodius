/**
 * @file useSocketSync.ts
 * @description Central synchronization hub for real-time collaborative editing
 * @module client/hooks
 *
 * The heart of Nodius's real-time collaboration system. Manages WebSocket connections,
 * graph synchronization, HTML rendering, and instruction-based updates for multi-user editing.
 *
 * Core Responsibilities:
 * - **WebSocket Management**: Connects to appropriate server instance via cluster routing
 * - **Graph Synchronization**: Keeps local graph state in sync with server and other clients
 * - **HTML Rendering**: Manages multiple HTML render instances per node
 * - **Instruction System**: Applies incremental updates via InstructionBuilder
 * - **Conflict Resolution**: Handles concurrent edits from multiple users
 * - **State Management**: Integrates with ProjectContext for global state
 *
 * Connection Modes:
 * 1. **HTML Class Editor**: Opens HTML component with linked workflow graph
 * 2. **Node Config Editor**: Opens single node for configuration editing
 *
 * Synchronization Flow:
 * 1. Client requests sync info from HTTP server (/api/sync)
 * 2. Server routes to appropriate WebSocket instance (self or peer)
 * 3. Client connects to WebSocket and registers with graph/nodeConfig key
 * 4. Server sends missing messages since last timestamp (catch-up)
 * 5. Bidirectional real-time sync begins
 *
 * Instruction-Based Updates:
 * - All changes represented as Instructions (path-based updates)
 * - updateGraph: Sends instructions to server, applies to local state
 * - updateHtml: Convenience for updating current edited HTML
 * - applyGraphInstructions: Applies instructions from server to local graph
 * - Supports targeted updates with identifier validation
 *
 * Batch Operations:
 * - batchCreateElements: Create multiple nodes/edges atomically
 * - batchDeleteElements: Delete nodes and connected edges
 * - Automatic edge cleanup when deleting nodes
 *
 * HTML Renderer Management:
 * - Multiple renderers per node (keyed by ID)
 * - Auto-updates renderers when node data changes
 * - Supports custom render paths (pathOfRender)
 * - Cleanup on node deletion or component unmount
 *
 * GPU Motor Integration:
 * - WebGpuMotor renders the visual graph
 * - Auto-fits to "root" node on open
 * - Disables interaction for node config editing
 * - Requests redraw on graph changes
 *
 * Data Type Management:
 * - Fetches custom DataTypes and Enums from server
 * - Tracks current entry type connected to "root" node
 * - Refreshes on graph changes
 *
 * State Provided to ProjectContext:
 * - graph: Current graph with sheets
 * - editedHtml: Currently open HTML for editing
 * - selectedSheetId: Active sheet in multi-sheet graph
 * - currentEntryDataType: DataType for node entry editing
 * - dataTypes / enumTypes: Available custom types
 * - isSynchronized: Connection state
 * - openHtmlClass / openNodeConfig: Connection functions
 * - updateGraph / updateHtml: Update functions
 * - batchCreateElements / batchDeleteElements: Batch operations
 * - generateUniqueId: Server-side ID generation
 * - HTML renderer functions
 *
 * @example
 * const { gpuMotor, activeWindow, resetState } = useSocketSync();
 *
 * // In ProjectContext consumer:
 * await Project.state.openHtmlClass(htmlClass);
 * await Project.state.updateHtml(instruction);
 * await Project.state.batchCreateElements(nodes, edges);
 */

import {useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {
    ActionContext, DisabledNodeInteractionType, EditedHtmlType,
    EditedNodeTypeConfig,
    htmlRenderContext,
    ProjectContext,
    UpdateHtmlOption
} from "./contexts/ProjectContext";
import {api_sync, api_sync_info} from "../../utils/requests/type/api_sync.type";
import {HtmlClass, HtmlObject} from "../../utils/html/htmlType";
import {Edge, Graph, Node, NodeTypeConfig, NodeTypeEntryType} from "../../utils/graph/graphType";
import {WebGpuMotor} from "../schema/motor/webGpuMotor/index";
import {api_graph_html} from "../../utils/requests/type/api_workflow.type";
import {
    createNodeFromConfig,
    edgeArrayToMap,
    findEdgeByKey,
    findFirstNodeByType,
    findFirstNodeWithId, findNodeConnected,
    nodeArrayToMap
} from "../../utils/graph/nodeUtils";
import {HtmlRender, HtmlRenderOption} from "../../process/html/HtmlRender";
import {useWebSocket} from "./useWebSocket";
import {
    applyInstruction,
    BeforeApplyInstruction, BeforeApplyInstructionWithContext,
    Instruction,
} from "../../utils/sync/InstructionBuilder";
import {
    GraphInstructions, nodeConfigInstructions,
    WSApplyInstructionToGraph, WSApplyInstructionToNodeConfig,
    WSBatchCreateElements,
    WSBatchDeleteElements,
    WSGenerateUniqueId,
    WSMessage,
    WSRegisterUserOnGraph, WSRegisterUserOnNodeConfig,
    WSResponseMessage
} from "../../utils/sync/wsObject";
import {deepCopy} from "../../utils/objectUtils";
import {DataTypeClass, EnumClass} from "../../utils/dataType/dataType";
import {api_node_config_get} from "../../utils/requests/type/api_nodeconfig.type";

export type OpenHtmlEditorFct = (nodeId:string,htmlRender:htmlRenderContext, onClose?: () => void) => void;
export const useSocketSync = () => {

    const Project = useContext(ProjectContext);

    const [activeWindow, setActiveWindow] = useState<number>(0);

    const htmlRenderer = useRef<Record<string, Record<string, htmlRenderContext>>>({});

    const gpuMotor = useRef<WebGpuMotor | null>(null);

    const [serverInfo, setServerInfo] = useState<api_sync_info>();

    const { connect, sendMessage, setMessageHandler, connectionState, stats, disconnect } = useWebSocket(
        true,  // autoReconnect
        1000,  // reconnectInterval (ms)
        3      // maxReconnectAttempts
    );

    /* ------------------------------------ HTML RENDER STORAGE --------------------------------------------------- */
    const initiateNewHtmlRenderer = async (node:Node<any>, id:string, container:HTMLElement, pathOfRender:string[]|HtmlObject, options?:HtmlRenderOption) :Promise<htmlRenderContext | undefined> => {
        if(!htmlRenderer.current[node._key]) {
            htmlRenderer.current[node._key] = {};
        }
        if(htmlRenderer.current[node._key][id]) {
            console.error("Html Renderer with id ", id, "already exist on node", node);
            console.trace();
            return undefined;
        }

        htmlRenderer.current[node._key][id] = {
            htmlMotor: new HtmlRender(container, options),
            pathOfRender: pathOfRender,
            nodeId: node._key
        }
        if(!options?.noFirstRender) {
            if (Array.isArray(pathOfRender)) {
                let object = node as any;
                for (const path of pathOfRender) {
                    object = object[path as any];
                }
                await htmlRenderer.current[node._key][id].htmlMotor.render(object);
            } else {
                await htmlRenderer.current[node._key][id].htmlMotor.render(pathOfRender);
            }
        }

        return htmlRenderer.current[node._key][id];
    };

    const getHtmlRenderer = (node:string|Node<any>) => htmlRenderer.current[typeof node === "string" ? node : node._key];
    const getHtmlAllRenderer = () => htmlRenderer.current;
    useEffect(() => {
        Project.dispatch({
            field: "initiateNewHtmlRenderer",
            value: initiateNewHtmlRenderer,
        });
        Project.dispatch({
            field: "getHtmlAllRenderer",
            value: getHtmlAllRenderer,
        });
        Project.dispatch({
            field: "getHtmlRenderer",
            value: getHtmlRenderer,
        });
    }, []);

    const openHtmlEditor:OpenHtmlEditorFct = useCallback((nodeId:string,htmlRenderer:htmlRenderContext, onClose?: () => void) => {
        if(!gpuMotor.current || !Project.state.graph || !Project.state.selectedSheetId || !htmlRenderer) return;

        const node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(nodeId);
        if(!node) return;

        /*if(! Array.isArray(htmlRenderer.pathOfRender) ) {
            console.error("Can't edit html that is not stored in a node");
            return;
        }*/
        Project.dispatch({
            field: "onCloseEditor",
            value: onClose,
        });



        if(Array.isArray(htmlRenderer.pathOfRender)) {
            let object = node as any;
            for (const path of htmlRenderer.pathOfRender) {
                object = object[path];
            }

            if (object) {
                const newEditedHtml: EditedHtmlType = {
                    targetType: "node",
                    target: node,
                    html: object,
                    htmlRender: htmlRenderer.htmlMotor,
                    pathOfRender: htmlRenderer.pathOfRender,

                }
                Project.dispatch({
                    field: "editedHtml",
                    value: newEditedHtml
                });
            }
        } else if(Project.state.editedNodeConfig) {
            const newEditedHtml: EditedHtmlType = {
                targetType: "NodeTypeConfig",
                target: Project.state.editedNodeConfig.config,
                html: htmlRenderer.pathOfRender as HtmlObject,
                htmlRender: htmlRenderer.htmlMotor,
                pathOfRender: ["content"]

            }
            Project.dispatch({
                field: "editedHtml",
                value: newEditedHtml
            });
        }
    }, [Project.state.graph, Project.state.selectedSheetId, Project.state.editedNodeConfig]);

    useEffect(() => {
        Project.dispatch({
            field: "openHtmlEditor",
            value: openHtmlEditor,
        })
    }, [openHtmlEditor]);
    /* ----------------------------------------------------------------------------------------------------------- */

    /* ---------------------------- REQUEST A SERVER CONNECTION BASED ON GRAPH UNIQUE KEY ------------------------- */
    const initWebSocketAbortController = useRef<AbortController>(undefined);
    const retrieveServerInfo = useCallback(async (body:api_sync):Promise<api_sync_info |undefined> => {
        // look for server
        if(initWebSocketAbortController.current) {
            initWebSocketAbortController.current.abort();
        }
        initWebSocketAbortController.current = new AbortController();
        const response = await fetch('http://localhost:8426/api/sync', {
            method: "POST",
            signal: initWebSocketAbortController.current.signal,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body)
        });

        if(response.status !== 200) {
            return undefined;
        }

        return await response.json() as api_sync_info;
    }, []);
    /* ----------------------------------------------------------------------------------------------------------- */

    /* -------------------------- START A SYNC WITH THE SERVER BASED ON A HTMLCLASS/GRAPH ------------------------ */

    /*
        Open a htmlClass => graph with "root" node is an html display editor
     */
    const openHtmlClassAbortController = useRef<AbortController>(undefined);
    const openHtmlClass = useCallback(async (html:HtmlClass, graph?:Graph):Promise<ActionContext> => {
        const start = Date.now();

        if(connectionState !== "disconnected") {
            disconnect();
        }

        let htmlGraph = graph; // may change

        if(!htmlGraph || htmlGraph.sheets == undefined) {
            // retrieve graph
            if(openHtmlClassAbortController.current) {
                openHtmlClassAbortController.current.abort();
            }
            openHtmlClassAbortController.current = new AbortController();
            const response = await fetch('http://localhost:8426/api/graph/get', {
                method: "POST",
                signal: openHtmlClassAbortController.current.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspace: "root",
                    retrieveGraph: {
                        buildGraph: true,
                        token: html.graphKeyLinked,
                        onlyFirstSheet: false
                    }
                } as api_graph_html),
            });
            if(response.status === 200) {
                const json = await response.json() as Omit<Graph, "sheets">;
                if(!json) {
                    return {
                        timeTaken: Date.now() - start,
                        reason: "Can't retrieve graph with key "+html.graphKeyLinked,
                        status: false,
                    }
                }

                // convert dict to map for each sheet (map can't be send over JSON, so with use dict with key _sheet)
                htmlGraph = {
                    ...json,
                    sheets: Object.fromEntries(
                        Object.entries(json._sheets).map(([sheet, data]) => [
                            sheet,
                            {
                                nodeMap: nodeArrayToMap(data.nodes),
                                edgeMap: edgeArrayToMap(data.edges)
                            },
                        ])
                    ),
                };
                delete (htmlGraph as any)["_sheets"];
            } else {
                return {
                    timeTaken: Date.now() - start,
                    reason: "Can't retrieve graph with key, error on HTTP request("+response.status+") "+html.graphKeyLinked,
                    status: false,
                }
            }
        }

        if(!htmlGraph) {
            return {
                timeTaken: Date.now() - start,
                reason: "Can't retrieve graph with key "+html.graphKeyLinked,
                status: false,
            }
        }

        if(!gpuMotor.current) {
            return {
                timeTaken: Date.now() - start,
                reason: "Can't start the synchronization, the GPU display is not working",
                status: false,
            }
        }

        const serverInfo = await retrieveServerInfo({
            instanceId: "graph-"+htmlGraph._key
        });
        if(!serverInfo) {
            return {
                timeTaken: Date.now() - start,
                reason: "Can't find a server to start a sync",
                status: false,
            }
        } else {
            console.log("Pairing with serveur: "+serverInfo.host+":"+serverInfo.port);
            setServerInfo(serverInfo);
        }

        const connected = await connect(`ws://${serverInfo.host}:${serverInfo.port}`);
        if(!connected) {
            return {
                timeTaken: Date.now() - start,
                reason: "Can't connect to server",
                status: false,
            }
        }

        const selectedSheetId = Object.keys(htmlGraph.sheets)[0];

        const registerUser:WSMessage<WSRegisterUserOnGraph> = {
            type: "registerUserOnGraph",
            userId: Array.from({length: 32}, () => Math.random().toString(36)[2]).join(''),
            name: "User",
            sheetId: selectedSheetId,
            graphKey: htmlGraph._key,
            fromTimestamp: htmlGraph.lastUpdatedTime
        }
        const response = await sendMessage<{
            missingMessages: WSMessage<any>[]
        }>(registerUser);
        if(!response || !response._response.status) {
            disconnect();
            return {
                timeTaken: Date.now() - start,
                reason: "Server didn't accept our registration"+(response?._response.message ? ": "+response?._response.message : ""),
                status: false,
            }
        }

        if(response.missingMessages.length > 0) {
            response.missingMessages.forEach((m) => {
                for(const i of m.instructions) {
                    if(i.animatePos) {
                        delete i.animatePos; // no need animation when try to caught up the current graph
                    }
                    if(i.animateSize) {
                        delete i.animateSize; // no need animation when try to caught up the current graph
                    }
                }
            })
            Project.dispatch({
                field:"caughtUpMessage",
                value: response.missingMessages
            });
        }


        Project.dispatch({
            field: "disabledNodeInteraction",
            value: {}
        });
        Project.dispatch(({
            field: "selectedSheetId",
            value: selectedSheetId,
        })); // select first sheet id
        Project.dispatch({
            field: "graph",
            value: htmlGraph
        });
        Project.dispatch({
            field: "editedHtml",
            value: undefined
        });

        Project.dispatch({
            field: "isSynchronized",
            value: true
        });

        /*const htmlNode = findFirstNodeByType(htmlGraph, "html");
        if(htmlNode) {
            htmlNode.data = html.object;
        }*/


        requestAnimationFrame(() => {
            gpuMotor.current!.setScene({
                nodes: htmlGraph.sheets[selectedSheetId].nodeMap,
                edges: htmlGraph.sheets[selectedSheetId].edgeMap
            });
        });
        const rootNode = findFirstNodeWithId(htmlGraph, "root");
        if(rootNode) {
            gpuMotor.current.smoothFitToNode(rootNode._key, {
                padding: 100
            });
        } else {
            gpuMotor.current.resetViewport();
        }

        setActiveWindow(1);
        return {
            timeTaken: Date.now() - start,
            status: true,
        }
    }, [connect, disconnect, connectionState]);

    useEffect(() => {
        Project.dispatch({
            field: "openHtmlClass",
            value: openHtmlClass
        })
    }, [openHtmlClass]);

    /*
     open a node editor => empty graph with only the node
     */
    const openNodeConfigAbortController = useRef<AbortController>(undefined);
    const openNodeConfig = useCallback(async (baseNodeConfig:Pick<NodeTypeConfig, "_key" | "workspace" | "lastUpdatedTime">) => {
        const start = Date.now();

        if(connectionState !== "disconnected") {
            disconnect();
        }

        if(openNodeConfigAbortController.current) {
            openNodeConfigAbortController.current.abort();
        }

        let nodeConfig:NodeTypeConfig|undefined;

        openNodeConfigAbortController.current = new AbortController();
        const request = await fetch('http://localhost:8426/api/nodeconfig/get', {
            method: "POST",
            signal: openNodeConfigAbortController.current.signal,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                workspace: baseNodeConfig.workspace,
                _key: baseNodeConfig._key

            } as api_node_config_get),
        });
        if(request.status === 200) {
            const json = await request.json() as NodeTypeConfig;
            if(json) {
                nodeConfig = json;
            }
        } else {
            return {
                timeTaken: Date.now() - start,
                reason: "Can't retrieve node config with key, error on HTTP request("+request.status+") "+baseNodeConfig._key,
                status: false,
            }
        }

        if(!nodeConfig) {
            return {
                timeTaken: Date.now() - start,
                reason: "Can't retrieve node config with key, error on HTTP request("+request.status+") "+baseNodeConfig._key,
                status: false,
            }
        }

        if(!gpuMotor.current) {
            return {
                timeTaken: Date.now() - start,
                reason: "Can't start the synchronization, the GPU display is not working",
                status: false,
            }
        }

        const serverInfo = await retrieveServerInfo({
            instanceId: "nodeConfig-"+nodeConfig._key,
        });
        if(!serverInfo) {
            return {
                timeTaken: Date.now() - start,
                reason: "Can't find a server to start a sync",
                status: false,
            }
        } else {
            console.log("Pairing with serveur: "+serverInfo.host+":"+serverInfo.port);
            setServerInfo(serverInfo);
        }

        // generate fake graph
        const graph:Omit<Graph, "_sheets"> = {
            _key: "0",
            sheets: {
                "main": {
                    nodeMap: new Map(),
                    edgeMap: new Map(),
                }
            },
            lastUpdatedTime: Date.now(),
            createdTime: Date.now(),
            sheetsList: {"main":"main"},
            workspace: nodeConfig.workspace,
            category: "",
            name: "Editing "+nodeConfig.displayName,
            version: 0,
            permission: 0,
        }

        const selectedSheetId = "main"

        const baseNode:Node<any> = createNodeFromConfig(nodeConfig, "0", "0", "main");
        graph.sheets["main"].nodeMap.set("0", baseNode);

        const connected = await connect(`ws://${serverInfo.host}:${serverInfo.port}`);
        if(!connected) {
            return {
                timeTaken: Date.now() - start,
                reason: "Can't connect to server",
                status: false,
            }
        }

        const registerUser:WSMessage<WSRegisterUserOnNodeConfig> = {
            type: "registerUserOnNodeConfig",
            userId: Array.from({length: 32}, () => Math.random().toString(36)[2]).join(''),
            name: "User",
            nodeConfigKey: nodeConfig._key,
            fromTimestamp: nodeConfig.lastUpdatedTime
        }
        const response = await sendMessage<{
            missingMessages: WSMessage<any>[]
        }>(registerUser);
        if(!response || !response._response.status) {
            disconnect();
            return {
                timeTaken: Date.now() - start,
                reason: "Server didn't accept our registration",
                status: false,
            }
        }

        if(response.missingMessages.length > 0) {
            response.missingMessages.forEach((m) => {
                for(const i of m.instructions) {
                    if(i.animatePos) {
                        delete i.animatePos; // no need animation when try to caught up the current graph
                    }
                    if(i.animateSize) {
                        delete i.animateSize; // no need animation when try to caught up the current graph
                    }
                }
            })
            Project.dispatch({
                field:"caughtUpMessage",
                value: response.missingMessages
            });
        }

        Project.state.nodeTypeConfig[nodeConfig._key] = nodeConfig;
        Project.dispatch({
            field: "nodeTypeConfig",
            value: {...Project.state.nodeTypeConfig}
        });

        Project.dispatch(({
            field: "selectedSheetId",
            value: selectedSheetId,
        })); // select first sheet id
        Project.dispatch({
            field: "graph",
            value: graph as Graph
        });

        nodeConfig.node = baseNode;

        Project.dispatch({
            field: "editedNodeConfig",
            value: {
                node: baseNode,
                config: nodeConfig
            } as EditedNodeTypeConfig
        });

        const disabled:DisabledNodeInteractionType = {};
        disabled[baseNode._key] = {};
        disabled[baseNode._key].moving = true;

        Project.dispatch({
            field: "disabledNodeInteraction",
            value: disabled
        });

        requestAnimationFrame(() => {
            gpuMotor.current!.setScene({
                nodes: graph.sheets[selectedSheetId].nodeMap,
                edges: graph.sheets[selectedSheetId].edgeMap
            });
        });

        const padding = 500;
        gpuMotor.current.lockCameraToArea({
            minX: baseNode.posX - padding,
            minY: baseNode.posY - padding,
            maxX: baseNode.posX + baseNode.size.width + padding,
            maxY: baseNode.posY + baseNode.size.height + padding,
        })
        gpuMotor.current.smoothFitToNode(baseNode._key, {
            padding: padding
        });

        setActiveWindow(1);
        return {
            timeTaken: Date.now() - start,
            status: true,
        }
    }, [connect, disconnect, connectionState, Project.state.nodeTypeConfig]);

    useEffect(() => {
        Project.dispatch({
            field: "openNodeConfig",
            value: openNodeConfig
        })
    }, [openHtmlClass]);

    const handleIntructionToGraph = useCallback(async (instructions:GraphInstructions[], beforeApply?: BeforeApplyInstructionWithContext):Promise<{status:boolean, error?:string, shouldUpdateNode:boolean}> => {
        if(!Project.state.graph || !Project.state.selectedSheetId) return {
            status: false,
            error: "Graph not initialized",
            shouldUpdateNode: false
        };

        let shouldUpdateNode = false;

        for(const instruction of instructions) {
            if(instruction.nodeId) {
                const node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(instruction.nodeId);
                if(!node) {
                    return {
                        status: false,
                        error: "Can't find node with id :"+instruction.nodeId,
                        shouldUpdateNode: false,
                    };
                }

                // this is a special case, for animating a smooth posX and posY change, sync  between html render and gpu render,
                // if destination of instruction is posX/posY change it to toPosX and toPosY, this is client only
                // same for width and height with animateSize flag
                // temporary value set to animate transition

                if(instruction.animatePos && instruction.i.p && instruction.i.p.length == 1 && instruction.i.p[0] == "posX") {
                    instruction.i.p[0] = "toPosX";
                } else if(instruction.animatePos && instruction.i.p && instruction.i.p.length == 1 && instruction.i.p[0] == "posY") {
                    instruction.i.p[0] = "toPosY";
                } else if(instruction.animateSize && instruction.i.p && instruction.i.p.length == 2 && instruction.i.p[0] == "size" && instruction.i.p[1] == "width") {
                    instruction.i.p[1] = "toWidth";
                } else if(instruction.animateSize && instruction.i.p && instruction.i.p.length == 2 && instruction.i.p[0] == "size" && instruction.i.p[1] == "height") {
                    instruction.i.p[1] = "toHeight";
                } else {
                    shouldUpdateNode = true;
                }

                const newNode = applyInstruction(node, instruction.i, beforeApply ? ((objectBeingApplied) => beforeApply(instruction, objectBeingApplied)) : undefined);
                if(newNode.success) {
                    Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.set(instruction.nodeId, newNode.value);
                } else {
                    return {
                        status: false,
                        error: "Error while applied instruction to destination node, should not append:"+JSON.stringify(newNode),
                        shouldUpdateNode: false
                    };
                }
            } else if(instruction.edgeId) {
                const oldNEdge = findEdgeByKey(Project.state.graph.sheets[Project.state.selectedSheetId].edgeMap, instruction.edgeId);
                if(!oldNEdge) {
                    return {
                        status: false,
                        error: "Can't find edge with id :"+instruction.edgeId,
                        shouldUpdateNode: false,
                    };
                }
                const newEdge = applyInstruction(oldNEdge, instruction.i, beforeApply ? ((objectBeingApplied) => beforeApply(instruction, objectBeingApplied)) : undefined);
                if(newEdge.success) {
                    const edges = [oldNEdge, newEdge.value];

                    //remove old
                    if(edges[0].target) {
                        const targetKey = `target-${edges[0].target}`;
                        let edgeListTarget = Project.state.graph.sheets[Project.state.selectedSheetId].edgeMap.get(targetKey) ?? [];
                        edgeListTarget = edgeListTarget.filter((e) => e._key !== edges[0]._key);
                        if(edgeListTarget.length > 0) {
                            Project.state.graph.sheets[Project.state.selectedSheetId].edgeMap.set(targetKey, edgeListTarget);
                        } else {
                            Project.state.graph.sheets[Project.state.selectedSheetId].edgeMap.delete(targetKey);
                        }
                    }

                    if(edges[0].source) {
                        const sourceKey = `source-${edges[0].source}`;
                        let edgeListSource = Project.state.graph.sheets[Project.state.selectedSheetId].edgeMap.get(sourceKey) ?? [];
                        edgeListSource = edgeListSource.filter((e) => e._key !== edges[0]._key);
                        if(edgeListSource.length > 0) {
                            Project.state.graph.sheets[Project.state.selectedSheetId].edgeMap.set(sourceKey, edgeListSource);
                        } else {
                            Project.state.graph.sheets[Project.state.selectedSheetId].edgeMap.delete(sourceKey);
                        }
                    }

                    // add new
                    if(edges[1].target) {
                        const targetKey = `target-${edges[1].target}`;
                        let edgeListTarget = Project.state.graph.sheets[Project.state.selectedSheetId].edgeMap.get(targetKey) ?? [];
                        let some = false;
                        edgeListTarget = edgeListTarget.map((e) => {
                            if(e._key === edges[1]._key) {
                                some = true;
                                return edges[1];
                            } else {
                                return e;
                            }
                        });
                        if(!some) edgeListTarget.push(edges[1]);
                        if(edgeListTarget.length > 0) {
                            Project.state.graph.sheets[Project.state.selectedSheetId].edgeMap.set(targetKey, edgeListTarget);
                        } else {
                            Project.state.graph.sheets[Project.state.selectedSheetId].edgeMap.delete(targetKey);
                        }
                    }

                    if(edges[1].source) {
                        const sourceKey = `source-${edges[1].source}`;
                        let edgeListSource = Project.state.graph.sheets[Project.state.selectedSheetId].edgeMap.get(sourceKey) ?? [];
                        let some = false;
                        edgeListSource = edgeListSource.map((e) => {
                            if(e._key === edges[1]._key) {
                                some = true;
                                return edges[1];
                            } else {
                                return e;
                            }
                        });
                        if(!some) edgeListSource.push(edges[1]);
                        Project.state.graph.sheets[Project.state.selectedSheetId].edgeMap.set(sourceKey, edgeListSource);
                    }
                } else {
                    console.error(newEdge, instruction.i, oldNEdge);
                    return {
                        status: false,
                        error: "Error while applied instruction to destination edge, should not append:"+JSON.stringify(newEdge),
                        shouldUpdateNode: false,
                    };
                }
            }
        }
        return {
            status: true,
            shouldUpdateNode: shouldUpdateNode
        }
    }, [Project.state.graph, Project.state.editedHtml, Project.state.selectedSheetId]);


    const applyGraphInstructions = useCallback(async (instructions:Array<GraphInstructions>):Promise<string|undefined> => { // if return undefined -> it's good

        const instructionOutput = await handleIntructionToGraph(instructions,(currentGraphInstrution, objectBeingApplied) => {
            if(currentGraphInstrution.targetedIdentifier && objectBeingApplied != undefined && !Array.isArray(objectBeingApplied) && "identifier" in objectBeingApplied) {
                const object:HtmlObject = objectBeingApplied;
                if(object.identifier !== currentGraphInstrution.targetedIdentifier) {
                    console.error("wrong action, target:", currentGraphInstrution.targetedIdentifier, "found:", object.identifier);
                    return false;
                }
                return true;
            }
            return true;
        });

        if(instructionOutput.status) {
            Project.state.refreshCurrentEntryDataType?.();
            let redrawGraph = false;
            const nodeAlreadyCheck:string[] = [];
            const edgeAlreadyCheck:string[] = [];
            for(const instruction of instructions) {


                if(instruction.edgeId && !instruction.noRedraw) {
                    redrawGraph = true;

                    if(edgeAlreadyCheck.includes(instruction.edgeId)) {
                        continue;
                    }
                    edgeAlreadyCheck.push(instruction.edgeId);

                    // futur work
                } else if(instruction.nodeId) {

                    if(!instruction.noRedraw) {
                        redrawGraph = true;
                    }


                    // avoid triggering multiple event for one nodeid, triggering useless re-render
                    if(nodeAlreadyCheck.includes(instruction.nodeId)) {
                        continue;
                    }
                    nodeAlreadyCheck.push(instruction.nodeId);

                    // if instruction (coming from another user) include current editing node, apply instruction to the edited html
                    if(Project.state.editedHtml && Project.state.editedHtml.targetType === "node" && instruction.nodeId === Project.state.editedHtml.target._key) {
                        const newNode = Project.state.graph!.sheets[Project.state.selectedSheetId!].nodeMap.get(instruction.nodeId)!;
                        let objectHtml: any = newNode;
                        Project.state.editedHtml.pathOfRender.forEach((path) => {
                            objectHtml = objectHtml[path];
                        });
                        Project.state.editedHtml.html = objectHtml;
                        Project.state.editedHtml.target = newNode;
                        Project.dispatch({
                            field: "editedHtml",
                            value: {...Project.state.editedHtml}
                        });
                        if(!instruction.noRedraw) {
                            await Project.state.editedHtml.htmlRender.render(Project.state.editedHtml.html);
                        }

                    } else if(htmlRenderer.current[instruction.nodeId]) { // look for a htmlRenderer
                        const renderers = htmlRenderer.current[instruction.nodeId];
                        const newNode = Project.state.graph!.sheets[Project.state.selectedSheetId!].nodeMap.get(instruction.nodeId)!;
                        for(const [key, renderer] of Object.entries(renderers)) {
                            if(!instruction.noRedraw && key !== "") {
                                // key == "" meaning that this is SchemaDisplay that created this renderer
                                // and updating the node (calling triggerNodeUpdate), will tell SchemaDisplay to trigger a re render with a custom context
                                // that we can't handle here
                                if(Array.isArray(renderer.pathOfRender)) {
                                    let objectHtml: any = newNode;
                                    renderer.pathOfRender.forEach((path) => {
                                        objectHtml = objectHtml[path];
                                    });
                                    await renderer.htmlMotor.render(objectHtml);
                                } else {
                                    await renderer.htmlMotor.render(renderer.pathOfRender);
                                }
                            }
                        }

                    }

                    (window as any).triggerNodeUpdate?.(instruction.nodeId);

                }
            }

            if(redrawGraph) {
                gpuMotor.current!.requestRedraw();
            }
            return undefined;
        } else {
            return instructionOutput.error ?? "Unknown error"
        }
    }, [Project.state.graph, Project.state.editedHtml, handleIntructionToGraph, Project.state.selectedSheetId, Project.state.refreshCurrentEntryDataType]);


    const currentEditConfig = useRef<{node: Node<any>,config: NodeTypeConfig }>(Project.state.editedNodeConfig);
    useEffect(() => {
        currentEditConfig.current = Project.state.editedNodeConfig;
    }, [Project.state.editedNodeConfig]);
    const applyNodeConfigInstructions= useCallback(async (instructions:Array<nodeConfigInstructions>):Promise<string|undefined> => { // if return undefined -> it's good
        if(!currentEditConfig.current) return;
        let nodeConfig = deepCopy(currentEditConfig.current.config);

        let redrawGraph = false;
        for(const instruction of instructions) {
            const newNodeConfig = applyInstruction(nodeConfig, instruction.i, (objectBeingApplied) => {
                const currentGraphInstrution = instruction;
                if(currentGraphInstrution.targetedIdentifier && objectBeingApplied != undefined && !Array.isArray(objectBeingApplied) && "identifier" in objectBeingApplied) {
                    const object:HtmlObject = objectBeingApplied;
                    if(object.identifier !== currentGraphInstrution.targetedIdentifier) {
                        console.error("wrong action, target:", currentGraphInstrution.targetedIdentifier, "found:", object.identifier);
                        return false;
                    }
                    return true;
                }
                return true;
            });
            if(newNodeConfig.success) {
                nodeConfig = newNodeConfig.value;
                Project.state.graph!.sheets[Project.state.selectedSheetId!].nodeMap.set((nodeConfig.node as Node<any>)._key, nodeConfig.node as Node<any>);

                currentEditConfig.current = {
                    ...currentEditConfig.current,
                    config: nodeConfig
                };
                Project.dispatch({
                    field: "editedNodeConfig",
                    value: currentEditConfig.current
                });

                if(Project.state.editedHtml && Project.state.editedHtml.targetType === "NodeTypeConfig" ) {

                    let object = nodeConfig as any;

                    for(const key of Project.state.editedHtml.pathOfRender) {
                        object = object[key];
                    }

                    Project.state.editedHtml.html = object;
                    Project.state.editedHtml.target = nodeConfig;


                    Project.dispatch({
                        field: "editedHtml",
                        value: {...Project.state.editedHtml}
                    });

                    if (!instruction.noRedraw) {
                        await Project.state.editedHtml.htmlRender.render(Project.state.editedHtml.html);
                    }
                }
            }else {
                return newNodeConfig.error ?? "Unknown error"
            }
            if(!instruction.noRedraw) {
                redrawGraph = true;
            }
        }

        if(redrawGraph) {
            gpuMotor.current!.requestRedraw();
        }

    }, [Project.state.editedNodeConfig, Project.state.editedHtml]);

    const updateNodeConfig = useCallback(async (instructions:Array<nodeConfigInstructions>): Promise<ActionContext> => {
        const start = Date.now();
        const message:WSMessage<WSApplyInstructionToNodeConfig> = {
            type: "applyInstructionToNodeConfig",
            instructions: instructions
        }
        const response = await sendMessage(message) as WSResponseMessage<WSApplyInstructionToNodeConfig>;

        if(response && response._response) {
            if(response._response.status) {
                const output = await applyNodeConfigInstructions(response.instructions.filter((i) => !i.dontApplyToMySelf));
                if(output) {
                    return {
                        reason: output,
                        timeTaken: Date.now() - start,
                        status: false
                    }
                } else {
                    return {
                        timeTaken: Date.now() - start,
                        status: true
                    }
                }
            } else {
                console.error("Unknow server error while sending WS message:", message," | server output:",response);
                return {
                    timeTaken: Date.now() - start,
                    reason: "Unknow server error while sending WS message:"+JSON.stringify(message)+" | server output:"+JSON.stringify(response),
                    status: false,
                }
            }
        } else {
            console.error("Unknow client error while sending WS message:", message);
            return {
                timeTaken: Date.now() - start,
                reason: "Unknow client error while sending WS message:"+ JSON.stringify(message),
                status: false,
            }
        }



    }, [applyNodeConfigInstructions]);

    useEffect(() => {
        Project.dispatch({
            field: "updateNodeConfig",
            value: updateNodeConfig
        })
    }, [updateNodeConfig])

    const updateGraph = useCallback(async (instructions:Array<GraphInstructions>):Promise<ActionContext> => {

        const start = Date.now();

        // redirect to update node config is so
        if(Project.state.editedNodeConfig) {
            return await updateNodeConfig(instructions.map((inst) => {

                if(inst.nodeId != undefined) {
                    inst.i.p = ["node", ...(inst.i.p??[])];
                }

                return {
                    i: inst.i,
                    noRedraw: inst.noRedraw,
                    targetedIdentifier: inst.targetedIdentifier,
                    applyUniqIdentifier: inst.applyUniqIdentifier,
                    animatePos: inst.animatePos,
                    animateSize: inst.animateSize,
                    dontApplyToMySelf: inst.dontApplyToMySelf
                }
            }));
        }

        const message:WSMessage<WSApplyInstructionToGraph> = {
            type: "applyInstructionToGraph",
            instructions: instructions
        }

        const response = await sendMessage(message) as WSResponseMessage<WSApplyInstructionToGraph>;

        if(response && response._response) {
            if(response._response.status) {
                const output = await applyGraphInstructions(response.instructions.filter((i) => !i.dontApplyToMySelf));
                if(output) {
                    return {
                        reason: output,
                        timeTaken: Date.now() - start,
                        status: false
                    }
                } else {
                    return {
                        timeTaken: Date.now() - start,
                        status: true
                    }
                }
            } else {
                console.error("Unknow server error while sending WS message:", message," | server output:",response);
                return {
                    timeTaken: Date.now() - start,
                    reason: "Unknow server error while sending WS message:"+JSON.stringify(message)+" | server output:"+JSON.stringify(response),
                    status: false,
                }
            }
        } else {
            console.error("Unknow client error while sending WS message:", message);
            return {
                timeTaken: Date.now() - start,
                reason: "Unknow client error while sending WS message:"+ JSON.stringify(message),
                status: false,
            }
        }
    }, [applyGraphInstructions, updateNodeConfig, Project.state.editedNodeConfig]);

    useEffect(() => {
        Project.dispatch({
            field: "updateGraph",
            value: updateGraph
        });
    }, [updateGraph]);


    const updateHtml = useCallback(async (instructionHtml:Instruction|Instruction[], options?:UpdateHtmlOption): Promise<ActionContext> => {
        const instructions = deepCopy(instructionHtml);

        if(
            Project.state.editedNodeConfig && Project.state.editedHtml?.targetType === "NodeTypeConfig"
        ) {
            if(Array.isArray(instructions)) {

                for(const instruction of instructions) {
                    if (instruction.p) {
                        instruction.p = [...Project.state.editedHtml.pathOfRender, ...instruction.p];
                    }
                }
            } else {
                if (instructions.p) {
                    instructions.p = [...Project.state.editedHtml.pathOfRender, ...instructions.p];
                }
            }

            return await updateNodeConfig(
                (Array.isArray(instructions) ? instructions : [instructions] ).map((instruction) => (
                    {
                        i: instruction,
                        applyUniqIdentifier: "identifier",
                        targetedIdentifier: options?.targetedIdentifier,
                        noRedraw: options?.noRedraw,
                    }
                ))
            );
        } else if(Project.state.editedHtml?.targetType === "node") {

            if(Array.isArray(instructions)) {

                for(const instruction of instructions) {
                    if (instruction.p) {
                        instruction.p = [...Project.state.editedHtml.pathOfRender, ...instruction.p];
                    }
                }
            } else {
                if (instructions.p) {
                    instructions.p = [...Project.state.editedHtml.pathOfRender, ...instructions.p];
                }
            }

            return await updateGraph(
                (Array.isArray(instructions) ? instructions : [instructions] ).map((instruction) => (
                    {
                        i: instruction,
                        nodeId: Project.state.editedHtml!.target._key,
                        applyUniqIdentifier: "identifier",
                        targetedIdentifier: options?.targetedIdentifier,
                        noRedraw: options?.noRedraw
                    }
                ))
            );
        } else {
            return {
                timeTaken: 0,
                reason: "No current edited HTML",
                status: false,
            };
        }
    }, [Project.state.editedHtml, sendMessage, Project.state.selectedSheetId, Project.state.graph, updateGraph, updateNodeConfig]);

    useEffect(() => {
        Project.dispatch({
            field: "updateHtml",
            value: updateHtml
        });
    }, [updateHtml]);

    const applyBatchCreate = useCallback(async (nodes: Node<any>[], edges: Edge[]): Promise<{status: boolean, error?: string}> => {
        if(!Project.state.graph || !Project.state.selectedSheetId) return {
            status: false,
            error: "Graph not initialized"
        };

        const sheet = Project.state.graph.sheets[Project.state.selectedSheetId];

        // Add nodes to the graph
        for(const node of nodes) {
            sheet.nodeMap.set(node._key, node);
        }

        // Add edges to the graph
        for(const edge of edges) {
            // Add to target map
            const targetKey = `target-${edge.target}`;
            let targetEdges = sheet.edgeMap.get(targetKey) || [];
            targetEdges.push(edge);
            sheet.edgeMap.set(targetKey, targetEdges);

            // Add to source map
            const sourceKey = `source-${edge.source}`;
            let sourceEdges = sheet.edgeMap.get(sourceKey) || [];
            sourceEdges.push(edge);
            sheet.edgeMap.set(sourceKey, sourceEdges);
        }

        Project.state.refreshCurrentEntryDataType?.();

        // Redraw the graph if GPU motor is available
        if(gpuMotor.current) {
            gpuMotor.current.requestRedraw();
        }

        return {
            status: true,
        };
    }, [Project.state.graph, Project.state.selectedSheetId, Project.state.refreshCurrentEntryDataType]);

    const batchCreateElements = useCallback(async (nodes: Node<any>[], edges: Edge[]): Promise<ActionContext> => {
        const start = Date.now();

        if(!Project.state.selectedSheetId) {
            return {
                timeTaken: Date.now() - start,
                reason: "No sheet selected",
                status: false,
            };
        }

        const message: WSMessage<WSBatchCreateElements> = {
            type: "batchCreateElements",
            sheetId: Project.state.selectedSheetId,
            nodes: nodes,
            edges: edges
        };

        const response = await sendMessage(message) as WSResponseMessage<WSBatchCreateElements>;

        if(response && response._response) {
            if(response._response.status) {
                const output = await applyBatchCreate(response.nodes, response.edges);
                if(!output.status) {
                    return {
                        reason: output.error || "Unknown error applying batch create",
                        timeTaken: Date.now() - start,
                        status: false
                    };
                } else {
                    return {
                        timeTaken: Date.now() - start,
                        status: true
                    };
                }
            } else {
                console.error("Server error while sending batch create message:", message, " | server output:", response);
                return {
                    timeTaken: Date.now() - start,
                    reason: response._response.message || "Unknown server error while sending batch create message",
                    status: false,
                };
            }
        } else {
            console.error("Client error while sending batch create message:", message);
            return {
                timeTaken: Date.now() - start,
                reason: "Unknown client error while sending batch create message",
                status: false,
            };
        }
    }, [Project.state.selectedSheetId, sendMessage, applyBatchCreate]);

    useEffect(() => {
        Project.dispatch({
            field: "batchCreateElements",
            value: batchCreateElements
        });
    }, [batchCreateElements]);

    const applyBatchDelete = useCallback(async (nodeKeys: string[], edgeKeys: string[]): Promise<{status: boolean, error?: string}> => {
        if(!Project.state.graph || !Project.state.selectedSheetId) return {
            status: false,
            error: "Graph not initialized"
        };

        const sheet = Project.state.graph.sheets[Project.state.selectedSheetId];

        // Delete edges first (to avoid orphaned edges)
        for(const edgeKey of edgeKeys) {
            const edge = findEdgeByKey(sheet.edgeMap, edgeKey);
            if(edge) {
                // Remove from target map
                if(edge.target) {
                    const targetKey = `target-${edge.target}`;
                    let targetEdges = sheet.edgeMap.get(targetKey) || [];
                    targetEdges = targetEdges.filter(e => e._key !== edgeKey);
                    if(targetEdges.length > 0) {
                        sheet.edgeMap.set(targetKey, targetEdges);
                    } else {
                        sheet.edgeMap.delete(targetKey);
                    }
                }

                // Remove from source map
                if(edge.source) {
                    const sourceKey = `source-${edge.source}`;
                    let sourceEdges = sheet.edgeMap.get(sourceKey) || [];
                    sourceEdges = sourceEdges.filter(e => e._key !== edgeKey);
                    if(sourceEdges.length > 0) {
                        sheet.edgeMap.set(sourceKey, sourceEdges);
                    } else {
                        sheet.edgeMap.delete(sourceKey);
                    }
                }
            }
        }

        // Delete nodes
        for(const nodeKey of nodeKeys) {
            sheet.nodeMap.delete(nodeKey);
        }

        Project.state.refreshCurrentEntryDataType?.();

        // Redraw the graph if GPU motor is available
        if(gpuMotor.current) {
            gpuMotor.current.requestRedraw();
        }

        return {
            status: true,
        };
    }, [Project.state.graph, Project.state.selectedSheetId, Project.state.refreshCurrentEntryDataType]);

    const batchDeleteElements = useCallback(async (nodeKeys: string[], edgeKeys: string[]): Promise<ActionContext> => {
        const start = Date.now();

        if(!Project.state.selectedSheetId) {
            return {
                timeTaken: Date.now() - start,
                reason: "No sheet selected",
                status: false,
            };
        }

        if(!Project.state.graph) {
            return {
                timeTaken: Date.now() - start,
                reason: "Graph not initialized",
                status: false,
            };
        }

        const sheet = Project.state.graph.sheets[Project.state.selectedSheetId];

        // Create a set of edge keys for faster lookup
        const edgeKeysSet = new Set(edgeKeys);
        const finalEdgeKeys: string[] = [];

        // Find all edges connected to the nodes being deleted
        for(const nodeKey of nodeKeys) {
            // Find edges where this node is the source
            const sourceKey = `source-${nodeKey}`;
            const sourceEdges = sheet.edgeMap.get(sourceKey) || [];
            for(const edge of sourceEdges) {
                if(!edgeKeysSet.has(edge._key)) {
                    edgeKeysSet.add(edge._key);
                }
            }

            // Find edges where this node is the target
            const targetKey = `target-${nodeKey}`;
            const targetEdges = sheet.edgeMap.get(targetKey) || [];
            for(const edge of targetEdges) {
                if(!edgeKeysSet.has(edge._key)) {
                    edgeKeysSet.add(edge._key);
                }
            }
        }

        // Filter out undeletable edges
        for(const edgeKey of edgeKeysSet) {
            const edge = findEdgeByKey(sheet.edgeMap, edgeKey);
            if(edge) {
                finalEdgeKeys.push(edgeKey);
            }
        }

        // Ensure we have something to delete
        if(nodeKeys.length === 0 && finalEdgeKeys.length === 0) {
            return {
                timeTaken: Date.now() - start,
                reason: "No elements to delete",
                status: false,
            };
        }

        const message: WSMessage<WSBatchDeleteElements> = {
            type: "batchDeleteElements",
            sheetId: Project.state.selectedSheetId,
            nodeKeys: nodeKeys,
            edgeKeys: finalEdgeKeys
        };

        const response = await sendMessage(message) as WSResponseMessage<WSBatchDeleteElements>;

        if(response && response._response) {
            if(response._response.status) {
                const output = await applyBatchDelete(response.nodeKeys, response.edgeKeys);
                if(!output.status) {
                    return {
                        reason: output.error || "Unknown error applying batch delete",
                        timeTaken: Date.now() - start,
                        status: false
                    };
                } else {
                    return {
                        timeTaken: Date.now() - start,
                        status: true
                    };
                }
            } else {
                console.error("Server error while sending batch delete message:", message, " | server output:", response);
                return {
                    timeTaken: Date.now() - start,
                    reason: response._response.message || "Unknown server error while sending batch delete message",
                    status: false,
                };
            }
        } else {
            console.error("Client error while sending batch delete message:", message);
            return {
                timeTaken: Date.now() - start,
                reason: "Unknown client error while sending batch delete message",
                status: false,
            };
        }
    }, [Project.state.selectedSheetId, Project.state.graph, sendMessage, applyBatchDelete]);

    useEffect(() => {
        Project.dispatch({
            field: "batchDeleteElements",
            value: batchDeleteElements
        });
    }, [batchDeleteElements]);

    const handleIncomingMessage = useCallback(async (packet:WSMessage<any>) => {
        if(packet.type === "applyInstructionToGraph") {
            const message = packet as WSMessage<WSApplyInstructionToGraph>;
            await applyGraphInstructions(message.instructions);
        } else if(packet.type === "batchCreateElements") {
            const message = packet as WSMessage<WSBatchCreateElements>;
            await applyBatchCreate(message.nodes, message.edges);
        } else if(packet.type === "batchDeleteElements") {
            const message = packet as WSMessage<WSBatchDeleteElements>;
            await applyBatchDelete(message.nodeKeys, message.edgeKeys);
        } else if(packet.type === "applyInstructionToNodeConfig") {
            const message = packet as WSMessage<WSApplyInstructionToNodeConfig>;
            await applyNodeConfigInstructions(message.instructions);
        }
    }, [applyGraphInstructions, applyBatchCreate, applyBatchDelete, applyNodeConfigInstructions]);


    const workingOnCaughtUp = useRef(false);

    useEffect(() => {
        const { caughtUpMessage, graph } = Project.state;
        if (!caughtUpMessage || !graph || !handleIncomingMessage) return;

        if (workingOnCaughtUp.current) return;
        workingOnCaughtUp.current = true;

        const messages = deepCopy(caughtUpMessage);
        let cancelled = false;

        const processMessages = async () => {
            await new Promise((r) => requestAnimationFrame(r)); // yield to next frame
            console.log(`Caught up on ${messages.length} message(s)`, messages);

            for (const message of messages) {
                if (cancelled) break;
                await handleIncomingMessage(message);
            }

            workingOnCaughtUp.current = false;
        };

        processMessages();

        // clear caughtUpMessage right away
        Project.dispatch({ field: "caughtUpMessage", value: undefined });

        // Cleanup in case the effect re-runs or unmounts
        return () => {
            cancelled = true;
            workingOnCaughtUp.current = false;
        };
    }, [Project.state.graph, Project.state.caughtUpMessage, handleIncomingMessage]);


    useEffect(() => {
        setMessageHandler(handleIncomingMessage);
    }, [setMessageHandler, handleIncomingMessage]);


    const generateUniqueId = useCallback(async (amount:number) : Promise<string[]|undefined> => {

        const message:WSMessage<WSGenerateUniqueId> = {
            type: "generateUniqueId",
            ids: Array.from({ length: amount }),
        }
        const response = await sendMessage(message) as WSResponseMessage<WSGenerateUniqueId>;
        if(response && response._response.status) {
            return response.ids;
        }

        return undefined;
    }, []);

    useEffect(() => {
        Project.dispatch({
            field: "generateUniqueId",
            value: generateUniqueId
        })
    }, [generateUniqueId]);

    const retrieveDataTypeAbordController = useRef<AbortController>(undefined);
    const retrieveDataType = async () => {
        if(retrieveDataTypeAbordController.current) {
            retrieveDataTypeAbordController.current.abort();
        }
        retrieveDataTypeAbordController.current = new AbortController();
        const response = await fetch(`http://localhost:8426/api/type/list`, {
            method: "POST",
            signal: retrieveDataTypeAbordController.current.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                workspace: "root"
            })
        });
        if(response.status === 200) {
            const json:DataTypeClass[] = await response.json();
            Project.dispatch({
                field: "dataTypes",
                value: json
            });
        }else {
            Project.dispatch({
                field: "dataTypes",
                value: undefined
            });
        }
    }

    const retrieveEnumAbordController = useRef<AbortController>(undefined);
    const retrieveEnum = async () => {
        if(retrieveEnumAbordController.current) {
            retrieveEnumAbordController.current.abort();
        }
        retrieveEnumAbordController.current = new AbortController();
        const response = await fetch(`http://localhost:8426/api/enum/list`, {
            method: "POST",
            signal: retrieveEnumAbordController.current.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                workspace: "root"
            })
        });
        if(response.status === 200) {
            const json:EnumClass[] = await response.json();
            Project.dispatch({
                field: "enumTypes",
                value: json
            });
        }else {
            Project.dispatch({
                field: "enumTypes",
                value: undefined
            });
        }
    }


    useEffect(() => {

        const emptyCurrentDataType = () => {
            Project.dispatch({
                field: "currentEntryDataType",
                value: undefined
            });
        }

        if(!Project.state.graph || !Project.state.dataTypes) {
            return emptyCurrentDataType();
        }

        const nodeRoot = findFirstNodeWithId(Project.state.graph, "root")!;
        if(!nodeRoot || nodeRoot.handles["0"] == undefined || nodeRoot.handles["0"].point.length == 0) return emptyCurrentDataType();

        const connectedNodeToEntry = findNodeConnected(Project.state.graph, nodeRoot, "in");
        let nodeType = connectedNodeToEntry.find((n) => n.type === "entryType") as Node<NodeTypeEntryType>;

        if(nodeType) {
            Project.dispatch({
                field: "currentEntryDataType",
                value: Project.state.dataTypes.find((type) => type._key === nodeType.data!._key)
            });
        } else {
            return emptyCurrentDataType();
        }


    }, [Project.state.graph, Project.state.dataTypes]);

    const retrieveCurrentDataTypeEntry = useCallback(() => {
        const emptyCurrentDataType = () => {
            Project.dispatch({
                field: "currentEntryDataType",
                value: undefined
            });
        }

        if(!Project.state.graph || !Project.state.dataTypes) {
            return emptyCurrentDataType();
        }

        const nodeRoot = findFirstNodeWithId(Project.state.graph, "root")!;
        if(!nodeRoot || nodeRoot.handles["0"] == undefined || nodeRoot.handles["0"].point.length == 0) return emptyCurrentDataType();

        const connectedNodeToEntry = findNodeConnected(Project.state.graph, nodeRoot, "in");
        let nodeType = connectedNodeToEntry.find((n) => n.type === "entryType") as Node<NodeTypeEntryType>;

        if(nodeType) {
            Project.dispatch({
                field: "currentEntryDataType",
                value: Project.state.dataTypes.find((type) => type._key === nodeType.data!._key)
            });
        } else {
            return emptyCurrentDataType();
        }
    }, [Project.state.graph, Project.state.dataTypes]);

    useEffect(() => {
        if(Project.state.graph) {
            retrieveCurrentDataTypeEntry();
        }
        Project.dispatch({
            field: "refreshCurrentEntryDataType",
            value: retrieveCurrentDataTypeEntry,
        });
    }, [retrieveCurrentDataTypeEntry]);


    useEffect(() => {
        retrieveDataType().then(retrieveEnum);
        Project.dispatch({
            field: "refreshAvailableDataTypes",
            value: retrieveDataType
        });
        Project.dispatch({
            field: "refreshAvailableEnums",
            value: retrieveEnum
        });
    }, []);

    const resetState = useCallback(() => {
        Object.values(htmlRenderer.current ?? {}).forEach(node =>
            Object.values(node).forEach(item => item.htmlMotor?.dispose())
        );
        if(Project.state.editedHtml) {
            Project.dispatch({
                field: "editedHtml",
                value: undefined
            });
        }
        Project.dispatch({
            field: "graph",
            value: undefined
        });
        gpuMotor.current?.resetScene();
        disconnect();
    }, [Project.state.editedHtml, Project.state.editedHtml, disconnect]);


    /* ----------------------------------------------------------------------------------------------------------- */

    return {gpuMotor, activeWindow, setActiveWindow, resetState}
}