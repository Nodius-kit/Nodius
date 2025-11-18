import {useCallback, useContext, useEffect, useRef, useState} from "react";
import {
    ActionContext,
    DisabledNodeInteractionType,
    EditedHtmlType,
    htmlRenderContext,
    ProjectContext
} from "./contexts/ProjectContext";
import {api_sync, api_sync_info} from "../../utils/requests/type/api_sync.type";
import {useWebSocket} from "./useWebSocket";
import {HtmlClass, HtmlObject} from "../../utils/html/htmlType";
import {Graph, NodeTypeConfig, Node, Edge, NodeTypeEntryType} from "../../utils/graph/graphType";
import {api_graph_html} from "../../utils/requests/type/api_workflow.type";
import {
    createNodeFromConfig,
    edgeArrayToMap,
    findEdgeByKey,
    findFirstNodeWithId, findNodeConnected,
    nodeArrayToMap
} from "../../utils/graph/nodeUtils";
import {
    GraphInstructions,
    nodeConfigInstructions,
    WSApplyInstructionToGraph,
    WSApplyInstructionToNodeConfig,
    WSBatchCreateElements,
    WSBatchDeleteElements,
    WSGenerateUniqueId,
    WSMessage,
    WSRegisterUserOnGraph,
    WSRegisterUserOnNodeConfig,
    WSResponseMessage
} from "../../utils/sync/wsObject";
import {useStableProjectRef} from "./useStableProjectRef";
import {applyInstruction, BeforeApplyInstructionWithContext} from "../../utils/sync/InstructionBuilder";
import {DataTypeClass, EnumClass} from "../../utils/dataType/dataType";
import {api_node_config_get} from "../../utils/requests/type/api_nodeconfig.type";
import {deepCopy} from "../../utils/objectUtils";
import {triggerNodeUpdateOption} from "../schema/SchemaDisplay";
import {modalManager} from "../../process/modal/ModalManager";

export const useSocketSync = () => {
    const Project = useContext(ProjectContext);
    const projectRef = useStableProjectRef();
    const [serverInfo, setServerInfo] = useState<api_sync_info>();

    const { connect, sendMessage, setMessageHandler, connectionState, stats, disconnect } = useWebSocket(
        true,  // autoReconnect
        1000,  // reconnectInterval (ms)
        3      // maxReconnectAttempts
    );


    /* ---------------------------- REQUEST A SERVER CONNECTION BASED ON GRAPH UNIQUE KEY ------------------------- */
    const initWebSocketAbortController = useRef<AbortController>(undefined);
    const retrieveServerInfo = useCallback(async (body:api_sync):Promise<api_sync_info |undefined> => {
        // look for server
        if(initWebSocketAbortController.current) {
            initWebSocketAbortController.current.abort();
        }
        initWebSocketAbortController.current = new AbortController();
        const response = await fetch('/api/sync', {
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


    /*
    initiateNewHtmlRender: (context:htmlRenderContext) => boolean,
    getHtmlRenderWithId: (nodeId:string, renderId:string) => htmlRenderContext|undefined,
    getHtmlRenderOfNode: (nodeId:string) => htmlRenderContext[],
    getAllHtmlRender: () => htmlRenderContext[],
    removeHtmlRender: (nodeId:string, renderId:string) => void,
     */

    const htmlRender = useRef<Map<string, htmlRenderContext[]>>(new Map());

    /* ---------------------------- MISSING NODE CONFIG QUEUE SYSTEM ------------------------- */
    const fetchingNodeConfigs = useRef<Set<string>>(new Set());
    const fetchNodeConfigAbortControllers = useRef<Map<string, AbortController>>(new Map());

    const fetchMissingNodeConfig = useCallback(async (nodeType: string, workspace: string): Promise<NodeTypeConfig | undefined> => {
        // Check if already fetching
        if (fetchingNodeConfigs.current.has(nodeType)) {
            return undefined;
        }

        // Check if already loaded
        if (projectRef.current.state.nodeTypeConfig[nodeType]) {
            return projectRef.current.state.nodeTypeConfig[nodeType];
        }

        // Mark as fetching
        fetchingNodeConfigs.current.add(nodeType);

        // Cancel any previous request for this node type
        const existingController = fetchNodeConfigAbortControllers.current.get(nodeType);
        if (existingController) {
            existingController.abort();
        }

        // Create new abort controller
        const abortController = new AbortController();
        fetchNodeConfigAbortControllers.current.set(nodeType, abortController);

        try {
            const response = await fetch('/api/nodeconfig/get', {
                method: "POST",
                signal: abortController.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspace: workspace,
                    _key: nodeType
                } as api_node_config_get),
            });

            if (response.status === 200) {
                const nodeConfig = await response.json() as NodeTypeConfig;
                if (nodeConfig) {
                    // Store in state
                    projectRef.current.state.nodeTypeConfig[nodeConfig._key] = nodeConfig;
                    Project.dispatch({
                        field: "nodeTypeConfig",
                        value: { ...projectRef.current.state.nodeTypeConfig }
                    });

                    // Trigger visibility recompute to render nodes that were waiting for this config
                    projectRef.current.state.computeVisibility?.();

                    return nodeConfig;
                }
            } else {
                console.warn(`Failed to fetch node config for type "${nodeType}": HTTP ${response.status}`);
            }
        } catch (error) {
            if ((error as Error).name !== 'AbortError') {
                console.error(`Error fetching node config for type "${nodeType}":`, error);
            }
        } finally {
            // Remove from fetching set
            fetchingNodeConfigs.current.delete(nodeType);
            fetchNodeConfigAbortControllers.current.delete(nodeType);
        }

        return undefined;
    }, []);

    useEffect(() => {
        Project.dispatch({
            field: "fetchMissingNodeConfig",
            value: fetchMissingNodeConfig
        });
    }, [fetchMissingNodeConfig]);
    /* ----------------------------------------------------------------------------------------------------------- */

    const initiateNewHtmlRender = (context:htmlRenderContext):htmlRenderContext|undefined => {
        const contexts  = htmlRender.current.get(context.nodeId) ?? [];
        if(contexts.some((c) => c.renderId === context.renderId)) {
            return contexts.find((c) => c.renderId === context.renderId);
        }
        contexts.push(context);
        htmlRender.current.set(context.nodeId, contexts);
        return context;
    }
    const getHtmlRenderWithId = (nodeId:string, renderId:string) => {
        const contexts = htmlRender.current.get(nodeId) ?? [];
        return  contexts.find((c) => c.renderId === renderId);
    }

    const getHtmlRenderOfNode = (nodeId:string) => {
        return htmlRender.current.get(nodeId) ?? [];
    }

    const getAllHtmlRender = () => Array.from(htmlRender.current.values()).flat();

    const removeHtmlRender = (nodeId:string, renderId:string) => {
        const contexts = htmlRender.current.get(nodeId) ?? [];
        const context = contexts.find((c) => c.renderId === renderId);
        if(context) {
            context.htmlRender.dispose();
            htmlRender.current.set(context.nodeId, contexts.filter((c) => c.renderId !== renderId));
        }
    }

    useEffect(() => {
        Project.dispatch({
            field: "initiateNewHtmlRender",
            value: initiateNewHtmlRender
        });
        Project.dispatch({
            field: "getHtmlRenderWithId",
            value: getHtmlRenderWithId
        });
        Project.dispatch({
            field: "getHtmlRenderOfNode",
            value: getHtmlRenderOfNode
        });
        Project.dispatch({
            field: "getAllHtmlRender",
            value: getAllHtmlRender
        });
        Project.dispatch({
            field: "removeHtmlRender",
            value: removeHtmlRender
        })
    }, []);


    const openHtmlEditor = async (context: htmlRenderContext, pathOfEdit:string[]) => {
        if(projectRef.current.state.editedHtml && projectRef.current.state.editedHtml.htmlRenderContext.nodeId !== context.nodeId && projectRef.current.state.editedHtml.htmlRenderContext.renderId !== context.renderId) {
            await closeHtmlEditor();
        } else if(projectRef.current.state.editedHtml && projectRef.current.state.editedHtml.htmlRenderContext.nodeId === context.nodeId && projectRef.current.state.editedHtml.htmlRenderContext.renderId === context.renderId) {
            return projectRef.current.state.editedHtml;
        }

        await context.htmlRender.setBuildingMode(true);

        const edited:EditedHtmlType = {
            updateHtmlObject: async (graphInstructions) => {
                const clonedInstructions = deepCopy(graphInstructions);
                for(const graphInstruction of clonedInstructions) {
                    graphInstruction.i.p = [...pathOfEdit, ...graphInstruction.i.p ?? []];
                }
                if(projectRef.current.state.editedNodeConfig && context.nodeId === "0") {
                    // updateNodeConfig
                    const output = await projectRef.current.state.updateNodeConfig!(clonedInstructions.map((g) =>
                        (
                            {
                                ...g,
                                nodeId: context.nodeId,
                            }
                        )
                    ));
                    return output;
                } else {
                    // update graph
                    const output = await projectRef.current.state.updateGraph!(clonedInstructions.map((g) =>
                        (
                            {
                                ...g,
                                nodeId: context.nodeId,
                            }
                        )
                    ));
                    return output;
                }

            },
            htmlRenderContext: context
        }


        projectRef.current.dispatch({
            field: "editedHtml",
            value: edited
        });

        return edited;
    }

    const closeHtmlEditor = async () => {
        if(projectRef.current.state.editedHtml) {
            const context = projectRef.current.state.editedHtml.htmlRenderContext;
            await context.htmlRender.setBuildingMode(false);
            projectRef.current.dispatch({
                field: "editedHtml",
                value: undefined
            });
        }
    }

    useEffect(() => {
        Project.dispatch({
            field: "closeHtmlEditor",
            value: closeHtmlEditor
        });
        Project.dispatch({
            field: "openHtmlEditor",
            value: openHtmlEditor
        })
    }, []);

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
            const response = await fetch('/api/graph/get', {
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

        if(!projectRef.current.state.getMotor()) {
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
                if(m.instructions) {
                    for (const i of m.instructions) {
                        if(i.dontApplyToMySelf) {
                            delete i.dontApplyToMySelf;
                        }
                        if (i.animatePos) {
                            delete i.animatePos; // no need animation when try to caught up the current graph
                        }
                        if (i.animateSize) {
                            delete i.animateSize; // no need animation when try to caught up the current graph
                        }
                    }
                }
            })
            Project.dispatch({
                field:"caughtUpMessage",
                value: response.missingMessages
            });
        }

        projectRef.current.dispatch({
            field: "selectedSheetId",
            value: selectedSheetId,
        });
        projectRef.current.dispatch({
            field: "graph",
            value: htmlGraph,
        });

        Project.dispatch({
            field: "disabledNodeInteraction",
            value: {}
        });


        const rootNode = findFirstNodeWithId(htmlGraph, "root");
        projectRef.current.state.getMotor().removeCameraAreaLock();
        if(rootNode) {
            projectRef.current.state.getMotor().smoothFitToArea({
                minX: rootNode.posX,
                maxX: rootNode.posX+rootNode.size.width,
                minY: rootNode.posY,
                maxY: rootNode.posY+rootNode.size.height
            }, {
                padding: 100
            })
        } else {
            projectRef.current.state.getMotor().resetViewport();
        }
        projectRef.current.dispatch({
            field: "activeAppMenuId",
            value: "schemaEditor"
        });

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
        const request = await fetch('/api/nodeconfig/get', {
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

        if(!projectRef.current.state.getMotor()) {
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
                if(m.instructions) {
                    for (const i of m.instructions) {
                        if(i.dontApplyToMySelf) {
                            delete i.dontApplyToMySelf;
                        }
                        if (i.animatePos) {
                            delete i.animatePos; // no need animation when try to caught up the current graph
                        }
                        if (i.animateSize) {
                            delete i.animateSize; // no need animation when try to caught up the current graph
                        }
                    }
                }
            })
            Project.dispatch({
                field:"caughtUpMessage",
                value: response.missingMessages
            });
        }

        projectRef.current.state.nodeTypeConfig[nodeConfig._key] = nodeConfig;
        Project.dispatch({
            field: "nodeTypeConfig",
            value: {...projectRef.current.state.nodeTypeConfig}
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
            value: nodeConfig._key
        });



        const disabled:DisabledNodeInteractionType = {};
        disabled[baseNode._key] = {};
        disabled[baseNode._key].moving = true;

        Project.dispatch({
            field: "disabledNodeInteraction",
            value: disabled
        });


        const padding = 500;
        projectRef.current.state.getMotor().lockCameraToArea({
            minX: baseNode.posX - padding,
            minY: baseNode.posY - padding,
            maxX: baseNode.posX + baseNode.size.width + padding,
            maxY: baseNode.posY + baseNode.size.height + padding,
        });
        projectRef.current.state.getMotor().smoothFitToArea({
            minX: baseNode.posX,
            minY: baseNode.posY,
            maxX: baseNode.posX + baseNode.size.width,
            maxY: baseNode.posY + baseNode.size.height,
        }, {
            padding: padding
        })

        projectRef.current.dispatch({
            field: "activeAppMenuId",
            value: "schemaEditor"
        });
        return {
            timeTaken: Date.now() - start,
            status: true,
        }
    }, [connect, disconnect, connectionState]);

    useEffect(() => {
        Project.dispatch({
            field: "openNodeConfig",
            value: openNodeConfig
        })
    }, [openNodeConfig]);

    const handleIntructionToGraph = useCallback(async (instructions:GraphInstructions[], beforeApply?: BeforeApplyInstructionWithContext):Promise<{status:boolean, error?:string, shouldUpdateNode:boolean}> => {
        if(!projectRef.current.state.graph || !projectRef.current.state.selectedSheetId) return {
            status: false,
            error: "Graph not initialized",
            shouldUpdateNode: false
        };

        let shouldUpdateNode = false;

        for(const instruction of instructions) {
            if(instruction.nodeId) {
                const node = projectRef.current.state.graph!.sheets[projectRef.current.state.selectedSheetId!].nodeMap.get(instruction.nodeId);
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
                    projectRef.current.state.graph!.sheets[projectRef.current.state.selectedSheetId!].nodeMap.set(instruction.nodeId, newNode.value);
                } else {
                    return {
                        status: false,
                        error: "Error while applied instruction to destination node, should not append:"+JSON.stringify(newNode),
                        shouldUpdateNode: false
                    };
                }
            } else if(instruction.edgeId) {
                const oldNEdge = findEdgeByKey(projectRef.current.state.graph!.sheets[projectRef.current.state.selectedSheetId!].edgeMap, instruction.edgeId);
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
                        let edgeListTarget = projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId].edgeMap.get(targetKey) ?? [];
                        edgeListTarget = edgeListTarget.filter((e) => e._key !== edges[0]._key);
                        if(edgeListTarget.length > 0) {
                            projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId].edgeMap.set(targetKey, edgeListTarget);
                        } else {
                            projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId].edgeMap.delete(targetKey);
                        }
                    }

                    if(edges[0].source) {
                        const sourceKey = `source-${edges[0].source}`;
                        let edgeListSource = projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId].edgeMap.get(sourceKey) ?? [];
                        edgeListSource = edgeListSource.filter((e) => e._key !== edges[0]._key);
                        if(edgeListSource.length > 0) {
                            projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId].edgeMap.set(sourceKey, edgeListSource);
                        } else {
                            projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId].edgeMap.delete(sourceKey);
                        }
                    }

                    // add new
                    if(edges[1].target) {
                        const targetKey = `target-${edges[1].target}`;
                        let edgeListTarget = projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId].edgeMap.get(targetKey) ?? [];
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
                            projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId].edgeMap.set(targetKey, edgeListTarget);
                        } else {
                            projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId].edgeMap.delete(targetKey);
                        }
                    }

                    if(edges[1].source) {
                        const sourceKey = `source-${edges[1].source}`;
                        let edgeListSource = projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId].edgeMap.get(sourceKey) ?? [];
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
                        projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId].edgeMap.set(sourceKey, edgeListSource);
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
    }, []);

    const applyGraphInstructions = useCallback(async (instructions:Array<GraphInstructions>, fromOutside:boolean = false):Promise<string|undefined> => { // if return undefined -> it's good

        const instructionOutput = await handleIntructionToGraph(fromOutside ? instructions : instructions.filter((i) => !i.dontApplyToMySelf),(currentGraphInstrution, objectBeingApplied) => {
            if(currentGraphInstrution.targetedIdentifier && objectBeingApplied != undefined && !Array.isArray(objectBeingApplied) && ("identifier" in objectBeingApplied || "id" in objectBeingApplied)) {
                const object:HtmlObject = objectBeingApplied;
                if(object.identifier !== currentGraphInstrution.targetedIdentifier && object.id !== currentGraphInstrution.targetedIdentifier) {
                    console.error("wrong action, target:", currentGraphInstrution.targetedIdentifier, "found:", object.identifier);
                    return false;
                }
                return true;
            }
            return true;
        });
        if(instructionOutput.status) {
            const nodeAlreadyCheck:string[] = [];
            const edgeAlreadyCheck:string[] = [];
            for(const instruction of instructions) {

                if(instruction.edgeId) {

                    if(edgeAlreadyCheck.includes(instruction.edgeId)) {
                        continue;
                    }
                    edgeAlreadyCheck.push(instruction.edgeId);

                    // futur work
                } else if(instruction.nodeId) {

                    // avoid triggering multiple event for one nodeid, triggering useless re-render
                    if(nodeAlreadyCheck.includes(instruction.nodeId)) {
                        continue;
                    }
                    nodeAlreadyCheck.push(instruction.nodeId);

                    if(projectRef.current.state.editedCode) {
                        const edited = projectRef.current.state.editedCode.filter((s) => s.nodeId === instruction.nodeId);
                        edited.forEach((e) => e.onOutsideChange?.());
                    }

                    // Trigger node update
                    const options:triggerNodeUpdateOption = {
                        reRenderNodeConfig: instructions.some((i) => i.triggerHtmlRender)
                    };
                    await (window as any).triggerNodeUpdate?.(instruction.nodeId, options);
                    if(options.reRenderNodeConfig && projectRef.current.state.editedHtml) {
                        projectRef.current.dispatch({
                            field: "editedHtml",
                            value: {...projectRef.current.state.editedHtml},
                        })
                    }

                }
            }

            projectRef.current.state.getMotor().requestRedraw();

            refreshCurrentEntryDataType();

            return undefined;
        } else {
            return instructionOutput.error ?? "Unknown error"
        }
    }, []);

    const handleInstructionToNodeConfig = useCallback(async (instructions:Array<nodeConfigInstructions>, beforeApply?: (instruction: nodeConfigInstructions, objectBeingApplied: any) => boolean):Promise<{status:boolean, error?:string, config?: NodeTypeConfig}> => {

        let nodeConfig = projectRef.current.state.nodeTypeConfig[projectRef.current.state.editedNodeConfig!];

        for(const instruction of instructions) {
            const newNodeConfig = applyInstruction(nodeConfig, instruction.i, beforeApply ? ((objectBeingApplied) => beforeApply(instruction, objectBeingApplied)) : undefined);

            if(newNodeConfig.success) {
                nodeConfig = newNodeConfig.value;
            } else {
                return {
                    status: false,
                    error: newNodeConfig.error ?? "Unknown error"
                };
            }
        }

        return {
            status: true,
            config: nodeConfig
        }
    }, []);

    const applyNodeConfigInstructions= useCallback(async (instructions:Array<nodeConfigInstructions>, fromOutside:boolean = false):Promise<string|undefined> => { // if return undefined -> it's good
        const instructionOutput = await handleInstructionToNodeConfig(fromOutside ? instructions : instructions.filter((i) => !i.dontApplyToMySelf), (instruction, objectBeingApplied) => {
            if(instruction.targetedIdentifier && objectBeingApplied != undefined && !Array.isArray(objectBeingApplied) && ("identifier" in objectBeingApplied || "id" in objectBeingApplied)) {
                const object:HtmlObject = objectBeingApplied;
                if(object.identifier !== instruction.targetedIdentifier && object.id !== instruction.targetedIdentifier) {
                    console.error("wrong action, target:", instruction.targetedIdentifier, "found:", object.identifier);
                    return false;
                }
                return true;
            }
            return true;
        });

        if(instructionOutput.status && instructionOutput.config) {
            const nodeConfig = instructionOutput.config;

            // Update the node in the graph
            let baseNode = projectRef.current.state.graph!.sheets[projectRef.current.state.selectedSheetId!].nodeMap.get("0")!;
            for(const key of Object.keys(nodeConfig.node)) {
                (baseNode as any)[key as any] = (nodeConfig.node as any)[key as any];
            }
            projectRef.current.state.graph!.sheets[projectRef.current.state.selectedSheetId!].nodeMap.set("0", baseNode);

            projectRef.current.state.nodeTypeConfig[nodeConfig._key] = nodeConfig;
            Project.dispatch({
                field: "nodeTypeConfig",
                value: {
                    ...projectRef.current.state.nodeTypeConfig,
                }
            });

            if(projectRef.current.state.editedCode) {
                const edited = projectRef.current.state.editedCode.filter((s) => s.nodeId === "0");
                edited.forEach((e) => e.onOutsideChange?.());
            }

            // Trigger node update
            const options:triggerNodeUpdateOption = {
                reRenderNodeConfig: instructions.some((i) => i.triggerHtmlRender)
            };
            await (window as any).triggerNodeUpdate?.("0", options);
            if(options.reRenderNodeConfig && projectRef.current.state.editedHtml) {
                projectRef.current.dispatch({
                    field: "editedHtml",
                    value: {...projectRef.current.state.editedHtml},
                })
            }


            projectRef.current.state.getMotor().requestRedraw();

            return undefined;
        } else {
            return instructionOutput.error ?? "Unknown error"
        }

    }, []);


    const updateNodeConfig = useCallback(async (instructions:Array<nodeConfigInstructions>): Promise<ActionContext> => {
        const start = Date.now();
        const message:WSMessage<WSApplyInstructionToNodeConfig> = {
            type: "applyInstructionToNodeConfig",
            instructions: instructions
        }
        const response = await sendMessage(message) as WSResponseMessage<WSApplyInstructionToNodeConfig>;

        if(response && response._response) {
            if(response._response.status) {
                const output = await applyNodeConfigInstructions(response.instructions);
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
                console.trace();
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
    }, []);
    useEffect(() => {
        Project.dispatch({
            field: "updateNodeConfig",
            value: updateNodeConfig
        })
    }, []);

    const updateGraph = useCallback(async (instructions:Array<GraphInstructions>):Promise<ActionContext> => {

        const start = Date.now();

        if(projectRef.current.state.editedNodeConfig) {
            return await updateNodeConfig(instructions.map((inst) => {

                if(inst.nodeId != undefined) {
                    inst.i.p = ["node", ...(inst.i.p??[])];
                }

                return {
                    i: inst.i,
                    targetedIdentifier: inst.targetedIdentifier,
                    applyUniqIdentifier: inst.applyUniqIdentifier,
                    animatePos: inst.animatePos,
                    animateSize: inst.animateSize,
                    dontApplyToMySelf: inst.dontApplyToMySelf,
                    triggerHtmlRender: inst.triggerHtmlRender
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
                const output = await applyGraphInstructions(response.instructions);
                if (output) {
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
    }, []);

    useEffect(() => {
        Project.dispatch({
            field: "updateGraph",
            value: updateGraph
        })
    }, [updateGraph]);


    const retrieveDataTypeAbordController = useRef<AbortController>(undefined);
    const retrieveDataType = async () => {
        if(retrieveDataTypeAbordController.current) {
            retrieveDataTypeAbordController.current.abort();
        }
        retrieveDataTypeAbordController.current = new AbortController();
        const response = await fetch('/api/type/list', {
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
        } else {
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
        const response = await fetch('/api/enum/list', {
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

    useEffect(() => {
        if(Project.state.activeAppMenuId === "home") {
            Project.dispatch({
                field: "graph",
                value: undefined
            });
            Project.dispatch({
                field: "disabledNodeInteraction",
                value: {}
            });
            Project.dispatch({
                field: "workFlowState",
                value: {
                    active: false,
                    executing: false
                }
            })
            Project.dispatch({
                field: "editedNodeConfig",
                value: undefined
            });
            Project.dispatch({
                field: "editedNodeHandle",
                value: undefined
            });
            Project.dispatch({
                field: "selectedEdge",
                value: []
            });
            Project.dispatch({
                field: "selectedNode",
                value: []
            });

            if(Project.state.editedHtml) {
                Project.state.closeHtmlEditor!();
            }

            modalManager.closeAll();
            getAllHtmlRender().forEach((h) => {
                removeHtmlRender(h.nodeId, h.renderId);
            })
            projectRef.current.state.getMotor()?.resetScene();
            disconnect();
        }
    }, [Project.state.activeAppMenuId]);

    const applyBatchCreate = useCallback(async (nodes: Node<any>[], edges: Edge[]): Promise<{status: boolean, error?: string}> => {
        if(!projectRef.current.state.graph || !projectRef.current.state.selectedSheetId) return {
            status: false,
            error: "Graph not initialized"
        };

        const sheet = projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId];

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

        // Redraw the graph if GPU motor is available
        projectRef.current.state.getMotor()?.requestRedraw();

        refreshCurrentEntryDataType();
        projectRef.current.state.computeVisibility?.();

        return {
            status: true,
        };
    }, []);

    const batchCreateElements = useCallback(async (nodes: Node<any>[], edges: Edge[]): Promise<ActionContext> => {
        const start = Date.now();

        if(!projectRef.current.state.selectedSheetId) {
            return {
                timeTaken: Date.now() - start,
                reason: "No sheet selected",
                status: false,
            };
        }

        const message: WSMessage<WSBatchCreateElements> = {
            type: "batchCreateElements",
            sheetId: projectRef.current.state.selectedSheetId,
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
    }, [sendMessage, applyBatchCreate]);

    useEffect(() => {
        Project.dispatch({
            field: "batchCreateElements",
            value: batchCreateElements
        });
    }, [batchCreateElements]);

    const applyBatchDelete = useCallback(async (nodeKeys: string[], edgeKeys: string[]): Promise<{status: boolean, error?: string}> => {
        if(!projectRef.current.state.graph || !projectRef.current.state.selectedSheetId) return {
            status: false,
            error: "Graph not initialized"
        };

        const sheet = projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId];

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

        const allModal = modalManager.getOpenModals();

        // Delete nodes
        for(const nodeKey of nodeKeys) {
            sheet.nodeMap.delete(nodeKey);
            allModal.filter((m) => m.nodeId === nodeKey).forEach((m) => {
                modalManager.close(m.id);
            });
        }

        // Redraw the graph if GPU motor is available
        projectRef.current.state.getMotor()?.requestRedraw();

        refreshCurrentEntryDataType();
        projectRef.current.state.computeVisibility?.();

        return {
            status: true,
        };
    }, []);

    const batchDeleteElements = useCallback(async (nodeKeys: string[], edgeKeys: string[]): Promise<ActionContext> => {
        const start = Date.now();

        if(!projectRef.current.state.selectedSheetId) {
            return {
                timeTaken: Date.now() - start,
                reason: "No sheet selected",
                status: false,
            };
        }

        if(!projectRef.current.state.graph) {
            return {
                timeTaken: Date.now() - start,
                reason: "Graph not initialized",
                status: false,
            };
        }

        const sheet = projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId];

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
            sheetId: projectRef.current.state.selectedSheetId,
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
    }, [sendMessage, applyBatchDelete]);

    useEffect(() => {
        Project.dispatch({
            field: "batchDeleteElements",
            value: batchDeleteElements
        });
    }, [batchDeleteElements]);

    const handleIncomingMessage = useCallback(async (packet:WSMessage<any>) => {
        if(packet.type === "applyInstructionToGraph") {
            const message = packet as WSMessage<WSApplyInstructionToGraph>;
            await applyGraphInstructions(message.instructions, true);
        } else if(packet.type === "batchCreateElements") {
            const message = packet as WSMessage<WSBatchCreateElements>;
            await applyBatchCreate(message.nodes, message.edges);
        } else if(packet.type === "batchDeleteElements") {
            const message = packet as WSMessage<WSBatchDeleteElements>;
            await applyBatchDelete(message.nodeKeys, message.edgeKeys);
        } else if(packet.type === "applyInstructionToNodeConfig") {
            const message = packet as WSMessage<WSApplyInstructionToNodeConfig>;
            await applyNodeConfigInstructions(message.instructions, true);
        }
    }, [applyGraphInstructions, applyBatchCreate, applyBatchDelete, applyNodeConfigInstructions]);

    useEffect(() => {
        setMessageHandler(handleIncomingMessage);
    }, [setMessageHandler, handleIncomingMessage]);

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

    const refreshCurrentEntryDataType = () => {
        const emptyCurrentDataType = () => {
            projectRef.current.dispatch({
                field: "currentEntryDataType",
                value: undefined
            });
        }

        if(!projectRef.current.state.graph || !projectRef.current.state.dataTypes) {
            return emptyCurrentDataType();
        }

        const nodeRoot = findFirstNodeWithId(projectRef.current.state.graph, "root")!;
        if(!nodeRoot || nodeRoot.handles["0"] == undefined || nodeRoot.handles["0"].point.length == 0) return emptyCurrentDataType();

        const connectedNodeToEntry = findNodeConnected(projectRef.current.state.graph, nodeRoot, "in");
        let nodeType = connectedNodeToEntry.find((n) => n.type === "entryType") as Node<NodeTypeEntryType>;

        if(nodeType) {
            projectRef.current.dispatch({
                field: "currentEntryDataType",
                value: projectRef.current.state.dataTypes.find((type) => type._key === nodeType.data!._key)
            });
        } else {
            return emptyCurrentDataType();
        }
    }

    useEffect(() => {
        refreshCurrentEntryDataType();
        Project.dispatch({
            field: "refreshCurrentEntryDataType",
            value: refreshCurrentEntryDataType,
        });
    }, [Project.state.graph]);
}