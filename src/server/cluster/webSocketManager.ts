/**
 * @file webSocketManager.ts
 * @description Real-time WebSocket server for collaborative graph editing
 * @module server/cluster
 *
 * Manages WebSocket connections for real-time collaboration:
 * - WebSocketManager: Main WebSocket server coordinating all connections
 * - Graph session management: Multi-user editing with instruction history
 * - Node config editing: Real-time node configuration updates
 * - Instruction processing: Validates and applies graph modifications
 * - Auto-save system: Periodic persistence of changes to database
 *
 * Key features:
 * - Multi-user session support per graph/sheet
 * - Instruction history with timestamps for catch-up
 * - Unique ID generation for graph elements
 * - Batch create/delete operations
 * - Diff computation for unsaved changes
 * - Periodic cleanup of disconnected users
 * - Integration with ClusterManager for distributed operation
 * - Message validation and error handling
 *
 * TODO:
 * - Implement atomic operations to avoid concurrent modification
 * - Add user permission checks for graph/nodeconfig access
 */

import WebSocket, { WebSocketServer } from 'ws';
import {
    WSApplyInstructionToGraph, WSApplyInstructionToNodeConfig,
    WSBatchCreateElements,
    WSBatchDeleteElements, WSDisconnedUserOnGraph, WSDisconnectUserOnNodeConfig,
    WSGenerateUniqueId,
    WSMessage,
    WSRegisterUserOnGraph, WSRegisterUserOnNodeConfig,
    WSResponseMessage, GraphInstructions
} from "../../utils/sync/wsObject";
import {clusterManager, db} from "../server";
import {Edge, Node, NodeTypeConfig} from "../../utils/graph/graphType";
import {RequestWorkFlow} from "../request/requestWorkFlow";
import {edgeArrayToMap, findEdgeByKey, nodeArrayToMap} from "../../utils/graph/nodeUtils";
import {applyInstruction, InstructionBuilder, validateInstruction} from "../../utils/sync/InstructionBuilder";
import {HtmlObject} from "../../utils/html/htmlType";
import {travelHtmlObject} from "../../utils/html/htmlUtils";
import {travelObject} from "../../utils/objectUtils";

interface ManageUser {
    id: string,
    name: string,
    lastPing:number,
    ws:WebSocket
}

interface ManagedSheet { // management of sheet in graph
    instructionHistory: Array<{
        message:WSMessage<any>,
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

interface ManagedNodeConfig { // management of editing/creating node config
    instructionHistory: Array<{
        message:WSMessage<any>,
        time:number,
    }>,
    user: Array<ManageUser>,

    config: NodeTypeConfig,
    // for diff computation
    originalConfig: NodeTypeConfig,
    // Track if changes have been made
    hasUnsavedChanges: boolean
}

export class WebSocketManager {
    private wss: WebSocketServer;
    private clients: Set<WebSocket> = new Set(); // Set to store connected clients

    private uniqueIdGenerator:Record<string, number> = {};
    private managedGraph:Record<string, Record<string, ManagedSheet>> = {}
    private managedNodeConfig:Record<string, ManagedNodeConfig> = {}

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

    private findUserOnGraphByWs = (ws: WebSocket): ManageUser | undefined => {
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

    private findNodeConfigWithWs = (ws: WebSocket): ManagedNodeConfig | undefined => {
        for(const nodeConfigId in this.managedNodeConfig) {
            const nodeConfig = this.managedNodeConfig[nodeConfigId];
            if(nodeConfig.user.some((user: ManageUser) => user.ws === ws)) {
                return nodeConfig;
            }
        }
        return undefined;
    }

    private deleteUserOnGraph = (userId:string) => {
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

    private deleteUserOnNodeConfig = (userId:string) => {
        for(const nodeConfigId in this.managedNodeConfig) {
            const nodeConfig = this.managedNodeConfig[nodeConfigId];
            if(nodeConfig.user.some((user:ManageUser) => user.id === userId)) {
                nodeConfig.user = nodeConfig.user.filter(user => user.id !== userId);
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

        // Clean up node configs with no users
        for(const nodeConfigId in this.managedNodeConfig) {
            const nodeConfig = this.managedNodeConfig[nodeConfigId];

            // Remove all disconnected users
            nodeConfig.user = nodeConfig.user.filter(user =>
                user.ws.readyState === WebSocket.OPEN ||
                user.ws.readyState === WebSocket.CONNECTING
            );

            if(nodeConfig.user.length === 0) {
                // Save any pending changes before closing the node config
                await this.saveNodeConfigChanges(nodeConfigId);

                // nobody editing this node config, delete it
                delete this.managedNodeConfig[nodeConfigId];
            }
        }
    }

    private initGraph = async (graphKey:string) => {
        this.managedGraph[graphKey] = {};
        const graph = await RequestWorkFlow.buildGraph(graphKey, {
            build: true,
            avoidCheckingWebSocket: true
        });
        if (!graph) {
            throw new Error(`Graph with key ${graphKey} not found`);
        }
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

        // Initialize ID generator by scanning all existing IDs
        this.uniqueIdGenerator[graphKey] = 0;
        Object.values(this.managedGraph[graphKey]).forEach((sheet: ManagedSheet) => {
            // Check node._key values
            sheet.nodeMap.forEach((node) => {
                // Parse node._key as base-36 and update max
                try {
                    const num = parseInt(node._key, 36);
                    if (!isNaN(num) && num > this.uniqueIdGenerator[graphKey]) {
                        this.uniqueIdGenerator[graphKey] = num;
                    }
                } catch (e) {}

                // Also traverse node data for identifiers
                this.updateMaxIdOnGraph(graphKey, node);
            });

            // Check edge._key values
            for (const edgeList of sheet.edgeMap.values()) {
                edgeList.forEach((edge) => {
                    // Parse edge._key as base-36 and update max
                    try {
                        const num = parseInt(edge._key, 36);
                        if (!isNaN(num) && num > this.uniqueIdGenerator[graphKey]) {
                            this.uniqueIdGenerator[graphKey] = num;
                        }
                    } catch (e) {}

                    // Also traverse edge data for identifiers
                    this.updateMaxIdOnGraph(graphKey, edge);
                });
            }
        });
        this.uniqueIdGenerator[graphKey] += 1;  // Start from max + 1
        console.log(`[WebSocketManager] Initialized uniqueIdGenerator for graph ${graphKey} starting at ${this.uniqueIdGenerator[graphKey]}`);
    }

    private initNodeConfig = async (nodeConfigKey:string) => {
        const nodeConfig_collection = db.collection("nodius_node_config");

        // Load the node config from the database
        const config = await nodeConfig_collection.document(nodeConfigKey) as NodeTypeConfig;

        if (!config) {
            throw new Error(`NodeConfig with key ${nodeConfigKey} not found`);
        }

        // Initialize the managed node config
        this.managedNodeConfig[nodeConfigKey] = {
            instructionHistory: [],
            user: [],
            config: config,
            originalConfig: JSON.parse(JSON.stringify(config)), // Deep copy
            hasUnsavedChanges: false
        };

        // Initialize unique ID generator for this node config
        this.uniqueIdGenerator[nodeConfigKey] = 0;

        // Update max ID based on existing identifiers in the config
        this.updateMaxIdOnNodeConfig(nodeConfigKey, config);
        this.uniqueIdGenerator[nodeConfigKey] += 1;  // Start from max + 1
    }

    private updateMaxIdOnNodeConfig(nodeConfigKey: string, obj: any): void {
        travelObject(obj, (o) => {
            if (o.identifier !== undefined && typeof o.identifier === 'string') {
                try {
                    const num = parseInt(o.identifier, 36);
                    if (num > this.uniqueIdGenerator[nodeConfigKey]) {
                        this.uniqueIdGenerator[nodeConfigKey] = num;
                    }
                } catch (e) {}
            }
            return true;
        });
    }

    private updateMaxIdOnGraph(graphKey: string, obj: any): void {
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

    private binarySearchTime(arr:Array<{
        message:WSMessage<any>,
        time:number,
    }>, timestamp:number) {
        let low = 0, high = arr.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (arr[mid].time <= timestamp) low = mid + 1;
            else high = mid;
        }
        return low;
    }

    /**
     * Handles incoming messages by parsing them as JSON.
     * @param ws - The WebSocket client that sent the message.
     * @param message - The raw message string received.
     */
    private async handleIncomingMessage(ws: WebSocket, message: string): Promise<void> {
        try {
            const jsonData = JSON.parse(message) as WSMessage<any>;
            console.log('Received JSON message:');
            console.dir(jsonData, {depth:null});
            console.log("----------------");

            const messageId = (jsonData as WSMessage<any>)._id;

            // in case of graph editing user
            const sheet = this.findSheetWithWs(ws);
            const graphKey = sheet ? Object.keys(this.managedGraph).find((graphKey) => Object.values(this.managedGraph[graphKey]).some((s) => s == sheet)) : undefined;
            const graphUser = sheet?.user.find((user) => user.ws === ws);

            // in case of nodeConfig editing user
            const nodeConfig = this.findNodeConfigWithWs(ws);
            const nodeConfigUser = nodeConfig?.user.find((user) => user.ws === ws);

            if(jsonData.type === "__ping__") {
                if(graphUser) {
                    graphUser.lastPing = Date.now();
                    return this.sendMessage(ws, {type: "__pong__"});
                } else if(nodeConfigUser) {
                    nodeConfigUser.lastPing = Date.now();
                    return this.sendMessage(ws, {type: "__pong__"});
                } else {
                    ws.close();
                }
                return;
            } else if(jsonData.type === "registerUserOnGraph") {
                const message:WSMessage<WSRegisterUserOnGraph> = jsonData;
                this.deleteUserOnGraph(message.userId);

                const peer = clusterManager.getInstancehPeerId("graph-"+message.graphKey);
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

                const history = this.managedGraph[message.graphKey][message.sheetId].instructionHistory;
                const startIndex = this.binarySearchTime(history, message.fromTimestamp);
                const instructionsSince = history.slice(startIndex);

                if(messageId) return this.sendMessage(ws, { _id:messageId, _response: { status:true }, missingMessages: instructionsSince.map((i) => i.message) } as WSMessage<WSResponseMessage<{
                    missingMessages: WSMessage<any>[]
                }>>);
                return;

            } else if(jsonData.type === "disconnedUserOnGraph") {
                const message:WSMessage<WSDisconnedUserOnGraph> = jsonData;
                this.deleteUserOnGraph(message.userId);
                return;
            } else if(jsonData.type === "registerUserOnNodeConfig") {
                const message:WSMessage<WSRegisterUserOnNodeConfig> = jsonData;
                this.deleteUserOnNodeConfig(message.userId);

                const peer = clusterManager.getInstancehPeerId("nodeConfig-"+message.nodeConfigKey);
                if(!peer || peer != "self") {
                    if(messageId) return this.sendMessage(ws, { _id:messageId, _response: { status:false, message: "This server don't manage nodeConfig with key:"+message.nodeConfigKey } } as WSMessage<WSResponseMessage<unknown>>);
                    return;
                }

                // Initialize node config if not already managed
                if(!this.managedNodeConfig[message.nodeConfigKey]) {
                    try {
                        await this.initNodeConfig(message.nodeConfigKey);
                    } catch (error) {
                        if(messageId) return this.sendMessage(ws, {
                            _id:messageId,
                            _response: { status:false, message: "Failed to load node config: " + (error as Error).message }
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }
                }

                // Add user to the node config
                this.managedNodeConfig[message.nodeConfigKey].user.push({
                    name: message.name,
                    id: message.userId,
                    lastPing: Date.now(),
                    ws: ws
                });

                const history = this.managedNodeConfig[message.nodeConfigKey].instructionHistory;
                const startIndex = this.binarySearchTime(history, message.fromTimestamp);
                const instructionsSince = history.slice(startIndex);


                if(messageId) return this.sendMessage(ws, {
                    _id:messageId,
                    _response: { status:true },
                    missingMessages: instructionsSince.map((i) => i.message)
                } as WSMessage<WSResponseMessage<{
                    missingMessages: WSMessage<any>[]
                }>>);
                return;
            } else if(jsonData.type === "disconnectUserOnNodeConfig") {
                const message:WSMessage<WSDisconnectUserOnNodeConfig> = jsonData;
                this.deleteUserOnNodeConfig(message.userId);
                return;
            } else if(jsonData.type === "applyInstructionToNodeConfig") {
                if(!nodeConfigUser || !nodeConfig) {
                    ws.close();
                    return;
                }
                const message:WSMessage<WSApplyInstructionToNodeConfig> = jsonData;
                if(message.instructions.length > 20) {
                    ws.close();
                    return;
                }

                // Find the nodeConfigKey to access uniqueIdGenerator
                const nodeConfigKey = Object.keys(this.managedNodeConfig).find(
                    (key) => this.managedNodeConfig[key] === nodeConfig
                );

                if(!nodeConfigKey) {
                    if (messageId) return this.sendMessage(ws, {
                        _id: messageId,
                        _response: {status: false, message: "Node config not found in managed configs"}
                    } as WSMessage<WSResponseMessage<unknown>>);
                    return;
                }

                // Validate all instructions first
                for(const instruction of message.instructions) {
                    const validateResult = validateInstruction(instruction.i);
                    if (!validateResult.success) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: "Invalid instruction: " + validateResult.error}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }

                    const insertedObject = instruction.i.v as HtmlObject;
                    if(instruction.applyUniqIdentifier && insertedObject?.identifier != undefined) {
                        // ensure each new element have unique identifier
                        travelHtmlObject(insertedObject, (obj) => {
                            if(this.uniqueIdGenerator[nodeConfigKey] === undefined) {
                                this.uniqueIdGenerator[nodeConfigKey] = 0;
                            }
                            obj.identifier = (this.uniqueIdGenerator[nodeConfigKey]++).toString(36);
                            return true;
                        });
                    }
                }

                // Apply all instructions
                let currentConfig = nodeConfig.config;
                for(const instruction of message.instructions) {
                    const result = applyInstruction(currentConfig, instruction.i, (objectBeingApplied) => {
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

                    if(result.success) {
                        currentConfig = result.value;
                    } else {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: "Error while applying instruction: " + result.error}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }
                }

                // Update the config
                nodeConfig.config = currentConfig;
                nodeConfig.hasUnsavedChanges = true;

                // Add to instruction history
                nodeConfig.instructionHistory.push({
                    message: message,
                    time: Date.now()
                });

                // Send success response to sender
                if (messageId) {
                    this.sendMessage(ws, {
                        ...message,
                        _id: messageId,
                        _response: {status: true}
                    } as WSMessage<WSResponseMessage<WSApplyInstructionToNodeConfig>>);
                }

                // Broadcast to other users editing this nodeConfig
                for(const otherUser of nodeConfig.user) {
                    if(otherUser.id !== nodeConfigUser.id || messageId == undefined) {
                        this.sendMessage(otherUser.ws, {
                            ...message,
                            _id: undefined
                        } as WSMessage<WSApplyInstructionToNodeConfig>);
                    }
                }

            } else if(jsonData.type === "applyInstructionToGraph") {
                if(!graphUser || !sheet || !graphKey) {
                    ws.close();
                    return;
                }
                const message:WSMessage<WSApplyInstructionToGraph> = jsonData;
                if(message.instructions.length > 20) {
                    ws.close();
                }

                // Create maps to track unique nodes and edges being modified
                const modifiedNodes = new Map<string, Node<any>>();
                const modifiedEdges = new Map<string, [Edge, Edge]>(); // [oldEdge, newEdge]

                // validate first and collect unique objects
                for(const instruction of message.instructions) {
                    if(!instruction.nodeId && !instruction.edgeId) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: "NodeId and EdgeId can't be null at the same time"}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }
                    if(instruction.nodeId) {
                        // Get node from either our modified map or the sheet
                        if(!modifiedNodes.has(instruction.nodeId)) {
                            const node = sheet.nodeMap.get(instruction.nodeId);
                            if(!node) {
                                if (messageId) return this.sendMessage(ws, {
                                    _id: messageId,
                                    _response: {status: false, message: "Node with id "+instruction.nodeId+" not found"}
                                } as WSMessage<WSResponseMessage<unknown>>);
                                return;
                            }
                            modifiedNodes.set(instruction.nodeId, node);
                        }
                    }else if(instruction.edgeId) {
                        // Get edge from either our modified map or the sheet
                        if(!modifiedEdges.has(instruction.edgeId)) {
                            const edge = findEdgeByKey(sheet.edgeMap, instruction.edgeId);
                            if(!edge) {
                                if (messageId) return this.sendMessage(ws, {
                                    _id: messageId,
                                    _response: {status: false, message: "edge with id "+instruction.edgeId+" not found"}
                                } as WSMessage<WSResponseMessage<unknown>>);
                                return;
                            }
                            // Store [oldEdge, currentEdge] - both start as the same
                            modifiedEdges.set(instruction.edgeId, [edge, edge]);
                        }
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

                // apply instructions sequentially to the same object references
                for(const instruction of message.instructions) {
                    if(instruction.nodeId) {
                        const currentNode = modifiedNodes.get(instruction.nodeId)!;
                        const newNode = applyInstruction(currentNode, instruction.i, (objectBeingApplied) => {
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
                            modifiedNodes.set(instruction.nodeId, newNode.value);
                        } else {
                            if (messageId) return this.sendMessage(ws, {
                                _id: messageId,
                                _response: {status: false, message: "Error while parsing instruction on Node; " + newNode.error}
                            } as WSMessage<WSResponseMessage<unknown>>);
                            return;
                        }
                    } else if(instruction.edgeId) {
                        const edgePair = modifiedEdges.get(instruction.edgeId)!;
                        const currentEdge = edgePair[1]; // Get the latest version
                        const newEdge = applyInstruction(currentEdge, instruction.i, (objectBeingApplied) => {
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
                            edgePair[1] = newEdge.value; // Update the new edge
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

                // Update all modified nodes in the sheet
                for(const [nodeId, node] of modifiedNodes) {
                    sheet.nodeMap.set(nodeId, node);
                }

                // Update all modified edges in the sheet
                for(const [edgeId, edges] of modifiedEdges) {

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

                // Add to instruction history
                sheet.instructionHistory.push({
                    message: message,
                    time: Date.now()
                });

                if (messageId) this.sendMessage(ws, {
                    ...message,
                    _id: messageId,
                    _response: {status: true}
                } as WSMessage<WSResponseMessage<WSApplyInstructionToGraph>>);

                for(const otherUser of sheet.user) {
                    if(otherUser.id !== graphUser.id || messageId == undefined) {
                        this.sendMessage(otherUser.ws, {
                            ...message,
                            _id: undefined
                        } as WSMessage<WSApplyInstructionToGraph>);
                    }
                }
            } else if(jsonData.type === "generateUniqueId") {
                if(!graphUser || !sheet || !graphKey) {
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
                if(!graphUser || !sheet || !graphKey) {
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

                sheet.instructionHistory.push({
                    message: message,
                    time: Date.now()
                });

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
                    if(otherUser.id !== graphUser.id || messageId == undefined) {
                        this.sendMessage(otherUser.ws, {
                            ...message,
                            _id: undefined
                        } as WSMessage<WSBatchCreateElements>);
                    }
                }
            } else if(jsonData.type === "batchDeleteElements") {
                if(!graphUser || !sheet || !graphKey) {
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
                    finalEdgeKeys.push(edgeKey);
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

                sheet.instructionHistory.push({
                    message: message,
                    time: Date.now()
                });

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
                    if(otherUser.id !== graphUser.id || messageId == undefined) {
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
     * Save all pending changes for all managed graphs and node configs
     */
    private savePendingChanges = async () => {
        for (const graphKey in this.managedGraph) {
            await this.saveGraphChanges(graphKey);
        }
        for (const nodeConfigKey in this.managedNodeConfig) {
            await this.saveNodeConfigChanges(nodeConfigKey);
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

            // Track if any sheets had changes
            let hadAnyChanges = false;

            for (const sheetId in graph) {
                const sheet = graph[sheetId];

                if (!sheet.hasUnsavedChanges) {
                    continue; // Skip sheets with no changes
                }

                hadAnyChanges = true;

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
                        _key: edge.graphKey+"-"+edge._key,
                        _from: `nodius_nodes/${edge.graphKey+"-"+edge.source}`,
                        _to: `nodius_nodes/${edge.graphKey+"-"+edge.target}`
                        // Keep source and target as well for compatibility
                    };
                };

                const nodeToArangoFormat = (node:Node<any>):Node<any> => {
                    return {
                        ...node,
                        _key: node.graphKey+"-"+node._key,
                    }
                }

                // Execute database operations
                // Create new nodes
                for (const node of nodesToCreate) {
                    const arangoNode = nodeToArangoFormat(node);
                    await node_collection.save(arangoNode);
                }

                // Update existing nodes
                for (const node of nodesToUpdate) {
                    const arangoNode = nodeToArangoFormat(node);
                    await node_collection.replace(arangoNode._key, arangoNode);
                }

                // Delete removed nodes
                for (const nodeKey of nodesToDelete) {
                    await node_collection.remove(graphKey+"-"+nodeKey);
                }

                // Create new edges
                for (const edge of edgesToCreate) {
                    const arangoEdge = edgeToArangoFormat(edge);
                    await edge_collection.save(arangoEdge);
                }

                // Update existing edges
                for (const edge of edgesToUpdate) {
                    const arangoEdge = edgeToArangoFormat(edge);
                    await edge_collection.replace(graphKey+"-"+edge._key, arangoEdge);
                }

                // Delete removed edges
                for (const edgeKey of edgesToDelete) {
                    await edge_collection.remove(graphKey+"-"+edgeKey);
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

            // Update the graph's lastUpdatedTime if there were any changes
            if (hadAnyChanges) {
                const graph_collection = db.collection("nodius_graphs");
                await graph_collection.update(graphKey, {
                    lastUpdatedTime: Date.now()
                });
            }
        } catch (error) {
            console.error(`Error saving changes for graph ${graphKey}:`, error);
        }
    }

    /**
     * Save changes for a specific node config to ArangoDB
     * @param nodeConfigKey - The node config key to save changes for
     */
    private saveNodeConfigChanges = async (nodeConfigKey: string): Promise<void> => {
        const managedConfig = this.managedNodeConfig[nodeConfigKey];
        if (!managedConfig) return;

        try {
            if (!managedConfig.hasUnsavedChanges) {
                return; // Skip if no changes
            }

            const nodeConfig_collection = db.collection("nodius_node_config");

            // Check if the config has actually changed
            if (JSON.stringify(managedConfig.originalConfig) !== JSON.stringify(managedConfig.config)) {
                // Update lastUpdatedTime
                const updatedConfig = {
                    ...managedConfig.config,
                    lastUpdatedTime: Date.now()
                };

                // Update the node config in the database
                await nodeConfig_collection.replace(nodeConfigKey, updatedConfig);

                // Update the managed config with the new timestamp
                managedConfig.config = updatedConfig;

                // Update the original config after successful save
                managedConfig.originalConfig = JSON.parse(JSON.stringify(updatedConfig));
                managedConfig.hasUnsavedChanges = false;

                console.log(`Saved changes for node config ${nodeConfigKey}`);
            } else {
                // No actual changes, just mark as saved
                managedConfig.hasUnsavedChanges = false;
            }
        } catch (error) {
            console.error(`Error saving changes for node config ${nodeConfigKey}:`, error);
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
     * Check if an ID exists as a node or edge key in any sheet of the graph
     * @param graphKey - The graph key to check in
     * @param id - The ID to check
     * @returns true if the ID exists, false otherwise
     */
    private idExistsInGraph(graphKey: string, id: string): boolean {
        const graph = this.managedGraph[graphKey];
        if (!graph) return false;

        for (const sheetId in graph) {
            const sheet = graph[sheetId];

            // Check if ID exists as a node key
            if (sheet.nodeMap.has(id)) {
                return true;
            }

            // Check if ID exists as an edge key
            for (const edgeList of sheet.edgeMap.values()) {
                if (edgeList.some(edge => edge._key === id)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Get a unique identifier for nodes or edges in a specific graph.
     * This method guarantees that the returned ID will never be reused within the same graph.
     * IDs are generated in base-36 format and are tracked per graph.
     * The method validates that the generated ID doesn't collide with existing node or edge keys.
     *
     * @param graphKey - The graph key to generate a unique ID for
     * @returns A unique identifier string that has never been used in this graph
     * @throws Error if the graph is not managed by this WebSocketManager
     * @throws Error if unable to generate a unique ID after 1000 attempts (should never happen)
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

        let attempts = 0;
        const maxAttempts = 1000;

        while (attempts < maxAttempts) {
            // Generate the unique ID and increment the counter
            const uniqueId = (this.uniqueIdGenerator[graphKey]++).toString(36);

            // Skip reserved keywords
            if (uniqueId === "root") {
                attempts++;
                continue;
            }

            // Validate that the ID doesn't already exist in the graph
            if (this.idExistsInGraph(graphKey, uniqueId)) {
                console.warn(`[WebSocketManager] Generated ID "${uniqueId}" already exists in graph ${graphKey}, regenerating...`);
                attempts++;
                continue;
            }

            // ID is unique and valid
            return uniqueId;
        }

        // This should never happen, but handle it gracefully
        throw new Error(`[WebSocketManager] Failed to generate a unique ID for graph ${graphKey} after ${maxAttempts} attempts. This indicates a serious problem with ID generation.`);
    }
}

// Example usage:
// const manager = new WebSocketManager(8080);