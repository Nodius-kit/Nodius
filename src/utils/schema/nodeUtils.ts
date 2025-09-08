import {Edge} from "./schemaType";

export const flatEdgeMap = (edges:Map<string, Edge[]>):Edge[] => Array.from(edges.entries())
    .filter(([key, value]) => key.startsWith('target')).map(([key, value]) => value).flat();