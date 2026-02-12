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
import * as http from 'http';
import * as https from 'https';


import {
    WSApplyInstructionToGraph, WSApplyInstructionToNodeConfig,
    WSBatchCreateElements,
    WSBatchDeleteElements, WSDisconnedUserOnGraph, WSDisconnectUserOnNodeConfig,
    WSGenerateUniqueId,
    WSMessage,
    WSRegisterUserOnGraph, WSRegisterUserOnNodeConfig,
    WSResponseMessage, WSCreateSheet, WSRenameSheet, WSDeleteSheet,
    WSSaveStatus, WSForceSave, WSToggleAutoSave,
    Edge, GraphHistory, GraphHistoryBase, Node, NodeTypeConfig,
    edgeArrayToMap, findEdgeByKey, nodeArrayToMap,
    applyInstruction,
    getInverseInstruction,
    validateInstruction,
    HtmlObject,
    travelHtmlObject,
    deepCopy, travelObject,
    Graph
} from "@nodius/utils";

import {clusterManager, db} from "../server";
import {RequestWorkFlow} from "../request/requestWorkFlow";

import {createUniqueToken, ensureCollection} from "../utils/arangoUtils";
import {aql} from "arangojs";
import escapeHTML from "escape-html";

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

export interface WebSocketManagerOptions {
    /** Port number for standalone WebSocket server (when not using HTTPS server) */
    port?: number;
    /** Host for standalone WebSocket server */
    host?: string;
    /** Existing HTTP/HTTPS server to attach WebSocket to (for WSS support) */
    server?: http.Server | https.Server;
    /** Path for WebSocket connections when attached to server */
    path?: string;
}

export class WebSocketManager {
    private wss: WebSocketServer;
    private clients: Set<WebSocket> = new Set(); // Set to store connected clients

    private uniqueIdGenerator:Record<string, number> = {};
    private usedIds:Record<string, Set<string>> = {}; // Track all IDs that have ever been used
    private managedGraph:Record<string, Record<string, ManagedSheet>> = {}
    private managedNodeConfig:Record<string, ManagedNodeConfig> = {}

    private intervalCleaning:NodeJS.Timeout|undefined;
    private intervalSaving:NodeJS.Timeout|undefined;

    // Track save status per graph
    private graphSaveStatus:Record<string, {
        lastSaveTime: number,
        autoSaveEnabled: boolean
    }> = {};
    // Track save status per nodeConfig
    private nodeConfigSaveStatus:Record<string, {
        lastSaveTime: number,
        autoSaveEnabled: boolean
    }> = {};

    /**
     * Constructor to initialize the WebSocket server.
     * @param portOrOptions - Either a port number for standalone mode, or options object
     * @param host - Host for standalone mode (ignored if options object is used)
     */
    constructor(portOrOptions: number | WebSocketManagerOptions, host: string = "localhost") {
        if (typeof portOrOptions === 'number') {
            // Legacy mode: standalone WebSocket server on specified port
            this.wss = new WebSocketServer({ port: portOrOptions, host: host });
            console.log(`WebSocket server starting on port ${portOrOptions} (standalone mode)`);
        } else {
            // Options mode: either attach to existing server or create standalone
            const options = portOrOptions;
            if (options.server) {
                // Attach to existing HTTP/HTTPS server for WSS support
                this.wss = new WebSocketServer({
                    server: options.server,
                    path: options.path || '/ws'
                });
                console.log(`WebSocket server attached to existing server (path: ${options.path || '/ws'})`);
            } else if (options.port) {
                // Standalone mode with options
                this.wss = new WebSocketServer({
                    port: options.port,
                    host: options.host || 'localhost'
                });
                console.log(`WebSocket server starting on port ${options.port} (standalone mode)`);
            } else {
                throw new Error('WebSocketManager requires either a port number or a server instance');
            }
        }

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

        // Log when the server is listening (only for standalone mode)
        this.wss.on('listening', () => {
            const address = this.wss.address();
            if (address && typeof address === 'object') {
                console.log(`WebSocket server is listening on port ${address.port}`);
            }
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

    private deleteUserOnGraph = (userId: string, options?: Partial<{ graphKey:string, advertUser: boolean }>) => {
        // Iterate directly over graph entries to get ID and Data simultaneously
        for (const [graphId, sheets] of Object.entries(this.managedGraph)) {

            if(options?.graphKey && options?.graphKey !== graphId) continue;
            // Iterate over the sheets within the graph
            for (const sheet of Object.values(sheets)) {
                // OPTIMIZATION: findIndex does the job of 'some' and 'find' in one go
                const userIndex = sheet.user.findIndex((u: ManageUser) => u.id === userId);

                if (userIndex !== -1) {
                    const user = sheet.user[userIndex];

                    if(options?.advertUser) {
                        const message: WSMessage<WSDisconnedUserOnGraph> = {
                            type: "disconnedUserOnGraph",
                            graphKey: graphId,
                            userId: userId
                        };

                        this.sendMessage(user.ws, message);
                    }

                    // Remove in-place
                    sheet.user.splice(userIndex, 1);
                }
            }
        }
    }

    private deleteUserOnNodeConfig = (userId: string, options?: Partial<{ nodeConfigId:string, advertUser: boolean }>) => {
        for (const [nodeConfigId, nodeConfig] of Object.entries(this.managedNodeConfig)) {

            if(options?.nodeConfigId && options?.nodeConfigId !== nodeConfigId) continue;

            const userIndex = nodeConfig.user.findIndex((u: ManageUser) => u.id === userId);

            if (userIndex !== -1) {
                const user = nodeConfig.user[userIndex];

                if(options?.advertUser) {
                    const message: WSMessage<WSDisconnectUserOnNodeConfig> = {
                        type: "disconnectUserOnNodeConfig",
                        nodeConfigKey: nodeConfigId,
                        userId: userId
                    };

                    this.sendMessage(user.ws, message);
                }

                // Remove in-place
                nodeConfig.user.splice(userIndex, 1);
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

    private graphHistory:Record<"WF" | "node", Record<string, GraphHistory[]>> = {
        node: {},
        WF: {}
    }
    private addGraphHistory = (graphKey:string, type: "WF" | "node", history: GraphHistory) => {
        this.graphHistory[type][graphKey] ??= [];
        this.graphHistory[type][graphKey].push(history);
    }
    private saveGraphHistory = async (graphKey:string, type: "WF" | "node") => {
        if(!this.graphHistory[type][graphKey] || this.graphHistory[type][graphKey].length === 0) return;

        try {
            const collection = await ensureCollection("nodius_graphs_history");
            const key = await createUniqueToken(collection);

            // Convert Maps to arrays for JSON serialization
            const serializedHistory = this.graphHistory[type][graphKey].map((entry) => {
                if (entry.type === "sheetDelete" && entry.deleteSheet) {
                    // Convert Maps to arrays of [key, value] pairs
                    return {
                        ...entry,
                        deleteSheet: {
                            nodes: Array.from(entry.deleteSheet.nodeMap.entries()),
                            edges: Array.from(entry.deleteSheet.edgeMap.entries())
                        }
                    };
                }
                return entry;
            });

            const graphHistoryBase:GraphHistoryBase = {
                _key: key,
                graphKey: graphKey,
                type: type,
                timestamp: Date.now(),
                history: serializedHistory as GraphHistory[]
            }

            await collection.save(graphHistoryBase);

            // Clear the history after successful save
            this.graphHistory[type][graphKey] = [];

            console.log(`[WebSocketManager] Saved ${type} history for ${graphKey}: ${graphHistoryBase.history.length} entries`);
        } catch (error) {
            console.error(`[WebSocketManager] Error saving ${type} history for ${graphKey}:`, error);
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

        let hasInvalidEdges = false;

        Object.keys(graph._sheets).forEach((sheetId) => {
            const nodeMap = nodeArrayToMap(graph._sheets[sheetId].nodes);
            const edgeMap = edgeArrayToMap(graph._sheets[sheetId].edges);

            // Validate edges and remove those with invalid node connections
            const invalidEdgeKeys: string[] = [];
            for (const [key, edgeList] of edgeMap.entries()) {
                const validEdges = edgeList.filter((edge) => {
                    const sourceExists = nodeMap.has(edge.source);
                    const targetExists = nodeMap.has(edge.target);

                    if (!sourceExists || !targetExists) {
                        console.warn(`[WebSocketManager] Removing invalid edge ${edge._key} in graph ${graphKey}, sheet ${sheetId}: source=${edge.source} (exists: ${sourceExists}), target=${edge.target} (exists: ${targetExists})`);
                        invalidEdgeKeys.push(edge._key);
                        hasInvalidEdges = true;
                        return false;
                    }
                    return true;
                });

                if (validEdges.length === 0) {
                    edgeMap.delete(key);
                } else if (validEdges.length !== edgeList.length) {
                    edgeMap.set(key, validEdges);
                }
            }

            if (invalidEdgeKeys.length > 0) {
                console.log(`[WebSocketManager] Removed ${invalidEdgeKeys.length} invalid edges from graph ${graphKey}, sheet ${sheetId}: ${invalidEdgeKeys.join(', ')}`);
            }

            this.managedGraph[graphKey][sheetId] = {
                instructionHistory: [],
                user: [],
                nodeMap: nodeMap,
                edgeMap: edgeMap,
                // Deep copy for original state
                originalNodeMap: new Map(nodeMap),
                originalEdgeMap: new Map(edgeMap),
                hasUnsavedChanges: hasInvalidEdges
            }
        })

        // Initialize ID generator and used IDs set by scanning all existing IDs
        this.uniqueIdGenerator[graphKey] = 0;
        this.usedIds[graphKey] = new Set<string>();

        Object.values(this.managedGraph[graphKey]).forEach((sheet: ManagedSheet) => {
            // Check node._key values
            sheet.nodeMap.forEach((node) => {
                // Add to used IDs set
                this.usedIds[graphKey].add(node._key);

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
                    // Add to used IDs set
                    this.usedIds[graphKey].add(edge._key);

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
        console.log(`[WebSocketManager] Initialized uniqueIdGenerator for graph ${graphKey} starting at ${this.uniqueIdGenerator[graphKey]} with ${this.usedIds[graphKey].size} used IDs tracked`);

        // If invalid edges were found and removed, save the graph immediately
        if (hasInvalidEdges) {
            console.log(`[WebSocketManager] Triggering immediate save for graph ${graphKey} due to invalid edges removal`);
            await this.saveGraphChanges(graphKey);
        }
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
                //this.deleteUserOnGraph(message.userId, { advertUser: true });

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
                this.deleteUserOnGraph(message.userId, {graphKey:message.graphKey});
                return;
            } else if(jsonData.type === "registerUserOnNodeConfig") {
                const message:WSMessage<WSRegisterUserOnNodeConfig> = jsonData;
                //this.deleteUserOnNodeConfig(message.userId, { advertUser: true });

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
                this.deleteUserOnNodeConfig(message.userId, {
                    nodeConfigId: message.nodeConfigKey
                });
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

                const reversedInstructions = message.instructions.map((inst) => {
                    const reverse = getInverseInstruction(currentConfig, inst.i);
                    if(reverse.success) {
                        return deepCopy(reverse.value)
                    }
                    return undefined;
                }).filter((v) => v != undefined);

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

                this.addGraphHistory(nodeConfigKey, "node", {
                    type: "nodeUpdate",
                    instruction: message.instructions.map((i) => i.i),
                    reversedInstruction: reversedInstructions,
                    userId: nodeConfigUser.id
                });

                // Broadcast save status
                this.broadcastNodeConfigSaveStatus(nodeConfigKey);

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
                if(!graphUser || !graphKey) {
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
                // Track which sheet each node/edge belongs to
                const nodeSheetMap = new Map<string, string>(); // nodeId -> sheetId
                const edgeSheetMap = new Map<string, string>(); // edgeId -> sheetId
                // Track which sheets are modified
                const modifiedSheets = new Set<string>();

                // validate first and collect unique objects
                for(const instruction of message.instructions) {
                    const targetSheet = this.managedGraph[graphKey][instruction.sheetId];
                    if(!targetSheet) {
                        if (messageId) return this.sendMessage(ws, {
                            _id: messageId,
                            _response: {status: false, message: "Sheet with id "+instruction.sheetId+" not found"}
                        } as WSMessage<WSResponseMessage<unknown>>);
                        return;
                    }
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
                            const node = targetSheet.nodeMap.get(instruction.nodeId);
                            if(!node) {
                                if (messageId) return this.sendMessage(ws, {
                                    _id: messageId,
                                    _response: {status: false, message: "Node with id "+instruction.nodeId+" not found"}
                                } as WSMessage<WSResponseMessage<unknown>>);
                                return;
                            }
                            modifiedNodes.set(instruction.nodeId, node);
                            nodeSheetMap.set(instruction.nodeId, instruction.sheetId);
                        }
                        modifiedSheets.add(instruction.sheetId);
                    }else if(instruction.edgeId) {
                        // Get edge from either our modified map or the sheet
                        if(!modifiedEdges.has(instruction.edgeId)) {
                            const edge = findEdgeByKey(targetSheet.edgeMap, instruction.edgeId);
                            if(!edge) {
                                if (messageId) return this.sendMessage(ws, {
                                    _id: messageId,
                                    _response: {status: false, message: "edge with id "+instruction.edgeId+" not found"}
                                } as WSMessage<WSResponseMessage<unknown>>);
                                return;
                            }
                            // Store [oldEdge, currentEdge] - both start as the same
                            modifiedEdges.set(instruction.edgeId, [edge, edge]);
                            edgeSheetMap.set(instruction.edgeId, instruction.sheetId);
                        }
                        modifiedSheets.add(instruction.sheetId);
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

                const reversedNodesInstructions = message.instructions.map((inst) => {
                    if(inst.nodeId) {
                        const currentNode = modifiedNodes.get(inst.nodeId)!;
                        const reverse = getInverseInstruction(currentNode, inst.i);
                        if (reverse.success) {
                            return deepCopy(reverse.value)
                        }
                    }
                    return undefined;
                }).filter((v) => v != undefined);

                const reversedEdgesInstructions = message.instructions.map((inst) => {
                    if(inst.edgeId) {
                        const currentEdge = modifiedEdges.get(inst.edgeId)!;
                        const reverse = getInverseInstruction(currentEdge[1], inst.i);
                        if (reverse.success) {
                            return deepCopy(reverse.value)
                        }
                    }
                    return undefined;
                }).filter((v) => v != undefined);

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
                // Mark all affected sheets as having unsaved changes
                for(const sheetId of modifiedSheets) {
                    const targetSheet = this.managedGraph[graphKey][sheetId];
                    targetSheet.hasUnsavedChanges = true;
                }

                // Broadcast save status to all users
                this.broadcastSaveStatus(graphKey);

                // Update all modified nodes in their respective sheets
                for(const [nodeId, node] of modifiedNodes) {
                    const sheetId = nodeSheetMap.get(nodeId)!;
                    const targetSheet = this.managedGraph[graphKey][sheetId];
                    targetSheet.nodeMap.set(nodeId, node);
                }

                // Update all modified edges in their respective sheets
                for(const [edgeId, edges] of modifiedEdges) {
                        const sheetId = edgeSheetMap.get(edgeId)!;
                        const targetSheet = this.managedGraph[graphKey][sheetId];

                        //remove old
                        if(edges[0].target) {
                            const targetKey = `target-${edges[0].target}`;
                            let edgeListTarget = targetSheet.edgeMap.get(targetKey) ?? [];
                            edgeListTarget = edgeListTarget.filter((e) => e._key !== edges[0]._key);
                            if(edgeListTarget.length > 0) {
                                targetSheet.edgeMap.set(targetKey, edgeListTarget);
                            } else {
                                targetSheet.edgeMap.delete(targetKey);
                            }
                        }

                        if(edges[0].source) {
                            const sourceKey = `source-${edges[0].source}`;
                            let edgeListSource = targetSheet.edgeMap.get(sourceKey) ?? [];
                            edgeListSource = edgeListSource.filter((e) => e._key !== edges[0]._key);
                            if(edgeListSource.length > 0) {
                                targetSheet.edgeMap.set(sourceKey, edgeListSource);
                            } else {
                                targetSheet.edgeMap.delete(sourceKey);
                            }
                        }

                        // add new
                        if(edges[1].target) {
                            const targetKey = `target-${edges[1].target}`;
                            let edgeListTarget = targetSheet.edgeMap.get(targetKey) ?? [];
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
                                targetSheet.edgeMap.set(targetKey, edgeListTarget);
                            } else {
                                targetSheet.edgeMap.delete(targetKey);
                            }
                        }

                        if(edges[1].source) {
                            const sourceKey = `source-${edges[1].source}`;
                            let edgeListSource = targetSheet.edgeMap.get(sourceKey) ?? [];
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
                            targetSheet.edgeMap.set(sourceKey, edgeListSource);
                        }
                }

                // Add to instruction history for all affected sheets
                const historyEntry = {
                    message: message,
                    time: Date.now()
                };
                for(const sheetId of modifiedSheets) {
                    const targetSheet = this.managedGraph[graphKey][sheetId];
                    targetSheet.instructionHistory.push(historyEntry);
                }

                if(message.instructions.filter((i) => i.nodeId != undefined).length > 0) {
                    this.addGraphHistory(graphKey, "WF", {
                        type: "nodeUpdate",
                        instruction: message.instructions.filter((i) => i.nodeId != undefined).map((i) => i.i),
                        reversedInstruction: reversedNodesInstructions,
                        userId: graphUser.id
                    });
                }
                if(message.instructions.filter((i) => i.edgeId != undefined).length > 0) {
                    this.addGraphHistory(graphKey, "WF", {
                        type: "edgeUpdate",
                        instruction: message.instructions.filter((i) => i.edgeId != undefined).map((i) => i.i),
                        reversedInstruction: reversedEdgesInstructions,
                        userId: graphUser.id
                    });
                }

                if (messageId) this.sendMessage(ws, {
                    ...message,
                    _id: messageId,
                    _response: {status: true}
                } as WSMessage<WSResponseMessage<WSApplyInstructionToGraph>>);

                // Broadcast to users of all affected sheets
                const notifiedUsers = new Set<string>();
                for(const sheetId of modifiedSheets) {
                    const targetSheet = this.managedGraph[graphKey][sheetId];
                    for(const otherUser of targetSheet.user) {
                        // Avoid notifying the same user multiple times and skip the sender if they already got a response
                        if(!notifiedUsers.has(otherUser.id) && (otherUser.id !== graphUser.id || messageId == undefined)) {
                            notifiedUsers.add(otherUser.id);
                            this.sendMessage(otherUser.ws, {
                                ...message,
                                _id: undefined
                            } as WSMessage<WSApplyInstructionToGraph>);
                        }
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

                // Broadcast save status to all users
                this.broadcastSaveStatus(graphKey);

                // Initialize usedIds set if it doesn't exist
                if (!this.usedIds[graphKey]) {
                    this.usedIds[graphKey] = new Set<string>();
                }

                // Add nodes
                for(const node of message.nodes) {
                    targetSheet.nodeMap.set(node._key, node);
                    // Track this ID as used
                    this.usedIds[graphKey].add(node._key);
                }

                if(message.nodes.length > 0) {
                    this.addGraphHistory(graphKey, "WF", {
                        type: "nodeCreate",
                        userId: graphUser.id,
                        nodes: message.nodes
                    });
                }

                // Add edges to the edgeMap
                for(const edge of edgesToAdd) {
                    // Track this ID as used
                    this.usedIds[graphKey].add(edge._key);

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
                if(edgesToAdd.length > 0) {
                    this.addGraphHistory(graphKey, "WF", {
                        type: "edgeCreate",
                        userId: graphUser.id,
                        edges: edgesToAdd
                    });
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

                // Broadcast save status to all users
                this.broadcastSaveStatus(graphKey);

                // Delete edges first (to avoid orphaned edges)
                const deletedEdges: Edge[] = [];
                for(const edgeKey of finalEdgeKeys) {
                    const edge = findEdgeByKey(targetSheet.edgeMap, edgeKey);
                    if(edge) {
                        deletedEdges.push(edge);
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
                if(deletedEdges.length > 0) {
                    this.addGraphHistory(graphKey, "WF", {
                        type: "edgeDelete",
                        userId: graphUser.id,
                        edges: deletedEdges
                    });
                }

                // Delete nodes
                if(message.nodeKeys.length > 0) {
                    this.addGraphHistory(graphKey, "WF", {
                        type: "nodeDelete",
                        userId: graphUser.id,
                        nodes: message.nodeKeys.map((n) => targetSheet.nodeMap.get(n)).filter((v) => v != undefined)
                    });
                }
                for(const nodeKey of message.nodeKeys) {
                    targetSheet.nodeMap.delete(nodeKey);
                }

                sheet.instructionHistory.push({
                    message: message,
                    time: Date.now()
                });

                // for each node, delete subflow
                const targetKeys = message.nodeKeys
                    .map((n) => graphKey + "-"+ n);

                if (targetKeys.length > 0) {
                    // 2. Execute everything in a single database round-trip
                    await db.query(aql`
                        FOR targetKey IN ${targetKeys}
                            // Find the graph linked to this node
                            FOR g IN nodius_graphs
                                FILTER g.nodeKeyLinked == targetKey
                                
                                // Delete HTML Class (Subquery to handle conditional existence)
                                LET removeHtml = (
                                    FOR h IN nodius_html_class
                                        FILTER h._key == g.htmlKeyLinked
                                        REMOVE h IN nodius_html_class
                                )
                
                                // Delete Child Nodes
                                LET removeNodes = (
                                    FOR n IN nodius_nodes
                                        FILTER n.graphKey == g._key
                                        REMOVE n IN nodius_nodes
                                )
                
                                // Delete Child Edges
                                LET removeEdges = (
                                    FOR e IN nodius_edges
                                        FILTER e.graphKey == g._key
                                        REMOVE e IN nodius_edges
                                )
                
                                // Finally, remove the Graph itself
                                REMOVE g IN nodius_graphs
                    `);
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
                    if(otherUser.id !== graphUser.id || messageId == undefined) {
                        this.sendMessage(otherUser.ws, {
                            ...message,
                            edgeKeys: finalEdgeKeys, // Send back the actually deleted edges
                            _id: undefined
                        } as WSMessage<WSBatchDeleteElements>);
                    }
                }
            } else if(jsonData.type === "createSheet") {
                if(!graphUser || !sheet || !graphKey) {
                    ws.close();
                    return;
                }
                const message:WSMessage<WSCreateSheet> = jsonData;

                const graph = this.managedGraph[graphKey];

                let id = 1;
                while(graph[id]) {
                    id++;
                }
                message.key = id+"";
                graph[id] = {
                    instructionHistory: [],
                    user: [],
                    nodeMap: new Map(),
                    edgeMap: new Map(),
                    // Deep copy for original state
                    originalNodeMap: new Map(),
                    originalEdgeMap: new Map(),
                    hasUnsavedChanges: false
                }

                this.addGraphHistory(graphKey, "WF", {
                    type: "sheetCreate",
                    userId: graphUser.id,
                    name: message.name
                });

                // Save to ArangoDB
                try {
                    const graph_collection = db.collection("nodius_graphs");
                    const graphDoc = await graph_collection.document(graphKey) as Graph;

                    if(graphDoc.metadata?.noMultipleSheet) {
                        return;
                    }

                    // Update sheetsList in the graph document
                    if (!graphDoc.sheetsList) {
                        graphDoc.sheetsList = {};
                    }
                    graphDoc.sheetsList[message.key] = message.name || `Sheet ${message.key}`;

                    await graph_collection.update(graphKey, {
                        sheetsList: graphDoc.sheetsList,
                        lastUpdatedTime: Date.now()
                    });

                    console.log(`Created sheet ${message.key} in graph ${graphKey}`);
                } catch (error) {
                    console.error(`Error saving createSheet to database for graph ${graphKey}:`, error);
                }

                for(const graph of Object.values(this.managedGraph)) {
                    for(const sheet of Object.values(graph)) {
                        for(const user of sheet.user) {
                            this.sendMessage(user.ws, {
                                ...message,
                                _id: undefined
                            } as WSMessage<WSCreateSheet>);
                        }
                    }
                }
            } else if(jsonData.type === "renameSheet") {
                if(!graphUser || !sheet || !graphKey) {
                    ws.close();
                    return;
                }
                const message:WSMessage<WSRenameSheet> = jsonData;


                // Save to ArangoDB
                try {
                    const graph_collection = db.collection("nodius_graphs");
                    const graphDoc = await graph_collection.document(graphKey);

                    // Update sheet name in sheetsList
                    if (graphDoc.sheetsList && graphDoc.sheetsList[message.key]) {
                        this.addGraphHistory(graphKey, "WF", {
                            type: "sheetRename",
                            userId: graphUser.id,
                            oldName: graphDoc.sheetsList[message.key],
                            newName: message.name
                        });
                        graphDoc.sheetsList[message.key] = message.name;

                        await graph_collection.update(graphKey, {
                            sheetsList: graphDoc.sheetsList,
                            lastUpdatedTime: Date.now()
                        });

                        console.log(`Renamed sheet ${message.key} to "${message.name}" in graph ${graphKey}`);
                    } else {
                        console.warn(`Sheet ${message.key} not found in graph ${graphKey} sheetsList`);
                    }
                } catch (error) {
                    console.error(`Error saving renameSheet to database for graph ${graphKey}:`, error);
                }

                for(const graph of Object.values(this.managedGraph)) {
                    for(const sheet of Object.values(graph)) {
                        for(const user of sheet.user) {
                            this.sendMessage(user.ws, {
                                ...message,
                                _id: undefined
                            } as WSMessage<WSRenameSheet>);
                        }
                    }
                }
            } else if(jsonData.type === "deleteSheet") {
                if(!graphUser || !sheet || !graphKey) {
                    ws.close();
                    return;
                }
                const message:WSMessage<WSDeleteSheet> = jsonData;

                const graph = this.managedGraph[graphKey];
                const deletedSheet = graph[message.key];

                // Save to ArangoDB
                try {
                    const graph_collection = db.collection("nodius_graphs");
                    const node_collection = db.collection("nodius_nodes");
                    const edge_collection = db.collection("nodius_edges");
                    const graphDoc = await graph_collection.document(graphKey);

                    // Remove sheet from sheetsList
                    if (graphDoc.sheetsList && graphDoc.sheetsList[message.key]) {

                        this.addGraphHistory(graphKey, "WF", {
                            type: "sheetDelete",
                            userId: graphUser.id,
                            name: graphDoc.sheetsList[message.key],
                            deleteSheet: {
                                nodeMap: deletedSheet.nodeMap,
                                edgeMap: deletedSheet.edgeMap,
                            }
                        });

                        delete graphDoc.sheetsList[message.key];

                        await graph_collection.update(graphKey, {
                            sheetsList: graphDoc.sheetsList,
                            lastUpdatedTime: Date.now()
                        });


                        console.log(`Deleted sheet ${message.key} from graph ${graphKey} sheetsList`);
                    }

                    // Delete all nodes and edges from this sheet
                    if (deletedSheet) {
                        // Delete all nodes from this sheet
                        for (const nodeKey of deletedSheet.nodeMap.keys()) {
                            try {
                                await node_collection.remove(graphKey + "-" + nodeKey);
                            } catch (error) {
                                console.warn(`Failed to delete node ${nodeKey} from sheet ${message.key}:`, error);
                            }
                        }

                        // Delete all edges from this sheet
                        const allEdges = new Set<string>();
                        for (const edgeList of deletedSheet.edgeMap.values()) {
                            for (const edge of edgeList) {
                                allEdges.add(edge._key);
                            }
                        }
                        for (const edgeKey of allEdges) {
                            try {
                                await edge_collection.remove(graphKey + "-" + edgeKey);
                            } catch (error) {
                                console.warn(`Failed to delete edge ${edgeKey} from sheet ${message.key}:`, error);
                            }
                        }

                        console.log(`Deleted ${deletedSheet.nodeMap.size} nodes and ${allEdges.size} edges from sheet ${message.key} in graph ${graphKey}`);
                    }
                } catch (error) {
                    console.error(`Error saving deleteSheet to database for graph ${graphKey}:`, error);
                }

                delete graph[message.key];

                for(const graph of Object.values(this.managedGraph)) {
                    for(const sheet of Object.values(graph)) {
                        for(const user of sheet.user) {
                            this.sendMessage(user.ws, {
                                ...message,
                                _id: undefined
                            } as WSMessage<WSDeleteSheet>);
                        }
                    }
                }
            } else if(jsonData.type === "forceSave") {
                // CAS 1: Graph User
                if(graphUser && sheet && graphKey) {
                    const message:WSMessage<WSForceSave> = jsonData;
                    await this.saveGraphChanges(graphKey);

                    if (!this.graphSaveStatus[graphKey]) {
                        this.graphSaveStatus[graphKey] = { lastSaveTime: Date.now(), autoSaveEnabled: true };
                    } else {
                        this.graphSaveStatus[graphKey].lastSaveTime = Date.now();
                    }
                    this.broadcastSaveStatus(graphKey);

                    if (messageId) this.sendMessage(ws, { ...message, _id: messageId, _response: { status: true } } as WSMessage<WSResponseMessage<WSForceSave>>);
                }
                // CAS 2: NodeConfig User
                else if (nodeConfigUser && nodeConfig) {
                    const message:WSMessage<WSForceSave> = jsonData;

                    // Retrouver la clé
                    const nodeConfigKey = Object.keys(this.managedNodeConfig).find(key => this.managedNodeConfig[key] === nodeConfig);

                    if (nodeConfigKey) {
                        await this.saveNodeConfigChanges(nodeConfigKey);

                        if (!this.nodeConfigSaveStatus[nodeConfigKey]) {
                            this.nodeConfigSaveStatus[nodeConfigKey] = { lastSaveTime: Date.now(), autoSaveEnabled: true };
                        } else {
                            this.nodeConfigSaveStatus[nodeConfigKey].lastSaveTime = Date.now();
                        }

                        this.broadcastNodeConfigSaveStatus(nodeConfigKey);

                        if (messageId) this.sendMessage(ws, { ...message, _id: messageId, _response: { status: true } } as WSMessage<WSResponseMessage<WSForceSave>>);
                    }
                }
                else {
                    ws.close();
                    return;
                }
            } else if(jsonData.type === "toggleAutoSave") {
                // CAS 1: Graph User
                if(graphUser && sheet && graphKey) {
                    const message:WSMessage<WSToggleAutoSave> = jsonData;
                    if (!this.graphSaveStatus[graphKey]) {
                        this.graphSaveStatus[graphKey] = { lastSaveTime: Date.now(), autoSaveEnabled: true };
                    }
                    this.graphSaveStatus[graphKey].autoSaveEnabled = message.enabled;
                    this.broadcastSaveStatus(graphKey);

                    if (messageId) this.sendMessage(ws, { ...message, _id: messageId, _response: { status: true } } as WSMessage<WSResponseMessage<WSToggleAutoSave>>);
                }
                // CAS 2: NodeConfig User
                else if (nodeConfigUser && nodeConfig) {
                    const message:WSMessage<WSToggleAutoSave> = jsonData;

                    const nodeConfigKey = Object.keys(this.managedNodeConfig).find(key => this.managedNodeConfig[key] === nodeConfig);

                    if (nodeConfigKey) {
                        if (!this.nodeConfigSaveStatus[nodeConfigKey]) {
                            this.nodeConfigSaveStatus[nodeConfigKey] = { lastSaveTime: Date.now(), autoSaveEnabled: true };
                        }

                        this.nodeConfigSaveStatus[nodeConfigKey].autoSaveEnabled = message.enabled;
                        this.broadcastNodeConfigSaveStatus(nodeConfigKey);

                        if (messageId) this.sendMessage(ws, { ...message, _id: messageId, _response: { status: true } } as WSMessage<WSResponseMessage<WSToggleAutoSave>>);
                    }
                }
                else {
                    ws.close();
                    return;
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
     * Broadcast save status to all users on a graph
     * @param graphKey - The graph key to broadcast status for
     */
    private broadcastSaveStatus = (graphKey: string) => {
        // Initialize save status if it doesn't exist
        if (!this.graphSaveStatus[graphKey]) {
            this.graphSaveStatus[graphKey] = {
                lastSaveTime: Date.now(),
                autoSaveEnabled: true
            };
        }

        // Check if any sheet has unsaved changes
        const graph = this.managedGraph[graphKey];
        let hasUnsavedChanges = false;
        if (graph) {
            for (const sheetId in graph) {
                if (graph[sheetId].hasUnsavedChanges) {
                    hasUnsavedChanges = true;
                    break;
                }
            }
        }

        // Broadcast to all users on this graph
        if (graph) {
            for (const sheetId in graph) {
                const sheet = graph[sheetId];
                for (const user of sheet.user) {
                    this.sendMessage(user.ws, {
                        type: "saveStatus",
                        graphKey: graphKey,
                        lastSaveTime: this.graphSaveStatus[graphKey].lastSaveTime,
                        hasUnsavedChanges: hasUnsavedChanges,
                        autoSaveEnabled: this.graphSaveStatus[graphKey].autoSaveEnabled
                    } as WSMessage<WSSaveStatus>);
                }
            }
        }
    };

    /**
     * Broadcast save status to all users on a nodeConfig
     * @param nodeConfigKey - The nodeConfig key to broadcast status for
     */
    private broadcastNodeConfigSaveStatus = (nodeConfigKey: string) => {
        // Initialize save status if it doesn't exist
        if (!this.nodeConfigSaveStatus[nodeConfigKey]) {
            this.nodeConfigSaveStatus[nodeConfigKey] = {
                lastSaveTime: Date.now(),
                autoSaveEnabled: true
            };
        }

        const config = this.managedNodeConfig[nodeConfigKey];
        const hasUnsavedChanges = config ? config.hasUnsavedChanges : false;

        // Broadcast to all users on this nodeConfig
        if (config) {
            for (const user of config.user) {
                this.sendMessage(user.ws, {
                    type: "saveStatus",
                    nodeConfigKey: nodeConfigKey, // Spécifique pour le front-end
                    lastSaveTime: this.nodeConfigSaveStatus[nodeConfigKey].lastSaveTime,
                    hasUnsavedChanges: hasUnsavedChanges,
                    autoSaveEnabled: this.nodeConfigSaveStatus[nodeConfigKey].autoSaveEnabled
                } as WSMessage<any>); // Utilisation de any ou d'un type étendu WSSaveStatusNodeConfig
            }
        }
    };

    /**
     * Save all pending changes for all managed graphs and node configs
     */
    private savePendingChanges = async () => {
        for (const graphKey in this.managedGraph) {
            // Only auto-save if auto-save is enabled for this graph
            if (!this.graphSaveStatus[graphKey] || this.graphSaveStatus[graphKey].autoSaveEnabled) {
                await this.saveGraphChanges(graphKey);

                // Update last save time
                if (!this.graphSaveStatus[graphKey]) {
                    this.graphSaveStatus[graphKey] = {
                        lastSaveTime: Date.now(),
                        autoSaveEnabled: true
                    };
                } else {
                    this.graphSaveStatus[graphKey].lastSaveTime = Date.now();
                }

                // Broadcast save status to all users
                this.broadcastSaveStatus(graphKey);
            }
        }
        for (const nodeConfigKey in this.managedNodeConfig) {
            // Only auto-save if auto-save is enabled for this nodeConfig
            if (!this.nodeConfigSaveStatus[nodeConfigKey] || this.nodeConfigSaveStatus[nodeConfigKey].autoSaveEnabled) {

                // On check d'abord si on doit sauvegarder pour savoir si on met à jour le timer
                const hadChanges = this.managedNodeConfig[nodeConfigKey].hasUnsavedChanges;

                await this.saveNodeConfigChanges(nodeConfigKey);

                // Update last save time only if we attempt to save or check
                if (!this.nodeConfigSaveStatus[nodeConfigKey]) {
                    this.nodeConfigSaveStatus[nodeConfigKey] = {
                        lastSaveTime: Date.now(),
                        autoSaveEnabled: true
                    };
                }

                // Si des changements ont été sauvegardés, on met à jour le temps et on notifie
                if (hadChanges) {
                    this.nodeConfigSaveStatus[nodeConfigKey].lastSaveTime = Date.now();
                    this.broadcastNodeConfigSaveStatus(nodeConfigKey);
                }
            }
        }
    }

    /**
     * Save changes for a specific graph to ArangoDB
     * @param graphKey - The graph key to save changes for
     */
    private saveGraphChanges = async (graphKey: string): Promise<void> => {
        const graph = this.managedGraph[graphKey];
        if (!graph) return;

        await this.saveGraphHistory(graphKey, "WF");

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

        await this.saveGraphHistory(nodeConfigKey, "node");

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
     * This method guarantees that the returned ID will never be reused within the same graph,
     * even if an ID has been deleted. All generated IDs are tracked in the usedIds set.
     * IDs are generated in base-36 format and are tracked per graph.
     *
     * @param graphKey - The graph key to generate a unique ID for
     * @returns A unique identifier string that has never been used in this graph
     * @throws Error if the graph is not managed by this WebSocketManager
     * @throws Error if unable to generate a unique ID after 10000 attempts (should never happen)
     */
    public getUniqueId(graphKey: string): string {
        // Check if the graph is managed
        if (!this.managedGraph[graphKey]) {
            throw new Error(`Graph with key "${graphKey}" is not managed by this WebSocketManager. Please ensure the graph is initialized first.`);
        }

        // Initialize the counter and usedIds set if they don't exist (defensive programming)
        if (this.uniqueIdGenerator[graphKey] === undefined) {
            this.uniqueIdGenerator[graphKey] = 0;
        }
        if (this.usedIds[graphKey] === undefined) {
            this.usedIds[graphKey] = new Set<string>();
        }

        let attempts = 0;
        const maxAttempts = 10000;

        while (attempts < maxAttempts) {
            // Generate the unique ID and increment the counter
            const uniqueId = (this.uniqueIdGenerator[graphKey]++).toString(36);

            // Skip reserved keywords
            if (uniqueId === "root") {
                attempts++;
                continue;
            }

            // Check if this ID has ever been used (including deleted IDs)
            if (this.usedIds[graphKey].has(uniqueId)) {
                attempts++;
                continue;
            }

            // Double-check that the ID doesn't currently exist in the graph
            // This is a safety check in case the usedIds set gets out of sync
            if (this.idExistsInGraph(graphKey, uniqueId)) {
                console.warn(`[WebSocketManager] Generated ID "${uniqueId}" exists in graph ${graphKey} but not in usedIds set, adding to set...`);
                this.usedIds[graphKey].add(uniqueId);
                attempts++;
                continue;
            }

            // Mark this ID as used
            this.usedIds[graphKey].add(uniqueId);

            // ID is unique and valid
            return uniqueId;
        }

        // This should never happen, but handle it gracefully
        throw new Error(`[WebSocketManager] Failed to generate a unique ID for graph ${graphKey} after ${maxAttempts} attempts. This indicates a serious problem with ID generation. UsedIds count: ${this.usedIds[graphKey].size}`);
    }
}

// Example usage:
// const manager = new WebSocketManager(8080);