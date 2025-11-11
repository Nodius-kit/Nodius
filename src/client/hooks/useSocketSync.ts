import {useCallback, useContext, useEffect, useRef, useState} from "react";
import {ActionContext, ProjectContext} from "./contexts/ProjectContext";
import {api_sync, api_sync_info} from "../../utils/requests/type/api_sync.type";
import {useWebSocket} from "./useWebSocket";
import {HtmlClass, HtmlObject} from "../../utils/html/htmlType";
import {Graph} from "../../utils/graph/graphType";
import {api_graph_html} from "../../utils/requests/type/api_workflow.type";
import {edgeArrayToMap, findEdgeByKey, findFirstNodeWithId, nodeArrayToMap} from "../../utils/graph/nodeUtils";
import {
    GraphInstructions,
    WSApplyInstructionToGraph,
    WSMessage,
    WSRegisterUserOnGraph, WSResponseMessage
} from "../../utils/sync/wsObject";
import {useStableProjectRef} from "./useStableProjectRef";
import {applyInstruction, BeforeApplyInstructionWithContext} from "../../utils/sync/InstructionBuilder";
import {DataTypeClass, EnumClass} from "../../utils/dataType/dataType";

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

        /*requestAnimationFrame(() => {
            projectRef.current.state.getMotor().setScene({
                nodes: htmlGraph.sheets[selectedSheetId].nodeMap,
                edges: htmlGraph.sheets[selectedSheetId].edgeMap
            });
        });*/

        const rootNode = findFirstNodeWithId(htmlGraph, "root");
        projectRef.current.state.getMotor().removeCameraAreaLock();
        if(rootNode) {
            projectRef.current.state.getMotor().smoothFitToNode(rootNode._key, {
                padding: 100
            });
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

                    const newNode = projectRef.current.state.graph!.sheets[projectRef.current.state.selectedSheetId!].nodeMap.get(instruction.nodeId)!;
                }
            }


            projectRef.current.state.getMotor().requestRedraw();

            return undefined;
        } else {
            return instructionOutput.error ?? "Unknown error"
        }
    }, []);

    const updateGraph = useCallback(async (instructions:Array<GraphInstructions>):Promise<ActionContext> => {

        const start = Date.now();

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
            projectRef.current.state.getMotor()?.resetScene();
            disconnect();
        }
    }, [Project.state.activeAppMenuId])
}