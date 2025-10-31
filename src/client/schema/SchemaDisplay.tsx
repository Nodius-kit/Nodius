/**
 * @file SchemaDisplay.tsx
 * @description Canvas-based graph visualization with WebGPU rendering
 * @module schema
 *
 * Provides the main graph visualization component:
 * - SchemaDisplay: WebGPU-based graph canvas with HTML overlay rendering
 * - WebGpuMotor integration: High-performance graph rendering
 * - HTML overlays: Dynamic HTML rendering within graph nodes
 * - Node interactions: Enter/leave events, click handling
 * - Position animation: Spring-based smooth node movement
 *
 * Key features:
 * - WebGPU rendering for graph visualization
 * - HTML overlay z-index management
 * - Animated position changes with spring physics
 * - HtmlRender lifecycle management per node
 * - Mouse event forwarding to canvas
 * - Dynamic overlay updates (60fps cap)
 * - Node event handlers for hover/selection
 */

import {memo, useContext, useEffect, useRef, forwardRef, useCallback} from "react";
import {WebGpuMotor} from "./motor/webGpuMotor/index";
import {ThemeContext} from "../hooks/contexts/ThemeContext";
import {Edge, Node} from "../../utils/graph/graphType";
import {deepCopy, disableTextSelection, enableTextSelection, forwardMouseEvents} from "../../utils/objectUtils";
import {EditedNodeHandle, htmlRenderContext, ProjectContext} from "../hooks/contexts/ProjectContext";
import {NodeAnimationManager} from "./nodeAnimations";
import {OverlayManager} from "./overlayManager";
import {NodeEventManager} from "./nodeEventManager";
import {useNodeDragDrop} from "./hooks/useNodeDragDrop";
import {useNodeRenderer} from "./hooks/useNodeRenderer";
import {useDynamicClass} from "../hooks/useDynamicClass";
import {useNodeResize} from "./hooks/useNodeResize";
import {useHandleRenderer} from "./hooks/useHandleRenderer";

interface SchemaDisplayProps {
    onExitCanvas: () => void,
    onCanvasClick: (evt:React.MouseEvent) => void,
    onNodeEnter?: (node: Node<any>) => void,
    onNodeLeave?: (node: Node<any>|undefined, nodeId:string) => void,
}

interface SchemaNodeInfo {
    node: Node<any>;
    element: HTMLElement;
    overElement: HTMLElement;
    resizeHandle: HTMLElement;
    htmlRenderer?: htmlRenderContext;
    eventManager: NodeEventManager;
    mouseEnterHandler: () => void;
    mouseLeaveHandler: () => void;
    dragHandler: (evt: MouseEvent) => void;
    resizeHandler: (evt: MouseEvent) => void;
}

export const SchemaDisplay = memo(forwardRef<WebGpuMotor, SchemaDisplayProps>(({
    onExitCanvas,
    onNodeEnter,
    onNodeLeave,
    onCanvasClick
}, motorRef) => {

    const Project = useContext(ProjectContext);
    const Theme = useContext(ThemeContext);

    const canvasRef = useRef<HTMLCanvasElement|null>(null);
    const containerRef = useRef<HTMLDivElement|null>(null);
    const nodeDisplayContainer = useRef<HTMLDivElement>(null);

    const gpuMotor = useRef<WebGpuMotor>(undefined);
    const zIndex = useRef<number>(1);
    const inSchemaNode = useRef<Map<string, SchemaNodeInfo>>(new Map());
    const pendingNodeEnters = useRef<Map<string, Node<any>>>(new Map());

    // Managers
    const animationManager = useRef<NodeAnimationManager>(undefined);
    const overlayManager = useRef<OverlayManager>(undefined);

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

    const selectedNodeElementClass = useDynamicClass(`
        & {
            filter: brightness(1.05) !important;
            transition: filter 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
    `);

    const resizeHandleClass = useDynamicClass(`
        & {
            position: absolute;
            bottom: -6px;
            right: -6px;
            width: 16px;
            height: 16px;
            background: var(--nodius-primary, #3b82f6);
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
            background: var(--nodius-primary-dark, #2563eb);
            transform: scale(1.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        &:active {
            transform: scale(0.95);
        }
    `);

    // Initialize WebGPU motor
    useEffect(() => {
        if (!containerRef.current || !canvasRef.current) return;

        const motor = new WebGpuMotor();

        if (typeof motorRef === "function") {
            motorRef(motor);
        } else if (motorRef) {
            motorRef.current = motor;
        }
        gpuMotor.current = motor;

        // Initialize managers
        animationManager.current = new NodeAnimationManager({
            springStiffness: 100,
            damping: 2 * Math.sqrt(100)
        });
        overlayManager.current = new OverlayManager(motor);

        motor
            .init(containerRef.current, canvasRef.current, {
                backgroundType: "dotted"
            })
            .then(() => {
                motor.resetViewport();
                motor.enableInteractive(true);
            });

        return () => {
            animationManager.current?.stopAllAnimations();
            overlayManager.current?.dispose();
            if (motorRef && typeof motorRef !== "function") {
                motorRef.current = null;
            }
        };
    }, [motorRef]);

    // Node renderer hook
    const nodeRenderer = useNodeRenderer({
        dependencies: {
            currentEntryDataType: Project.state.currentEntryDataType,
            enumTypes: Project.state.enumTypes,
            dataTypes: Project.state.dataTypes,
        },
        getNodeConfig: (nodeType) => Project.state.nodeTypeConfig[nodeType]
    });


    // Helper functions
    const getNode = useCallback((nodeKey: string) => {
        return Project.state.graph?.sheets[Project.state.selectedSheetId!]?.nodeMap.get(nodeKey);
    }, [Project.state.graph, Project.state.selectedSheetId]);

    const updateZIndex = useCallback((element: HTMLElement, overlay: HTMLElement, currentZIndex: number) => {
        const currentZ = overlay.style.zIndex === "" ? 0 : parseInt(overlay.style.zIndex);
        if (currentZ < zIndex.current) {
            zIndex.current++;
            overlay.style.zIndex = element.style.zIndex = zIndex.current + "";
            return zIndex.current;
        }
        return currentZ;
    }, []);

    const triggerEventOnNode = useCallback((nodeId: string, eventName: string) => {
        const nodeElement = document.querySelector(`[data-node-key="${nodeId}"]`);
        if (nodeElement) {
            const updateEvent = new CustomEvent(eventName, { bubbles: false });
            nodeElement.dispatchEvent(updateEvent);
        }
    }, []);

    const { updateHandleOverlay, cleanupHandleOverlay} = useHandleRenderer({
        getNode: getNode,
        gpuMotor: gpuMotor.current!,
        setSelectedHandle: (handle:EditedNodeHandle) => Project.dispatch({
            field: "editedNodeHandle",
            value: handle
        }),
        editedNodeConfig: Project.state.editedNodeConfig,
        onClickOnHandle: (editedHandle:EditedNodeHandle) => Project.dispatch({field:"editedNodeHandle", value: editedHandle}),
        updateGraph: Project.state.updateGraph!
    });


    // Drag and drop hook
    const { createDragHandler } = useNodeDragDrop({
        gpuMotor: gpuMotor.current!,
        getNode: getNode,
        updateGraph: Project.state.updateGraph!,
        isNodeInteractionDisabled: (nodeKey) =>
            Project.state.disabledNodeInteraction[nodeKey]?.moving ?? false,
        isNodeAnimating: (nodeKey) => {
            const node = getNode(nodeKey) as any;
            return node && ("toPosX" in node || "toPosY" in node);
        },
        updateZIndex: updateZIndex,
        config: {
            posAnimationDelay: 200
        }
    });

    // Resize hook
    const { createResizeHandler } = useNodeResize({
        gpuMotor: gpuMotor.current!,
        getNode: getNode,
        updateGraph: Project.state.updateGraph!,
        isNodeInteractionDisabled: (nodeKey) =>
            (Project.state.disabledNodeInteraction[nodeKey]?.moving ?? false) && (!Project.state.editedNodeConfig || Project.state.editedNodeConfig.node._key !== nodeKey),
        updateZIndex: updateZIndex,
        config: {
            sizeAnimationDelay: 200,
            minWidth: 50,
            minHeight: 50,
        }
    });


    // Node enter handler
    const nodeEnter = useCallback(async (node: Node<any>) => {
        if (!Project.state.nodeTypeConfig[node.type]) {
            console.warn("Node type", node.type, "config not loaded yet, adding to pending queue");
            pendingNodeEnters.current.set(node._key, node);
            return;
        }
        if (!nodeDisplayContainer.current || !gpuMotor.current || !overlayManager.current) return;
        if (inSchemaNode.current.has(node._key)) return;

        // Remove from pending if it was there
        pendingNodeEnters.current.delete(node._key);

        const nodeHTML = document.createElement('div');
        nodeHTML.setAttribute("data-node-key", node._key);
        nodeHTML.style.position = 'absolute';
        nodeHTML.style.pointerEvents = 'all';
        nodeHTML.style.backgroundColor = 'var(--nodius-background-paper)';

        const overlay = document.createElement("div");
        overlay.setAttribute("data-node-overlay-key", node._key);
        overlay.style.position = 'absolute';
        overlay.style.pointerEvents = 'none';
        overlay.style.cursor = "pointer";
        overlay.style.transition = "outline ease-in-out 0.3s";

        const nodeConfig = Project.state.nodeTypeConfig[node.type];

        overlay.style.borderRadius = nodeConfig.border.radius + "px";
        nodeHTML.style.borderRadius = nodeConfig.border.radius + "px";
        overlay.style.outline = `${nodeConfig.border.width}px ${nodeConfig.border.type} ${nodeConfig.border.normal.color}`;

        // Mouse enter/leave for border color
        const mouseEnter = () => {
            overlay.style.outline = `${nodeConfig.border.width}px ${nodeConfig.border.type} ${nodeConfig.border.hover.color}`;
        };
        const mouseLeave = () => {
            overlay.style.outline = `${nodeConfig.border.width}px ${nodeConfig.border.type} ${nodeConfig.border.normal.color}`;
        };

        overlay.addEventListener("mouseenter", mouseEnter);
        nodeHTML.addEventListener("mouseenter", mouseEnter);
        overlay.addEventListener("mouseleave", mouseLeave);
        nodeHTML.addEventListener("mouseleave", mouseLeave);

        // Create resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.className = resizeHandleClass;
        resizeHandle.setAttribute("data-resize-handle", node._key);
        overlay.appendChild(resizeHandle);

        // Resize handler
        const resizeHandler = createResizeHandler(node._key, overlay, nodeHTML);
        resizeHandle.addEventListener("mousedown", resizeHandler);

        // Drag handler
        const dragHandler = createDragHandler(node._key, overlay, nodeHTML);
        nodeHTML.addEventListener("mousedown", dragHandler);

        // Create event manager
        const eventManager = new NodeEventManager(nodeHTML, overlay, {
            gpuMotor: gpuMotor.current,
            getNode: () => getNode(node._key),
            openHtmlEditor: Project.state.openHtmlEditor!,
            getHtmlRenderer: Project.state.getHtmlRenderer!,
            initiateNewHtmlRenderer: Project.state.initiateNewHtmlRenderer!,
            removeHtmlRenderer: Project.state.removeHtmlRenderer!,
            getHtmlAllRenderer: Project.state.getHtmlAllRenderer!,
            container: nodeHTML,
            overlayContainer: overlay,
            triggerEventOnNode: triggerEventOnNode,
            editedHtml: Project.state.editedHtml,
            editedNodeConfig: Project.state.editedNodeConfig,
            addSelectedNode: (nodeId:string, ctrlKey) => {
                if (ctrlKey) {
                    if (Project.state.selectedNode.includes(nodeId)) {
                        Project.dispatch({
                            field: "selectedNode",
                            value: Project.state.selectedNode.filter(id => id !== nodeId)
                        });
                    } else {
                        Project.dispatch({
                            field: "selectedNode",
                            value: [...Project.state.selectedNode, nodeId]
                        });
                    }
                } else {
                    Project.dispatch({
                        field: "selectedNode",
                        value: [nodeId]
                    });
                    Project.dispatch({
                        field: "selectedEdge",
                        value: []
                    });
                }
            },
            selectedNode: Project.state.selectedNode
        });

        // Attach events
        if (nodeConfig.domEvents) {
            eventManager.attachEvents(nodeConfig.domEvents);
        }

        // Handle node updates
        const handleNodeUpdate = async () => {
            const updatedNode = getNode(node._key) as (Node<any> & {
                toPosX?: number;
                toPosY?: number;
                size: {
                    toWidth?: number;
                    toHeight?: number;
                }
            }) | undefined;
            if (!updatedNode) {
                return;
            };

            const updatedConfig = Project.state.nodeTypeConfig[updatedNode.type];
            if (!updatedConfig) return;

            // Update events with latest config
            if (updatedConfig.domEvents) {
                eventManager.updateEvents(updatedConfig.domEvents);
            }

            // Update HTML renderer
            await nodeRenderer.updateRendererDependencies(node._key, updatedNode.type);

            overlayManager.current?.requestUpdate(node._key)



            // Trigger nodeUpdate event
            triggerEventOnNode(node._key, "nodeUpdate");

            updateHandleOverlay(node._key, overlay);

            // Start animation if needed
            if (
                (updatedNode.toPosX !== undefined && updatedNode.toPosX !== updatedNode.posX) ||
                (updatedNode.toPosY !== undefined && updatedNode.toPosY !== updatedNode.posY) ||
                (updatedNode.size.toWidth !== undefined && updatedNode.size.width !== updatedNode.size.toWidth) ||
                (updatedNode.size.toHeight !== undefined && updatedNode.size.height !== updatedNode.size.toHeight)
            ) {
                animationManager.current?.startAnimation(
                    updatedNode._key,
                    () => getNode(updatedNode._key) as any,
                    () => {
                        gpuMotor.current?.requestRedraw();
                        overlayManager.current?.requestUpdate(node._key);
                        updateHandleOverlay(node._key, overlay);
                    }
                );
            }
        };

        nodeHTML.addEventListener("nodeUpdateSystem", handleNodeUpdate);

        // Initialize HTML renderer
        let htmlRenderer: htmlRenderContext | undefined;
        if (nodeConfig.content) {
            htmlRenderer = await Project.state.initiateNewHtmlRenderer!(
                node,
                "",
                nodeHTML,
                nodeConfig.content,
                { noFirstRender: true }
            );
            if (htmlRenderer) {
                nodeRenderer.registerRenderer(node._key, htmlRenderer);
                await htmlRenderer.htmlMotor.render(nodeConfig.content);
            }
        }


        // Position overlay using CSS coordinates (accounts for browser zoom)
        const transform = gpuMotor.current.getTransform();
        const rect = gpuMotor.current.getNodeScreenRectCss(node._key)!;

        overlay.style.zoom = nodeHTML.style.zoom = transform.scale + "";
        overlay.style.left = nodeHTML.style.left = `${rect.x / transform.scale}px`;
        overlay.style.top = nodeHTML.style.top = `${rect.y / transform.scale}px`;
        overlay.style.width = nodeHTML.style.width = `${rect.width / transform.scale}px`;
        overlay.style.height = nodeHTML.style.height = `${rect.height / transform.scale}px`;

        forwardMouseEvents(nodeHTML, gpuMotor.current.getContainerDraw());
        forwardMouseEvents(overlay, gpuMotor.current.getContainerDraw());

        nodeDisplayContainer.current.appendChild(nodeHTML);
        nodeDisplayContainer.current.appendChild(overlay);

        overlayManager.current.addOverlay({
            nodeKey: node._key,
            element: nodeHTML,
            overElement: overlay
        });

        inSchemaNode.current.set(node._key, {
            node,
            element: nodeHTML,
            overElement: overlay,
            resizeHandle,
            htmlRenderer,
            eventManager,
            mouseEnterHandler: mouseEnter,
            mouseLeaveHandler: mouseLeave,
            dragHandler,
            resizeHandler
        });

        onNodeEnter?.(node);

        // Render handles for this node
        updateHandleOverlay(node, overlay);


    }, [
        Project.state.nodeTypeConfig,
        Project.state.initiateNewHtmlRenderer,
        Project.state.removeHtmlRenderer,
        Project.state.openHtmlEditor,
        Project.state.getHtmlRenderer,
        Project.state.getHtmlAllRenderer,
        Project.state.editedNodeConfig,
        createDragHandler,
        createResizeHandler,
        resizeHandleClass,
        getNode,
        nodeRenderer,
        onNodeEnter,
        triggerEventOnNode,
        updateHandleOverlay
    ]);

    // Node leave handler
    const nodeLeave = useCallback((node: Node<any> | undefined, nodeId: string) => {
        if (!nodeDisplayContainer.current) return;

        onNodeLeave?.(node, nodeId);

        // Remove from pending queue if it was there
        pendingNodeEnters.current.delete(nodeId);

        if (node) {
            const nodeConfig = Project.state.nodeTypeConfig[node.type];
            if (!nodeConfig || nodeConfig.alwaysRendered) return;
        }

        if(Project.state.removeHtmlRenderer) {
            Project.state.removeHtmlRenderer(nodeId, "");
        }

        const schemaNode = inSchemaNode.current.get(nodeId);
        if (schemaNode) {

            // Clear handle renderer for this node
            cleanupHandleOverlay(nodeId);

            nodeDisplayContainer.current.removeChild(schemaNode.element);
            nodeDisplayContainer.current.removeChild(schemaNode.overElement);
            schemaNode.eventManager.dispose();
            nodeRenderer.unregisterRenderer(nodeId);
            overlayManager.current?.removeOverlay(nodeId);
            animationManager.current?.stopAnimation(nodeId);
            inSchemaNode.current.delete(nodeId);
        }
    }, [onNodeLeave, Project.state.nodeTypeConfig, nodeRenderer, cleanupHandleOverlay, Project.state.removeHtmlRenderer]);

    // Reset handler
    const onReset = useCallback(() => {
        if (nodeDisplayContainer.current) {
            nodeDisplayContainer.current.innerHTML = "";
        }
        inSchemaNode.current.forEach(schemaNode => {
            schemaNode.eventManager.dispose();
        });
        inSchemaNode.current.clear();
        pendingNodeEnters.current.clear();
        nodeRenderer.clearAllRenderers();
        overlayManager.current?.clearOverlays();
        animationManager.current?.stopAllAnimations();
    }, [nodeRenderer]);

    // Update context for all event managers when dependencies change
    useEffect(() => {
        inSchemaNode.current.forEach(schemaNode => {
            schemaNode.eventManager.updateContext({
                gpuMotor: gpuMotor.current!,
                getNode: () => getNode(schemaNode.node._key),
                openHtmlEditor: Project.state.openHtmlEditor,
                getHtmlRenderer: Project.state.getHtmlRenderer,
                initiateNewHtmlRenderer: Project.state.initiateNewHtmlRenderer,
                removeHtmlRenderer: Project.state.removeHtmlRenderer,
                getHtmlAllRenderer: Project.state.getHtmlAllRenderer,
                container: schemaNode.element,
                overlayContainer: schemaNode.overElement,
                triggerEventOnNode: triggerEventOnNode,
                editedHtml: Project.state.editedHtml,
                editedNodeConfig: Project.state.editedNodeConfig,
                addSelectedNode: (nodeId:string, ctrlKey) => {
                    if (ctrlKey) {
                        if (Project.state.selectedNode.includes(nodeId)) {
                            Project.dispatch({
                                field: "selectedNode",
                                value: Project.state.selectedNode.filter(id => id !== nodeId)
                            });
                        } else {
                            Project.dispatch({
                                field: "selectedNode",
                                value: [...Project.state.selectedNode, nodeId]
                            });
                        }
                    } else {
                        Project.dispatch({
                            field: "selectedNode",
                            value: [nodeId]
                        });
                        Project.dispatch({
                            field: "selectedEdge",
                            value: []
                        });
                    }
                },
                selectedNode: Project.state.selectedNode
            });

            const nodeConfig = Project.state.nodeTypeConfig[schemaNode.node.type];
            schemaNode.eventManager.removeEvents();
            if(nodeConfig.domEvents) {
                schemaNode.eventManager.attachEvents(nodeConfig.domEvents);
            }
        });
    }, [
        Project.state.openHtmlEditor,
        Project.state.getHtmlRenderer,
        Project.state.initiateNewHtmlRenderer,
        Project.state.removeHtmlRenderer,
        Project.state.getHtmlAllRenderer,
        Project.state.nodeTypeConfig,
        Project.state.editedHtml,
        Project.state.editedNodeConfig,
        Project.state.selectedNode,
        Project.state.selectedEdge,
        getNode,
        triggerEventOnNode
    ]);

    // Update drag and resize handlers when handlers change (e.g., when updateGraph changes)
    useEffect(() => {
        inSchemaNode.current.forEach(schemaNode => {
            // Remove old handlers
            schemaNode.element.removeEventListener("mousedown", schemaNode.dragHandler);
            schemaNode.resizeHandle.removeEventListener("mousedown", schemaNode.resizeHandler);

            // Create and attach new drag handler
            const newDragHandler = createDragHandler(
                schemaNode.node._key,
                schemaNode.overElement,
                schemaNode.element
            );
            schemaNode.dragHandler = newDragHandler;
            schemaNode.element.addEventListener("mousedown", newDragHandler);

            // Create and attach new resize handler
            const newResizeHandler = createResizeHandler(schemaNode.node._key, schemaNode.overElement, schemaNode.element);
            schemaNode.resizeHandler = newResizeHandler;
            schemaNode.resizeHandle.addEventListener("mousedown", newResizeHandler);
        });
    }, [createDragHandler, createResizeHandler]);

    // Attach motor event listeners
    useEffect(() => {
        if (!gpuMotor.current || !overlayManager.current) return;

        const motor = gpuMotor.current;
        const overlay = overlayManager.current;

        motor.on("nodeEnter", nodeEnter);
        motor.on("nodeLeave", nodeLeave);

        motor.on("reset", onReset);

        const handlePan = () => {
            overlay.requestUpdate();
        };
        const handleZoom = () => {
            overlay.requestUpdate();
        };

        const handleEdgeClick = (edge: Edge, edgeKey: string, ctrlKey: boolean) => {
            // If not ctrl, clear node selection when selecting edge
            if (!ctrlKey) {
                Project.dispatch({
                    field: "selectedNode",
                    value: []
                });
            }

            // Sync motor selection to React context
            const motorSelected = motor.getSelectedEdges();
            Project.dispatch({
                field: "selectedEdge",
                value: motorSelected
            });
        };

        const handleNodeClick = (node: Node<any>, nodeKey: string, ctrlKey: boolean) => {
            // Node selection is handled by nodeEventManager's addSelectedNode
            // We only need to clear edge selection when not using ctrl
            if (!ctrlKey) {
                motor.setSelectedEdges([]);
                Project.dispatch({
                    field: "selectedEdge",
                    value: []
                });
            }
        };

        const handleCanvasClickEmpty = () => {
            // Clear both node and edge selections
            Project.dispatch({
                field: "selectedNode",
                value: []
            });
            motor.setSelectedEdges([]);
            Project.dispatch({
                field: "selectedEdge",
                value: []
            });
        };

        motor.on("pan", handlePan);
        motor.on("zoom", handleZoom);
        motor.on("edgeClick", handleEdgeClick);
        motor.on("nodeClick", handleNodeClick);
        motor.on("canvasClick", handleCanvasClickEmpty);

        return () => {
            motor.off("nodeEnter", nodeEnter);
            motor.off("nodeLeave", nodeLeave);
            motor.off("pan", handlePan);
            motor.off("zoom", handleZoom);
            motor.off("reset", onReset);
            motor.off("edgeClick", handleEdgeClick);
            motor.off("nodeClick", handleNodeClick);
            motor.off("canvasClick", handleCanvasClickEmpty);
        };
    }, [nodeEnter, nodeLeave, onReset]);

    // Sync selected edges from context to motor and renderer
    useEffect(() => {
        if (!gpuMotor.current) return;
        gpuMotor.current.setSelectedEdges(Project.state.selectedEdge);
    }, [Project.state.selectedEdge]);

    // Retry pending node enters when nodeTypeConfig changes
    useEffect(() => {
        if (pendingNodeEnters.current.size === 0) return;

        const nodesToRetry: Array<Node<any>> = [];

        // Check which pending nodes now have their config loaded
        pendingNodeEnters.current.forEach((node, nodeKey) => {
            if (Project.state.nodeTypeConfig[node.type]) {
                nodesToRetry.push(node);
            }
        });

        // Retry entering nodes that now have their config
        if (nodesToRetry.length > 0) {
            console.log(`Retrying nodeEnter for ${nodesToRetry.length} nodes with newly loaded configs`);
            nodesToRetry.forEach(node => {
                nodeEnter(node);
            });
        }
    }, [Project.state.nodeTypeConfig, nodeEnter]);

    // Global trigger function
    useEffect(() => {
        const triggerNodeUpdate = (nodeKey: string) => {
            triggerEventOnNode(nodeKey, "nodeUpdateSystem");
        };

        (window as any).triggerNodeUpdate = triggerNodeUpdate;

        return () => {
            delete (window as any).triggerNodeUpdate;
        };
    }, [triggerEventOnNode]);

    // Selection visual effect using dynamic classes
    useEffect(() => {
        const selectedNodeIds = new Set(Project.state.selectedNode);
        const isSingleSelection = selectedNodeIds.size === 1;

        inSchemaNode.current.forEach((schemaNode, nodeKey) => {
            const isSelected = selectedNodeIds.has(nodeKey);
            const overlay = schemaNode.overElement;
            const element = schemaNode.element;
            const resizeHandle = schemaNode.resizeHandle;

            if (isSelected) {
                // Apply selection classes
                overlay.classList.add(selectedNodeClass);
                element.classList.add(selectedNodeElementClass);

                // Show resize handle only for single selection
                if (isSingleSelection) {
                    resizeHandle.style.opacity = "1";
                    resizeHandle.style.transform = "scale(1)";
                } else {
                    resizeHandle.style.opacity = "0";
                    resizeHandle.style.transform = "scale(0.8)";
                }

                // Increase z-index for selected nodes
                const currentZ = parseInt(overlay.style.zIndex) || 0;
                overlay.style.zIndex = element.style.zIndex = (currentZ + 10000) + "";
            } else {
                // Remove selection classes
                overlay.classList.remove(selectedNodeClass);
                element.classList.remove(selectedNodeElementClass);

                // Hide resize handle
                resizeHandle.style.opacity = "0";
                resizeHandle.style.transform = "scale(0.8)";

                // Restore original z-index (if it was artificially increased)
                const currentZ = parseInt(overlay.style.zIndex) || 0;
                if (currentZ >= 10000) {
                    overlay.style.zIndex = element.style.zIndex = (currentZ - 10000) + "";
                }
            }
        });
    }, [Project.state.selectedNode, selectedNodeClass, selectedNodeElementClass]);

    const onDoubleClick = () => {
        onExitCanvas();
    };

    // Track drag state to distinguish click from drag
    const dragState = useRef({ isDragging: false, startX: 0, startY: 0 });

    const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
        dragState.current.isDragging = false;
        dragState.current.startX = e.clientX;
        dragState.current.startY = e.clientY;
    }, []);

    const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
        if (dragState.current.startX !== 0 || dragState.current.startY !== 0) {
            const dx = Math.abs(e.clientX - dragState.current.startX);
            const dy = Math.abs(e.clientY - dragState.current.startY);
            // Consider it a drag if moved more than 5 pixels
            if (dx > 5 || dy > 5) {
                dragState.current.isDragging = true;
            }
        }
    }, []);

    const handleCanvasMouseUp = useCallback((e: React.MouseEvent) => {
        // If mouseup without dragging
        if (!dragState.current.isDragging && !Project.state.editedHtml) {
            /*if (Project.state.selectedNode.length > 0) {
                Project.dispatch({
                    field: "selectedNode",
                    value: []
                });
            }*/
        }
        // Reset drag state
        dragState.current.isDragging = false;
        dragState.current.startX = 0;
        dragState.current.startY = 0;
    }, [Project.state.selectedNode, Project.state.editedHtml]);

    const handleCanvasClick = useCallback((e: React.MouseEvent) => {
        onCanvasClick(e);
    }, [onCanvasClick]);

    return (
        <div ref={containerRef} style={{height:'100%', width: '100%', backgroundColor:'white', position:"relative"}} >
            <canvas
                ref={canvasRef}
                style={{
                    filter: `invert(${Theme.state.theme === "dark" ? 1 : 0})`,
                    transition: "all 0.25s ease-in-out"
                }}
                data-graph-motor=""
                onDoubleClick={onDoubleClick}
                onClick={handleCanvasClick}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
            />
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
    );
}));
