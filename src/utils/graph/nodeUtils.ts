import {Edge, Graph, Node, NodeType} from "./graphType";

export const flatEdgeMap = (edges:Map<string, Edge[]>):Edge[] => Array.from(edges.entries())
    .filter(([key, value]) => key.startsWith('target')).map(([key, value]) => value).flat();


/**
 * Converts a `Map` to a plain object (dictionary).
 *
 * @param map - The `Map` to be converted to a plain object (dictionary).
 *              It is of type `any`, meaning it can accept any input, but it expects a `Map`.
 * @returns A plain object (dictionary) created from the key-value pairs in the `Map`.
 *          The resulting object will have keys and values corresponding to those in the `Map`.
 */
export const mapToDict = (map: any):any => Object.fromEntries(map);

/**
 * Converts a plain object (dictionary) back into a `Map`.
 *
 * @param dic - The dictionary (plain object) to be converted into a `Map`.
 *              It is of type `any`, meaning it can accept any input, but it expects a plain object.
 * @returns A `Map` created from the key-value pairs in the dictionary.
 *          The resulting `Map` will have the same keys and values as the original plain object.
 */
export const dictToMap = (dic: any):any => new Map(Object.entries(dic));

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

export const findFirstNodeByType = (graph:Graph, type:NodeType):Node<any>|undefined => {
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