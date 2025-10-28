/**
 * @file App.tsx
 * @description Main application component coordinating dashboard and schema editor
 * @module client
 *
 * Root component managing application state and views:
 * - App: Main application container with view switching
 * - useSocketSync integration: WebSocket connection and graph synchronization
 * - HTML editor: Inline HTML component editing workflow
 * - Multi-view support: Dashboard and schema editor with smooth transitions
 *
 * Key features:
 * - MultiFade transitions between dashboard and editor
 * - HTML editor opening from graph nodes
 * - Undo/redo for HTML editing with Ctrl+Z
 * - Theme context parser integration
 * - Project loader for async operations
 * - Keyboard shortcut handling
 */

import {SchemaDisplay} from "./schema/SchemaDisplay";
import {ThemeContextParser} from "./hooks/contexts/ThemeContextParser";
import {ProjectLoader} from "./component/animate/ProjectLoader";
import {MultiFade} from "./component/animate/MultiFade";
import {DashboardWorkFlow} from "./component/dashboard/DashboardWorkFlow";
import {SchemaEditor} from "./component/dashboard/SchemaEditor";
import {useSocketSync} from "./hooks/useSocketSync";
import {useCallback, useContext, useEffect, useRef} from "react";
import {Node} from "../utils/graph/graphType";
import {EditedHtmlType, htmlRenderContext, ProjectContext} from "./hooks/contexts/ProjectContext";
import {documentHaveActiveElement} from "../utils/objectUtils";
import {getInverseInstruction, InstructionBuilder} from "../utils/sync/InstructionBuilder";
import {searchElementWithIdentifier} from "../utils/html/htmlUtils";


export const App = () => {

    const Project = useContext(ProjectContext);

    const {
        setActiveWindow,
        activeWindow,
        gpuMotor,
        resetState
    } = useSocketSync();

    const onNodeLeave = useCallback((node:Node<any>|undefined, nodeId:string) => {
        if(!Project.state.graph || !Project.state.selectedSheetId) return;
        if(node) {
            if (Project.state.editedHtml && Project.state.editedHtml.targetType === "node" && node._key === Project.state.editedHtml?.target._key) {
                Project.dispatch({
                    field: "editedHtml",
                    value: undefined
                });
                Project.state.onCloseEditor?.();
                Project.dispatch({
                    field: "selectedNode",
                    value: Project.state.selectedNode.filter((id) => id !== nodeId)
                });
            }

            const nodeConfig = Project.state.nodeTypeConfig[node.type];
            if (!nodeConfig || !nodeConfig.alwaysRendered) {
                const renderers = Project.state.getHtmlRenderer!(node);
                Object.values(renderers ?? {}).forEach(renderer => {
                    renderer.htmlMotor.dispose();
                })
            }

            const nodeLeaveEvent = new CustomEvent("nodeLeave", {});
            const nodeElement = document.querySelector("[data-node-key='" + node._key + "']");
            if (nodeElement) {
                nodeElement.dispatchEvent(nodeLeaveEvent);
            }
        } else {
            // node deleted
            if(Project.state.editedHtml && Project.state.editedHtml.targetType === "node" && nodeId === Project.state.editedHtml?.target._key) {
                Project.dispatch({
                    field: "editedHtml",
                    value: undefined
                });
                Project.state.onCloseEditor?.();
                Project.dispatch({
                    field: "selectedNode",
                    value: Project.state.selectedNode.filter((id) => id !== nodeId)
                });
            }
        }
    }, [
        Project.state.editedHtml,
        Project.state.getHtmlRenderer,
        Project.state.graph,
        Project.state.selectedSheetId,
        Project.state.openHtmlEditor,
        Project.state.onCloseEditor,
        Project.state.selectedNode
    ]);

    const onNodeEnter = useCallback((node:Node<any>) => {
        const nodeEnterEvent = new CustomEvent("nodeEnter", {
            bubbles: false
        });
        const nodeElement = document.querySelector("[data-node-key='"+node._key+"']");
        requestAnimationFrame(() => {
            if(nodeElement) {
                nodeElement.dispatchEvent(nodeEnterEvent);
            }
        });
    }, []);


    const onExitCanvas = useCallback(() => {
        if(Project.state.editedHtml) {
            Project.dispatch({
                field: "editedHtml",
                value: undefined
            });
            Project.state.onCloseEditor?.();
        }
    }, [Project.state.editedHtml, Project.state.onCloseEditor]);

    const onCanvasClick = useCallback(() => {
        if(Project.state.editedHtml) {
            Project.state.editedHtml.htmlRender.clearBuildingOverlay();
        }
        /*Project.dispatch({
            field:"selectedNode",
            value: []
        });*/
    }, [Project.state.editedHtml/*, Project.state.selectedNode*/])



    useEffect(() => {
        const keyDown = async (event:KeyboardEvent) => {
            // Normalize key detection
            const key = event.key.toLowerCase();

            if(documentHaveActiveElement()) return;

            if (event.ctrlKey && key === "c") {
                if(Project.state.editedHtml != undefined && Project.state.updateHtml != undefined) {
                    // in html
                    const copiedObject = Project.state.editedHtml.htmlRender.getSelectedObject();
                    if(copiedObject) {
                        sessionStorage.setItem("copiedHtmlObject", JSON.stringify(copiedObject));
                    }
                }
            }else if (event.ctrlKey && key === "v") {
                if(Project.state.editedHtml != undefined && Project.state.updateHtml!=undefined) {
                    // in html
                    const copiedObject = sessionStorage.getItem("copiedHtmlObject") ? JSON.parse(sessionStorage.getItem("copiedHtmlObject")!) : undefined;
                    const selectedObject = Project.state.editedHtml.htmlRender.getSelectedObject();
                    if(copiedObject && selectedObject) {

                        const instruction = new InstructionBuilder();
                        let pathToSelected = searchElementWithIdentifier(selectedObject.identifier, Project.state.editedHtml.html, instruction);
                        if(pathToSelected) {
                            if(selectedObject.type === "block" && selectedObject.content === undefined) {
                                instruction.key("content").set(copiedObject);

                                const reverseInstruction = getInverseInstruction(Project.state.editedHtml.html, instruction.instruction);
                                // used later for CTRL + Z / CTRL + Y

                                await Project.state.updateHtml(instruction.instruction);
                            } else if(selectedObject.type === "list"){
                                instruction.key("content").arrayAdd(copiedObject);

                                const reverseInstruction = getInverseInstruction(Project.state.editedHtml.html, instruction.instruction);
                                // used later for CTRL + Z / CTRL + Y

                                await Project.state.updateHtml(instruction.instruction);
                            }
                        }
                    }
                }
            } else if (key === "delete") {
                if(Project.state.editedHtml != undefined && Project.state.updateHtml != undefined) {
                    // in html
                    const selectedObject = Project.state.editedHtml.htmlRender.getSelectedObject();
                    if (selectedObject && selectedObject.identifier !== "root") {
                        const instruction = new InstructionBuilder();
                        let pathToSelected = searchElementWithIdentifier(selectedObject.identifier, Project.state.editedHtml.html, instruction);
                        if (pathToSelected) {
                            instruction.remove();
                            const reverseInstruction = getInverseInstruction(Project.state.editedHtml.html, instruction.instruction);
                            // used later for CTRL + Z / CTRL + Y

                            await Project.state.updateHtml(instruction.instruction);
                        }
                    }
                }
            }
        }
        document.addEventListener("keydown", keyDown);
        return () => {
            document.removeEventListener("keydown", keyDown);
        }
    }, [Project.state.editedHtml, Project.state.updateHtml]);

    const returnToMenu = useCallback(() => {
        setActiveWindow(0);
        setTimeout(resetState, 500);
    }, [resetState]);


    return (
        <div style={{width: "100vw", height: "100vh", position:"relative"}}>
            <SchemaDisplay
                ref={gpuMotor}
                onExitCanvas={onExitCanvas}
                onNodeLeave={onNodeLeave}
                onNodeEnter={onNodeEnter}
                onCanvasClick={onCanvasClick}
            />
            <ThemeContextParser/>
            <ProjectLoader/>

            <MultiFade active={activeWindow} timeout={250}
                       extraCss={{
                           position:"absolute",
                           inset:"0px",
                           overflow: "hidden",
                           zIndex:"10000000",
                           pointerEvents: activeWindow == 1 ? "none" : "inherit"
            }}
            >

                <DashboardWorkFlow />

                <SchemaEditor returnToMenu={returnToMenu} />
            </MultiFade>

        </div>
    )
}