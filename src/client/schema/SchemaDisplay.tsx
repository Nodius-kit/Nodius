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
import {Node} from "../../utils/graph/graphType";
import {deepCopy, disableTextSelection, enableTextSelection, forwardMouseEvents} from "../../utils/objectUtils";
import {htmlRenderContext, ProjectContext} from "../hooks/contexts/ProjectContext";
import {NodeAnimationManager} from "./nodeAnimations";
import {OverlayManager} from "./overlayManager";
import {NodeEventManager} from "./nodeEventManager";
import {useNodeDragDrop} from "./hooks/useNodeDragDrop";
import {useNodeRenderer} from "./hooks/useNodeRenderer";
import {useDynamicClass} from "../hooks/useDynamicClass";

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
    htmlRenderer?: htmlRenderContext;
    eventManager: NodeEventManager;
    mouseEnterHandler: () => void;
    mouseLeaveHandler: () => void;
    dragHandler: (evt: MouseEvent) => void;
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
                    0 0 0 2px var(--nodius-primary, #3b82f6),
                    0 0 20px 4px rgba(59, 130, 246, 0.4),
                    0 0 40px 8px rgba(59, 130, 246, 0.2),
                    0 8px 16px rgba(0, 0, 0, 0.1);
            }
            50% {
                box-shadow:
                    0 0 0 2px var(--nodius-primary, #3b82f6),
                    0 0 25px 6px rgba(59, 130, 246, 0.5),
                    0 0 50px 12px rgba(59, 130, 246, 0.3),
                    0 8px 16px rgba(0, 0, 0, 0.1);
            }
        }
    `);

    const selectedNodeElementClass = useDynamicClass(`
        & {
            filter: brightness(1.05) !important;
            transition: filter 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
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
        updateZIndex,
        config: {
            posAnimationDelay: 200,
            onUpdate: () => overlayManager.current?.requestUpdate()
        }
    });

    // Node enter handler
    const nodeEnter = useCallback(async (node: Node<any>) => {
        if (!Project.state.nodeTypeConfig[node.type]) {
            console.error("Node type", node.type, "can't be processed");
            return;
        }
        if (!nodeDisplayContainer.current || !gpuMotor.current || !overlayManager.current) return;
        if (inSchemaNode.current.has(node._key)) return;

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
            getHtmlAllRenderer: Project.state.getHtmlAllRenderer!,
            container: nodeHTML,
            overlayContainer: overlay,
            triggerEventOnNode: triggerEventOnNode,
            editedHtml: Project.state.editedHtml,
            editedNodeConfig: Project.state.editedNodeConfig,
            addSelectedNode: (nodeId:string) => {
                Project.state.selectedNode.push(nodeId);
                Project.dispatch({
                    field: "selectedNode",
                    value: [...Project.state.selectedNode]
                })
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
                toWidth?: number;
                toHeight?: number;
            }) | undefined;
            if (!updatedNode) return;

            const updatedConfig = Project.state.nodeTypeConfig[updatedNode.type];
            if (!updatedConfig) return;

            // Update events with latest config
            if (updatedConfig.domEvents) {
                eventManager.updateEvents(updatedConfig.domEvents);
            }

            // Update HTML renderer
            await nodeRenderer.updateRendererDependencies(node._key, updatedNode.type);

            // Trigger nodeUpdate event
            triggerEventOnNode(node._key, "nodeUpdate");

            // Start animation if needed
            if (
                (updatedNode.toPosX !== undefined && updatedNode.toPosX !== updatedNode.posX) ||
                (updatedNode.toPosY !== undefined && updatedNode.toPosY !== updatedNode.posY) ||
                (updatedNode.toWidth !== undefined) ||
                (updatedNode.toHeight !== undefined)
            ) {
                animationManager.current?.startAnimation(
                    updatedNode._key,
                    () => getNode(updatedNode._key) as any,
                    () => {
                        gpuMotor.current?.requestRedraw();
                        overlayManager.current?.requestUpdate();
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

        // handle node config
        /*console.log("aaa0", deepCopy(Project.state.editedNodeConfig), Project.state.editedNodeConfig.node._key === node._key, htmlRenderer, Project.state.openHtmlEditor);
        if(Project.state.editedNodeConfig && Project.state.editedNodeConfig.node._key === node._key && htmlRenderer && Project.state.openHtmlEditor) {
            console.log("aaa");
            nodeHTML.addEventListener("dblclick", () => {
                console.log("click");
                Project.state.openHtmlEditor?.(node._key, htmlRenderer);
            });
        }*/

        // Position overlay
        const transform = gpuMotor.current.getTransform();
        const rect = gpuMotor.current.getNodeScreenRect(node._key)!;

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
            htmlRenderer,
            eventManager,
            mouseEnterHandler: mouseEnter,
            mouseLeaveHandler: mouseLeave,
            dragHandler
        });

        onNodeEnter?.(node);
    }, [
        Project.state.nodeTypeConfig,
        Project.state.initiateNewHtmlRenderer,
        Project.state.openHtmlEditor,
        Project.state.getHtmlRenderer,
        Project.state.getHtmlAllRenderer,
        Project.state.editedNodeConfig,
        createDragHandler,
        getNode,
        nodeRenderer,
        onNodeEnter,
        triggerEventOnNode
    ]);

    // Node leave handler
    const nodeLeave = useCallback((node: Node<any> | undefined, nodeId: string) => {
        if (!nodeDisplayContainer.current) return;

        onNodeLeave?.(node, nodeId);

        if (node) {
            const nodeConfig = Project.state.nodeTypeConfig[node.type];
            if (!nodeConfig || nodeConfig.alwaysRendered) return;
        }

        const schemaNode = inSchemaNode.current.get(nodeId);
        if (schemaNode) {
            nodeDisplayContainer.current.removeChild(schemaNode.element);
            nodeDisplayContainer.current.removeChild(schemaNode.overElement);
            schemaNode.eventManager.dispose();
            nodeRenderer.unregisterRenderer(nodeId);
            overlayManager.current?.removeOverlay(nodeId);
            animationManager.current?.stopAnimation(nodeId);
            inSchemaNode.current.delete(nodeId);
        }
    }, [onNodeLeave, Project.state.nodeTypeConfig, nodeRenderer]);

    // Reset handler
    const onReset = useCallback(() => {
        if (nodeDisplayContainer.current) {
            nodeDisplayContainer.current.innerHTML = "";
        }
        inSchemaNode.current.forEach(schemaNode => {
            schemaNode.eventManager.dispose();
        });
        inSchemaNode.current.clear();
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
                getHtmlAllRenderer: Project.state.getHtmlAllRenderer,
                container: schemaNode.element,
                overlayContainer: schemaNode.overElement,
                triggerEventOnNode: triggerEventOnNode,
                editedHtml: Project.state.editedHtml,
                editedNodeConfig: Project.state.editedNodeConfig,
                addSelectedNode: (nodeId:string) => {
                    Project.state.selectedNode.push(nodeId);
                    Project.dispatch({
                        field: "selectedNode",
                        value: [...Project.state.selectedNode]
                    })
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
        Project.state.getHtmlAllRenderer,
        Project.state.nodeTypeConfig,
        Project.state.editedHtml,
        Project.state.editedNodeConfig,
        Project.state.selectedNode,
        getNode,
        triggerEventOnNode
    ]);

    // Update drag handlers when createDragHandler changes (e.g., when updateGraph changes)
    useEffect(() => {
        inSchemaNode.current.forEach(schemaNode => {
            // Remove old handler
            schemaNode.element.removeEventListener("mousedown", schemaNode.dragHandler);

            // Create and attach new handler
            const newDragHandler = createDragHandler(
                schemaNode.node._key,
                schemaNode.overElement,
                schemaNode.element
            );
            schemaNode.dragHandler = newDragHandler;
            schemaNode.element.addEventListener("mousedown", newDragHandler);
        });
    }, [createDragHandler]);

    // Attach motor event listeners
    useEffect(() => {
        if (!gpuMotor.current || !overlayManager.current) return;

        const motor = gpuMotor.current;
        const overlay = overlayManager.current;

        motor.on("nodeEnter", nodeEnter);
        motor.on("nodeLeave", nodeLeave);
        motor.on("pan", () => overlay.requestUpdate());
        motor.on("zoom", () => overlay.requestUpdate());
        motor.on("reset", onReset);

        return () => {
            motor.off("nodeEnter", nodeEnter);
            motor.off("nodeLeave", nodeLeave);
            motor.off("pan", () => overlay.requestUpdate());
            motor.off("zoom", () => overlay.requestUpdate());
            motor.off("reset", onReset);
        };
    }, [nodeEnter, nodeLeave, onReset]);

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

        inSchemaNode.current.forEach((schemaNode, nodeKey) => {
            const isSelected = selectedNodeIds.has(nodeKey);
            const overlay = schemaNode.overElement;
            const element = schemaNode.element;

            if (isSelected) {
                // Apply selection classes
                overlay.classList.add(selectedNodeClass);
                element.classList.add(selectedNodeElementClass);

                // Increase z-index for selected nodes
                const currentZ = parseInt(overlay.style.zIndex) || 0;
                overlay.style.zIndex = element.style.zIndex = (currentZ + 10000) + "";
            } else {
                // Remove selection classes
                overlay.classList.remove(selectedNodeClass);
                element.classList.remove(selectedNodeElementClass);

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
        // If mouseup without dragging, reset selected nodes
        if (!dragState.current.isDragging) {
            if (Project.state.selectedNode.length > 0) {
                Project.dispatch({
                    field: "selectedNode",
                    value: []
                });
            }
        }
        // Reset drag state
        dragState.current.isDragging = false;
        dragState.current.startX = 0;
        dragState.current.startY = 0;
    }, [Project]);

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
