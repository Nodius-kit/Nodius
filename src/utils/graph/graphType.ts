/**
 * @file graphType.ts
 * @description Core type definitions for graph data structures (nodes, edges, graphs)
 * @module graph
 *
 * Comprehensive type system for workflow graph representation:
 * - Node: Graph node with position, size, handles, and typed data
 * - Edge: Connections between nodes with source/target handles
 * - Graph: Complete graph with sheets, nodes, and edges
 * - NodeTypeConfig: Configuration for custom node types
 * - Handle system: Directional connection points (T, D, R, L, 0)
 *
 * Key features:
 * - Multi-sheet graph support
 * - Dynamic node sizing
 * - Handle positioning (separate or fixed)
 * - Type-safe node data with generics
 * - ArangoDB integration (cleanNode, cleanEdge functions)
 * - Node type configuration with HTML content and borders
 * - Category-based organization
 */

import {pickKeys} from "../objectUtils";
import {HTMLDomEvent, HtmlObject} from "../html/htmlType";
import {MotorEventMap} from "../../client/schema/motor/graphicalMotor";

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
    process:string,
    handles: Partial<Record<handleSide, {
        position: "separate" | "fix",
        point: Array<{
            id: string,
            offset?: number,
            display?: string,
            type: "in" | "out",
            accept: string,
            linkedHtmlId?: string,
        }>
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
        "style",
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


export type MotorDomEventMap = "nodeEnter" | "nodeUpdate"


export interface NodeTypeConfig {
    _key: string,
    workspace:string,
    displayName: string,
    description: string,
    content: HtmlObject,
    category: string,
    alwaysRendered: boolean,
    node: Omit<Node<any>, "graphKey" | "sheet" | "_key" | "posX" | "posY">,
    domEvents: Array<HTMLDomEvent<keyof HTMLElementEventMap | MotorDomEventMap>>,
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
    },
    lastUpdatedTime: number,
    createdTime: number,
}

export const NodeTypeHtmlConfig:NodeTypeConfig = {
    _key: "html",
    workspace: "root",
    category: "",
    content: {
        type: "html",
        content: "",
        name: "Container",
        delimiter: true,
        tag: "div",
        domEvents: [],
        workflowEvents: [],
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
    description: "",
    alwaysRendered: true,
    node: {
        type: "html",
        process: "",
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
                const htmlRenderer = getHtmlRenderer(node)[render_id];
                
                gpuMotor.smoothFitToNode(node._key, {
                    padding: 100
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

                const pathOfRender = ["data"]; // path inside the node where is stored the html
                const renderContainer = container.querySelector("[mainRender]"); // where render the html in the DOM, mainRender is set as custom attribute
                const htmlRenderer = await initiateNewHtmlRenderer(node, render_id, renderContainer, pathOfRender);

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
    displayName: "Entry Data Type",
    description: "",
    alwaysRendered: true,
    category: "",
    content: {
        type: "block",
        name: "Container",
        delimiter: true,
        domEvents: [],
        workflowEvents: [],
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
        {
            name: "dblclick",
            call: `
            `,
            description: ""
        },
        {
            name: "nodeEnter",
            call: `

                const renderContainer = container.querySelector("[dataTypeRender]");
                if(renderContainer.children.length == 0){
                    //first render
                    //render logic is on the nodeUpdate, we can manually trigger it:
                    triggerEventOnNode(node._key, "nodeUpdate");
                }
            `
        },
        {
            name: "nodeUpdate",
            call: `
                // Select the container element where the JSON viewer will be rendered
                const renderContainer = container.querySelector("[dataTypeRender]");
                
                // Clear any previous content in the render container
                renderContainer.innerHTML = "";
                
                // Check if the necessary data is available before rendering
                console.log(node.data.fixedValue);
                if (node.data.fixedValue !== undefined) {
                  const fixedValue = node.data.fixedValue;
                
                  // Add global styles for the JSON viewer if they haven't been added yet
                  const styleId = 'json-viewer-style';
                  if (!document.getElementById(styleId)) {
                    const style = document.createElement('style');
                    style.id = styleId;
                    style.textContent = \`
                      .json-viewer {
                        background-color: var(--nodius-background-paper);
                        padding: 10px;
                        border-radius: 8px;
                        box-shadow: var(--nodius-shadow-1);
                        color: var(--nodius-text-primary);
                        font-family: monospace;
                        font-size: 14px;
                        overflow: auto;
                      }
                      .json-key {
                        color: var(--nodius-primary-main);
                        font-weight: bold;
                      }
                      .json-string {
                        color: var(--nodius-success-main);
                      }
                      .json-number {
                        color: var(--nodius-info-main);
                      }
                      .json-boolean {
                        color: var(--nodius-warning-main);
                      }
                      .json-null {
                        color: var(--nodius-text-disabled);
                      }
                      .json-object, .json-array {
                        padding-left: 20px;
                      }
                      summary {
                        cursor: pointer;
                        font-weight: bold;
                        color: var(--nodius-text-primary);
                        background-color: var(--nodius-background-default);
                        padding: 5px;
                        border-radius: 4px;
                        margin-bottom: 5px;
                        transition: var(--nodius-transition-default);
                      }
                      summary:hover {
                        background-color: var(--nodius-primary-paper);
                      }
                      .json-key-value, .json-array-item {
                        display: flex;
                        align-items: baseline;
                        margin-bottom: 5px;
                      }
                      .json-value {
                        flex: 1;
                      }
                    \`;
                    document.head.appendChild(style);
                  }
                
                  // Apply the viewer class to the render container for overall styling
                  renderContainer.classList.add('json-viewer');
                
                  // Start rendering the fixedValue recursively
                  renderValue(fixedValue, renderContainer, true);
                }
                
                // Recursive function to render any value (primitive, object, array) into a parent element
                function renderValue(value, parent, isRoot = false) {
                  // Handle null values
                  if (value === null) {
                    const span = document.createElement('span');
                    span.className = 'json-null';
                    span.textContent = 'null';
                    parent.appendChild(span);
                    return;
                  }
                
                  // Determine the type of the value
                  const type = typeof value;
                
                  // Handle primitive types: string, number, boolean
                  if (type === 'string' || type === 'number' || type === 'boolean') {
                    const span = document.createElement('span');
                    span.className = "json-"+type;
                    span.textContent = type === 'string' ? '"'+value+'"' : value.toString();
                    parent.appendChild(span);
                    return;
                  }
                
                  // Handle objects and arrays recursively with collapsible sections
                  const isArray = Array.isArray(value);
                  const details = document.createElement('details');
                  details.open = isRoot; // Expand the root level by default for better user experience
                  const summary = document.createElement('summary');
                  summary.textContent = isArray ? "Array ["+value.length+"]" : "Object {"+Object.keys(value).length+"}";
                  details.appendChild(summary);
                
                  const containerDiv = document.createElement('div');
                  containerDiv.className = isArray ? 'json-array' : 'json-object';
                
                  if (isArray) {
                    // Render array items with indices
                    value.forEach((item, index) => {
                      const div = document.createElement('div');
                      div.className = 'json-array-item';
                      const indexSpan = document.createElement('span');
                      indexSpan.className = 'json-key';
                      indexSpan.textContent = index+": ";
                      div.appendChild(indexSpan);
                      const valDiv = document.createElement('div');
                      valDiv.className = 'json-value';
                      renderValue(item, valDiv);
                      div.appendChild(valDiv);
                      containerDiv.appendChild(div);
                    });
                  } else {
                    // Render object key-value pairs
                    Object.entries(value).forEach(([key, val]) => {
                      const div = document.createElement('div');
                      div.className = 'json-key-value';
                      const keySpan = document.createElement('span');
                      keySpan.className = 'json-key';
                      keySpan.textContent = key+": ";
                      div.appendChild(keySpan);
                      const valDiv = document.createElement('div');
                      valDiv.className = 'json-value';
                      renderValue(val, valDiv);
                      div.appendChild(valDiv);
                      containerDiv.appendChild(div);
                    });
                  }
                
                  details.appendChild(containerDiv);
                  parent.appendChild(details);
                }
                
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
    },
    lastUpdatedTime: Date.now(),
    createdTime: Date.now(),
}