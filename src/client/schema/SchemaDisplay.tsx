import {memo, useContext, useEffect, useRef, forwardRef, useLayoutEffect} from "react";
import {WebGpuMotor} from "./motor/webGpuMotor";
import {ThemeContext} from "../hooks/contexts/ThemeContext";
import {Node} from "../../utils/graph/graphType";
import {disableTextSelection, enableTextSelection, forwardMouseEvents} from "../../utils/objectUtils";
import {AsyncFunction, HtmlRender} from "../../process/html/HtmlRender";
import {htmlRenderContext, ProjectContext} from "../hooks/contexts/ProjectContext";
import {OpenHtmlEditorFct} from "../App";
import {InstructionBuilder} from "../../utils/sync/InstructionBuilder";
import {GraphInstructions} from "../../utils/sync/wsObject";

interface SchemaDisplayProps {
    onExitCanvas: () => void,
    onCanvasClick: (evt:React.MouseEvent) => void,
    openHtmlEditor: OpenHtmlEditorFct,
    onNodeEnter?: (node: Node<any>) => void,
    onNodeLeave?: (node: Node<any>|undefined, nodeId:string) => void,
}
export const SchemaDisplay = memo(forwardRef<WebGpuMotor, SchemaDisplayProps>(({
    onExitCanvas,
    openHtmlEditor,
    onNodeEnter,
    onNodeLeave,
    onCanvasClick
}, motorRef) => {

    const Project = useContext(ProjectContext);

    const canvasRef = useRef<HTMLCanvasElement|null>(null);
    const containerRef = useRef<HTMLDivElement|null>(null);

    const gpuMotor = useRef<WebGpuMotor>(undefined);

    const Theme = useContext(ThemeContext);

    const zIndex = useRef<number>(1);

    const updateOverlayFrameId = useRef<number|undefined>(undefined);
    const animatePosChangeFrameId = useRef<Record<string, {id:number}>>({});
    const posAnimationDelay = 300;
    const posAnimationStep = 5;




    useEffect(() => {
        if (!containerRef.current || !canvasRef.current) return;

        const motor = new WebGpuMotor();

        // assign motor to forwarded ref properly
        if (typeof motorRef === "function") {
            motorRef(motor);
        } else if (motorRef) {
            motorRef.current = motor;
        }
        gpuMotor.current = motor;

        motor
            .init(containerRef.current, canvasRef.current, {
                backgroundType: "dotted"
            })
            .then(() => {
                motor.resetViewport();
                motor.enableInteractive(true);
            });

        // optional: cleanup when unmounting
        return () => {
            if (motorRef && typeof motorRef !== "function") {
                motorRef.current = null;
            }
        };
    }, [motorRef]);



    const inSchemaNode = useRef<{
        node:Node<any>,
        element:HTMLElement,
        overElement:HTMLElement,
        htmlRenderer?: htmlRenderContext,
    }[]>([]);
    const nodeDisplayContainer = useRef<HTMLDivElement>(null);

    // Track previous dependency values to detect changes
    const previousDependencies = useRef<{
        currentEntryDataType?: any,
        enumTypes?: any[],
        dataTypes?: any[],
    }>({});

    useLayoutEffect(() => {
        if(!gpuMotor.current || !Project.state.graph) return;

        const updateOverlays = () => {
            if(!nodeDisplayContainer.current) return;
            if(!gpuMotor.current) return;
            const transform = gpuMotor.current.getTransform();

            for(let i = 0; i < inSchemaNode.current.length; i++) {
                inSchemaNode.current[i].overElement.style.zoom = inSchemaNode.current[i].element.style.zoom = transform.scale+"";
                const rect = gpuMotor.current.getNodeScreenRect(inSchemaNode.current[i].node._key);
                if(!rect) {
                    continue;
                }
                inSchemaNode.current[i].overElement.style.left = inSchemaNode.current[i].element.style.left = `${rect.x / transform.scale}px`;
                inSchemaNode.current[i].overElement.style.top = inSchemaNode.current[i].element.style.top = `${rect.y / transform.scale}px`;
                inSchemaNode.current[i].overElement.style.width = inSchemaNode.current[i].element.style.width = `${rect.width / transform.scale}px`;
                inSchemaNode.current[i].overElement.style.height = inSchemaNode.current[i].element.style.height = `${rect.height / transform.scale}px`;
            }
        };

        const requestUpdateOverlay = () => {
            if(updateOverlayFrameId.current) cancelAnimationFrame(updateOverlayFrameId.current)
            updateOverlayFrameId.current = requestAnimationFrame(updateOverlays);
        }

        // Function to update HTML renderer dependencies and re-render
        const updateHtmlRendererDependencies = async () => {
            for(let i = 0; i < inSchemaNode.current.length; i++) {
                const {htmlRenderer, node} = inSchemaNode.current[i];
                if(htmlRenderer) {
                    // Update global storage variables
                    htmlRenderer.htmlMotor.setVariableInGlobalStorage("allDataTypes", Project.state.dataTypes);
                    htmlRenderer.htmlMotor.setVariableInGlobalStorage("allEnumTypes", Project.state.enumTypes);
                    htmlRenderer.htmlMotor.setVariableInGlobalStorage("globalCurrentEntryDataType", Project.state.currentEntryDataType);

                    // Trigger re-render by getting the current content
                    const nodeConfig = Project.state.nodeTypeConfig[node.type];
                    if(nodeConfig?.content) {
                        await htmlRenderer.htmlMotor.render(nodeConfig.content);
                    }
                }
            }
        };

        // Function to dispatch nodeUpdate event for a specific node
        const dispatchNodeUpdateEvent = (nodeKey: string) => {
            const nodeElement = document.querySelector(`[data-node-key="${nodeKey}"]`);
            if(nodeElement) {
                const updateEvent = new CustomEvent("nodeUpdate", {
                    bubbles: false,
                    detail: { nodeKey }
                });
                nodeElement.dispatchEvent(updateEvent);
            }
        };
        const nodeEnter = async (node: Node<any>) => {
            if(!Project.state.nodeTypeConfig[node.type]) {
                console.error("Node type", node.type, "can't be processed");
                return;
            }
            if(!nodeDisplayContainer.current) return;
            if(!gpuMotor.current) return;
            if(inSchemaNode.current.findIndex((n) => n.node._key === node._key) === -1) {
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

                overlay.style.borderRadius = nodeConfig.border.radius+"px";
                nodeHTML.style.borderRadius = nodeConfig.border.radius+"px";
                overlay.style.outline = `${nodeConfig.border.width}px ${nodeConfig.border.type} ${nodeConfig.border.normal.color}`;

                const mouseEnter = () => {
                    overlay.style.outline = `${nodeConfig.border.width}px ${nodeConfig.border.type} ${nodeConfig.border.hover.color}`;
                }
                const mouseLeave = () => {
                    overlay.style.outline = `${nodeConfig.border.width}px ${nodeConfig.border.type} ${nodeConfig.border.normal.color}`;
                }

                overlay.addEventListener("mouseenter",mouseEnter)
                nodeHTML.addEventListener("mouseenter", mouseEnter);
                overlay.addEventListener("mouseleave",mouseLeave)
                nodeHTML.addEventListener("mouseleave", mouseLeave);


                const mouseDown = (evt:MouseEvent) => {

                    if(!gpuMotor.current!.isInteractive()) {
                        return;
                    }

                    if((overlay.style.zIndex == "" ? 0 : parseInt(overlay.style.zIndex)) < zIndex.current) {
                        zIndex.current++;
                        overlay.style.zIndex = nodeHTML.style.zIndex = zIndex.current+"";
                    }


                    let lastSavedX = node.posX;
                    let lastSavedY = node.posY;
                    let lastSaveTime = Date.now();

                    let lastX = evt.clientX;
                    let lastY = evt.clientY;


                    gpuMotor.current!.enableInteractive(false);

                    let animationFrame:number|undefined;

                    disableTextSelection();

                    const saveNodePosition = (currentNode:Node<any>) => {
                        const insts:Array<GraphInstructions> = [];
                        const instructionsX = new InstructionBuilder();
                        const instructionsY = new InstructionBuilder();
                        instructionsX.key("posX").set(currentNode.posX);
                        instructionsY.key("posY").set(currentNode.posY);

                        insts.push({
                            i: instructionsX.instruction,
                            nodeId: currentNode._key,
                            animatePos: true,
                            dontApplyToMySelf: true,
                        },
                        {
                            i: instructionsY.instruction,
                            nodeId: currentNode._key,
                            animatePos: true,
                            dontApplyToMySelf: true,
                        });
                        Project.state.updateGraph!(insts);
                    }

                    const mouseMove = (evt:MouseEvent) => {
                        if(animationFrame) cancelAnimationFrame(animationFrame);
                        animationFrame = requestAnimationFrame(() => {
                            if(!Project.state.graph) return;
                            if(!Project.state.selectedSheetId) return;
                            if(!node) return;

                            // because each time node is updated, his ref change we have to take it back
                            const currentNode = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(node!._key);
                            if(!currentNode) return;

                            const newX = evt.clientX;
                            const newY = evt.clientY;

                            const deltaX = newX - lastX;
                            const deltaY = newY - lastY;


                            const worldDeltaX = deltaX / (gpuMotor.current!.getTransform().scale);
                            const worldDeltaY = deltaY / (gpuMotor.current!.getTransform().scale);

                            currentNode.posX += worldDeltaX;
                            currentNode.posY += worldDeltaY;

                            lastX = newX;
                            lastY = newY;

                            gpuMotor.current!.requestRedraw();

                            requestUpdateOverlay();

                            const now = Date.now();
                            if (now - lastSaveTime >= posAnimationDelay && (currentNode.posX !== lastSavedX || currentNode.posY !== lastSavedY)) {
                                saveNodePosition(currentNode);
                                lastSaveTime = now;
                                lastSavedX = currentNode.posX;
                                lastSavedY = currentNode.posY;
                            }

                        });
                    }

                    const mouseUp = (evt:MouseEvent) => {
                        if(animationFrame) cancelAnimationFrame(animationFrame);
                        window.removeEventListener("mousemove", mouseMove);
                        window.removeEventListener("mouseup", mouseUp);
                        gpuMotor.current!.enableInteractive(true);
                        enableTextSelection();

                        if(!Project.state.graph) return;
                        if(!Project.state.selectedSheetId) return;
                        if(!node) return;

                        // because each time node is updated, his ref change we have to take it back
                        const currentNode = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(node!._key);
                        if(!currentNode) return;
                        saveNodePosition(currentNode);
                    }

                    window.addEventListener("mouseup", mouseUp);
                    window.addEventListener("mousemove", mouseMove);
                }

                nodeHTML.addEventListener("mousedown", mouseDown);

                // Store event listeners for cleanup and reattachment
                const eventListenerMap = new Map<string, (event: any) => void>();

                const attachDomEvents = (config: typeof nodeConfig) => {
                    // Reset cursor
                    nodeHTML.style.cursor = "default";

                    if(config.domEvents) {
                        config.domEvents!.forEach((domEvent:any) => {
                            if(domEvent.name === "click" || domEvent.name === "dblclick") {
                                nodeHTML.style.cursor = "pointer";
                            }

                            const triggerEventOnNode = (nodeId:string, eventName:string) => {
                                const nodeElement = document.querySelector(`[data-node-key="${nodeId}"]`);
                                if(nodeElement) {
                                    const updateEvent = new CustomEvent(eventName, {
                                        bubbles: false
                                    });
                                    nodeElement.dispatchEvent(updateEvent);
                                }
                            }

                            const callEvent = async (event:any) => {
                                const currentNode = Project.state.graph!.sheets[Project.state.selectedSheetId!]!.nodeMap.get(node._key);
                                if(!currentNode) return;
                                const fct = new AsyncFunction(
                                    ...[
                                        "event",
                                        "gpuMotor",
                                        "node",
                                        "openHtmlEditor",
                                        "getHtmlRenderer",
                                        "initiateNewHtmlRenderer",
                                        "getHtmlAllRenderer",
                                        "container",
                                        "overlayContainer",
                                        "triggerEventOnNode",
                                        domEvent.call
                                    ]
                                );
                                await fct(
                                    ...[
                                        event,
                                        gpuMotor.current,
                                        currentNode,
                                        openHtmlEditor,
                                        Project.state.getHtmlRenderer,
                                        Project.state.initiateNewHtmlRenderer,
                                        Project.state.getHtmlAllRenderer,
                                        nodeHTML,
                                        overlay,
                                        triggerEventOnNode
                                    ]
                                );
                            }

                            eventListenerMap.set(domEvent.name, callEvent);

                            if(domEvent.name === "load") {
                                callEvent(new Event("load", { bubbles: true }));
                            } else {
                                overlay.addEventListener(domEvent.name, callEvent);
                                nodeHTML.addEventListener(domEvent.name, callEvent);
                            }
                        });
                    }
                };

                const removeDomEvents = () => {
                    eventListenerMap.forEach((listener, eventName) => {
                        overlay.removeEventListener(eventName, listener);
                        nodeHTML.removeEventListener(eventName, listener);
                    });
                    eventListenerMap.clear();
                };

                // Handle nodeUpdate to refresh event listeners and HTML renderer when node changes
                const handleNodeUpdate = async () => {
                    const updatedNode = Project.state.graph?.sheets[Project.state.selectedSheetId!]?.nodeMap.get(node._key) as (Node<any> & {toPosX?:number, toPosY?:number}) | undefined;
                    if (!updatedNode) return;

                    const updatedConfig = Project.state.nodeTypeConfig[updatedNode.type];
                    if (!updatedConfig) return;

                    // Remove old listeners and attach new ones with updated config
                    removeDomEvents();
                    attachDomEvents(updatedConfig);

                    // Update HTML renderer if it exists
                    const schemaNode = inSchemaNode.current.find(n => n.node._key === node._key);
                    if(schemaNode?.htmlRenderer) {
                        // Update global storage variables with latest values
                        schemaNode.htmlRenderer.htmlMotor.setVariableInGlobalStorage("allDataTypes", Project.state.dataTypes);
                        schemaNode.htmlRenderer.htmlMotor.setVariableInGlobalStorage("allEnumTypes", Project.state.enumTypes);
                        schemaNode.htmlRenderer.htmlMotor.setVariableInGlobalStorage("globalCurrentEntryDataType", Project.state.currentEntryDataType);

                        // Re-render with updated config content
                        if(updatedConfig.content) {
                            await schemaNode.htmlRenderer.htmlMotor.render(updatedConfig.content);
                        }
                    }

                    const nodeElement = document.querySelector(`[data-node-key="${node._key}"]`);
                    if(nodeElement) {
                        const updateEvent = new CustomEvent("nodeUpdate", {
                            bubbles: false
                        });
                        nodeElement.dispatchEvent(updateEvent);
                    }

                    if((updatedNode.toPosX && updatedNode.toPosX != updatedNode.posX) || (updatedNode.toPosY && updatedNode.toPosY != updatedNode.posY)) {
                       if(animatePosChangeFrameId.current[updatedNode._key]) {
                           cancelAnimationFrame(animatePosChangeFrameId.current[updatedNode._key].id);
                       }

                       const animePosTransition = () => {
                           const currentNode = Project.state.graph?.sheets[Project.state.selectedSheetId!]?.nodeMap.get(node._key) as (Node<any> & {toPosX?:number, toPosY?:number}) | undefined;
                           if(!currentNode || (currentNode.toPosX == undefined && currentNode.toPosY == undefined)) {
                               delete animatePosChangeFrameId.current[updatedNode._key];
                               return;
                           }

                           if(currentNode.toPosX != undefined) {
                               if(currentNode.posX < currentNode.toPosX - (posAnimationStep/2)) {
                                   currentNode.posX += posAnimationStep;
                               } else if(currentNode.posX > currentNode.toPosX + (posAnimationStep/2)) {
                                   currentNode.posX -= posAnimationStep;
                               } else {
                                   currentNode.posX = currentNode.toPosX;
                                   delete currentNode.toPosX;
                               }
                           }
                           if(currentNode.toPosY != undefined) {
                               if(currentNode.posY < currentNode.toPosY - (posAnimationStep/2)) {
                                   currentNode.posY += posAnimationStep;
                               } else if(currentNode.posY > currentNode.toPosY + (posAnimationStep/2)) {
                                   currentNode.posY -= posAnimationStep;
                               } else {
                                   currentNode.posY = currentNode.toPosY;
                                   delete currentNode.toPosY;
                               }
                           }
                           gpuMotor.current!.requestRedraw();

                           requestUpdateOverlay();

                           if(!(currentNode.toPosX == undefined && currentNode.toPosY == undefined)) {
                               animatePosChangeFrameId.current[updatedNode._key] = {
                                   id: requestAnimationFrame(animePosTransition)
                               }
                           }
                       }
                        animatePosChangeFrameId.current[updatedNode._key] = {
                           id: requestAnimationFrame(animePosTransition)
                        }

                    }

                };

                nodeHTML.addEventListener("nodeUpdateSystem", handleNodeUpdate);

                // Initial attachment
                attachDomEvents(nodeConfig);
                let htmlRenderer:htmlRenderContext|undefined;
                if(nodeConfig.content) {
                    htmlRenderer = await Project.state.initiateNewHtmlRenderer!(node, "", nodeHTML, nodeConfig.content, {
                        noFirstRender: true
                    });
                    if(htmlRenderer) {
                        htmlRenderer.htmlMotor.setVariableInGlobalStorage("allDataTypes", Project.state.dataTypes);
                        htmlRenderer.htmlMotor.setVariableInGlobalStorage("allEnumTypes", Project.state.enumTypes);
                        htmlRenderer.htmlMotor.setVariableInGlobalStorage("globalCurrentEntryDataType", Project.state.currentEntryDataType);
                        await htmlRenderer.htmlMotor.render(nodeConfig.content);
                    }
                }

                const transform = gpuMotor.current.getTransform();
                const rect = gpuMotor.current.getNodeScreenRect(node._key)!;

                overlay.style.zoom = nodeHTML.style.zoom = transform.scale+"";
                overlay.style.left = nodeHTML.style.left = `${rect.x / transform.scale}px`;
                overlay.style.top = nodeHTML.style.top = `${rect.y / transform.scale}px`;
                overlay.style.width = nodeHTML.style.width = `${rect.width / transform.scale}px`;
                overlay.style.height = nodeHTML.style.height = `${rect.height / transform.scale}px`;

                forwardMouseEvents(nodeHTML, gpuMotor.current.getContainerDraw());
                forwardMouseEvents(overlay, gpuMotor.current.getContainerDraw());

                nodeDisplayContainer.current.appendChild(nodeHTML);
                nodeDisplayContainer.current.appendChild(overlay);
                inSchemaNode.current.push({
                    node: node,
                    element: nodeHTML,
                    overElement: overlay,
                    htmlRenderer: htmlRenderer
                });
            }
            onNodeEnter?.(node);
        }
        const nodeLeave = (node: Node<any>|undefined, nodeId:string) => {


            if(!nodeDisplayContainer.current) return;

            onNodeLeave?.(node, nodeId);

            if(node) {
                const nodeConfig = Project.state.nodeTypeConfig[node.type];
                if (!nodeConfig || nodeConfig.alwaysRendered) return;

            }
            const index = inSchemaNode.current.findIndex((n) => n.node._key === nodeId);
            if (index !== -1) {
                nodeDisplayContainer.current.removeChild(inSchemaNode.current[index].element);
                nodeDisplayContainer.current.removeChild(inSchemaNode.current[index].overElement);
                if (inSchemaNode.current[index].htmlRenderer) {
                    inSchemaNode.current[index].htmlRenderer.htmlMotor.dispose();
                }
                inSchemaNode.current.splice(index, 1);
            }

        };

        const onReset = () => {
            if(nodeDisplayContainer.current) {
                nodeDisplayContainer.current.innerHTML = "";
            }
            inSchemaNode.current = [];
        }

        gpuMotor.current.on("nodeEnter", nodeEnter);
        gpuMotor.current.on("nodeLeave", nodeLeave);
        gpuMotor.current.on("pan", requestUpdateOverlay);
        gpuMotor.current.on("zoom", requestUpdateOverlay);
        gpuMotor.current.on("reset", onReset);

        // Check if dependencies have changed and trigger updates
        const depsChanged =
            previousDependencies.current.currentEntryDataType !== Project.state.currentEntryDataType ||
            previousDependencies.current.enumTypes !== Project.state.enumTypes ||
            previousDependencies.current.dataTypes !== Project.state.dataTypes;

        if(depsChanged) {
            // Update previous dependencies
            previousDependencies.current = {
                currentEntryDataType: Project.state.currentEntryDataType,
                enumTypes: Project.state.enumTypes,
                dataTypes: Project.state.dataTypes,
            };

            // Trigger update for all rendered nodes
            updateHtmlRendererDependencies();

            // Dispatch nodeUpdate event for all nodes to refresh their event handlers
            inSchemaNode.current.forEach(schemaNode => {
                dispatchNodeUpdateEvent(schemaNode.node._key);
            });
        }

        return () => {
            if(!gpuMotor.current) return;
            gpuMotor.current.off("nodeEnter", nodeEnter);
            gpuMotor.current.off("nodeLeave", nodeLeave);
            gpuMotor.current.off("pan", requestUpdateOverlay);
            gpuMotor.current.off("zoom", requestUpdateOverlay);
            gpuMotor.current.off("reset", onReset);
        }
    }, [
        gpuMotor.current,
        openHtmlEditor,
        onNodeEnter,
        onNodeLeave,
        Project.state.nodeTypeConfig,
        Project.state.getHtmlRenderer,
        Project.state.initiateNewHtmlRenderer,
        Project.state.getHtmlAllRenderer,
        Project.state.graph,
        Project.state.currentEntryDataType,
        Project.state.enumTypes,
        Project.state.dataTypes,
    ]);

    const onDoubleClick = () => {
        onExitCanvas();
    }

    // Expose a global function to trigger node update for a specific node
    // This can be used from anywhere in the app to force a node re-render
    useEffect(() => {
        const triggerNodeUpdate = (nodeKey: string) => {
            const nodeElement = document.querySelector(`[data-node-key="${nodeKey}"]`);
            if(nodeElement) {
                const updateEvent = new CustomEvent("nodeUpdateSystem", {
                    bubbles: false,
                    detail: {
                        nodeId: nodeKey
                    }
                });
                nodeElement.dispatchEvent(updateEvent);
            }
        };

        // Attach to window for global access
        (window as any).triggerNodeUpdate = triggerNodeUpdate;

        return () => {
            delete (window as any).triggerNodeUpdate;
        };
    }, []);

    return (
        <div ref={containerRef} style={{height:'100%', width: '100%', backgroundColor:'white', position:"relative"}} >
            <canvas ref={canvasRef} style={{filter: `invert(${Theme.state.theme === "dark" ? 1 : 0})`, transition: "all 0.25s ease-in-out"}} onDoubleClick={onDoubleClick} onClick={onCanvasClick}>

            </canvas>
            <div ref={nodeDisplayContainer} style={{width:"100%", height:"100%", position:"absolute", inset:"0px", pointerEvents:"none", overflow:"hidden"}}>

            </div>
        </div>
    )
}));