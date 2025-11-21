import {memo, useCallback, useContext, useEffect, useRef, useState} from "react";
import {EditedNodeHandle, htmlRenderContext, ProjectContext} from "../hooks/contexts/ProjectContext";
import {useStableProjectRef} from "../hooks/useStableProjectRef";
import {Edge, Node, NodeTypeEntryType} from "../../utils/graph/graphType";
import {MotorScene} from "./motor/graphicalMotor";
import {edgeArrayToMap, findFirstNodeWithId, findNodeConnected, nodeArrayToMap} from "../../utils/graph/nodeUtils";
import {useDynamicClass} from "../hooks/useDynamicClass";
import {deepCopy, forwardMouseEvents} from "../../utils/objectUtils";
import { useNodeDragDrop } from "./hook/useNodeDragDrop";
import {NodeAnimationManager} from "./manager/nodeAnimation";
import {useNodeResize} from "./hook/useNodeResize";
import {useNodeSelector} from "./hook/useNodeSelector";
import {HtmlRender} from "../../process/html/HtmlRender";
import {generateUniqueHandlePointId, useHandleRenderer} from "./hook/useHandleRenderer";
import {generateInstructionsToMatch, Instruction, InstructionBuilder} from "../../utils/sync/InstructionBuilder";
import {WorkflowCallbacks, WorkflowManager} from "../../process/workflow/WorkflowManager";
import {HtmlObject} from "../../utils/html/htmlType";
import {useWorkflowActionRenderer} from "./hook/useWorkflowActionRenderer";
import {DataTypeClass, DataTypeConfig} from "../../utils/dataType/dataType";
import {Plus} from "lucide-react";
import toast from "react-hot-toast";

export interface SchemaNodeInfo {
    node: Node<any>;
    element: HTMLElement;
    htmlRenderContext: htmlRenderContext
}

export interface triggerNodeUpdateOption {
    reRenderNodeConfig?:boolean
}


export const SchemaDisplay = memo(() => {

    const Project = useContext(ProjectContext);
    const projectRef = useStableProjectRef();

    const nodeDisplayContainer = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const visibleNodes = useRef<Set<Node<any>>>(new Set());
    const prevVisibleNodes = useRef<Set<Node<any>>>(new Set());
    const visibleEdges = useRef<Edge[]>([]);

    const currentEntryDataTypeFixed = useRef<DataTypeClass|undefined>(undefined);


    const getWorkflowCallback = ():WorkflowCallbacks => ({
        onComplete:async  (totalTimeMs: number, data: Record<string, any>) => {
            console.log(`[SchemaDisplay] Workflow completed in ${totalTimeMs}ms`, data);
            const rootNode = getNode('root');
            if (rootNode) {
                const renders = projectRef.current.state.getHtmlRenderOfNode(rootNode._key);
                for(const render of renders) {
                    if(render.renderId !== "") {
                        render.htmlRender.setExtraEventVariable({
                            ...data,
                            entryData: projectRef.current.state.workFlowState.entryData
                        });
                        render.htmlRender.setNodeKey(rootNode._key);
                        await render.htmlRender.render(render.retrieveHtmlObject(rootNode));
                    }
                }
            }
            projectRef.current.dispatch({
                field: "workFlowState",
                value: {
                    ...projectRef.current.state.workFlowState,
                    global: data
                }
            });
        },
        onData: (nodeKey: string | undefined, data: any, timestamp: number) => {
            console.log(`[SchemaDisplay] Data from node ${nodeKey}:`, data);
        },
        onLog: (message: string, timestamp: number) => {
            console.log(`[SchemaDisplay] [${new Date(timestamp).toISOString()}] ${message}`);
        },
        onError: (error: string, timestamp: number) => {
            console.error(`[SchemaDisplay] Workflow error:`, error);
        },
        onDomEvent: (nodeKey: string, pointId: string, eventType: string, eventData: any) => {
            console.log(`[SchemaDisplay] DOM event: ${eventType} from node ${nodeKey}, point ${pointId}`, eventData);
        },
        onInitHtml: async (html: HtmlObject, id?: string, containerSelector?: string) => {
            console.log('[SchemaDisplay] Init HTML render', { id, containerSelector });

            const renderId = id || '';
            const rootSchemaNode = inSchemaNode.current.get('root');
            if (!rootSchemaNode) return;

            // Determine container
            let container: HTMLElement;
            if (containerSelector) {
                const selected = rootSchemaNode.element.querySelector(containerSelector);
                container = selected as HTMLElement || rootSchemaNode.element;
            } else {
                container = rootSchemaNode.element;
            }

            // Remove existing renderer with same ID
            /*const existingRenderer = projectRef.current.state.getHtmlRenderWithId("root", renderId);
            console.log(renderId, projectRef.current.state.getHtmlRenderOfNode("root"));
            if (existingRenderer) {
                projectRef.current.state.removeHtmlRender("root", renderId);
            }*/

            // Create new workflow HTML renderer
            const rootNode = getNode('root');
            if (rootNode) {

                if(rootNode.type === "html") {
                    const htmlRender = new HtmlRender(container, {
                        language: "en",
                        buildingMode: false,
                        workflowMode: true,
                        onDomEvent: (nodeKey: string, pointId: string, eventType: string, eventData: any) => {
                            // Forward DOM event to workflow manager
                            if (workflowManager.current) {
                                workflowManager.current.sendDomEvent(nodeKey, pointId, eventType, eventData);
                            }
                        }
                    });
                    const context = projectRef.current.state.initiateNewHtmlRender({
                        nodeId: rootNode._key,
                        htmlRender: htmlRender,
                        renderId: `${renderId}`,
                        retrieveNode: () => getNode("root"),
                        retrieveHtmlObject: (node) => html
                    })!;
                    if (context) {
                        // Set the node key for event tracking
                        context.htmlRender.setExtraEventVariable({
                            ...projectRef.current.state.workFlowState.global,
                            entryData: projectRef.current.state.workFlowState.entryData
                        })
                        context.htmlRender.setNodeKey(rootNode._key);
                        await context.htmlRender.render(html);
                    }
                }
            }
        },
        onUpdateHtml: async (instructions: Instruction[], id?: string) => {
            console.log('[SchemaDisplay] Update HTML render', { id, instructions });

            const renderId = id || '';
            const renderer =  projectRef.current.state.getHtmlRenderWithId("root", renderId);

            if (!renderer) {
                console.warn(`[SchemaDisplay] No workflow renderer found with id: ${renderId}`);
                return;
            }

            // Apply instructions to the renderer's HTML object
            for (const instruction of instructions) {
                //await renderer.htmlMotor.applyInstruction(instruction);
            }
        }
    });

    const workflowManager = useRef<WorkflowManager>(new WorkflowManager(getWorkflowCallback()));



    const animationManager = useRef<NodeAnimationManager>(new NodeAnimationManager({
        springStiffness: 100,
        damping: 2 * Math.sqrt(100)
    }));

    const inSchemaNode = useRef<Map<string, SchemaNodeInfo>>(new Map());

    const zIndex = useRef<number>(1);

    const getNode = (nodeId:string) => projectRef.current.state.graph?.sheets[ projectRef.current.state.selectedSheetId ?? ""]?.nodeMap.get(nodeId);

    useEffect(() => {
        if(!Project.state.graph) {
            visibleNodes.current = new Set();
            prevVisibleNodes.current = new Set();
            visibleEdges.current = [];
            for(const schema of inSchemaNode.current.values()) {
                schema.element.remove();
            }
            inSchemaNode.current = new Map();
            workflowManager.current.dispose();
        }
    }, [Project.state.graph]);

    // Dynamic class for selected node effect
    const selectedNodeClass = useDynamicClass(`
        & {
            animation: nodius-selection-pulse 2s ease-in-out infinite !important;
            transition: box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }

        @keyframes nodius-selection-pulse {
            0%, 100% {
                box-shadow:
                    0 0 0 1px var(--nodius-primary, #3b82f6),
                    0 0 10px 2px rgba(59, 130, 246, 0.4),
                    0 0 20px 4px rgba(59, 130, 246, 0.2),
                    0 4px 8px rgba(0, 0, 0, 0.1);
            }
            50% {
                box-shadow:
                    0 0 0 1px var(--nodius-primary, #3b82f6),
                    0 0 12px 3px rgba(59, 130, 246, 0.5),
                    0 0 25px 6px rgba(59, 130, 246, 0.3),
                    0 4px 8px rgba(0, 0, 0, 0.1);
            }
        }
    `);


    const resizeHandleClass = useDynamicClass(`
        & {
            position: absolute;
            bottom: -6px;
            right: -6px;
            width: 16px;
            height: 16px;
            background: var(--nodius-primary);
            border: 2px solid white;
            border-radius: 50%;
            cursor: nwse-resize;
            pointer-events: all;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            transition: all 0.2s ease;
            z-index: 10;
            opacity: 0;
            transform: scale(0.8);
        }
        &:hover {
            background: var(--nodius-primary-dark);
            transform: scale(1.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        &:active {
            transform: scale(0.95);
        }
    `);

    useEffect(() => {
        computeVisibility();
    }, [Project.state.graph, Project.state.selectedSheetId]);

    useEffect(() => {
        Project.dispatch({
            field: "computeVisibility",
            value: computeVisibility
        })
    }, []);

    const computeVisibility = () => {
        if(!projectRef.current.state.graph || !projectRef.current.state.selectedSheetId) {
            for(const node of visibleNodes.current) {
                onNodeLeave(node);
            }
            return;
        }

        const graph = projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId];

        const motor = projectRef.current.state.getMotor();
        const containerRect = containerRef.current!.getBoundingClientRect();

        const tl = motor.screenToWorld({ x: 0, y: 0 });
        const br = motor.screenToWorld({ x: containerRect.width, y: containerRect.height });
        const visMinX = Math.min(tl.x, br.x);
        const visMaxX = Math.max(tl.x, br.x);
        const visMinY = Math.min(tl.y, br.y);
        const visMaxY = Math.max(tl.y, br.y);
        prevVisibleNodes.current = new Set(visibleNodes.current);
        visibleNodes.current.clear();

        let visibleNodesId = new Set<string>();
        let notVisibleNodesId = new Set<string>();

        for (const [id, node] of graph.nodeMap.entries()) {
            const nodeConfig = projectRef.current.state.nodeTypeConfig[node.type];

            // If nodeConfig is missing, fetch it and skip this node for now
            if (!nodeConfig) {
                console.warn(`Node type "${node.type}" config not present, fetching...`);
                projectRef.current.state.fetchMissingNodeConfig?.(node.type, projectRef.current.state.graph?.workspace ?? "root");
                continue;
            }

            if(nodeConfig.alwaysRendered) {
                visibleNodes.current.add(node);
                visibleNodesId.add(id);
                continue;
            }
            const nMinX = node.posX;
            const nMaxX = node.posX + node.size.width;
            const nMinY = node.posY;
            const nMaxY = node.posY + node.size.height;
            if (nMaxX > visMinX && nMinX < visMaxX && nMaxY > visMinY && nMinY < visMaxY) {
                visibleNodes.current.add(node);
                visibleNodesId.add(id);
            } else {
                notVisibleNodesId.add(id);
            }
        }

        for(const notVisibleNodeId of notVisibleNodesId) {
            for(const edges of graph.edgeMap.values()) {
                for(const edge of edges) {
                    if(notVisibleNodeId === edge.source && visibleNodesId.has(edge.target)) {
                        visibleNodesId.add(notVisibleNodeId);
                        visibleNodes.current.add(getNode(notVisibleNodeId)!);
                    } else if(notVisibleNodeId === edge.target && visibleNodesId.has(edge.source)) {
                        visibleNodesId.add(notVisibleNodeId);
                        visibleNodes.current.add(getNode(notVisibleNodeId)!);
                    }
                }
            }
        }

        visibleEdges.current = [];
        for(const edges of graph.edgeMap.values()) {
            for(const edge of edges) {
                if(visibleNodesId.has(edge.target) || visibleNodesId.has(edge.source)) {
                    visibleEdges.current.push(edge);
                }
            }
        }
        const scene:MotorScene = {
            edges: edgeArrayToMap(visibleEdges.current),
            nodes: nodeArrayToMap(Array.from(visibleNodes.current)),
        }

        motor.setScene(scene);

        for (const node of visibleNodes.current) {
            if (!prevVisibleNodes.current.has(node)) {
                onNodeEnter(node);
            }
        }
        for (const node of prevVisibleNodes.current) {
            if (!visibleNodesId.has(node._key)) {
                onNodeLeave(node);
            }
        }
    }

    const updateZIndex = useCallback((element: HTMLElement, currentZIndex: number) => {
        const currentZ = currentZIndex ? currentZIndex : (element.style.zIndex === "" ? 0 : parseInt(element.style.zIndex));
        if (currentZ < zIndex.current) {
            zIndex.current++;
            element.style.zIndex = (zIndex.current) + "";
            return zIndex.current;
        }
        return currentZ;
    }, []); // No deps - pure DOM manipulation

    // Drag and drop hook - Using projectRef for stable reference
    const { createDragHandler } = useNodeDragDrop({
        getNode: getNode,
        updateZIndex: updateZIndex,
        isNodeAnimating: (nodeKey) => {
            const node = getNode(nodeKey) as any;
            return node && ("toPosX" in node || "toPosY" in node);
        },
        config: {
            posAnimationDelay: 200
        }
    });

    const { createResizeHandler } = useNodeResize({
        getNode: getNode,
        config: {
            sizeAnimationDelay: 200,
            minWidth: 50,
            minHeight: 50,
        },
        updateZIndex: updateZIndex
    });

    const {
        initSelectorContainer,
        deInitSelectorContainer
    } = useNodeSelector();

    const { updateHandleOverlay, cleanupHandleOverlay} = useHandleRenderer({
        getNode: getNode,
    });

    const {
        renderWorkflowAction,
        disposeWorkflowAction,
        updateWorkFlowButton
    } = useWorkflowActionRenderer({
        workflowCallback: {
            start: async () => {
                console.log("start workflow");
                if(projectRef.current.state.editedHtml?.htmlRenderContext.nodeId === "root") {
                    await projectRef.current.state.closeHtmlEditor!();
                }

                const rootNode = findFirstNodeWithId(projectRef.current.state.graph!, "root")!;
                if(!rootNode) return

                const schema = inSchemaNode.current.get(rootNode._key);
                if(!schema) return;

                if(rootNode.type === "html") {
                    const htmlRender = projectRef.current.state.getHtmlRenderOfNode(rootNode._key);
                    const main = htmlRender.find((h) => h.renderId === "main");
                    if(!main) return;
                    projectRef.current.state.removeHtmlRender(rootNode._key, "main");
                    // it mean it will render html
                }

                const nodes: Node<any>[] = [];
                const edges: Edge[] = [];

                for(const sheet of Object.values(projectRef.current.state.graph!.sheets)) {
                    nodes.push(...sheet.nodeMap.values());
                    for(const key of sheet.edgeMap.keys()) {
                        if(key.startsWith("source-")) {
                            edges.push(...sheet.edgeMap.get(key)!);
                        }
                    }
                }

                // Get entry data from entryType node
                let nodeTypeEntry: Node<NodeTypeEntryType> | undefined = undefined;
                let entryData:Record<string, any> = {};
                if(! (!rootNode || rootNode.handles["0"] == undefined || rootNode.handles["0"].point.length == 0)) {
                    const connectedNodeToEntry = findNodeConnected(projectRef.current.state.graph!, rootNode, "in");
                    nodeTypeEntry = connectedNodeToEntry.find((n) => n.type === "entryType") as Node<NodeTypeEntryType>;
                    if(nodeTypeEntry) {
                        const dataType = projectRef.current.state.dataTypes?.find((d) => d._key === nodeTypeEntry!.data!._key);
                        if(dataType) {
                            for(const type of dataType.types) {
                                if(nodeTypeEntry.data?.fixedValue?.[type.name]) {
                                    entryData[type.name] = nodeTypeEntry.data?.fixedValue?.[type.name];
                                } else if(type.defaultValue !== undefined) {
                                    entryData[type.name] = type.defaultValue
                                }
                            }
                        }
                    }
                }
                projectRef.current.dispatch({
                    field: "workFlowState",
                    value: {
                        ...projectRef.current.state.workFlowState,
                        active: true,
                        executing: true,
                        entryData: entryData,
                        global: {}
                    }
                });
                await workflowManager.current.executeWorkflow(
                    nodes,
                    edges,
                    "root",
                    entryData,
                    projectRef.current.state.nodeTypeConfig
                )
                projectRef.current.dispatch({
                    field: "workFlowState",
                    value: {
                        ...projectRef.current.state.workFlowState,
                        active: true,
                        executing: false
                    }
                });
            },
            stop: () => {
                console.log("stop workflow");

                const rootNode = getNode("root");
                if(!rootNode) return

                workflowManager.current.dispose();

                onNodeLeave(rootNode);
                onNodeEnter(rootNode);
                projectRef.current.dispatch({
                    field: "workFlowState",
                    value: {
                        ...projectRef.current.state.workFlowState,
                        active: false,
                        executing: false
                    }
                });
            }
        }
    });

    useEffect(() => {
        if(Project.state.getMotor?.() && containerRef.current) {
            initSelectorContainer(Project.state.getMotor().getContainerDraw(), containerRef.current);

            return () => {
                deInitSelectorContainer();
            }
        }
    }, [Project.state.getMotor, containerRef.current]);

    const onNodeLeave = (node:Node<any>) => {
        const schema = inSchemaNode.current.get(node._key);
        if(schema) {
            schema.element.remove();

            cleanupHandleOverlay(node._key);

            const htmlRenders = projectRef.current.state.getHtmlRenderOfNode(node._key);
            for(const htmlRender of htmlRenders) {
                projectRef.current.state.removeHtmlRender(htmlRender.nodeId, htmlRender.renderId);
            }

            inSchemaNode.current.delete(node._key);
        }

        if(projectRef.current.state.editedHtml && projectRef.current.state.editedHtml.htmlRenderContext.nodeId === node._key) {
            projectRef.current.state.closeHtmlEditor!();
        }
        if(projectRef.current.state.editedNodeHandle && projectRef.current.state.editedNodeHandle.nodeId === node._key) {
            projectRef.current.dispatch({
                field: "editedNodeHandle",
                value: undefined
            });
        }
    }

    const onNodeEnter = (node:Node<any>) => {
        const nodeConfig = projectRef.current.state.nodeTypeConfig[node.type];
        if (!nodeConfig) {
            console.warn("Node type", node.type, "config not present, can't proceed");
            return;
        }

        if (inSchemaNode.current.has(node._key)) return;

        const nodeHTML = document.createElement('div');
        nodeHTML.setAttribute("data-node-schema-element", node._key);
        nodeHTML.style.position = 'absolute';
        nodeHTML.style.pointerEvents = 'all';
        nodeHTML.style.backgroundColor = 'var(--nodius-background-paper)';
        nodeHTML.style.borderRadius = nodeConfig.border.radius + "px";
        nodeHTML.style.outline = `${nodeConfig.border.width}px ${nodeConfig.border.type} ${nodeConfig.border.normal.color}`;
        nodeHTML.style.setProperty(
            "transition",
            "box-shadow 0.2s ease-in-out, scale 0.2s ease-in-out",
            "important"
        );

        // Mouse enter/leave for border color
        const mouseEnter = () => {
            nodeHTML.style.outline = `${nodeConfig.border.width}px ${nodeConfig.border.type} ${nodeConfig.border.hover.color}`;
        };
        const mouseLeave = () => {
            nodeHTML.style.outline = `${nodeConfig.border.width}px ${nodeConfig.border.type} ${nodeConfig.border.normal.color}`;
        };

        nodeHTML.addEventListener("mouseenter", mouseEnter);
        nodeHTML.addEventListener("mouseleave", mouseLeave);

        nodeHTML.addEventListener("click", (evt) => {
            if(evt.ctrlKey) {
                projectRef.current.dispatch({
                    field: "selectedNode",
                    value: [...projectRef.current.state.selectedNode.filter((sn) => sn != node._key),node._key]
                });
            } else {
                projectRef.current.dispatch({
                    field: "selectedNode",
                    value: [node._key]
                });
            }
            internalNodeUpdate(node._key);
        });

        if(projectRef.current.state.selectedNode.includes(node._key)) {
            nodeHTML.classList.add(selectedNodeClass);
        }


        // Create resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.className = resizeHandleClass;
        resizeHandle.setAttribute("data-resize-handle", node._key);
        nodeHTML.appendChild(resizeHandle);
        const resizeHandler = createResizeHandler(node._key, nodeHTML);
        resizeHandle.addEventListener("mousedown", resizeHandler);

        const dragHandler = createDragHandler(node._key, nodeHTML);
        nodeHTML.addEventListener("mousedown", dragHandler);


        // add workflow interactive
        renderWorkflowAction(node._key, nodeHTML);


        const htmlRender = new HtmlRender(nodeHTML, {
            language: "en",
            buildingMode: false,
            workflowMode: true,
        });


        const context = projectRef.current.state.initiateNewHtmlRender({
            nodeId: node._key,
            htmlRender:htmlRender,
            renderId: "",
            retrieveNode: () => getNode(node._key),
            retrieveHtmlObject: (node) => projectRef.current.state.nodeTypeConfig[node.type].content
        })!;

        inSchemaNode.current.set(node._key, {
            node: node,
            element: nodeHTML,
            htmlRenderContext: context
        });

        htmlRender.setExtraEventVariable(getExtraRenderGraphVariable(node));
        htmlRender.render(nodeConfig.content).then(() => {
            const updateTrigger = nodeHTML.querySelectorAll('[data-workflow-event*="nodeEnter"]');
            for(const element of updateTrigger) {
                element.dispatchEvent(new CustomEvent("nodeEnter", {
                    bubbles: false
                }))
            }
        });


        if(projectRef.current.state.editedNodeConfig && node._key === "0") {
            nodeHTML.addEventListener("dblclick", () => {
                projectRef.current.state.openHtmlEditor!(context, ["content"]);
            });
        }

        nodeDisplayContainer.current!.appendChild(nodeHTML);
        forwardMouseEvents(nodeHTML, projectRef.current.state.getMotor().getContainerDraw());
        updateHandleOverlay(node, nodeHTML);
        updateNodePosition(node._key);

    }

    const deletePointId = async (nodeId:string, pointId:string):Promise<boolean> => {
        const node =  getNode(nodeId);
        if(!node) return false;

        const intruction = new InstructionBuilder();
        intruction.key("handles");
        for(const [side, handle] of Object.entries(node.handles)) {
            const index = handle.point.findIndex((p) => p.id === pointId);
            if(index !== -1) {
                const point = handle.point[index];
                intruction.key(side).arrayRemoveIndex(index);
                const edgeMap = projectRef.current.state.graph?.sheets[projectRef.current.state.selectedSheetId ?? ""]?.edgeMap;
                if(!edgeMap) return false;
                const edge = edgeMap.get(( point.type === "out" ? "source-" : "target-")+nodeId);
                if(edge) {
                    const output = await projectRef.current.state.batchDeleteElements!([], edge.map((e) => e._key));
                    if(!output.status) {
                        return false;
                    }
                }
                const output = await projectRef.current.state.updateGraph!([{
                    i: intruction.instruction,
                    nodeId: nodeId,
                }]);
                return output.status;
            }
        }
        return false;
    }

    const _generateUniqueHandlePointId = (nodeId:string):string => {
        const node = getNode(nodeId)!;
        return generateUniqueHandlePointId(node);
    }

    const getExtraRenderGraphVariable = (node:Node<any>) => {
        const schema = inSchemaNode.current.get(node._key);
        if(!schema) return {};
        return {
            getNode: (nodeId:string) => {
                const node = getNode(nodeId);
                return node ? deepCopy(node) : undefined
            },
            nodeId: node._key,
            updateNode:async (newNode:Node<any>) => {
                const baseNode = getNode(node._key);
                const diffs = generateInstructionsToMatch(baseNode, newNode);
                if(diffs.length > 0) {
                    const output = await projectRef.current.state.updateGraph!(diffs.map((d) => (
                        {
                            i: d,
                            nodeId: node._key,
                        }
                    )));
                    return output.status;
                }
                return true;
            },
            InstructionBuilder: InstructionBuilder,
            deletePointId: deletePointId,
            generateUniqueHandlePointId:_generateUniqueHandlePointId,
            updateGraph: projectRef.current.state.updateGraph!,
            gpuMotor: projectRef.current.state.getMotor(),
            initiateNewHtmlRender: projectRef.current.state.initiateNewHtmlRender,
            getHtmlRenderWithId: projectRef.current.state.getHtmlRenderWithId,
            getHtmlRenderOfNode: projectRef.current.state.getHtmlRenderOfNode,
            getAllHtmlRender: projectRef.current.state.getAllHtmlRender,
            removeHtmlRender: projectRef.current.state.removeHtmlRender,
            openHtmlEditor: projectRef.current.state.openHtmlEditor,
            currentEntryDataType: currentEntryDataTypeFixed.current,
            HtmlRender: HtmlRender,
            container: schema.element
        }
    }

    const updateNodePosition = (nodeId:string) => {
        const schema = inSchemaNode.current.get(nodeId);
        if(schema) {
            const motor = projectRef.current.state.getMotor();
            const transform = motor.getTransform();
            const rect = motor.getNodeScreenRect(nodeId)!;

            schema.element.style.zoom = transform.scale + "";
            schema.element.style.left = `${rect.x / transform.scale}px`;
            schema.element.style.top = `${rect.y / transform.scale}px`;
            schema.element.style.width = `${rect.width / transform.scale}px`;
            schema.element.style.height = `${rect.height / transform.scale}px`;

        }
    }


    // Attach motor event listeners
    useEffect(() => {
        const motor = projectRef.current.state.getMotor();
        if(!motor) return;

        const handlePan = () => {
            computeVisibility();
            for(const node of visibleNodes.current) {
                updateNodePosition(node._key);
            }
        };
        const handleZoom = () => {
            computeVisibility();
            for(const node of visibleNodes.current) {
                updateNodePosition(node._key);
            }
        };

        const handleEdgeClick = (edge: Edge, edgeKey: string, ctrlKey: boolean) => {
            // If not ctrl, clear node selection when selecting edge
            console.log("edge click");
            console.trace();
        };

        const handleCanvasClickEmpty = () => {


        };

        motor.on("pan", handlePan);
        motor.on("zoom", handleZoom);
        motor.on("edgeClick", handleEdgeClick);
        motor.on("canvasClick", handleCanvasClickEmpty);

        return () => {
            motor.off("pan", handlePan);
            motor.off("zoom", handleZoom);
            motor.off("edgeClick", handleEdgeClick);
            motor.off("canvasClick", handleCanvasClickEmpty);
        };
    }, [projectRef.current.state.getMotor]);



    const internalNodeUpdate = async  (nodeId:string, options?:triggerNodeUpdateOption) => {
        const node = getNode(nodeId)as (Node<any> & {
            toPosX?: number;
            toPosY?: number;
            size: {
                toWidth?: number;
                toHeight?: number;
            }
        }) | undefined

        if(!node) return;

        const schema = inSchemaNode.current.get(nodeId);
        if(!schema) return;

        const nodeConfig = projectRef.current.state.nodeTypeConfig[node.type];
        if(!nodeConfig) return;


        if(options?.reRenderNodeConfig) {
            schema.htmlRenderContext.htmlRender.setExtraEventVariable(getExtraRenderGraphVariable(node));
            await schema.htmlRenderContext.htmlRender.render(schema.htmlRenderContext.retrieveHtmlObject(node));
        }



        const handleSelectedPointId = projectRef.current.state.editedNodeHandle && projectRef.current.state.editedNodeHandle.nodeId === nodeId ? projectRef.current.state.editedNodeHandle.pointId : undefined;

        if (
            (node.toPosX !== undefined && node.toPosX !== node.posX) ||
            (node.toPosY !== undefined && node.toPosY !== node.posY) ||
            (node.size.toWidth !== undefined && node.size.width !== node.size.toWidth) ||
            (node.size.toHeight !== undefined && node.size.height !== node.size.toHeight)
        ) {
            animationManager.current?.startAnimation(
                nodeId,
                () => getNode(nodeId) as any,
                () => {
                    projectRef.current.state.getMotor().requestRedraw();
                    updateNodePosition(nodeId);
                    updateHandleOverlay(node, schema.element, handleSelectedPointId);
                }
            );
        } else {
            updateNodePosition(nodeId);
            updateHandleOverlay(node, schema.element, handleSelectedPointId);
            const renders = projectRef.current.state.getHtmlRenderOfNode(nodeId);
            for(const render of renders) {
                if(render.renderId !== "") {
                    render.htmlRender.render(render.retrieveHtmlObject(node));
                }
            }
        }


        if(!projectRef.current.state.selectedNode.includes(nodeId)  && schema.element.classList.contains(selectedNodeClass)) {
            schema.element.classList.remove(selectedNodeClass);
        } else if(projectRef.current.state.selectedNode.includes(nodeId) && !schema.element.classList.contains(selectedNodeClass)) {
            schema.element.classList.add(selectedNodeClass);
        }

        const updateTrigger = schema.element.querySelectorAll('[data-workflow-event*="nodeUpdate"]');

        for(const element of updateTrigger) {
            element.dispatchEvent(new CustomEvent("nodeUpdate", {
                bubbles: false
            }))
        }
    }


    useEffect(() => {
        const triggerNodeUpdate = async (nodeId: string, options?:triggerNodeUpdateOption) => {
            await internalNodeUpdate(nodeId, options);
        };

        (window as any).triggerNodeUpdate = triggerNodeUpdate;

        return () => {
            delete (window as any).triggerNodeUpdate;

        };
    }, []);

    useEffect(() => {
        for(const nodeSchema of inSchemaNode.current.values()) {
            if(!Project.state.selectedNode.includes(nodeSchema.node._key)  && nodeSchema.element.classList.contains(selectedNodeClass)) {
                nodeSchema.element.classList.remove(selectedNodeClass);
            } else if(Project.state.selectedNode.includes(nodeSchema.node._key) && !nodeSchema.element.classList.contains(selectedNodeClass)) {
                nodeSchema.element.classList.add(selectedNodeClass);
            }
        }
    }, [Project.state.selectedNode]);

    useEffect(() => {
        for(const nodeSchema of inSchemaNode.current.values()) {
            // re render handle
            cleanupHandleOverlay(nodeSchema.node._key);
            updateHandleOverlay(getNode(nodeSchema.node._key)!, nodeSchema.element);

            disposeWorkflowAction(nodeSchema.node._key);
            renderWorkflowAction(nodeSchema.node._key, nodeSchema.element);
        }
    }, [Project.state.editedNodeConfig]);


    const previousEditedNodeHandle = useRef<EditedNodeHandle>(undefined);
    useEffect(() => {
        if(previousEditedNodeHandle.current) {
            const schema = inSchemaNode.current.get(previousEditedNodeHandle.current.nodeId);
            if(schema) {
                updateHandleOverlay(getNode(schema.node._key)!, schema.element);
            }
        }
        if(Project.state.editedNodeHandle) {
            if(Project.state.editedHtml) {
                Project.state.closeHtmlEditor!();
            }
            const schema = inSchemaNode.current.get(Project.state.editedNodeHandle.nodeId);
            if(schema) {
                updateHandleOverlay(getNode(schema.node._key)!, schema.element, Project.state.editedNodeHandle.pointId);
            }
        }
        previousEditedNodeHandle.current = deepCopy(Project.state.editedNodeHandle);
    }, [Project.state.editedNodeHandle]);

    useEffect(() => {
        if(Project.state.editedHtml && Project.state.editedNodeHandle) {
            Project.dispatch({
                field: "editedNodeHandle",
                value: undefined
            });
        }
    }, [Project.state.editedHtml]);

    useEffect(() => {
        if(!Project.state.graph) return;
        const nodeRoot = findFirstNodeWithId(Project.state.graph, "root")!;
        let nodeTypeEntry: Node<NodeTypeEntryType> | undefined = undefined;
        if(! (!nodeRoot || nodeRoot.handles["0"] == undefined || nodeRoot.handles["0"].point.length == 0)) {
            const connectedNodeToEntry = findNodeConnected(Project.state.graph, nodeRoot, "in");
            nodeTypeEntry = connectedNodeToEntry.find((n) => n.type === "entryType") as Node<NodeTypeEntryType>;
        }

        currentEntryDataTypeFixed.current = Project.state.currentEntryDataType;

        if(nodeTypeEntry) {
            internalNodeUpdate(nodeTypeEntry._key, {reRenderNodeConfig: true});
        }
    }, [Project.state.currentEntryDataType]);


    const sheetListClass = useDynamicClass(`
        & {
            position:absolute; 
            width:100%; 
            display:flex;
            flex-direction:row; 
            justify-content:center; 
            bottom:0;
            overflow:hidden;
            pointer-events: all;
            z-index: 1;
            gap: 10px;
        }
        
        & > div {
            background-color: var(--nodius-background-paper);
            box-shadow: var(--nodius-shadow-2);
            padding: 8px 16px;
            font-size: 16px;
            font-weight: 500;
            border-radius: 8px 8px 0px 0px;
            transform: translateY(30px);
            cursor:pointer;
            transition: var(--nodius-transition-default);
        }
        
        & > div.selected {
            border: 1px solid var(--nodius-primary-main)
        }
        
        &:hover > div {
            transform: translateY(2px);
        }
        
    `);

    return (
        <div ref={containerRef} style={{height:'100%', width: '100%', position:"absolute", inset:"0", pointerEvents:"none"}} >
            <div
                ref={nodeDisplayContainer}
                style={{
                    width:"100%",
                    height:"100%",
                    position:"absolute",
                    inset:"0px",
                    pointerEvents:"none",
                    overflow:"hidden"
                }}
            />
            <div className={sheetListClass}>
                {
                    Object.keys(Project.state.graph?.sheetsList ?? {}).map((sheetKey, i) => (
                        <div key={i} className={sheetKey === Project.state.selectedSheetId ? "selected" : ""}>
                            {Project.state.graph!.sheetsList[sheetKey]}
                        </div>
                    ))
                }
                <div className={"selected"} style={{color: "var(--nodius-primary-main)"}} onClick={async () => {
                    const sheetName = prompt("Sheet name");
                    if(sheetName) {
                        if(Object.values(Project.state.graph!.sheetsList).includes(sheetName)) {
                            toast.error("Sheet name already used");
                        } else {
                            await Project.state.createSheet!(sheetName);
                        }
                    }
                }}>
                    <Plus />
                </div>
            </div>
        </div>
    )
})