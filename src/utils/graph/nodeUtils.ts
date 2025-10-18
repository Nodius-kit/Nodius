import {Edge, Graph, Node, NodeType} from "./graphType";

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
            console.log(type, node.type);
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

export const findNodeConnected = (graph:Graph, node:Node<any>, type: "in" | "out" | "both" = "both") : Node<any>[] => {
    // return all node connected to "node", reading the handles in "nodes", filtering the connected point type by "type"

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