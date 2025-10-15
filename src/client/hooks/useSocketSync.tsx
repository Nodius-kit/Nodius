import {useCallback, useContext, useEffect, useRef, useState} from "react";
import {ActionContext, ProjectContext, UpdateHtmlOption} from "./contexts/ProjectContext";
import {api_sync_graph, api_sync_graph_info} from "../../utils/requests/type/api_sync.type";
import {HtmlClass, HtmlObject} from "../../utils/html/htmlType";
import {Graph} from "../../utils/graph/graphType";
import {WebGpuMotor} from "../schema/motor/webGpuMotor";
import {api_graph_html} from "../../utils/requests/type/api_workflow.type";
import {edgeArrayToMap, findEdgeByKey, findFirstNodeByType, nodeArrayToMap} from "../../utils/graph/nodeUtils";
import {HtmlRender, HtmlRenderOption} from "../../process/html/HtmlRender";
import {useWebSocket} from "./useWebSocket";
import {
    applyInstruction,
    BeforeApplyInstruction, BeforeApplyInstructionWithContext,
    Instruction,
} from "../../utils/sync/InstructionBuilder";
import {
    GraphInstructions,
    WSApplyInstructionToGraph,
    WSMessage,
    WSRegisterUser,
    WSResponseMessage
} from "../../utils/sync/wsObject";
import {deepCopy} from "../../utils/objectUtils";

export const useSocketSync = () => {

    const Project = useContext(ProjectContext);

    const [activeWindow, setActiveWindow] = useState<number>(0);

    const htmlRenderer = useRef<Record<string, HtmlRender>>({});

    const gpuMotor = useRef<WebGpuMotor | null>(null);

    const [serverInfo, setServerInfo] = useState<api_sync_graph_info>();

    const { connect, sendMessage, setMessageHandler, connectionState, stats, disconnect } = useWebSocket(
        true,  // autoReconnect
        1000,  // reconnectInterval (ms)
        3      // maxReconnectAttempts
    );

    /*useEffect(() => {
        console.log(stats);
    }, [stats]);*/


    /* ------------------------------------ HTML RENDER STORAGE --------------------------------------------------- */
    const initiateNewHtmlRenderer = async (id:string, container:HTMLElement, options?:HtmlRenderOption) => {
        htmlRenderer.current[id] = new HtmlRender(container, options);
        return htmlRenderer.current[id];
    };

    const getHtmlRenderer = (id:string) => htmlRenderer.current[id];
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
    /* ----------------------------------------------------------------------------------------------------------- */

    /* ---------------------------- REQUEST A SERVER CONNECTION BASED ON GRAPH UNIQUE KEY ------------------------- */
    const initWebSocketAbortController = useRef<AbortController>(undefined);
    const retrieveServerInfo = useCallback(async (graphKey:string):Promise<api_sync_graph_info |undefined> => {
        // look for server
        if(initWebSocketAbortController.current) {
            initWebSocketAbortController.current.abort();
        }
        initWebSocketAbortController.current = new AbortController();
        const response = await fetch('http://localhost:8426/api/sync/graph', {
            method: "POST",
            signal: initWebSocketAbortController.current.signal,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                graphKey: graphKey
            } as api_sync_graph)
        });

        if(response.status !== 200) {
            return undefined;
        }

        return await response.json() as api_sync_graph_info;
    }, []);
    /* ----------------------------------------------------------------------------------------------------------- */

    /* -------------------------- START A SYNC WITH THE SERVER BASED ON A HTMLCLASS/GRAPH ------------------------ */
    const openHtmlClassAbortController = useRef<AbortController>(undefined);
    const openHtmlClass = useCallback(async (html:HtmlClass, graph?:Graph):Promise<ActionContext> => {
        const start = Date.now();

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
                        onlyFirstSheet: true
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

        if(!gpuMotor.current) {
            return {
                timeTaken: Date.now() - start,
                reason: "Can't start the synchronization, the GPU display is not working",
                status: false,
            }
        }

        const serverInfo = await retrieveServerInfo(htmlGraph._key);
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

        const registerUser:WSMessage<WSRegisterUser> = {
            type: "registerUser",
            userId: Array.from({length: 32}, () => Math.random().toString(36)[2]).join(''),
            name: "User",
            sheetId: selectedSheetId,
            graphKey: htmlGraph._key
        }
        const response = await sendMessage(registerUser);
        if(!response || !response._response.status) {
            disconnect();
            return {
                timeTaken: Date.now() - start,
                reason: "Server didn't accept our registration",
                status: false,
            }
        }

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
            field: "html",
            value: html
        });
        Project.dispatch({
            field: "isSynchronized",
            value: true
        });

        /*const htmlNode = findFirstNodeByType(htmlGraph, "html");
        if(htmlNode) {
            htmlNode.data = html.object;
        }*/


        gpuMotor.current.setScene({
            nodes: htmlGraph.sheets[selectedSheetId].nodeMap,
            edges: htmlGraph.sheets[selectedSheetId].edgeMap
        });
        gpuMotor.current.resetViewport();

        setActiveWindow(1);
        return {
            timeTaken: Date.now() - start,
            status: true,
        }
    }, [connect, disconnect]);

    setMessageHandler((message) => {
        console.log('Received:', message);
    });

    useEffect(() => {
        Project.dispatch({
            field: "openHtmlClass",
            value: openHtmlClass
        })
    }, [openHtmlClass]);

    const handleIntructionToGraph = useCallback(async (WSMessage:WSApplyInstructionToGraph, beforeApply?: BeforeApplyInstructionWithContext):Promise<{status:boolean, error?:string}> => {
        if(!Project.state.graph || !Project.state.selectedSheetId) return {
            status: false,
            error: "Graph not initialized"
        };

        for(const instruction of WSMessage.instructions) {
            if(instruction.nodeId) {
                const node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(instruction.nodeId);
                if(!node) {
                    return {
                        status: false,
                        error: "Can't find node with id :"+instruction.nodeId,
                    };
                }
                const newNode = applyInstruction(node, instruction.i, beforeApply ? ((objectBeingApplied) => beforeApply(instruction, objectBeingApplied)) : undefined);
                if(newNode.success) {
                    Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.set(instruction.nodeId, newNode.value);
                    return {
                        status: true,
                    }
                } else {
                    console.error(newNode, instruction.i, node);
                    return {
                        status: false,
                        error: "Error while applied instruction to destination node, should not append:"+JSON.stringify(newNode),
                    };
                }
            } else if(instruction.edgeId) {
                const oldNEdge = findEdgeByKey(Project.state.graph.sheets[Project.state.selectedSheetId].edgeMap, instruction.edgeId);
                if(!oldNEdge) {
                    return {
                        status: false,
                        error: "Can't find edge with id :"+instruction.edgeId,
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
                    };
                }
            }
        }
        return {
            status: true,
        }
    }, [Project.state.graph, Project.state.editedHtml, Project.state.selectedSheetId]);


    const updateGraph = useCallback(async (instructions:Array<GraphInstructions>):Promise<ActionContext> => {
        const start = Date.now();
        const message:WSMessage<WSApplyInstructionToGraph> = {
            type: "applyInstructionToGraph",
            instructions: instructions
        }

        const response = await sendMessage(message) as WSResponseMessage<WSApplyInstructionToGraph>;

        if(response && response._response) {
            if(response._response.status) {
                const instructionOutput = await handleIntructionToGraph(response,(currentGraphInstrution, objectBeingApplied) => {
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

                    let redrawGraph = false;
                    for(const instruction of instructions) {
                        if(instruction.edgeId && !instruction.noRedraw) {
                            redrawGraph = true;
                        } else if(instruction.nodeId) {
                            // if instruction (coming from another user) include current editing node, apply instruction to the edited html
                            if(Project.state.editedHtml && instruction.nodeId === Project.state.editedHtml.node._key) {
                                const newNode = Project.state.graph!.sheets[Project.state.selectedSheetId!].nodeMap.get(Project.state.editedHtml.node._key)!;
                                let objectHtml: any = newNode;
                                Project.state.editedHtml.pathToEdit.forEach((path) => {
                                    objectHtml = objectHtml[path];
                                });
                                Project.state.editedHtml.html.object = objectHtml;
                                Project.state.editedHtml.node = newNode;
                                Project.dispatch({
                                    field: "editedHtml",
                                    value: {...Project.state.editedHtml}
                                });
                                if(!instruction.noRedraw) {
                                    await Project.state.editedHtml.htmlRender.render(Project.state.editedHtml.html.object);
                                }
                            } else if(!instruction.noRedraw) {
                                redrawGraph = true;
                            }

                            // trigger node event update
                            const nodeHtml = document.querySelector('[data-node-key="'+instruction.nodeId+'"]');
                            if(nodeHtml) {
                                nodeHtml.dispatchEvent(new Event("nodeUpdate", {
                                    bubbles: false,
                                }))
                            }
                        }
                    }

                    if(redrawGraph) {
                        gpuMotor.current!.requestRedraw();
                    }
                    return {
                        timeTaken: Date.now() - start,
                        status: true,
                    }
                } else {
                    return {
                        timeTaken: Date.now() - start,
                        status: false,
                        reason: instructionOutput.error ?? "Unknown error"
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
    }, [Project.state.editedHtml, Project.state.graph]);

    useEffect(() => {
        Project.dispatch({
            field: "updateGraph",
            value: updateGraph
        });
    }, [updateGraph])

    const updateHtml = useCallback(async (instructionHtml:Instruction, options?:UpdateHtmlOption): Promise<ActionContext> => {
        if(!Project.state.editedHtml) return {
            timeTaken: 0,
            reason: "No current edited HTML",
            status: false,
        };

        const instruction = deepCopy(instructionHtml);

        if(instruction.p) {
            instruction.p = [...Project.state.editedHtml.pathToEdit, ...instruction.p];
        }

        return await updateGraph([
            {
                i: instruction,
                nodeId: Project.state.editedHtml.node._key,
                applyUniqIdentifier: "identifier",
                targetedIdentifier: options?.targetedIdentifier,
                noRedraw: options?.noRedraw
            }
        ]);
        /*
        const message:WSMessage<WSApplyInstructionToGraph> = {
            type: "applyInstructionToGraph",
            instructions: [
                {
                    i: instruction,
                    nodeId: Project.state.editedHtml.node._key,
                    applyUniqIdentifier: "identifier",
                    targetedIdentifier: options?.targetedIdentifier
                }
            ]
        }

        const response = await sendMessage(message) as WSResponseMessage<WSApplyInstructionToGraph>;

        if(response && response._response) {
            if(response._response.status) {
                const instructionOutput = await handleIntructionToGraph(response,(currentGraphInstrution, objectBeingApplied) => {
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

                    const newNode = Project.state.graph!.sheets[Project.state.selectedSheetId!].nodeMap.get(Project.state.editedHtml.node._key)!;

                    let objectHtml:any = newNode;
                    Project.state.editedHtml.pathToEdit.forEach((path) => {
                        objectHtml = objectHtml[path];
                    });
                    Project.state.editedHtml.html.object = objectHtml;
                    Project.state.editedHtml.node = newNode;
                    Project.dispatch({
                        field: "editedHtml",
                        value: {...Project.state.editedHtml}
                    });
                    if(!options?.noRedraw) {
                        await Project.state.editedHtml.htmlRender.render(Project.state.editedHtml.html.object);
                    }
                    return {
                        timeTaken: Date.now() - start,
                        status: true,
                    }
                } else {
                    return {
                        timeTaken: Date.now() - start,
                        status: false,
                        reason: instructionOutput.error ?? "Unknown error"
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
        }*/
        /*
        if(newHtml.success) {
            editedHtml.html.object = newHtml.value;
            setEditedHtml({...editedHtml});
            editedHtml.node.data = editedHtml.html.object;
            if(!options?.noRedraw) {
                await editedHtml.htmlRender.render(editedHtml.html.object);
            }
        } else {
            console.error(newHtml);
        }*/

    }, [Project.state.editedHtml, sendMessage, Project.state.selectedSheetId, Project.state.graph, updateGraph]);

    useEffect(() => {
        Project.dispatch({
            field: "updateHtml",
            value: updateHtml
        });
    }, [updateHtml]);

    /* ----------------------------------------------------------------------------------------------------------- */

    return {gpuMotor, activeWindow, setActiveWindow}
}