import {useCallback, useContext, useEffect, useRef, useState} from "react";
import {ActionContext, ProjectContext} from "./contexts/ProjectContext";
import {api_sync, api_sync_info} from "../../utils/requests/type/api_sync.type";
import {useWebSocket} from "./useWebSocket";
import {HtmlClass} from "../../utils/html/htmlType";
import {Graph} from "../../utils/graph/graphType";
import {api_graph_html} from "../../utils/requests/type/api_workflow.type";
import {edgeArrayToMap, findFirstNodeWithId, nodeArrayToMap} from "../../utils/graph/nodeUtils";
import {WSMessage, WSRegisterUserOnGraph} from "../../utils/sync/wsObject";
import {useStableProjectRef} from "./useStableProjectRef";

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
}