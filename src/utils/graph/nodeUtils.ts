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
            if (node.type === type) return node;
        }
    }
    return undefined;
}

export const findEdgeByKey = (map: Map<string, Edge[]>, key: string): Edge | undefined => {
    for (const edges of map.values()) {
        const edge = edges.find(e => e._key === key);
        if (edge) return edge; // Stop as soon as we find it
    }
    return undefined; // Not found
};