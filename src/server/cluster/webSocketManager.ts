import WebSocket, { WebSocketServer } from 'ws';
import {
    WSApplyInstructionToGraph,
    WSBatchCreateElements,
    WSBatchDeleteElements,
    WSGenerateUniqueId,
    WSMessage,
    WSRegisterUser,
    WSResponseMessage
} from "../../utils/sync/wsObject";
import {ClusterManager} from "./clusterManager";
import {clusterManager, db} from "../server";
import {Edge, Node} from "../../utils/graph/graphType";
import {RequestWorkFlow} from "../request/requestWorkFlow";
import {edgeArrayToMap, findEdgeByKey, nodeArrayToMap} from "../../utils/graph/nodeUtils";
import {applyInstruction, InstructionBuilder, validateInstruction} from "../../utils/sync/InstructionBuilder";
import {HtmlObject} from "../../utils/html/htmlType";
import {travelHtmlObject} from "../../utils/html/htmlUtils";
import {travelObject, deepCopy} from "../../utils/objectUtils";

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
    edgeMap: Map<string, Edge[]>,
    // Original state when graph was loaded, for diff computation
    originalNodeMap: Map<string, Node<any>>,
    originalEdgeMap: Map<string, Edge[]>,
    // Track if changes have been made
    hasUnsavedChanges: boolean
}

export class WebSocketManager {
    private wss: WebSocketServer;
    private clients: Set<WebSocket> = new Set(); // Set to store connected clients

    private uniqueIdGenerator:Record<string, number> = {};
    private managedGraph:Record<string, Record<string, ManagedSheet>> = {}

    private intervalCleaning:NodeJS.Timeout|undefined;
    private intervalSaving:NodeJS.Timeout|undefined;

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
        // Save diffs every 30 seconds
        this.intervalSaving = setInterval(this.savePendingChanges, 30000);
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
                // Save any pending changes before closing the graph
                await this.saveGraphChanges(graphId);

                // nobody in this graph, delete it
                delete this.managedGraph[graphId];
                await clusterManager.removeGraphPeer(graphId);
            }
        }
    }

    private initGraph = async (graphKey:string) => {
        this.managedGraph[graphKey] = {};
        const graph = await RequestWorkFlow.buildGraph(graphKey, {
            build: true,
            avoidCheckingWebSocket: true
        });
        Object.keys(graph._sheets).forEach((sheetId) => {
            const nodeMap = nodeArrayToMap(graph._sheets[sheetId].nodes);
            const edgeMap = edgeArrayToMap(graph._sheets[sheetId].edges);

            this.managedGraph[graphKey][sheetId] = {
                instructionHistory: [],
                user: [],
                nodeMap: nodeMap,
                edgeMap: edgeMap,
                // Deep copy for original state
                originalNodeMap: new Map(nodeMap),
                originalEdgeMap: new Map(edgeMap),
                hasUnsavedChanges: false
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
                // Mark sheet as having unsaved changes
                sheet.hasUnsavedChanges = true;

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
            } else if(jsonData.type === "generateUniqueId") {
                if(!user || !sheet || !graphKey) {
                    ws.close();
                    return;
                }
                const message:WSMessage<WSGenerateUniqueId> = jsonData;
                for(let i = 0; i < message.ids.length; i++) {
                    message.ids[i] = this.getUniqueId(graphKey);
                }

                if (messageId) {
                    this.sendMessage(ws, {
                        ...message,
                        _id: messageId,
                        _response: {status: true}
                    } as WSMessage<WSResponseMessage<WSGenerateUniqueId>>);
                }
            } else if(jsonData.type === "batchCreateElements") {
                if(!user || !sheet || !graphKey) {
                    ws.close();
                    return;
                }
                const message:WSMessage<WSBatchCreateElements> = jsonData;

                // Validate that the sheet exists
                const targetSheet = this.managedGraph[graphKey][message.sheetId];
                if(!targetSheet) {
                    if (messageId) return this.sendMessage(ws, {
                        _id: messageId,
                        _response: {status: false, message: "Sheet with id "+message.sheetId+" not found"}
                    } as WSMessage<WSResponseMessage<unknown>>);
                    return;
                }

                // Create a temporary map of nodes being added for edge validation
                const nodesToAdd = new Map<string, Node<any>>();

                // Validate all nodes first
                for(const node of message.nodes) {
                    // Check graphKey matches
                    if(node.graphKey !== graphKey) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: `Node ${node._key} has invalid graphKey: expected ${graphKey}, got ${node.graphKey}`}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }

                    // Check sheet matches
                    if(node.sheet !== message.sheetId) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: `Node ${node._key} has invalid sheet: expected ${message.sheetId}, got ${node.sheet}`}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }

                    // Check _key is unique
                    if(targetSheet.nodeMap.has(node._key)) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: `Node with _key ${node._key} already exists`}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }

                    // Check _key is unique within the batch
                    if(nodesToAdd.has(node._key)) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: `Duplicate node _key ${node._key} in batch`}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }

                    nodesToAdd.set(node._key, node);
                }

                // Validate all edges
                const edgesToAdd: Edge[] = [];
                for(const edge of message.edges) {
                    // Check graphKey matches
                    if(edge.graphKey !== graphKey) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: `Edge ${edge._key} has invalid graphKey: expected ${graphKey}, got ${edge.graphKey}`}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }

                    // Check sheet matches
                    if(edge.sheet !== message.sheetId) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: `Edge ${edge._key} has invalid sheet: expected ${message.sheetId}, got ${edge.sheet}`}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }

                    // Check _key is unique in existing edges
                    const existingEdge = findEdgeByKey(targetSheet.edgeMap, edge._key);
                    if(existingEdge) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: `Edge with _key ${edge._key} already exists`}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }

                    // Check _key is unique within the batch
                    if(edgesToAdd.some(e => e._key === edge._key)) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: `Duplicate edge _key ${edge._key} in batch`}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }

                    // Check source node exists (either in existing nodes or in nodes being added)
                    if(!targetSheet.nodeMap.has(edge.source) && !nodesToAdd.has(edge.source)) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: `Edge ${edge._key} has invalid source: node ${edge.source} not found`}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }

                    // Check target node exists (either in existing nodes or in nodes being added)
                    if(!targetSheet.nodeMap.has(edge.target) && !nodesToAdd.has(edge.target)) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: `Edge ${edge._key} has invalid target: node ${edge.target} not found`}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }

                    edgesToAdd.push(edge);
                }

                // All validations passed, now add the nodes and edges
                // Mark sheet as having unsaved changes
                targetSheet.hasUnsavedChanges = true;

                // Add nodes
                for(const node of message.nodes) {
                    targetSheet.nodeMap.set(node._key, node);
                }

                // Add edges to the edgeMap
                for(const edge of edgesToAdd) {
                    // Add to target map
                    const targetKey = `target-${edge.target}`;
                    let targetEdges = targetSheet.edgeMap.get(targetKey) || [];
                    targetEdges.push(edge);
                    targetSheet.edgeMap.set(targetKey, targetEdges);

                    // Add to source map
                    const sourceKey = `source-${edge.source}`;
                    let sourceEdges = targetSheet.edgeMap.get(sourceKey) || [];
                    sourceEdges.push(edge);
                    targetSheet.edgeMap.set(sourceKey, sourceEdges);
                }

                // Send success response
                if (messageId) {
                    this.sendMessage(ws, {
                        ...message,
                        _id: messageId,
                        _response: {status: true}
                    } as WSMessage<WSResponseMessage<WSBatchCreateElements>>);
                }

                // Broadcast to other users
                for(const otherUser of targetSheet.user) {
                    if(otherUser.id !== user.id || messageId == undefined) {
                        this.sendMessage(otherUser.ws, {
                            ...message,
                            _id: undefined
                        } as WSMessage<WSBatchCreateElements>);
                    }
                }
            } else if(jsonData.type === "batchDeleteElements") {
                if(!user || !sheet || !graphKey) {
                    ws.close();
                    return;
                }
                const message:WSMessage<WSBatchDeleteElements> = jsonData;

                // Validate that the sheet exists
                const targetSheet = this.managedGraph[graphKey][message.sheetId];
                if(!targetSheet) {
                    if (messageId) return this.sendMessage(ws, {
                        _id: messageId,
                        _response: {status: false, message: "Sheet with id "+message.sheetId+" not found"}
                    } as WSMessage<WSResponseMessage<unknown>>);
                    return;
                }

                // Validate all nodes exist before deletion
                for(const nodeKey of message.nodeKeys) {
                    if(!targetSheet.nodeMap.has(nodeKey)) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: `Node with _key ${nodeKey} not found`}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }
                }

                // Validate all edges exist and filter out undeletable edges
                const finalEdgeKeys: string[] = [];
                for(const edgeKey of message.edgeKeys) {
                    const existingEdge = findEdgeByKey(targetSheet.edgeMap, edgeKey);
                    if(!existingEdge) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: `Edge with _key ${edgeKey} not found`}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }
                    // Only include deletable edges
                    if(!existingEdge.undeletable) {
                        finalEdgeKeys.push(edgeKey);
                    }
                }

                // Ensure we have something to delete
                if(message.nodeKeys.length === 0 && finalEdgeKeys.length === 0) {
                    if (messageId) return this.sendMessage(ws, {
                        _id: messageId,
                        _response: {status: false, message: "No elements to delete (all edges are undeletable or no elements provided)"}
                    } as WSMessage<WSResponseMessage<unknown>>);
                    return;
                }

                // All validations passed, mark as having unsaved changes
                targetSheet.hasUnsavedChanges = true;

                // Delete edges first (to avoid orphaned edges)
                for(const edgeKey of finalEdgeKeys) {
                    const edge = findEdgeByKey(targetSheet.edgeMap, edgeKey);
                    if(edge) {
                        // Remove from target map
                        if(edge.target) {
                            const targetKey = `target-${edge.target}`;
                            let targetEdges = targetSheet.edgeMap.get(targetKey) || [];
                            targetEdges = targetEdges.filter(e => e._key !== edgeKey);
                            if(targetEdges.length > 0) {
                                targetSheet.edgeMap.set(targetKey, targetEdges);
                            } else {
                                targetSheet.edgeMap.delete(targetKey);
                            }
                        }

                        // Remove from source map
                        if(edge.source) {
                            const sourceKey = `source-${edge.source}`;
                            let sourceEdges = targetSheet.edgeMap.get(sourceKey) || [];
                            sourceEdges = sourceEdges.filter(e => e._key !== edgeKey);
                            if(sourceEdges.length > 0) {
                                targetSheet.edgeMap.set(sourceKey, sourceEdges);
                            } else {
                                targetSheet.edgeMap.delete(sourceKey);
                            }
                        }
                    }
                }

                // Delete nodes
                for(const nodeKey of message.nodeKeys) {
                    targetSheet.nodeMap.delete(nodeKey);
                }

                // Send success response with filtered edge keys
                if (messageId) {
                    this.sendMessage(ws, {
                        ...message,
                        edgeKeys: finalEdgeKeys, // Send back the actually deleted edges
                        _id: messageId,
                        _response: {status: true}
                    } as WSMessage<WSResponseMessage<WSBatchDeleteElements>>);
                }

                // Broadcast to other users with filtered edge keys
                for(const otherUser of targetSheet.user) {
                    if(otherUser.id !== user.id || messageId == undefined) {
                        this.sendMessage(otherUser.ws, {
                            ...message,
                            edgeKeys: finalEdgeKeys, // Send back the actually deleted edges
                            _id: undefined
                        } as WSMessage<WSBatchDeleteElements>);
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
     * Save all pending changes for all managed graphs
     */
    private savePendingChanges = async () => {
        for (const graphKey in this.managedGraph) {
            await this.saveGraphChanges(graphKey);
        }
    }

    /**
     * Save changes for a specific graph to ArangoDB
     * @param graphKey - The graph key to save changes for
     */
    private saveGraphChanges = async (graphKey: string): Promise<void> => {
        const graph = this.managedGraph[graphKey];
        if (!graph) return;

        try {
            const node_collection = db.collection("nodius_nodes");
            const edge_collection = db.collection("nodius_edges");

            for (const sheetId in graph) {
                const sheet = graph[sheetId];

                if (!sheet.hasUnsavedChanges) {
                    continue; // Skip sheets with no changes
                }

                // Compute node diffs
                const nodesToUpdate: Node<any>[] = [];
                const nodesToCreate: Node<any>[] = [];
                const nodesToDelete: string[] = [];

                // Find updated and new nodes
                for (const [nodeKey, node] of sheet.nodeMap) {
                    const originalNode = sheet.originalNodeMap.get(nodeKey);
                    if (!originalNode) {
                        // New node
                        nodesToCreate.push(node);
                    } else if (JSON.stringify(originalNode) !== JSON.stringify(node)) {
                        // Modified node
                        nodesToUpdate.push(node);
                    }
                }

                // Find deleted nodes
                for (const [nodeKey, _] of sheet.originalNodeMap) {
                    if (!sheet.nodeMap.has(nodeKey)) {
                        nodesToDelete.push(nodeKey);
                    }
                }

                // Compute edge diffs
                const edgesToUpdate: Edge[] = [];
                const edgesToCreate: Edge[] = [];
                const edgesToDelete: string[] = [];

                // Helper to get all edges from edgeMap
                const getAllEdges = (edgeMap: Map<string, Edge[]>): Map<string, Edge> => {
                    const allEdges = new Map<string, Edge>();
                    for (const edges of edgeMap.values()) {
                        for (const edge of edges) {
                            allEdges.set(edge._key, edge);
                        }
                    }
                    return allEdges;
                };

                const currentEdges = getAllEdges(sheet.edgeMap);
                const originalEdges = getAllEdges(sheet.originalEdgeMap);

                // Find updated and new edges
                for (const [edgeKey, edge] of currentEdges) {
                    const originalEdge = originalEdges.get(edgeKey);
                    if (!originalEdge) {
                        // New edge
                        edgesToCreate.push(edge);
                    } else if (JSON.stringify(originalEdge) !== JSON.stringify(edge)) {
                        // Modified edge
                        edgesToUpdate.push(edge);
                    }
                }

                // Find deleted edges
                for (const [edgeKey, _] of originalEdges) {
                    if (!currentEdges.has(edgeKey)) {
                        edgesToDelete.push(edgeKey);
                    }
                }

                // Helper to convert edge to ArangoDB format (source/target -> _from/_to)
                const edgeToArangoFormat = (edge: Edge): any => {
                    return {
                        ...edge,
                        _from: `nodius_nodes/${edge.source}`,
                        _to: `nodius_nodes/${edge.target}`
                        // Keep source and target as well for compatibility
                    };
                };

                // Execute database operations
                // Create new nodes
                for (const node of nodesToCreate) {
                    await node_collection.save(node);
                }

                // Update existing nodes
                for (const node of nodesToUpdate) {
                    await node_collection.update(node._key, node);
                }

                // Delete removed nodes
                for (const nodeKey of nodesToDelete) {
                    await node_collection.remove(nodeKey);
                }

                // Create new edges
                for (const edge of edgesToCreate) {
                    const arangoEdge = edgeToArangoFormat(edge);
                    await edge_collection.save(arangoEdge);
                }

                // Update existing edges
                for (const edge of edgesToUpdate) {
                    const arangoEdge = edgeToArangoFormat(edge);
                    await edge_collection.update(edge._key, arangoEdge);
                }

                // Delete removed edges
                for (const edgeKey of edgesToDelete) {
                    await edge_collection.remove(edgeKey);
                }

                // Update the original state after successful save
                sheet.originalNodeMap = new Map(sheet.nodeMap);
                sheet.originalEdgeMap = new Map(sheet.edgeMap);
                sheet.hasUnsavedChanges = false;

                console.log(`Saved changes for graph ${graphKey}, sheet ${sheetId}:`, {
                    nodesCreated: nodesToCreate.length,
                    nodesUpdated: nodesToUpdate.length,
                    nodesDeleted: nodesToDelete.length,
                    edgesCreated: edgesToCreate.length,
                    edgesUpdated: edgesToUpdate.length,
                    edgesDeleted: edgesToDelete.length
                });
            }
        } catch (error) {
            console.error(`Error saving changes for graph ${graphKey}:`, error);
        }
    }

    /**
     * Utility function to close the WebSocket server.
     */
    public closeServer(): void {
        this.wss.close(() => {
            console.log('WebSocket server closed');
            clearInterval(this.intervalCleaning);
            if (this.intervalSaving) {
                clearInterval(this.intervalSaving);
            }
        });
    }

    /**
     * Get a managed graph if it exists in the WebSocket manager
     * @param graphKey - The graph key to look for
     * @returns The graph data with sheets if found, undefined otherwise
     */
    public getManagedGraph(graphKey: string): { nodeMap: Map<string, Node<any>>, edgeMap: Map<string, Edge[]> } | undefined {
        const graph = this.managedGraph[graphKey];
        if (!graph) {
            return undefined;
        }

        // Merge all sheets (for now, we'll return the first sheet or all sheets merged)
        // If you need specific sheet handling, this can be modified
        const sheets = Object.values(graph);
        if (sheets.length === 0) {
            return undefined;
        }

        return {
            nodeMap: sheets[0].nodeMap,
            edgeMap: sheets[0].edgeMap
        };
    }

    /**
     * Get all sheets of a managed graph if it exists
     * @param graphKey - The graph key to look for
     * @returns Record of sheet id to sheet data, or undefined if graph not found
     */
    public getManagedGraphSheets(graphKey: string): Record<string, { nodeMap: Map<string, Node<any>>, edgeMap: Map<string, Edge[]> }> | undefined {
        const graph = this.managedGraph[graphKey];
        if (!graph) {
            return undefined;
        }

        const result: Record<string, { nodeMap: Map<string, Node<any>>, edgeMap: Map<string, Edge[]> }> = {};
        for (const sheetId in graph) {
            result[sheetId] = {
                nodeMap: graph[sheetId].nodeMap,
                edgeMap: graph[sheetId].edgeMap
            };
        }
        return result;
    }

    /**
     * Get a unique identifier for nodes or edges in a specific graph.
     * This method guarantees that the returned ID will never be reused within the same graph.
     * IDs are generated in base-36 format and are tracked per graph.
     *
     * @param graphKey - The graph key to generate a unique ID for
     * @returns A unique identifier string that has never been used in this graph
     * @throws Error if the graph is not managed by this WebSocketManager
     */
    public getUniqueId(graphKey: string): string {
        // Check if the graph is managed
        if (!this.managedGraph[graphKey]) {
            throw new Error(`Graph with key "${graphKey}" is not managed by this WebSocketManager. Please ensure the graph is initialized first.`);
        }

        // Initialize the counter if it doesn't exist (defensive programming)
        if (this.uniqueIdGenerator[graphKey] === undefined) {
            this.uniqueIdGenerator[graphKey] = 0;
        }

        // Generate the unique ID and increment the counter
        const uniqueId = (this.uniqueIdGenerator[graphKey]++).toString(36);
        if(uniqueId == "root") {
            return this.getUniqueId(graphKey);
        }

        return uniqueId;
    }
}

// Example usage:
// const manager = new WebSocketManager(8080);