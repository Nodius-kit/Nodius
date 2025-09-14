
export type NodeType = "html" | string;
export type handleSide = "T" | "D" | "R" | "L" | "0"

export interface Edge {
    graphKey: string,

    source: string;
    sourceHandle: string;

    target: string;
    targetHandle: string;

    style: "curved" | "straight",
    label?:string,
}

export interface Node<T> {
    _key: string,
    type: NodeType,
    size: {
        width: number,
        height: number
    } | "auto",
    posX: number,
    posY: number,
    handles: Partial<Record<handleSide, {
        position: "separate" | "fix",
        point: Array<{
            id: string,
            offset?:number,
            display?: string,
        }>
    }>>,
    data?: T
}

export interface Graph {
    _key: string,

    name: string,
    version: number;
    description?:string,

    htmlKeyLinked?: string,

    // aditional info
    category:string,
    permission:number,

    // html unique info
    workspace:string, // user-id or workspace-id
    identifier?:string,

    _sheets: { // used for transfert
        nodes: Array<Node<any>>,
        edges: Array<Edge>,
    },
    sheets:{
        nodeMap: Map<string, Node<any>>,
        edgeMap: Map<string, Edge[]>
    }
}

export interface NodeTypeHtml {
    identifier: string
}