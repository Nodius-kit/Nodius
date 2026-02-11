import {pickKeys} from "../objectUtils";
import {HTMLDomEvent, HtmlObject, HTMLWorkflowEvent} from "../html/htmlType";
import {Instruction} from "../sync/InstructionBuilder";

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

export interface graphMetaData {
    invisible:boolean;
    noMultipleSheet:boolean;
    limitWorkingArea: {
        width: number;
        height: number;
    }
}

export interface Graph {
    _key: string,

    name: string,
    version: number;
    description?:string,

    htmlKeyLinked?:string,
    nodeKeyLinked?:string,

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

    metadata?: Partial<graphMetaData>
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
    border: NodeTypeConfigBorder,
    lastUpdatedTime: number,
    createdTime: number,
    icon?: string,
}

export interface GraphHistoryBase {
    _key: string,
    timestamp: number,
    graphKey: string,
    history: GraphHistory[],
    type: "WF" | "node"
}

export interface GraphHistoryNodeCreate {
    type: "nodeCreate",
    nodes: Node<any>[]
}

export interface GraphHistoryNodeDelete {
    type: "nodeDelete",
    nodes: Node<any>[]
}

export interface GraphHistoryNodeUpdate {
    type: "nodeUpdate",
    instruction: Instruction[],
    reversedInstruction: Instruction[],
}

export interface GraphHistoryEdgeDelete {
    type: "edgeDelete",
    edges: Edge[]
}

export interface GraphHistoryEdgeCreate {
    type: "edgeCreate",
    edges: Edge[]
}

export interface GraphHistoryEdgeUpdate {
    type: "edgeUpdate",
    instruction: Instruction[],
    reversedInstruction: Instruction[],
}

export interface GraphHistorySheetRename {
    type: "sheetRename",
    oldName: string,
    newName: string,
}

export interface GraphHistorySheetDelete {
    type: "sheetDelete",
    name: string,
    deleteSheet: {
        nodeMap: Map<string, Node<any>>,
        edgeMap: Map<string, Edge[]>
    }
}

export interface GraphHistorySheetCreate {
    type: "sheetCreate",
    name: string
}

export type GraphHistory =
    (GraphHistoryNodeCreate | GraphHistoryNodeDelete | GraphHistoryNodeUpdate | GraphHistoryEdgeDelete | GraphHistoryEdgeCreate | GraphHistoryEdgeUpdate | GraphHistorySheetRename | GraphHistorySheetDelete | GraphHistorySheetCreate) & {
        userId: string
    }


export const NodeTypeReturnConfig:NodeTypeConfig = {
    _key: "return",
    version: 1,
    workspace: "root",
    category: "default",
    content: {
        type: "list",
        identifier: "roou",
        domEvents: [],
        tag: "div",
        name: "Column",
        css: [
            {
                selector: "&",
                rules: [
                    ["display","flex"],
                    ["flex-direction","column"],
                    ["padding","5px"],
                    ["gap","0px"],
                    ["min-height","50px"],
                    ["height","100%"],
                    ["justify-content","center"],
                    ["align-items","center"]
                ]
            }
        ],
        content: [
            {
                type: "icon",
                identifier: "roov",
                tag: "span",
                domEvents: [],
                name: "Icon",
                css: [
                    {
                        selector: "&amp;",
                        rules: [
                            ["width","40px"],
                            ["height","40px"],
                            ["stroke-width","1.5px"],
                            ["color","var(--nodius-primary-main)"]
                        ]
                    }
                ],
                content: "Forward"
            }
        ]
    },
    displayName: "Return",
    description: "",
    alwaysRendered: true,
    node: {
        type: "return",
        posY: 0,
        posX: 0,
        process: ``,
        handles: {
            "L": {
                position: "separate",
                point: [
                    {
                        id: "0",
                        type: "in",
                        accept: "any"
                    }
                ]
            }
        },
        size: {
            width: 150,
            height: 150,
            dynamic: true,
        },
        data: undefined
    },

    border: {
        radius:15,
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

export const NodeTypeStarterConfig:NodeTypeConfig = {
    _key: "starter",
    version: 1,
    workspace: "root",
    category: "",
    content: {
        type: "list",
        identifier: "roou",
        domEvents: [],
        tag: "div",
        name: "Column",
        css: [
            {
                selector: "&",
                rules: [
                    ["display","flex"],
                    ["flex-direction","column"],
                    ["padding","5px"],
                    ["gap","0px"],
                    ["min-height","50px"],
                    ["height","100%"],
                    ["justify-content","center"],
                    ["align-items","center"]
                ]
            }
        ],
        content: [
            {
                type: "icon",
                identifier: "roov",
                tag: "span",
                domEvents: [],
                name: "Icon",
                css: [
                    {
                        selector: "&amp;",
                        rules: [
                            ["width","40px"],
                            ["height","40px"],
                            ["stroke-width","1.5px"],
                            ["color","var(--nodius-primary-main)"]
                        ]
                    }
                ],
                content: "Play"
            }
        ]
    },
    displayName: "Starter",
    description: "",
    alwaysRendered: true,
    node: {
        type: "starter",
        posY: 0,
        posX: 0,
        process: ``,
        handles: {
            0: {
                position: "fix",
                point: [
                    {
                        id: "1",
                        type: "in",
                        accept: "entryType"
                    }
                ]
            },
            "R": {
                position: "separate",
                point: [
                    {
                        id: "0",
                        type: "out",
                        accept: "any"
                    }
                ]
            }
        },
        size: {
            width: 150,
            height: 150,
            dynamic: true,
        },
        data: undefined
    },

    border: {
        radius:15,
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
                domEvents: [
                    {
                        name: "dblclick",
                        call: `
                            const render_id = "main";
                            const context = getHtmlRenderWithId(nodeId, render_id);
                            if(!context) return; 
                            
                            gpuMotor.smoothFitToNode(nodeId, {
                                padding: 500
                            });
                            openHtmlEditor(context, ["data"]);
                            
                        `,
                        description: "Open HTML Editor for the current node"
                    },
                    {
                        name: "nodeEnter",
                        call: `
                            // because this node is "alwaysRendered", this event will be trigger and the htmlRenderer is still initialized, avoid dupling:
                            const render_id = "main"; // unique render id in the node
                            if(getHtmlRenderWithId(nodeId, render_id)) return; // avoid dupling
         
                            const renderContainer = container.querySelector("[mainRender]"); // where render the html in the DOM, mainRender is set as custom attribute
                            
                            const htmlRender = new HtmlRender(renderContainer, {
                                language: "en",
                                buildingMode: false,
                                workflowMode: false,
                            });
                            
                            const context = initiateNewHtmlRender({
                                nodeId: nodeId, 
                                htmlRender: htmlRender,
                                renderId: render_id,
                                retrieveNode: () => getNode(nodeId),
                                retrieveHtmlObject: (node) => node.data
                            });
                            htmlRender.render(getNode(nodeId).data);
                        `
                    }
                ],
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
            
            initHtml(htmlObject, "main", "[mainRender]");
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
        type: "html",
        name: "Container",
        domEvents: [
            {
                name: "nodeEnter",
                call: `

                const renderContainer = container.querySelector("[dataTypeRender]");
                if(renderContainer.children.length == 0){
                    //first render
                    //render logic is on the nodeUpdate, we can manually trigger it:
                    element.dispatchEvent(new CustomEvent("nodeUpdate", {
                      bubbles: false
                    }))
                }
            `
            },
            {
                name: "nodeUpdate",
                call: `
                
                const node = getNode(nodeId);
                
                // Select the container element where the form will be rendered
                const renderContainer = container.querySelector("[dataTypeRender]");

                // Store current data type key to detect changes
                const currentDataTypeKey = renderContainer.getAttribute('data-current-type');
                const newDataTypeKey = currentEntryDataType?._key;

                // Only re-render if data type changed or container is empty
                if (currentDataTypeKey === newDataTypeKey && renderContainer.children.length > 0) {
                    // Just update values without full re-render
                    if (currentEntryDataType && node.data.fixedValue) {
                        currentEntryDataType.types.forEach((typeConfig) => {
                            const inputElement = renderContainer.querySelector('[data-field-name="' + typeConfig.name + '"]');
                            if (inputElement) {
                                const currentValue = node.data.fixedValue[typeConfig.name];
                                if (inputElement.type === 'checkbox') {
                                    inputElement.checked = currentValue === true || currentValue === 'true';
                                } else {
                                    inputElement.value = currentValue !== undefined && currentValue !== null ? String(currentValue) : '';
                                }
                            }
                        });
                    }
                    return;
                }

                // Full re-render needed
                renderContainer.innerHTML = "";
                renderContainer.setAttribute('data-current-type', newDataTypeKey || '');

                // Check if currentEntryDataType is available
                if (!currentEntryDataType) {
                    const noDataMessage = document.createElement('div');
                    noDataMessage.style.cssText = 'padding: 20px; text-align: center; color: var(--nodius-text-secondary);';
                    noDataMessage.textContent = 'No Entry Data Type selected';
                    renderContainer.appendChild(noDataMessage);
                    return;
                }


                // Initialize fixedValue if it doesn't exist
                if (!node.data.fixedValue) {
                    node.data.fixedValue = {};
                }

                // Add global styles for the form if they haven't been added yet
                const styleId = 'entry-type-form-style';
                if (!document.getElementById(styleId)) {
                    const style = document.createElement('style');
                    style.id = styleId;
                    style.textContent = \`
                        .entry-type-header {
                            font-size: 16px;
                            font-weight: bold;
                            color: var(--nodius-text-primary);
                            margin-bottom: 12px;
                            padding-bottom: 8px;
                            border-bottom: 2px solid var(--nodius-primary-main);
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                        }
                        .entry-import-btn {
                            padding: 6px 12px;
                            background: var(--nodius-success-main);
                            color: var(--nodius-success-contrastText);
                            border: none;
                            border-radius: 6px;
                            font-size: 12px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: var(--nodius-transition-default);
                            display: flex;
                            align-items: center;
                            gap: 6px;
                        }
                        .entry-import-btn:hover {
                            background: var(--nodius-success-dark);
                            transform: translateY(-1px);
                            box-shadow: var(--nodius-shadow-2);
                        }
                        .entry-import-btn:active {
                            transform: translateY(0);
                        }
                        .entry-field {
                            margin-bottom: 16px;
                        }
                        .entry-field-label {
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            margin-bottom: 6px;
                            font-size: 13px;
                            font-weight: 600;
                            color: var(--nodius-text-primary);
                        }
                        .entry-field-type {
                            font-size: 11px;
                            padding: 2px 6px;
                            background: var(--nodius-primary-main);
                            color: var(--nodius-primary-contrastText);
                            border-radius: 4px;
                            font-weight: normal;
                        }
                        .entry-field-required {
                            font-size: 11px;
                            color: var(--nodius-error-main);
                        }
                        .entry-field-input {
                            padding: 8px 12px;
                            background: var(--nodius-background-default);
                            color: var(--nodius-text-primary);
                            border: 1px solid var(--nodius-primary-dark);
                            border-radius: 6px;
                            font-size: 13px;
                            font-family: monospace;
                            transition: var(--nodius-transition-default);
                            box-sizing: border-box;
                        }
                        .entry-field-input:focus {
                            outline: none;
                            border-color: var(--nodius-primary-main);
                            box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2);
                        }
                        .entry-field-input::placeholder {
                            color: var(--nodius-text-disabled);
                            font-style: italic;
                        }
                        .entry-field-checkbox {
                            width: 18px;
                            height: 18px;
                            cursor: pointer;
                        }
                        .entry-field-meta {
                            display: flex;
                            gap: 4px;
                            margin-top: 4px;
                            font-size: 11px;
                            color: var(--nodius-text-secondary);
                        }
                        .entry-field-placeholder {
                            flex: 1;
                        }
                    \`;
                    document.head.appendChild(style);
                }

                // Create header with data type name and import button
                const headerContainer = document.createElement('div');
                headerContainer.className = 'entry-type-header';

                const headerTitle = document.createElement('span');
                headerTitle.textContent = currentEntryDataType.name;
                headerContainer.appendChild(headerTitle);

                // Create import button
                const importButton = document.createElement('button');
                importButton.className = 'entry-import-btn';
                importButton.innerHTML = '📁 Import JSON';
                headerContainer.appendChild(importButton);

                // Create hidden file input
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'application/json,.json';
                fileInput.style.display = 'none';

                // Handle file selection
                fileInput.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    try {
                        const text = await file.text();
                        const jsonData = JSON.parse(text);

                        // Get valid keys from currentEntryDataType
                        const validKeys = new Set(currentEntryDataType.types.map(t => t.name));
                        const jsonKeys = Object.keys(jsonData);
                        const extraKeys = jsonKeys.filter(key => !validKeys.has(key));

                        // Update fixedValue with only valid keys
                        const updatedValues = {};
                        let importedCount = 0;

                        currentEntryDataType.types.forEach((typeConfig) => {
                            if (jsonData.hasOwnProperty(typeConfig.name)) {
                                updatedValues[typeConfig.name] = jsonData[typeConfig.name];
                                importedCount++;
                            } else {
                                // Keep existing value if not in JSON
                                updatedValues[typeConfig.name] = node.data.fixedValue[typeConfig.name];
                            }
                        });

                        // Update node data
                        node.data.fixedValue = updatedValues;
                        await updateNode(node);

                        // Show success message
                        toast.success(\`Imported \${importedCount} field(s) from JSON\`, {
                            duration: 3000,
                            position: 'bottom-right',
                        });

                        // Show warning for extra keys
                        if (extraKeys.length > 0) {
                            toast(\`Extra keys ignored: \${extraKeys.join(', ')}\`, {
                                icon: '⚠️',
                                duration: 5000,
                                position: 'bottom-right',
                                style: {
                                    background: 'var(--nodius-warning-main)',
                                    color: 'var(--nodius-warning-contrastText)',
                                }
                            });
                        }

                        // Trigger re-render to show new values
                        triggerEventOnNode(node._key, 'nodeUpdate');

                    } catch (error) {
                        toast.error('Failed to parse JSON: ' + error.message, {
                            duration: 4000,
                            position: 'bottom-right',
                        });
                    }

                    // Reset file input
                    fileInput.value = '';
                });

                // Connect button to file input
                importButton.addEventListener('click', () => {
                    fileInput.click();
                });

                renderContainer.appendChild(headerContainer);
                renderContainer.appendChild(fileInput);

                // Helper function to render fields recursively
                const renderField = (typeConfig, parentPath = [], level = 0) => {
                    const fieldContainer = document.createElement('div');
                    fieldContainer.className = 'entry-field';
                    fieldContainer.style.marginLeft = (level * 20) + 'px';

                    // Create label with type and required indicator
                    const label = document.createElement('div');
                    label.className = 'entry-field-label';

                    const labelText = document.createElement('span');
                    labelText.textContent = typeConfig.name;
                    label.appendChild(labelText);

                    const typeTag = document.createElement('span');
                    typeTag.className = 'entry-field-type';
                    typeTag.textContent = typeConfig.typeId + (typeConfig.isArray ? '[]' : '');
                    label.appendChild(typeTag);

                    if (typeConfig.required) {
                        const requiredTag = document.createElement('span');
                        requiredTag.className = 'entry-field-required';
                        requiredTag.textContent = '*required';
                        label.appendChild(requiredTag);
                    }

                    fieldContainer.appendChild(label);

                    // Get current value from nested path
                    const getCurrentValue = () => {
                        let value = node.data.fixedValue;
                        for (const key of parentPath) {
                            value = value?.[key];
                        }
                        return value?.[typeConfig.name];
                    };

                    // Set value in nested path
                    const setCurrentValue = (newValue) => {
                        // Ensure nested structure exists
                        let current = node.data.fixedValue;
                        for (let i = 0; i < parentPath.length; i++) {
                            const key = parentPath[i];
                            if (!current[key] || typeof current[key] !== 'object') {
                                current[key] = {};
                            }
                            current = current[key];
                        }
                        current[typeConfig.name] = newValue;
                    };

                    // Handle dataType (complex nested type)
                    if (typeConfig.typeId === 'dataType') {
                        // Find the referenced data type
                        const referencedTypeKey = typeConfig.defaultValue;
                        const referencedType = dataTypes.find(dt => dt._key === referencedTypeKey);

                        if (referencedType) {
                            // Create unique storage key for this section
                            const storageKey = 'nodius-node-' + node._key + '-section-' + [...parentPath, typeConfig.name].join('.');

                            // Create collapsible section for nested type
                            const nestedContainer = document.createElement('details');

                            // Restore state from sessionStorage, or auto-expand first 2 levels
                            const savedState = globalStorage[storageKey];
                            if (savedState !== null) {
                                nestedContainer.open = savedState === 'true';
                            } else {
                                nestedContainer.open = level < 2;
                            }

                            nestedContainer.style.marginTop = '8px';
                            nestedContainer.style.marginBottom = '8px';

                            // Save state to sessionStorage when toggled
                            nestedContainer.addEventListener('toggle', () => {
                                globalStorage[storageKey] = nestedContainer.open.toString();
                            });

                            const summary = document.createElement('summary');
                            summary.style.cursor = 'pointer';
                            summary.style.fontWeight = '600';
                            summary.style.padding = '8px';
                            summary.style.backgroundColor = 'var(--nodius-background-default)';
                            summary.style.borderRadius = '6px';
                            summary.style.marginBottom = '8px';
                            summary.textContent = '📦 ' + referencedType.name;
                            nestedContainer.appendChild(summary);

                            // Ensure nested object exists
                            const currentValue = getCurrentValue();
                            if (!currentValue || typeof currentValue !== 'object') {
                                setCurrentValue({});
                            }

                            // Render nested fields
                            const nestedFieldsContainer = document.createElement('div');
                            nestedFieldsContainer.style.marginLeft = '12px';
                            nestedFieldsContainer.style.borderLeft = '2px solid var(--nodius-primary-main)';
                            nestedFieldsContainer.style.paddingLeft = '12px';

                            referencedType.types.forEach(nestedTypeConfig => {
                                const nestedField = renderField(nestedTypeConfig, [...parentPath, typeConfig.name], level + 1);
                                nestedFieldsContainer.appendChild(nestedField);
                            });

                            nestedContainer.appendChild(nestedFieldsContainer);
                            fieldContainer.appendChild(nestedContainer);
                        } else {
                            // Type not found
                            const errorMsg = document.createElement('div');
                            errorMsg.style.color = 'var(--nodius-error-main)';
                            errorMsg.style.fontSize = '12px';
                            errorMsg.style.marginTop = '4px';
                            errorMsg.textContent = 'Referenced type not found: ' + referencedTypeKey;
                            fieldContainer.appendChild(errorMsg);
                        }
                    } else {
                        // Regular input field
                        let inputElement;
                        const currentValue = getCurrentValue();

                        if (typeConfig.typeId === 'bool') {
                            inputElement = document.createElement('input');
                            inputElement.type = 'checkbox';
                            inputElement.className = 'entry-field-checkbox';
                            inputElement.checked = currentValue === true || currentValue === 'true';
                        } else {
                            inputElement = document.createElement('input');
                            inputElement.type = 'text';
                            inputElement.className = 'entry-field-input';
                            inputElement.value = currentValue !== undefined && currentValue !== null ? String(currentValue) : '';
                            inputElement.placeholder = typeConfig.defaultValue || 'Enter ' + typeConfig.name;
                        }

                        // Add data attribute for field name (for updates)
                        inputElement.setAttribute('data-field-name', [...parentPath, typeConfig.name].join('.'));

                        // Add change handler to update fixedValue
                        const updateValue = async () => {
                            const newValue = inputElement.type === 'checkbox' ? inputElement.checked : inputElement.value;
                            setCurrentValue(newValue);
                            await updateNode(node);
                        };

                        if (inputElement.type === 'checkbox') {
                            inputElement.addEventListener('change', updateValue);
                        } else {
                            inputElement.addEventListener('blur', updateValue);
                            inputElement.addEventListener('keydown', (e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    updateValue();
                                }
                            });
                        }

                        fieldContainer.appendChild(inputElement);

                        // Show placeholder/default value info
                        if (typeConfig.defaultValue && typeConfig.typeId !== 'bool' && typeConfig.typeId !== 'dataType') {
                            const meta = document.createElement('div');
                            meta.className = 'entry-field-meta';

                            const placeholderInfo = document.createElement('span');
                            placeholderInfo.className = 'entry-field-placeholder';
                            placeholderInfo.textContent = 'Default: ' + typeConfig.defaultValue;
                            meta.appendChild(placeholderInfo);

                            fieldContainer.appendChild(meta);
                        }
                    }

                    return fieldContainer;
                };

                // Render each field from currentEntryDataType
                currentEntryDataType.types.forEach((typeConfig) => {
                    const field = renderField(typeConfig);
                    renderContainer.appendChild(field);
                });

            `
            }
        ],
        tag: "div",
        attribute: {
            dataTypeRender: "",
        },
        content: "",
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