import {pickKeys} from "../objectUtils";
import {HTMLDomEvent, HtmlObject} from "../html/htmlType";

export type NodeType = "html" | string;
export type handleSide = "T" | "D" | "R" | "L" | "0"

export interface Edge {

    _key: string,

    graphKey: string,
    sheet:string,

    source?: string;
    sourceHandle?: string;

    target?: string;
    targetHandle?: string;

    style: "curved" | "straight",
    label?:string,
}

export interface Node<T> {
    _key: string,
    graphKey: string,
    type: NodeType,
    sheet:string,
    size: {
        width: number,
        height: number,
        dynamic?: boolean,
    },
    posX: number,
    posY: number,
    handles: Partial<Record<handleSide, {
        position: "separate" | "fix",
        point: Array<{
            id: string,
            offset?:number,
            display?: string,
            type: "in" | "out",
            accept: string,
        }>
    }>>,
    data?: T
}

// Clean an Edge object
export function cleanEdge(obj: any): Edge {
    return pickKeys<Edge>(obj, [
        "graphKey",
        "sheet",
        "source",
        "sourceHandle",
        "target",
        "targetHandle",
        "style",
        "label",
    ]);
}

// Clean a Node object
export function cleanNode<T>(obj: any): Node<T> {
    return pickKeys<Node<T>>(obj, [
        "_key",
        "graphKey",
        "type",
        "sheet",
        "size",
        "posX",
        "posY",
        "handles",
        "data",
    ]);
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

    sheetsList: Record<string, string>,

    _sheets: Record<string, { // used for transfert
        nodes: Array<Node<any>>,
        edges: Array<Edge>,
    }>,
    sheets:Record<string, {
        nodeMap: Map<string, Node<any>>,
        edgeMap: Map<string, Edge[]>
    }>,
    createdTime: number,
    lastUpdatedTime: number,
}



export interface NodeTypeConfig {
    _key: string,
    displayName: string,
    content: HtmlObject,
    content_key: string,
    alwaysRendered: boolean,
    domEvents?: Array<HTMLDomEvent<keyof HTMLElementEventMap>>,
    border: {
        radius: number,
        width: number,
        type: string
        normal: {
            color: string,
        },
        hover: {
            color: string,
        }
    }
}

export const NodeTypeHtmlConfig:Omit<NodeTypeConfig, "content"> = {
    _key: "0",
    content_key: "",
    displayName: "Html Editor",
    alwaysRendered: true,
    domEvents: [
        {
            name: "dblclick",
            call: `
            
                const render_id = node._key;
                const htmlRender = getHtmlRenderer(render_id);
                
                gpuMotor.smoothFitToNode(node._key, {
                    padding: 400
                });
                
                const pathToEdit = ["data"]; // path inside the node where is stored the html
                
                openHtmlEditor(node, htmlRender, pathToEdit, () => {
                    // on close
                    container.style.cursor = "cursor";
                    htmlRender.setBuildingMode(false);
                });
                container.style.cursor = "initial";
                
                htmlRender.setBuildingMode(true);
                
            `,
            description: "Open HTML Editor for the current node"
        },
        {
            name: "nodeEnter" as any,
            call: `
                const render_id = node._key;
                const htmlRender = await initiateNewHtmlRenderer(render_id, container);
                htmlRender.render(node.data);
            `
        }
    ],
    border: {
        radius:10,
        width:1,
        type: "solid",
        normal: {
            color: "var(--nodius-primary-dark)",
        },
        hover: {
            color: "var(--nodius-primary-light)",
        }
    }
}