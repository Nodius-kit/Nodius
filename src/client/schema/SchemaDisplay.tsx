import {memo, useCallback, useContext, useEffect, useRef} from "react";
import {EditedNodeHandle, htmlRenderContext, ProjectContext} from "../hooks/contexts/ProjectContext";
import {useStableProjectRef} from "../hooks/useStableProjectRef";
import {Edge, Node} from "../../utils/graph/graphType";
import {MotorScene} from "./motor/graphicalMotor";
import {edgeArrayToMap, nodeArrayToMap} from "../../utils/graph/nodeUtils";
import {useDynamicClass} from "../hooks/useDynamicClass";
import {deepCopy, forwardMouseEvents} from "../../utils/objectUtils";
import { useNodeDragDrop } from "./hook/useNodeDragDrop";
import {NodeAnimationManager} from "./manager/nodeAnimation";
import {useNodeResize} from "./hook/useNodeResize";
import {useNodeSelector} from "./hook/useNodeSelector";
import {HtmlRender} from "../../process/html/HtmlRender";
import { useHandleRenderer } from "./hook/useHandleRenderer";
import {generateInstructionsToMatch} from "../../utils/sync/InstructionBuilder";
import {useNodeActionButton} from "./hook/useNodeActionButton";

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

        let visibleNodeId = new Set<string>();

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
                visibleNodeId.add(id);
                continue;
            }
            const nMinX = node.posX;
            const nMaxX = node.posX + node.size.width;
            const nMinY = node.posY;
            const nMaxY = node.posY + node.size.height;
            if (nMaxX > visMinX && nMinX < visMaxX && nMaxY > visMinY && nMinY < visMaxY) {
                visibleNodes.current.add(node);
                visibleNodeId.add(id);
            }
        }

        visibleEdges.current = [];
        for(const edges of graph.edgeMap.values()) {
            for(const edge of edges) {
                if(visibleNodeId.has(edge.target) || visibleNodeId.has(edge.source)) {
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
            if (!visibleNodes.current.has(node)) {
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
        createActionButton,
        clearActionButton,
        updateActionButton,
        setCallBackWhenNodeChange
    } = useNodeActionButton();

    const {
        initSelectorContainer,
        deInitSelectorContainer
    } = useNodeSelector();

    const { updateHandleOverlay, cleanupHandleOverlay} = useHandleRenderer({
        getNode: getNode,
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

        htmlRender.setExtraEventVariable(getExtraRenderVariable(node));
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
        createActionButton(inSchemaNode.current.get(node._key)!);

    }

    const getExtraRenderVariable = (node:Node<any>) => {
        const schema = inSchemaNode.current.get(node._key);
        if(!schema) return {};
        return {
            getNode: getNode,
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
            updateGraph: projectRef.current.state.updateGraph!,
            gpuMotor: projectRef.current.state.getMotor(),
            initiateNewHtmlRender: projectRef.current.state.initiateNewHtmlRender,
            getHtmlRenderWithId: projectRef.current.state.getHtmlRenderWithId,
            getHtmlRenderOfNode: projectRef.current.state.getHtmlRenderOfNode,
            getAllHtmlRender: projectRef.current.state.getAllHtmlRender,
            removeHtmlRender: projectRef.current.state.removeHtmlRender,
            openHtmlEditor: projectRef.current.state.openHtmlEditor,
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
            schema.htmlRenderContext.htmlRender.setExtraEventVariable(getExtraRenderVariable(node));
            await schema.htmlRenderContext.htmlRender.render(schema.htmlRenderContext.retrieveHtmlObject(node));
        }

        const handleSelectedPointId = projectRef.current.state.editedNodeHandle && projectRef.current.state.editedNodeHandle.nodeId === nodeId ? projectRef.current.state.editedNodeHandle.pointId : undefined;



        updateActionButton(schema);

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
        setCallBackWhenNodeChange(internalNodeUpdate);
    }, []);



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

            clearActionButton(nodeSchema.node._key);
            createActionButton(nodeSchema);
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
        </div>
    )
})