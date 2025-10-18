import {memo, useContext, useEffect, useRef, MouseEvent, forwardRef, useLayoutEffect} from "react";
import {WebGpuMotor} from "./motor/webGpuMotor";
import {ThemeContext} from "../hooks/contexts/ThemeContext";
import {Node} from "../../utils/graph/graphType";
import {forwardMouseEvents} from "../../utils/objectUtils";
import {AsyncFunction, HtmlRender} from "../../process/html/HtmlRender";
import {ProjectContext} from "../hooks/contexts/ProjectContext";
import {OpenHtmlEditorFct} from "../App";

interface SchemaDisplayProps {
    onExitCanvas: () => void,
    onCanvasClick: (evt:MouseEvent) => void,
    openHtmlEditor: OpenHtmlEditorFct,
    onNodeEnter?: (node: Node<any>) => void,
    onNodeLeave?: (node: Node<any>) => void,
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
        htmlRenderer: HtmlRender,
    }[]>([]);
    const nodeDisplayContainer = useRef<HTMLDivElement>(null);
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
        const nodeEnter = (node: Node<any>) => {
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
                overlay.style.zIndex = "1000000";
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
                            const callEvent = async (event:any) => {
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
                                        domEvent.call
                                    ]
                                );
                                await fct(
                                    ...[
                                        event,
                                        gpuMotor.current,
                                        Project.state.graph!.sheets[Project.state.selectedSheetId!]!.nodeMap.get(node._key),
                                        openHtmlEditor,
                                        Project.state.getHtmlRenderer,
                                        Project.state.initiateNewHtmlRenderer,
                                        Project.state.getHtmlAllRenderer,
                                        nodeHTML,
                                        overlay
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

                // Handle nodeUpdate to refresh event listeners when node changes
                const handleNodeUpdate = () => {
                    const updatedNode = Project.state.graph?.sheets[Project.state.selectedSheetId!]?.nodeMap.get(node._key);
                    if (!updatedNode) return;

                    const updatedConfig = Project.state.nodeTypeConfig[updatedNode.type];
                    if (!updatedConfig) return;

                    // Remove old listeners and attach new ones with updated config
                    removeDomEvents();
                    attachDomEvents(updatedConfig);
                };

                nodeHTML.addEventListener("nodeUpdate", handleNodeUpdate);

                // Initial attachment
                attachDomEvents(nodeConfig);
                const htmlRenderer = new HtmlRender(nodeHTML);
                if(nodeConfig.content) {
                    htmlRenderer.setVariableInGlobalStorage("allDataTypes", Project.state.dataTypes);
                    htmlRenderer.setVariableInGlobalStorage("allEnumTypes", Project.state.enumTypes);
                    htmlRenderer.setVariableInGlobalStorage("globalCurrentEntryDataType", Project.state.currentEntryDataType);
                    htmlRenderer.render(nodeConfig.content);
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
        const nodeLeave = (node: Node<any>) => {


            if(!nodeDisplayContainer.current) return;

            onNodeLeave?.(node);

            const nodeConfig = Project.state.nodeTypeConfig[node.type];
            if(!nodeConfig || nodeConfig.alwaysRendered) return;

            const index = inSchemaNode.current.findIndex((n) => n.node === node);
            if (index !== -1){
                nodeDisplayContainer.current.removeChild(inSchemaNode.current[index].element);
                nodeDisplayContainer.current.removeChild(inSchemaNode.current[index].overElement);
                inSchemaNode.current[index].htmlRenderer.dispose();
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
        gpuMotor.current.on("pan", updateOverlays);
        gpuMotor.current.on("zoom", updateOverlays);
        gpuMotor.current.on("reset", onReset);
        return () => {
            if(!gpuMotor.current) return;
            gpuMotor.current.off("nodeEnter", nodeEnter);
            gpuMotor.current.off("nodeLeave", nodeLeave);
            gpuMotor.current.off("pan", updateOverlays);
            gpuMotor.current.off("zoom", updateOverlays);
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
    ]);

    const onDoubleClick = () => {
        onExitCanvas();
    }

    return (
        <div ref={containerRef} style={{height:'100%', width: '100%', backgroundColor:'white', position:"relative"}} >
            <canvas ref={canvasRef} style={{filter: `invert(${Theme.state.theme === "dark" ? 1 : 0})`, transition: "all 0.25s ease-in-out"}} onDoubleClick={onDoubleClick} onClick={onCanvasClick}>

            </canvas>
            <div ref={nodeDisplayContainer} style={{width:"100%", height:"100%", position:"absolute", inset:"0px", pointerEvents:"none", overflow:"hidden"}}>

            </div>
        </div>
    )
}));