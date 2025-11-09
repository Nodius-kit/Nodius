import {pickKeys} from "../objectUtils";
import {HTMLDomEvent, HtmlObject, HTMLWorkflowEvent} from "../html/htmlType";

export type NodeType = "html" | "entryType" | string;
export type handleSide = "T" /*top*/ | "D"/*down*/ | "R"/*right*/ | "L"/*left*/ | "0"/*middle, uneditable*/

export interface NodeTypeEntryType {
    _key:string,
    fixedValue?:Record<string, any>
}

export interface Edge {

    _key: string,

    graphKey: string,
    sheet:string,

    source: string;
    sourceHandle: string;

    target: string;
    targetHandle: string;

    label?:string,
}


export interface NodePoint {
    id: string,
    offset?: number,
    display?: string,
    type: "in" | "out",
    accept: string,
    linkedHtmlId?: string,
}
export interface Node<T> {
    _key: string,
    graphKey: string,

    type: NodeType,
    typeVersion: number,

    sheet:string,
    size: {
        width: number,
        height: number,
        dynamic?: boolean,
    },
    posX: number,
    posY: number,
    process:string,
    handles: Partial<Record<handleSide, {
        position: "separate" | "fix",
        point: Array<NodePoint>
    }>>,
    data?: T
}

// Clean an Edge object and translate ArangoDB format (_from/_to) to application format (source/target)
export function cleanEdge(obj: any): Edge {
    const cleaned = pickKeys<Edge>(obj, [
        "_key",
        "graphKey",
        "sheet",
        "source",
        "sourceHandle",
        "target",
        "targetHandle",
        "label",
    ]);

    // If _from and _to exist (from ArangoDB), extract source and target from them
    if (obj._from && !cleaned.source) {
        // _from format: "nodius_nodes/nodeKey" -> extract "nodeKey"
        cleaned.source = obj._from.split('/')[1];
    }
    if (obj._to && !cleaned.target) {
        // _to format: "nodius_nodes/nodeKey" -> extract "nodeKey"
        cleaned.target = obj._to.split('/')[1];
    }

    return cleaned;
}

// Clean a Node object
export function cleanNode<T>(obj: any): Node<T> {
    return pickKeys<Node<T>>(obj, [
        "_key",
        "graphKey",
        "process",
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


export interface NodeTypeConfigBorder {
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
export interface NodeTypeConfig {
    _key: string,
    workspace:string,
    version:number,
    displayName: string,
    description: string,
    content: HtmlObject,
    category: string,
    alwaysRendered: boolean,
    node: Omit<Node<any>, "graphKey" | "sheet" | "_key" | "typeVersion">,
    domEvents: Array<HTMLDomEvent<keyof HTMLElementEventMap | (typeof HTMLWorkflowEvent[number])>>,
    border: NodeTypeConfigBorder,
    lastUpdatedTime: number,
    createdTime: number,
}

export const NodeTypeHtmlConfig:NodeTypeConfig = {
    _key: "html",
    version: 1,
    workspace: "root",
    category: "",
    content: {
        type: "list",
        tag: "div",
        name: "container",
        css: [
            {
                selector: "&",
                rules: [
                    ["height", "100%"],
                    ["width", "100%"]
                ]
            }
        ],
        domEvents: [],
        attribute: {},
        identifier: "overlayRoot",
        content: [
            {
                type: "html",
                content: "",
                name: "html render",
                tag: "div",
                domEvents: [],
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
            }
        ]
    },
    displayName: "Html Editor",
    description: "",
    alwaysRendered: true,
    node: {
        type: "html",
        posY: 0,
        posX: 0,
        process: `
            let htmlObject = node;
            const pathOfRender = ["data"];
            
            for(const path of pathOfRender) {
                htmlObject = htmlObject[path];
            }
            
            initHtml(htmlObject);
        `,
        handles: {
            0: {
                position: "fix",
                point: [
                    {
                        id: "0",
                        type: "out",
                        accept: "event[]"
                    },
                    {
                        id: "1",
                        type: "in",
                        accept: "entryType"
                    }
                ]
            }
        },
        size: {
            width: 640,
            height: 360,
            dynamic: true,
        },
        data: undefined
    },
    domEvents: [
        {
            name: "dblclick",
            call: `
            
                const render_id = "main";
                const htmlRenderer = getHtmlRenderer(node)?.[render_id];
                if(!htmlRenderer) return; 
                
                gpuMotor.smoothFitToNode(node._key, {
                    padding: 500
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
                if(getHtmlRenderer(node)?.[render_id]) return; // avoid dupling

                storage.workflowMode ??= false; // default init workflow mode as false, so the graph will not be interpreted

                const pathOfRender = ["data"]; // path inside the node where is stored the html
                const renderContainer = container.querySelector("[mainRender]"); // where render the html in the DOM, mainRender is set as custom attribute
                const htmlRenderer = await initiateNewHtmlRenderer(node, render_id, renderContainer, pathOfRender, {
                    workflowMode: storage.workflowMode
                });

                // To remove a renderer when done (e.g., on nodeLeave or cleanup):
                // removeHtmlRenderer(node._key, render_id);
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
    },
    lastUpdatedTime: Date.now(),
    createdTime: Date.now(),
}


export const NodeTypeEntryTypeConfig:NodeTypeConfig = {
    _key: "entryType",
    workspace: "root",
    version: 1,
    displayName: "Entry Data Type",
    description: "",
    alwaysRendered: true,
    category: "",
    content: {
        type: "block",
        name: "Container",
        domEvents: [],
        tag: "div",
        attribute: {
            dataTypeRender: "",
        },
        css: [
            {
                selector: "&",
                rules: [
                    ["height", "100%"],
                    ["width", "100%"],
                    ["display", "flex"],
                    ["flex-direction", "column"],
                    ["padding", "16px"],
                    ["overflow-y", "auto"],
                    ["background-color", "var(--nodius-background-paper)"]
                ]
            }
        ],
        identifier: "root"
    },

    node: {
        type: "entryType",
        process: "",
        posX: 0,
        posY: 0,
        handles: {
            0: {
                position: "fix",
                point: [
                    {
                        id: "0",
                        type: "out",
                        accept: "entryType"
                    }
                ]
            }
        },
        size: {
            width: 300,
            height: 500,
            dynamic: true,
        },
        data: {
            _key: undefined
        }
    },
    domEvents: [

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
    },
    lastUpdatedTime: Date.now(),
    createdTime: Date.now(),
}