import WebSocket, { WebSocketServer } from 'ws';
import {WSApplyInstructionToGraph, WSMessage, WSRegisterUser, WSResponseMessage} from "../../utils/sync/wsObject";
import {ClusterManager} from "./clusterManager";
import {clusterManager} from "../server";
import {Edge, Node} from "../../utils/graph/graphType";
import {RequestWorkFlow} from "../request/requestWorkFlow";
import {edgeArrayToMap, findEdgeByKey, nodeArrayToMap} from "../../utils/graph/nodeUtils";
import {applyInstruction, InstructionBuilder, validateInstruction} from "../../utils/sync/InstructionBuilder";
import {HtmlObject} from "../../utils/html/htmlType";
import {travelHtmlObject} from "../../utils/html/htmlUtils";
import {travelObject} from "../../utils/objectUtils";

/**
 * WebSocketManager class to handle WebSocket server in Node.js.
 * It opens a WebSocket server on the specified port in the constructor,
 * manages incoming messages as JSON, and provides utility functions for sending messages.
 */

// todo: avoid multiple access to edge / node at the same time, atomic waitw

interface ManageUser {
    id: string,
    name: string,
    lastPing:number,
    ws:WebSocket
}

interface ManagedSheet {
    instructionHistory: Array<{
        ws:WSApplyInstructionToGraph,
        time:number,
    }>,
    user: Array<ManageUser>,
    nodeMap: Map<string, Node<any>>,
    edgeMap: Map<string, Edge[]>
}

export class WebSocketManager {
    private wss: WebSocketServer;
    private clients: Set<WebSocket> = new Set(); // Set to store connected clients

    private uniqueIdGenerator:Record<string, number> = {};
    private managedGraph:Record<string, Record<string, ManagedSheet>> = {}

    private intervalCleaning:NodeJS.Timeout|undefined;

    /**
     * Constructor to initialize the WebSocket server.
     * @param port - The port number on which to start the WebSocket server.
     * @param host
     */
    constructor(port: number, host: string = "localhost") {
        this.wss = new WebSocketServer({ port:port, host: host });

        // Set up connection event listener
        this.wss.on('connection', (ws: WebSocket) => {
            this.clients.add(ws); // Add new client to the set
            console.log('WS: New client connected');

            // Handle incoming messages
            ws.on('message', (message: string) => {
                this.handleIncomingMessage(ws, message);
            });

            // Handle client disconnection
            ws.on('close', () => {
                this.clients.delete(ws);
                console.log('WS: Client disconnected');
            });
        });

        // Log when the server is listening
        this.wss.on('listening', () => {
            console.log(`WebSocket server is listening on port ${port}`);
        });

        this.intervalCleaning = setInterval(this.clearUnhabitedInstances, 10000);
    }

    private findUserByWs = (ws: WebSocket): ManageUser | undefined => {
        for (const graphId in this.managedGraph) {
            // each graph
            for (const sheetId in this.managedGraph[graphId]) {
                // each sheet
                const sheet = this.managedGraph[graphId][sheetId];
                const foundUser = sheet.user.find((user: ManageUser) => user.ws === ws);
                if (foundUser) {
                    return foundUser;
                }
            }
        }
        return undefined; // if not found
    }

    private findSheetWithWs = (ws: WebSocket): ManagedSheet | undefined => {
        for (const graphId in this.managedGraph) {
            const graph = this.managedGraph[graphId];
            for (const sheetId in graph) {
                const sheet = graph[sheetId];
                if (sheet.user.some((user) => user.ws === ws)) {
                    return sheet;
                }
            }
        }
        return undefined;
    }

    private deleteUser = (userId:string) => {
        for(const graphId in this.managedGraph) {
            // each graph
            for(const sheetId in this.managedGraph[graphId]) {
                // each sheet
                const sheet = this.managedGraph[graphId][sheetId];
                if(sheet.user.some((user:ManageUser) => user.id === userId)) {
                    sheet.user = sheet.user.filter(user => user.id !== userId);
                }
            }
        }
    }

    private clearUnhabitedInstances = async () => {
        for(const graphId in this.managedGraph) {
            // each graph
            let AllEmpty = true;
            for(const sheetId in this.managedGraph[graphId]) {
                // each sheet
                const sheet = this.managedGraph[graphId][sheetId];

                // Remove all disconnected users
                sheet.user = sheet.user.filter(user =>
                    user.ws.readyState === WebSocket.OPEN ||
                    user.ws.readyState === WebSocket.CONNECTING
                );

                if(sheet.user.length !== 0) {
                    AllEmpty = false;
                }
            }
            if(AllEmpty) {
                // nobody in this graph, delete it
                delete this.managedGraph[graphId];
                await clusterManager.removeGraphPeer(graphId);
            }
        }
    }

    private initGraph = async (graphKey:string) => {
        this.managedGraph[graphKey] = {};
        const graph = await RequestWorkFlow.buildGraph(graphKey, true);
        Object.keys(graph._sheets).forEach((sheetId) => {
            this.managedGraph[graphKey][sheetId] = {
                instructionHistory: [],
                user: [],
                nodeMap: nodeArrayToMap(graph._sheets[sheetId].nodes),
                edgeMap: edgeArrayToMap(graph._sheets[sheetId].edges),
            }
        })
        this.uniqueIdGenerator[graphKey] = 0;
        Object.values(this.managedGraph[graphKey]).forEach((sheet: ManagedSheet) => {
            sheet.nodeMap.forEach((node) => {
                this.updateMaxId(graphKey, node);  // Traverse node (or node.data if identifiers are only there)
            });
            for (const edgeList of sheet.edgeMap.values()) {
                edgeList.forEach((edge) => {
                    this.updateMaxId(graphKey, edge);  // Traverse edge (or edge.data if identifiers are only there)
                });
            }
        });
        this.uniqueIdGenerator[graphKey] += 1;  // Start from max + 1
    }

    private updateMaxId(graphKey: string, obj: any): void {
        travelObject(obj, (o) => {
            if (o.identifier !== undefined && typeof o.identifier === 'string') {
                try {
                    const num = parseInt(o.identifier, 36);
                    if (num > this.uniqueIdGenerator[graphKey]) {
                        this.uniqueIdGenerator[graphKey] = num;
                    }
                } catch (e) {}
            }
            return true;
        });
    }

    /**
     * Handles incoming messages by parsing them as JSON.
     * @param ws - The WebSocket client that sent the message.
     * @param message - The raw message string received.
     */
    private async handleIncomingMessage(ws: WebSocket, message: string): Promise<void> {
        try {
            const jsonData = JSON.parse(message) as WSMessage<any>;
            console.log('Received JSON message:', jsonData);

            const messageId = (jsonData as WSMessage<any>)._id;
            const sheet = this.findSheetWithWs(ws);
            const graphKey = sheet ? Object.keys(this.managedGraph).find((graphKey) => Object.values(this.managedGraph[graphKey]).some((s) => s == sheet)) : undefined;
            const user = sheet?.user.find((user) => user.ws === ws);
            console.log(
                [
                    graphKey !== undefined && "graphKey is set",
                    sheet !== undefined && "sheet is set",
                    user !== undefined && "user is set",
                ].filter(Boolean).join(", ")
            );
            if(jsonData.type === "__ping__") {
                if(user) {
                    user.lastPing = Date.now();
                    return this.sendMessage(ws, {type: "__pong__"});
                } else {
                    ws.close();
                }
                return;
            } else if(jsonData.type === "registerUser") {
                const message:WSMessage<WSRegisterUser> = jsonData;
                this.deleteUser(message.userId);

                const peer = clusterManager.getGraphPeerId(message.graphKey);
                if(!peer || peer != "self") {
                    if(messageId) return this.sendMessage(ws, { _id:messageId, _response: { status:false, message: "This server don't manage graph with key:"+message.graphKey } } as WSMessage<WSResponseMessage<unknown>>);
                    return;
                }
                if(!this.managedGraph[message.graphKey]) {
                    await this.initGraph(message.graphKey);
                }

                this.managedGraph[message.graphKey][message.sheetId].user.push({
                    name: message.name,
                    id: message.userId,
                    lastPing: Date.now(),
                    ws: ws
                });
                if(messageId) return this.sendMessage(ws, { _id:messageId, _response: { status:true } } as WSMessage<WSResponseMessage<unknown>>);
                return;

            } else if(jsonData.type === "applyInstructionToGraph") {
                if(!user || !sheet || !graphKey) {
                    ws.close();
                    return;
                }
                const message:WSMessage<WSApplyInstructionToGraph> = jsonData;
                if(message.instructions.length > 20) {
                    ws.close();
                }
                const objectList:Array<Node<any> | Edge[]> = [];

                

                // validate first
                for(const instruction of message.instructions) {
                    if(!instruction.nodeId && !instruction.edgeId) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: "NodeId and EdgeId can't be null at the same time"}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }
                    if(instruction.nodeId) {
                        const node = sheet.nodeMap.get(instruction.nodeId);
                        if(!node) {
                            if (messageId) return this.sendMessage(ws, {
                                _id: messageId,
                                _response: {status: false, message: "Node with id "+instruction.nodeId+" not found"}
                            } as WSMessage<WSResponseMessage<unknown>>);
                            return;
                        }
                        objectList.push(node);
                    }else if(instruction.edgeId) {
                        const edge = findEdgeByKey(sheet.edgeMap, instruction.edgeId);
                        if(!edge) {
                            if (messageId) return this.sendMessage(ws, {
                                _id: messageId,
                                _response: {status: false, message: "edge with id "+instruction.edgeId+" not found"}
                            } as WSMessage<WSResponseMessage<unknown>>);
                            return;
                        }
                        // store old edge first, then new edge
                        objectList.push([edge, undefined!]);
                    }
                    const validateResult = validateInstruction(instruction.i);
                    if (!validateResult.success) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: "Invalid instruction:" + validateResult.error}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }
                    const insertedObject = instruction.i.v as HtmlObject;
                    if(instruction.applyUniqIdentifier && insertedObject?.identifier != undefined) {
                        // ensure each new element have unique identifier
                        travelHtmlObject(insertedObject, (obj) => {
                            if(this.uniqueIdGenerator[graphKey] === undefined) {
                                this.uniqueIdGenerator[graphKey] = 0;
                            }
                            obj.identifier = (this.uniqueIdGenerator[graphKey]++).toString(36);
                            return true;
                        });
                    }
                }
                for( let i = 0; i < message.instructions.length; i++ ) {
                    const instruction = message.instructions[i];
                    if(instruction.nodeId) {
                        const oldNode = objectList[i] as Node<any>;
                        console.log(oldNode);
                        const newNode = applyInstruction(oldNode, instruction.i, (objectBeingApplied) => {
                            if(instruction.targetedIdentifier && objectBeingApplied != undefined && !Array.isArray(objectBeingApplied) && "identifier" in objectBeingApplied) {
                                const object:any = objectBeingApplied;
                                if(object.identifier !== instruction?.targetedIdentifier) {
                                    console.error("wrong action, target:", instruction.targetedIdentifier, "found:", object.identifier);
                                    return false;
                                }
                                return true;
                            }
                            return true;
                        });

                        if(newNode.success) {
                            objectList[i] = newNode.value;
                        } else {
                            if (messageId) return this.sendMessage(ws, {
                                _id: messageId,
                                _response: {status: false, message: "Error while parsing instruction on Node; " + newNode.error}
                            } as WSMessage<WSResponseMessage<unknown>>);
                            return;
                        }
                    } else if(instruction.edgeId) {
                        const oldNEdge = objectList[i] as Edge[];
                        const newEdge = applyInstruction(oldNEdge[0], instruction.i, (objectBeingApplied) => {
                            if(instruction.targetedIdentifier && objectBeingApplied != undefined && !Array.isArray(objectBeingApplied) && "identifier" in objectBeingApplied) {
                                const object:any = objectBeingApplied;
                                if(object.identifier !== instruction?.targetedIdentifier) {
                                    console.error("wrong action, target:", instruction.targetedIdentifier, "found:", object.identifier);
                                    return false;
                                }
                                return true;
                            }
                            return true;
                        });

                        if(newEdge.success) {
                            (objectList[i] as Edge[])[1] = newEdge.value;
                        } else {
                            if (messageId) return this.sendMessage(ws, {
                                _id: messageId,
                                _response: {status: false, message: "Error while parsing instruction on edge:" + newEdge.error}
                            } as WSMessage<WSResponseMessage<unknown>>);
                            return;
                        }
                    }
                }
                for( let i = 0; i < message.instructions.length; i++ ) {
                    const instruction = message.instructions[i];
                    if(instruction.nodeId) {
                        sheet.nodeMap.set(instruction.nodeId, objectList[i] as Node<any>);
                    } else if(instruction.edgeId) {
                        const edges = objectList[i] as Edge[];

                        //remove old
                        if(edges[0].target) {
                            const targetKey = `target-${edges[0].target}`;
                            let edgeListTarget = sheet.edgeMap.get(targetKey) ?? [];
                            edgeListTarget = edgeListTarget.filter((e) => e._key !== edges[0]._key);
                            if(edgeListTarget.length > 0) {
                                sheet.edgeMap.set(targetKey, edgeListTarget);
                            } else {
                                sheet.edgeMap.delete(targetKey);
                            }
                        }

                        if(edges[0].source) {
                            const sourceKey = `source-${edges[0].source}`;
                            let edgeListSource = sheet.edgeMap.get(sourceKey) ?? [];
                            edgeListSource = edgeListSource.filter((e) => e._key !== edges[0]._key);
                            if(edgeListSource.length > 0) {
                                sheet.edgeMap.set(sourceKey, edgeListSource);
                            } else {
                                sheet.edgeMap.delete(sourceKey);
                            }
                        }

                        // add new
                        if(edges[1].target) {
                            const targetKey = `target-${edges[1].target}`;
                            let edgeListTarget = sheet.edgeMap.get(targetKey) ?? [];
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
                                sheet.edgeMap.set(targetKey, edgeListTarget);
                            } else {
                                sheet.edgeMap.delete(targetKey);
                            }
                        }

                        if(edges[1].source) {
                            const sourceKey = `source-${edges[1].source}`;
                            let edgeListSource = sheet.edgeMap.get(sourceKey) ?? [];
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
                            sheet.edgeMap.set(sourceKey, edgeListSource);
                        }


                    }
                }

                if (messageId) this.sendMessage(ws, {
                    ...message,
                    _id: messageId,
                    _response: {status: true}
                } as WSMessage<WSResponseMessage<WSApplyInstructionToGraph>>);

                for(const otherUser of sheet.user) {
                    if(otherUser.id !== user.id || messageId == undefined) {
                        this.sendMessage(otherUser.ws, {
                            ...message,
                            _id: undefined
                        } as WSMessage<WSApplyInstructionToGraph>);
                    }
                }
            }

        } catch (error) {
            console.error('Failed to parse message as JSON:', error);
            // Optionally, send an error response back to the client
            this.sendMessage(ws, { error: 'Invalid JSON' });
        }
    }

    /**
     * Utility function to send a message to a specific client.
     * @param ws - The WebSocket client to send the message to.
     * @param data - The data object to send as JSON.
     */
    public sendMessage(ws: WebSocket, data: any): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        } else {
            console.warn('Cannot send message: WebSocket is not open');
        }
    }

    /**
     * Utility function to broadcast a message to all connected clients.
     * @param data - The data object to broadcast as JSON.
     */
    public broadcastMessage(data: any): void {
        this.clients.forEach((client) => {
            this.sendMessage(client, data);
        });
    }

    /**
     * Utility function to get the number of connected clients.
     * @returns The count of currently connected clients.
     */
    public getClientCount(): number {
        return this.clients.size;
    }

    /**
     * Utility function to close the WebSocket server.
     */
    public closeServer(): void {
        this.wss.close(() => {
            console.log('WebSocket server closed');
            clearInterval(this.intervalCleaning);
        });
    }
}

// Example usage:
// const manager = new WebSocketManager(8080);