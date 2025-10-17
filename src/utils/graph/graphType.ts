import {pickKeys} from "../objectUtils";
import {HTMLDomEvent, HtmlObject} from "../html/htmlType";
import {MotorEventMap} from "../../client/schema/motor/graphicalMotor";

export type NodeType = "html" | "entryType" | string;
export type handleSide = "T" | "D" | "R" | "L" | "0"

export interface NodeTypeEntryType {
    _key:string
}

export interface Edge {

    _key: string,

    undeletable?: boolean,

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


export type MotorDomEventMap = "nodeEnter" | "nodeUpdate"


export interface NodeTypeConfig {
    _key: string,
    displayName: string,
    content: HtmlObject,
    content_key: string,
    alwaysRendered: boolean,
    domEvents?: Array<HTMLDomEvent<keyof HTMLElementEventMap | MotorDomEventMap>>,
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
            
                const render_id = "main";
                const htmlRenderer = getHtmlRenderer(node)[render_id];
                
                gpuMotor.smoothFitToNode(node._key, {
                    padding: 400
                });
                
                
                openHtmlEditor(node._key, htmlRenderer, () => {
                    // on close
                    container.style.cursor = "cursor";
                    htmlRenderer.htmlMotor.setBuildingMode(false);
                });
                container.style.cursor = "initial";
                
                htmlRenderer.htmlMotor.setBuildingMode(true);
                
            `,
            description: "Open HTML Editor for the current node"
        },
        {
            name: "nodeEnter",
            call: `
                
                // because this node is "alwaysRendered", this event will be trigger and the htmlRenderer is still initialized, avoid dupling:
                if(getHtmlRenderer(node)) return;
            
                const render_id = "main"; // unique render id in the node
                const pathOfRender = ["data"]; // path inside the node where is stored the html
                const renderContainer = container; // where render the html in the DOM 
                const htmlRenderer = await initiateNewHtmlRenderer(node, render_id, renderContainer, pathOfRender);
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