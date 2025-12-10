/**
 * @file nodeUtils.ts
 * @description Utility functions for graph node and edge manipulation
 * @module graph
 *
 * Provides utilities for working with graph data structures:
 * - flatEdgeMap: Flatten edge map to array
 * - nodeArrayToMap: Convert node array to key-indexed map
 * - edgeArrayToMap: Group edges by source/target for efficient lookup
 * - findFirstNodeByType: Search for node by type across sheets
 * - findFirstNodeWithId: Locate node by ID
 * - findNodeConnected: Get all nodes connected to a given node
 * - duplicateNodeConfig: Create deep copy of node configuration
 * - generateHistoryDescription: Generate human-readable description from GraphHistory
 *
 * Key features:
 * - Efficient edge grouping by source-{id} and target-{id} keys
 * - Multi-sheet graph traversal
 * - Directional connection queries (in, out, both)
 * - Deep cloning for node config duplication
 * - Type-safe generic node data handling
 * - History tracking and reporting
 */

import {Edge, Graph, GraphHistory, Node, NodeType, NodeTypeConfig} from "./graphType";
import {deepCopy} from "../objectUtils";

export const flatEdgeMap = (edges:Map<string, Edge[]>):Edge[] => Array.from(edges.entries())
    .filter(([key, value]) => key.startsWith('target')).map(([key, value]) => value).flat();


export const nodeArrayToMap = (nodes:Node<any>[]):Map<string, Node<any>> => new Map(nodes.map(n => [n._key, n]));

export const edgeArrayToMap = (edges: Edge[]): Map<string, Edge[]> => {
    const output = new Map<string, Edge[]>();

    for (const edge of edges) {

        // push into target group
        if(edge.target) {
            const targetKey = `target-${edge.target}`;
            let targetArray = output.get(targetKey);
            if (!targetArray) {
                targetArray = [];
                output.set(targetKey, targetArray);
            }
            targetArray.push(edge);
        }

        // push into source group
        if(edge.source) {
            const sourceKey = `source-${edge.source}`;
            let sourceArray = output.get(sourceKey);
            if (!sourceArray) {
                sourceArray = [];
                output.set(sourceKey, sourceArray);
            }
            sourceArray.push(edge);
        }
    }

    return output;
};

export const findFirstNodeByType = <T = any>(graph:Graph, type:NodeType):Node<T>|undefined => {
    for (const sheet of Object.values(graph.sheets)) {
        for (const node of sheet.nodeMap.values()) {
            if (node.type === type) return node;
        }
    }
    return undefined;
}

export const findFirstNodeWithId = <T = any>(graph:Graph, id:string):Node<T>|undefined => {
    for (const sheet of Object.values(graph.sheets)) {
        if(sheet.nodeMap.has(id)) {
            return sheet.nodeMap.get(id);
        }
    }
    return undefined;
}

/**
 * Returns all nodes connected to the given node
 * Filters by connection direction: in (incoming), out (outgoing), or both
 */
export const findNodeConnected = (graph:Graph, node:Node<any>, type: "in" | "out" | "both" = "both") : Node<any>[] => {
    // Find the sheet containing this node
    const sheet = graph.sheets[node.sheet];
    if (!sheet) return [];

    const connectedNodes: Node<any>[] = [];
    const connectedNodeIds = new Set<string>();

    // Get incoming edges (where this node is the target)
    if (type === "in" || type === "both") {
        const incomingEdges = sheet.edgeMap.get(`target-${node._key}`) || [];
        for (const edge of incomingEdges) {
            if (edge.source && !connectedNodeIds.has(edge.source)) {
                const sourceNode = sheet.nodeMap.get(edge.source);
                if (sourceNode) {
                    connectedNodes.push(sourceNode);
                    connectedNodeIds.add(edge.source);
                }
            }
        }
    }

    // Get outgoing edges (where this node is the source)
    if (type === "out" || type === "both") {
        const outgoingEdges = sheet.edgeMap.get(`source-${node._key}`) || [];
        for (const edge of outgoingEdges) {
            if (edge.target && !connectedNodeIds.has(edge.target)) {
                const targetNode = sheet.nodeMap.get(edge.target);
                if (targetNode) {
                    connectedNodes.push(targetNode);
                    connectedNodeIds.add(edge.target);
                }
            }
        }
    }

    return connectedNodes;
}

export const findEdgeByKey = (map: Map<string, Edge[]>, key: string): Edge | undefined => {
    for (const edges of map.values()) {
        const edge = edges.find(e => e._key === key);
        if (edge) return edge; // Stop as soon as we find it
    }
    return undefined; // Not found
};

export const createNodeFromConfig = <T = any>(config:NodeTypeConfig, nodeKey:string, graphKey: string, sheetId: string):Node<T> => {
    const node: Node<T> = {
        _key: nodeKey,
        graphKey: graphKey,
        sheet: sheetId,
        typeVersion: config.version,
        posX: config.node.posX,
        posY: config.node.posY,
        size: config.node.size,
        type: config._key,
        data: config.node.data,
        handles: config.node.handles,
        process: config.node.process,
    }
    return deepCopy(node);
}

/**
 * Generate a human-readable description of modifications from GraphHistory array
 * Groups similar modifications together for concise output
 *
 * @param history - Array of GraphHistory entries to describe
 * @returns A descriptive string of all modifications in English
 *
 * @example
 * const description = generateHistoryDescription([
 *   { type: "nodeCreate", nodes: [...], userId: "user1" },
 *   { type: "nodeCreate", nodes: [...], userId: "user1" },
 *   { type: "edgeUpdate", instruction: [...], userId: "user2" }
 * ]);
 * // Returns: "Created 5 node(s). Updated 1 edge(s)."
 */
export const generateHistoryDescription = (history: GraphHistory[]): string => {
    if (!history || history.length === 0) {
        return "No modifications";
    }

    // Counters for each type of modification
    const stats = {
        nodeCreate: 0,
        nodeDelete: 0,
        nodeUpdate: 0,
        edgeCreate: 0,
        edgeDelete: 0,
        edgeUpdate: 0,
        sheetCreate: [] as string[],
        sheetRename: [] as Array<{ oldName: string, newName: string }>,
        sheetDelete: [] as string[]
    };

    // Aggregate modifications
    for (const entry of history) {
        switch (entry.type) {
            case "nodeCreate":
                stats.nodeCreate += entry.nodes.length;
                break;
            case "nodeDelete":
                stats.nodeDelete += entry.nodes.length;
                break;
            case "nodeUpdate":
                stats.nodeUpdate += entry.instruction.length;
                break;
            case "edgeCreate":
                stats.edgeCreate += entry.edges.length;
                break;
            case "edgeDelete":
                stats.edgeDelete += entry.edges.length;
                break;
            case "edgeUpdate":
                stats.edgeUpdate += entry.instruction.length;
                break;
            case "sheetCreate":
                stats.sheetCreate.push(entry.name);
                break;
            case "sheetRename":
                stats.sheetRename.push({ oldName: entry.oldName, newName: entry.newName });
                break;
            case "sheetDelete":
                stats.sheetDelete.push(entry.name);
                break;
        }
    }

    // Build description array
    const descriptions: string[] = [];

    // Node operations
    if (stats.nodeCreate > 0) {
        descriptions.push(`Created ${stats.nodeCreate} node${stats.nodeCreate > 1 ? 's' : ''}`);
    }
    if (stats.nodeUpdate > 0) {
        descriptions.push(`Updated ${stats.nodeUpdate} node${stats.nodeUpdate > 1 ? 's' : ''}`);
    }
    if (stats.nodeDelete > 0) {
        descriptions.push(`Deleted ${stats.nodeDelete} node${stats.nodeDelete > 1 ? 's' : ''}`);
    }

    // Edge operations
    if (stats.edgeCreate > 0) {
        descriptions.push(`Created ${stats.edgeCreate} edge${stats.edgeCreate > 1 ? 's' : ''}`);
    }
    if (stats.edgeUpdate > 0) {
        descriptions.push(`Updated ${stats.edgeUpdate} edge${stats.edgeUpdate > 1 ? 's' : ''}`);
    }
    if (stats.edgeDelete > 0) {
        descriptions.push(`Deleted ${stats.edgeDelete} edge${stats.edgeDelete > 1 ? 's' : ''}`);
    }

    // Sheet operations
    if (stats.sheetCreate.length > 0) {
        if (stats.sheetCreate.length === 1) {
            descriptions.push(`Created sheet "${stats.sheetCreate[0]}"`);
        } else {
            descriptions.push(`Created ${stats.sheetCreate.length} sheets: ${stats.sheetCreate.map(n => `"${n}"`).join(', ')}`);
        }
    }
    if (stats.sheetRename.length > 0) {
        for (const rename of stats.sheetRename) {
            descriptions.push(`Renamed sheet "${rename.oldName}" to "${rename.newName}"`);
        }
    }
    if (stats.sheetDelete.length > 0) {
        if (stats.sheetDelete.length === 1) {
            descriptions.push(`Deleted sheet "${stats.sheetDelete[0]}"`);
        } else {
            descriptions.push(`Deleted ${stats.sheetDelete.length} sheets: ${stats.sheetDelete.map(n => `"${n}"`).join(', ')}`);
        }
    }

    // Join all descriptions with proper punctuation
    if (descriptions.length === 0) {
        return "No significant modifications";
    }

    return descriptions.join('. ') + '.';
}