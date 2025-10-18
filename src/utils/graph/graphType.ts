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

    source: string;
    sourceHandle: string;

    target: string;
    targetHandle: string;

    style?: "curved" | "straight",
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
    content_html_graph_key: string,
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

export const NodeTypeHtmlConfig:NodeTypeConfig = {
    _key: "0",
    content_html_graph_key: "",
    content: {
        type: "block",
        name: "Container",
        delimiter: true,
        tag: "div",
        attribute: {
            mainRender: "",
        },
        css: [
            {
                selector: "&",
                rules: [
                    ["height", "100%"],
                    ["width", "100%"]
                ]
            }
        ],
        identifier: "root"
    },
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
                const render_id = "main"; // unique render id in the node
                if(getHtmlRenderer(node)?.[render_id]) return;
            
                const pathOfRender = ["data"]; // path inside the node where is stored the html
                const renderContainer = container.querySelector("[mainRender]"); // where render the html in the DOM, mainRender is set as custom attribute
                const htmlRenderer = await initiateNewHtmlRenderer(node, render_id, renderContainer, pathOfRender);
            `
        }

    ],
    border: {
        radius:0,
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


export const NodeTypeEntryTypeConfig:NodeTypeConfig = {
    _key: "1",
    displayName: "Entry Data Type",
    alwaysRendered: true,
    content_html_graph_key: "",
    content: {
        type: "block",
        name: "Container",
        delimiter: true,
        tag: "div",
        css: [
            {
                selector: "&",
                rules: [
                    ["height", "100%"],
                    ["width", "100%"]
                ]
            }
        ],
        identifier: "root",
        content: {
            type: "text",
            tag: "p",
            name: "Text",
            delimiter: true,
            identifier:"0",
            css: [],
            domEvents: [
                {
                    name: "load",
                    call: `
                    console.log(globalStorage);
                    `
                }
            ],
            content: {
                "fr": "dataType selected: {{JSON.stringify(globalStorage.globalCurrentEntryDataType)}}",
                "en": "HTML: {{JSON.stringify(globalStorage.globalCurrentEntryDataType)}}",
            },
        }
    },
    domEvents: [
        {
            name: "dblclick",
            call: `
            
            `,
            description: ""
        },
        {
            name: "nodeEnter",
            call: `
               
            `
        },

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