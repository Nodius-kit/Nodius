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

import {memo, useContext, useEffect, useRef, forwardRef, useCallback, useMemo} from "react";
import {WebGpuMotor} from "./motor/webGpuMotor/index";
import {ThemeContext} from "../hooks/contexts/ThemeContext";
import {Edge, Node, NodeTypeEntryType} from "../../utils/graph/graphType";
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
import {useStableProjectRef} from "../hooks/useStableProjectRef";
import {generateInstructionsToMatch, Instruction} from "../../utils/sync/InstructionBuilder";
import {WorkflowManager} from "../../process/workflow/WorkflowManager";
import {HtmlObject} from "../../utils/html/htmlType";
import {findFirstNodeWithId, findNodeConnected} from "../../utils/graph/nodeUtils";

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

export interface updateNodeOption {
    dontUpdateRender?:boolean
}

export interface GraphWorkFlowMemoryStorage {
    workflowMode: boolean,
    [key: string]: any
}

export interface GraphWorkflowMemory {
    storage: Partial<GraphWorkFlowMemoryStorage>
}



export const SchemaDisplay = memo(forwardRef<WebGpuMotor, SchemaDisplayProps>(({
    onExitCanvas,
    onNodeEnter,
    onNodeLeave,
    onCanvasClick
}, motorRef) => {

    const Project = useContext(ProjectContext);
    const projectRef = useStableProjectRef(); // Stable ref for DOM events and callbacks
    const Theme = useContext(ThemeContext);

    const canvasRef = useRef<HTMLCanvasElement|null>(null);
    const containerRef = useRef<HTMLDivElement|null>(null);
    const nodeDisplayContainer = useRef<HTMLDivElement>(null);
    const overlayContainer = useRef<HTMLDivElement>(null);

    const gpuMotor = useRef<WebGpuMotor>(undefined);
    const zIndex = useRef<number>(1);
    const inSchemaNode = useRef<Map<string, SchemaNodeInfo>>(new Map());
    const pendingNodeEnters = useRef<Map<string, Node<any>>>(new Map());

    // Managers
    const animationManager = useRef<NodeAnimationManager>(undefined);
    const overlayManager = useRef<OverlayManager>(undefined);
    const workflowManager = useRef<WorkflowManager>(undefined);

    const graphMemoryWorkflow = useRef<GraphWorkflowMemory>({
        storage: {

        }
    })

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

        // Initialize managers (created once, stored in refs for stability)
        animationManager.current = new NodeAnimationManager({
            springStiffness: 100,
            damping: 2 * Math.sqrt(100)
        });
        overlayManager.current = new OverlayManager(motor);
        workflowManager.current = new WorkflowManager();

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
            workflowManager.current?.dispose();


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
    });


    // Helper functions - Using projectRef for stable callbacks without recreating on every state change
    const getNode = useCallback((nodeKey: string) => {
        return projectRef.current.state.graph?.sheets[projectRef.current.state.selectedSheetId!]?.nodeMap.get(nodeKey);
    }, []); // Empty deps - always use fresh ref

    const updateZIndex = useCallback((element: HTMLElement, overlay: HTMLElement, currentZIndex: number) => {
        const currentZ = currentZIndex ? currentZIndex : (overlay.style.zIndex === "" ? 0 : parseInt(overlay.style.zIndex));
        if (currentZ < zIndex.current) {
            zIndex.current++;
            element.style.zIndex = (zIndex.current) + "";
            overlay.style.zIndex = (zIndex.current) + ""
            return zIndex.current;
        }
        return currentZ;
    }, []); // No deps - pure DOM manipulation

    const triggerEventOnNode = useCallback((nodeId: string, eventName: string, options?: updateNodeOption) => {
        const nodeElement = document.querySelector(`[data-node-key="${nodeId}"]`);
        if (nodeElement) {
            const updateEvent = new CustomEvent(eventName, { bubbles: false, detail: options });
            nodeElement.dispatchEvent(updateEvent);
        }
    }, []); // No deps - pure DOM manipulation

    // Clean root node HTML (remove workflow renderers, keep base renderer)
    const cleanRootNodeHtml = useCallback(() => {
        const rootSchemaNode = inSchemaNode.current.get('root');
        if (!rootSchemaNode) return;


        // Remove all workflow HTML renderers
        /*workflowHtmlRenderers.current.forEach((renderer, id) => {
            projectRef.current.state.removeHtmlRenderer!("root", id);
            renderer.htmlMotor.dispose();
        });*/

        for(const [key, renderer] of Object.entries(projectRef.current.state.getHtmlRenderer!("root") ?? {})) {
            renderer.htmlMotor.dispose();
            projectRef.current.state.removeHtmlRenderer!("root", key);
        }


        // Clear root node container (will be re-rendered with base config)
        rootSchemaNode.element.innerHTML = '';


        // Re-render base HTML if node has content
        /*const rootNode = getNode('root');
        if (rootNode && projectRef.current.state.nodeTypeConfig[rootNode.type]?.content) {
            const nodeConfig = projectRef.current.state.nodeTypeConfig[rootNode.type];
            projectRef.current.state.initiateNewHtmlRenderer?.(
                rootNode,
                "",
                rootSchemaNode.element,
                nodeConfig.content!,
                { noFirstRender: false }
            ).then(renderer => {
                if (renderer) {
                    renderer.htmlMotor.render(nodeConfig.content!);
                }
            });
        }*/
    }, [getNode]);

    // Start workflow execution
    const startWorkflow = useCallback(() => {
        if (!workflowManager.current || !projectRef.current.state.graph || !projectRef.current.state.selectedSheetId) {
            return;
        }

        const sheet = projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId];
        if (!sheet) {
            return;
        }


        // Clean root node HTML before starting
        cleanRootNodeHtml();

        // Convert nodeMap and edgeMap to arrays
        const nodes = Array.from(sheet.nodeMap.values());
        const edges: Edge[] = [];
        for(const key of sheet.edgeMap.keys()) {
            if(key.startsWith("source-")) {
                edges.push(...sheet.edgeMap.get(key)!);
            }
        }

        // Get entry data from entryType node
        const nodeRoot = findFirstNodeWithId(projectRef.current.state.graph, "root")!;
        let nodeTypeEntre: Node<NodeTypeEntryType> | undefined = undefined;
        if(! (!nodeRoot || nodeRoot.handles["0"] == undefined || nodeRoot.handles["0"].point.length == 0)) {
            const connectedNodeToEntry = findNodeConnected(projectRef.current.state.graph, nodeRoot, "in");
            nodeTypeEntre = connectedNodeToEntry.find((n) => n.type === "entryType") as Node<NodeTypeEntryType>;
        }

        // Execute workflow with callbacks
        workflowManager.current.executeWorkflow(
            nodes,
            edges,
            "root",
            nodeTypeEntre?.data?.fixedValue || {},
            projectRef.current.state.nodeTypeConfig,
            {
                onComplete: (totalTimeMs: number, data: any) => {
                    console.log(`[SchemaDisplay] Workflow completed in ${totalTimeMs}ms`, data);
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

                    const existingRenderer = projectRef.current.state.getHtmlRenderer!("root")?.[renderId];
                    if (existingRenderer) {
                        existingRenderer.htmlMotor.dispose();
                        projectRef.current.state.removeHtmlRenderer!("root", renderId);
                    }

                    // Create new workflow HTML renderer
                    const rootNode = getNode('root');
                    if (rootNode) {
                        const renderer = await projectRef.current.state.initiateNewHtmlRenderer?.(
                            rootNode,
                            `workflow-${renderId}`,
                            container,
                            html,
                            { noFirstRender: true, workflowMode: true }
                        );

                        if (renderer) {
                            await renderer.htmlMotor.render(html);
                        }
                    }
                },
                onUpdateHtml: async (instructions: Instruction[], id?: string) => {
                    console.log('[SchemaDisplay] Update HTML render', { id, instructions });

                    const renderId = id || '';
                    const renderer =  projectRef.current.state.getHtmlRenderer!("root")?.[renderId];

                    if (!renderer) {
                        console.warn(`[SchemaDisplay] No workflow renderer found with id: ${renderId}`);
                        return;
                    }

                    // Apply instructions to the renderer's HTML object
                    for (const instruction of instructions) {
                        //await renderer.htmlMotor.applyInstruction(instruction);
                    }
                }
            }
        );
    }, [getNode, cleanRootNodeHtml]);

    // Stop workflow execution
    const stopWorkflow = useCallback(async () => {
        if (workflowManager.current) {
            await workflowManager.current.cancelExecution();
        }

        // Restore base HTML render
        cleanRootNodeHtml();
    }, [cleanRootNodeHtml, nodeRenderer]);

    // Reset workflow (restart from beginning)
    const resetWorkflow = useCallback(() => {

        // Stop current execution
        stopWorkflow().then(() => {
            // If workflow is ON, restart it
            if (graphMemoryWorkflow.current.storage.workflowMode) {
                startWorkflow();
            }
        });
    }, [stopWorkflow, startWorkflow]);

    const { updateHandleOverlay, cleanupHandleOverlay} = useHandleRenderer({
        getNode: getNode,
        gpuMotor: gpuMotor.current!,
        getProjectRef: () => projectRef.current, // Pass getter instead of individual state pieces
    });


    // Drag and drop hook - Using projectRef for stable reference
    const { createDragHandler } = useNodeDragDrop({
        gpuMotor: gpuMotor.current!,
        getNode: getNode,
        getProjectRef: () => projectRef.current,
        isNodeAnimating: (nodeKey) => {
            const node = getNode(nodeKey) as any;
            return node && ("toPosX" in node || "toPosY" in node);
        },
        updateZIndex: updateZIndex,
        config: {
            posAnimationDelay: 200
        }
    });

    // Resize hook - Using projectRef for stable reference
    const { createResizeHandler } = useNodeResize({
        gpuMotor: gpuMotor.current!,
        getNode: getNode,
        getProjectRef: () => projectRef.current,
        updateZIndex: updateZIndex,
        config: {
            sizeAnimationDelay: 200,
            minWidth: 50,
            minHeight: 50,
        }
    });


    // Node enter handler
    const nodeEnter = useCallback(async (node: Node<any>) => {
        // Use projectRef for all Project.state accesses to avoid stale closures
        const nodeConfig = projectRef.current.state.nodeTypeConfig[node.type];

        if (!nodeConfig) {
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

        // Add workflow mode switch for root node
        if (node._key === "root") {
            const switchContainer = document.createElement('div');
            switchContainer.style.cssText = `
                position: absolute;
                top: -48px;
                right: 8px;
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 6px 10px;
                background-color: var(--nodius-background-paper);
                border-radius: 8px;
                border: 1px solid var(--nodius-primary-dark);
                box-shadow: var(--nodius-shadow-2);
                z-index: 10;
                transition: var(--nodius-transition-default);
                pointer-events: all;
            `;

            const label = document.createElement('label');
            label.htmlFor = 'workflowModeSwitch';
            label.textContent = 'Execute WorkFlow';
            label.style.cssText = `
                font-size: 12px;
                font-weight: 600;
                color: var(--nodius-text-primary);
                cursor: pointer;
                user-select: none;
            `;

            const switchLabel = document.createElement('label');
            switchLabel.style.cssText = `
                position: relative;
                display: inline-block;
                width: 40px;
                height: 22px;
            `;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'workflowModeSwitch';
            checkbox.checked = graphMemoryWorkflow.current.storage.workflowMode == true;
            checkbox.style.cssText = `
                opacity: 0;
                width: 0;
                height: 0;
            `;

            const slider = document.createElement('span');
            slider.style.cssText = `
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: var(--nodius-grey-600);
                transition: var(--nodius-transition-default);
                border-radius: 22px;
            `;

            const sliderBefore = document.createElement('span');
            sliderBefore.style.cssText = `
                position: absolute;
                content: '';
                height: 16px;
                width: 16px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: var(--nodius-transition-default);
                border-radius: 50%;
            `;

            slider.appendChild(sliderBefore);

            const resetButton = document.createElement('button');

            // Click event handler - start/stop workflow
            checkbox.addEventListener('click', async (e) => {
                e.stopPropagation();
                const isChecked = !graphMemoryWorkflow.current.storage.workflowMode;
                checkbox.checked = isChecked;
                if (isChecked) {
                    slider.style.backgroundColor = 'var(--nodius-success-main)';
                    sliderBefore.style.transform = 'translateX(18px)';
                    graphMemoryWorkflow.current.storage.workflowMode = true;
                    resetButton.style.display = "flex";
                    await (window as any).triggerWorkflowStart?.();
                } else {
                    slider.style.backgroundColor = 'var(--nodius-grey-600)';
                    sliderBefore.style.transform = 'translateX(0)';
                    graphMemoryWorkflow.current.storage.workflowMode = false;
                    resetButton.style.display = "none";
                    await (window as any).triggerWorkflowStop?.();
                    if (nodeConfig.content) {
                        // Use projectRef for fresh initiateNewHtmlRenderer
                        htmlRenderer = await projectRef.current.state.initiateNewHtmlRenderer!(
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
                    triggerEventOnNode("root", "nodeEnter");
                }
            });

            // Reset button
            resetButton.textContent = '↻ Reset';
            resetButton.style.cssText = `
                padding: 4px 12px;
                background-color: var(--nodius-warning-main);
                color: var(--nodius-warning-contrastText);
                border: none;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: var(--nodius-transition-default);
                user-select: none;
                align-items: center;
                gap: 4px;
            `;
            resetButton.style.display = "none";

            resetButton.addEventListener('mouseenter', () => {
                resetButton.style.backgroundColor = 'var(--nodius-warning-dark)';
                resetButton.style.transform = 'scale(1.05)';
            });
            resetButton.addEventListener('mouseleave', () => {
                resetButton.style.backgroundColor = 'var(--nodius-warning-main)';
                resetButton.style.transform = 'scale(1)';
            });
            resetButton.addEventListener('mousedown', () => {
                resetButton.style.transform = 'scale(0.95)';
            });
            resetButton.addEventListener('mouseup', () => {
                resetButton.style.transform = 'scale(1.05)';
            });
            resetButton.addEventListener('click', (e) => {
                e.stopPropagation();
                (window as any).triggerWorkflowReset?.();
            });

            switchLabel.appendChild(checkbox);
            switchLabel.appendChild(slider);
            switchContainer.appendChild(label);
            switchContainer.appendChild(switchLabel);
            switchContainer.appendChild(resetButton);
            overlay.appendChild(switchContainer);
        }

        // Resize handler
        const resizeHandler = createResizeHandler(node._key, overlay, nodeHTML);
        resizeHandle.addEventListener("mousedown", resizeHandler);

        // Drag handler
        const dragHandler = createDragHandler(node._key, overlay, nodeHTML);
        nodeHTML.addEventListener("mousedown", dragHandler);

        // Create event manager - using getter for fresh context
        const eventManager = new NodeEventManager(
            nodeHTML,
            overlay,
            // Context getter - returns fresh state on each call
            () => ({
                gpuMotor: gpuMotor.current!,
                getNode: () => getNode(node._key),
                openHtmlEditor: projectRef.current.state.openHtmlEditor!,
                getHtmlRenderer: projectRef.current.state.getHtmlRenderer!,
                initiateNewHtmlRenderer: projectRef.current.state.initiateNewHtmlRenderer!,
                removeHtmlRenderer: projectRef.current.state.removeHtmlRenderer!,
                getHtmlAllRenderer: projectRef.current.state.getHtmlAllRenderer!,
                container: nodeHTML,
                overlayContainer: overlay,
                triggerEventOnNode: triggerEventOnNode,
                editedHtml: projectRef.current.state.editedHtml,
                editedNodeConfig: projectRef.current.state.editedNodeConfig,
                currentEntryDataType: projectRef.current.state.currentEntryDataType,
                addSelectedNode: (nodeId:string, ctrlKey) => {
                    if (ctrlKey) {
                        if (projectRef.current.state.selectedNode.includes(nodeId)) {
                            projectRef.current.dispatch({
                                field: "selectedNode",
                                value: projectRef.current.state.selectedNode.filter(id => id !== nodeId)
                            });
                        } else {
                            projectRef.current.dispatch({
                                field: "selectedNode",
                                value: [...projectRef.current.state.selectedNode, nodeId]
                            });
                        }
                    } else {
                        projectRef.current.dispatch({
                            field: "selectedNode",
                            value: [nodeId]
                        });
                        projectRef.current.dispatch({
                            field: "selectedEdge",
                            value: []
                        });
                    }
                },
                selectedNode: projectRef.current.state.selectedNode,
                dataTypes: projectRef.current.state.dataTypes!,
                updateNode: async (node:Node<any>) => {
                    const currentNode = projectRef.current.state.graph!.sheets[projectRef.current.state.selectedSheetId!].nodeMap.get(node._key);
                    if(!currentNode) {
                        return  {
                            status: false,
                            timeTaken: 0,
                            reason: "Node with key "+node._key+" don't exist"
                        }
                    }
                    const instructions = generateInstructionsToMatch(currentNode, node);
                    if(instructions.length > 0) {
                        return await projectRef.current.state.updateGraph!(instructions.map((i) => ({
                            nodeId: currentNode._key,
                            i: i
                        })))
                    } else {
                        return {
                            status: true,
                            timeTaken: 0
                        }
                    }
                },
                graphMemoryWorkflow: graphMemoryWorkflow.current
            }),
            // Stable context - values that don't change
            {
                gpuMotor: gpuMotor.current!,
                getNode: () => getNode(node._key),
                container: nodeHTML,
                overlayContainer: overlay,
                triggerEventOnNode: triggerEventOnNode
            }
        );

        // Attach events
        if (nodeConfig.domEvents) {
            eventManager.attachEvents(nodeConfig.domEvents);
        }

        // Handle node updates
        const handleNodeUpdate = async (evt:CustomEvent) => {
            const updatedNode = getNode(node._key) as (Node<any> & {
                toPosX?: number;
                toPosY?: number;
                size: {
                    toWidth?: number;
                    toHeight?: number;
                }
            }) | undefined;

            const detail = evt.detail as updateNodeOption | undefined;

            if (!updatedNode) {
                return;
            }

            // Get fresh config via projectRef
            const updatedConfig = projectRef.current.state.nodeTypeConfig[updatedNode.type];
            if (!updatedConfig) return;

            // Update events with latest config
            if (updatedConfig.domEvents) {
                eventManager.updateEvents(updatedConfig.domEvents);
            }

            // Update HTML renderer
            if(!detail?.dontUpdateRender) {
                await nodeRenderer.updateRendererDependencies(node._key, updatedNode.type);
            }

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

        nodeHTML.addEventListener("nodeUpdateSystem" as any, handleNodeUpdate);

        // Initialize HTML renderer
        let htmlRenderer: htmlRenderContext | undefined;
        if (nodeConfig.content) {
            // Use projectRef for fresh initiateNewHtmlRenderer
            htmlRenderer = await projectRef.current.state.initiateNewHtmlRenderer!(
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
        // Removed all Project.state dependencies - now using projectRef
        // Only stable dependencies remain
        createDragHandler,       // Stable (uses projectRef internally)
        createResizeHandler,     // Stable (uses projectRef internally)
        resizeHandleClass,       // Stable CSS class
        getNode,                 // Stable callback
        nodeRenderer,            // Hook instance
        onNodeEnter,             // Prop callback
        triggerEventOnNode,      // Stable callback
        updateHandleOverlay      // Stable callback
    ]);

    // Node leave handler
    const nodeLeave = useCallback((node: Node<any> | undefined, nodeId: string) => {
        if (!nodeDisplayContainer.current) return;

        onNodeLeave?.(node, nodeId);

        // Remove from pending queue if it was there
        pendingNodeEnters.current.delete(nodeId);

        if (node) {
            // Use projectRef for fresh nodeTypeConfig
            const nodeConfig = projectRef.current.state.nodeTypeConfig[node.type];
            if (!nodeConfig || nodeConfig.alwaysRendered) return;
        }

        // Use projectRef for fresh removeHtmlRenderer
        if(projectRef.current.state.removeHtmlRenderer) {
            projectRef.current.state.removeHtmlRenderer(nodeId, "");
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
    }, [onNodeLeave, nodeRenderer, cleanupHandleOverlay]); // Removed Project.state dependencies

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

    // Update event listeners when nodeTypeConfig changes (only update events, not context)
    // Context is now fetched fresh via getter on each event, so no need to update it
    useEffect(() => {
        inSchemaNode.current.forEach(schemaNode => {
            const nodeConfig = projectRef.current.state.nodeTypeConfig[schemaNode.node.type];
            schemaNode.eventManager.removeEvents();
            if(nodeConfig?.domEvents) {
                schemaNode.eventManager.attachEvents(nodeConfig.domEvents);
            }
        });
    }, [Project.state.nodeTypeConfig]); // Only dependency: nodeTypeConfig

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
        const triggerNodeUpdate = (nodeKey: string, options?: updateNodeOption) => {
            triggerEventOnNode(nodeKey, "nodeUpdateSystem", options);
        };

        (window as any).triggerNodeUpdate = triggerNodeUpdate;
        (window as any).triggerWorkflowStart = startWorkflow;
        (window as any).triggerWorkflowStop = stopWorkflow;
        (window as any).triggerWorkflowReset = resetWorkflow;

        return () => {
            delete (window as any).triggerNodeUpdate;
            delete (window as any).triggerWorkflowStart;
            delete (window as any).triggerWorkflowStop;
            delete (window as any).triggerWorkflowReset;
        };
    }, [triggerEventOnNode, startWorkflow, stopWorkflow, resetWorkflow]);

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
                overlay.style.zIndex = (currentZ) + "";
                element.style.zIndex = (currentZ) + "";
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
    const selectingState = useRef<{isSelecting:boolean, startX: number, startY:number, endX:number, endY:number, container?:HTMLElement}>({isSelecting:false, startX: 0, startY:0, endX:0, endY:0, container:undefined})

    const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
        if(e.button === 1) {
            dragState.current.isDragging = false;
            dragState.current.startX = e.clientX;
            dragState.current.startY = e.clientY;
        } else if(e.button === 0 && !selectingState.current.isSelecting) {
            const element = document.elementFromPoint(e.clientX, e.clientY);
            if(!element || element.tagName.toLowerCase() !== "canvas") {
                return;
            }

            selectingState.current.isSelecting = true;
            selectingState.current.startX = e.clientX;
            selectingState.current.startY = e.clientY;
            selectingState.current.endX = e.clientX;
            selectingState.current.endY = e.clientY;


            selectingState.current.container?.remove();
            selectingState.current.container = document.createElement("div");
            selectingState.current.container.style.position = "absolute";
            selectingState.current.container.style.pointerEvents = "none";
            selectingState.current.container.style.border = "1px solid var(--nodius-primary-main)";
            selectingState.current.container.style.top = "-100px";
            selectingState.current.container.style.left = "-100px";
            selectingState.current.container.style.width = "0px";
            selectingState.current.container.style.height = "0px";
        }
    }, []);

    const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
        if (e.button === 1 && (dragState.current.startX !== 0 || dragState.current.startY !== 0)) {
            const dx = Math.abs(e.clientX - dragState.current.startX);
            const dy = Math.abs(e.clientY - dragState.current.startY);
            // Consider it a drag if moved more than 5 pixels
            if (dx > 5 || dy > 5) {
                dragState.current.isDragging = true;
            }
        } else if(e.button === 0 && selectingState.current.isSelecting && selectingState.current.container) {

            selectingState.current.endX = e.clientX;
            selectingState.current.endY = e.clientY;

            const isFartherThan = (x1:number, y1:number, x2:number, y2:number, distance:number) => {
                const dx = x2 - x1;
                const dy = y2 - y1;
                const distSquared = dx * dx + dy * dy;
                return distSquared > distance * distance;
            }
            if(!selectingState.current.container.parentElement && isFartherThan(selectingState.current.startX, selectingState.current.startY, selectingState.current.endX, selectingState.current.endY, 5)) {
                overlayContainer.current!.appendChild(selectingState.current.container!);
            }

            if(selectingState.current.container.parentElement) {
                selectingState.current.endX = e.clientX;
                selectingState.current.endY = e.clientY;

                const minX = Math.min(selectingState.current.endX, selectingState.current.startX);
                const minY = Math.min(selectingState.current.endY, selectingState.current.startY);

                const maxX = Math.max(selectingState.current.endX, selectingState.current.startX);
                const maxY = Math.max(selectingState.current.endY, selectingState.current.startY);

                const worldMin = gpuMotor.current!.screenToWorld({
                    x: minX,
                    y: minY
                });
                const worldMax = gpuMotor.current!.screenToWorld({
                    x: maxX,
                    y: maxY
                });

                const newSelectedNode: string[] = [];
                const newSelectedEdge: string[] = [];
                for (const [key, node] of projectRef.current.state.graph!.sheets[projectRef.current.state.selectedSheetId!].nodeMap.entries()) {
                    if (node.posX > worldMin.x && node.posY > worldMin.y && node.posX + node.size.width < worldMax.x && node.posY + node.size.height < worldMax.y) {
                        newSelectedNode.push(key);
                    }
                }
                for (const selectedNode of newSelectedNode) {
                    const node = projectRef.current.state.graph!.sheets[projectRef.current.state.selectedSheetId!].nodeMap.get(selectedNode)!;
                    const edgesTarget = projectRef.current.state.graph!.sheets[projectRef.current.state.selectedSheetId!].edgeMap.get("target-" + node._key) ?? [];
                    const edgesSource = projectRef.current.state.graph!.sheets[projectRef.current.state.selectedSheetId!].edgeMap.get("source-" + node._key) ?? [];
                    for (const edgeTarget of edgesTarget) {
                        if (newSelectedNode.some((n) => n === edgeTarget.source) && !newSelectedEdge.includes(edgeTarget._key)) {
                            newSelectedEdge.push(edgeTarget._key);
                        }
                    }
                    for (const edgeSource of edgesSource) {
                        if (newSelectedNode.some((n) => n === edgeSource.source) && !newSelectedEdge.includes(edgeSource._key)) {
                            newSelectedEdge.push(edgeSource._key);
                        }
                    }
                }

                projectRef.current.dispatch({
                    field: "selectedNode",
                    value: newSelectedNode
                });
                projectRef.current.dispatch({
                    field: "selectedEdge",
                    value: newSelectedEdge
                })

                // Get container offset to convert clientX/Y to container-relative coordinates
                const containerRect = containerRef.current!.getBoundingClientRect();

                const left = minX - containerRect.left;
                const top = minY - containerRect.top;
                const width = maxX - minX;
                const height = maxY - minY;

                selectingState.current.container.style.left = left + "px";
                selectingState.current.container.style.top = top + "px";
                selectingState.current.container.style.width = width + "px";
                selectingState.current.container.style.height = height + "px";
            }

        }
    }, []);

    const handleCanvasMouseUp = useCallback((e: React.MouseEvent) => {
        // If mouseup without dragging
        if(e.button === 1) {
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
        } else if(e.button === 0 && selectingState.current.isSelecting && selectingState.current.container) {
            selectingState.current.isSelecting = false;
            if(!selectingState.current.container.parentElement) {
                // it mean it didn't to a selection, only a click
                projectRef.current.dispatch({
                    field: "selectedNode",
                    value: []
                });
                projectRef.current.dispatch({
                    field: "selectedEdge",
                    value: []
                });
                gpuMotor.current!.setSelectedEdges([]);
            } else {
                selectingState.current.container.remove();
            }
        }
    }, [Project.state.selectedNode, Project.state.editedHtml]);

    const handleCanvasClick = useCallback((e: React.MouseEvent) => {
        onCanvasClick(e);
    }, [onCanvasClick]);

    useEffect(() => {
        requestAnimationFrame(() => {
            for(const schema of inSchemaNode.current.values()) {
                schema.element.dispatchEvent(new CustomEvent("entryDataType"));
            }
        });
    }, [Project.state.currentEntryDataType]);

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
            <div
                ref={overlayContainer}
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
