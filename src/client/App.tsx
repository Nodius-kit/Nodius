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

export type OpenHtmlEditorFct = (nodeId:string,htmlRender:htmlRenderContext, onClose?: () => void) => void;

export const App = () => {

    const Project = useContext(ProjectContext);

    const {
        setActiveWindow,
        activeWindow,
        gpuMotor
    } = useSocketSync();


    const onCloseEditor = useRef<() => void>(undefined);
    const openHtmlEditor:OpenHtmlEditorFct = useCallback((nodeId:string,htmlRenderer:htmlRenderContext, onClose?: () => void) => {
        if(!gpuMotor.current || !Project.state.graph || !Project.state.selectedSheetId) return;
        onCloseEditor.current = onClose;
        const node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(nodeId);

        if(node && node.type === "html" && Project.state.html) {
            console.log(Project.state.html);
            const newEditedHtml:EditedHtmlType = {
                node: node,
                html: Project.state.html,
                htmlRender: htmlRenderer.htmlMotor,
                pathOfRender: htmlRenderer.pathOfRender,
            }
            Project.dispatch({
                field: "editedHtml",
                value: newEditedHtml
            });
        }
    }, [Project.state.html, Project.state.graph, Project.state.selectedSheetId]);

    const onNodeLeave = useCallback((node:Node<any>) => {
        if (node._key === Project.state.editedHtml?.node._key) {
            Project.dispatch({
                field: "editedHtml",
                value: undefined
            });
            onCloseEditor.current?.();
        }

        const nodeConfig = Project.state.nodeTypeConfig[node.type];
        if (!nodeConfig.alwaysRendered) {
            const renderers = Project.state.getHtmlRenderer!(node);
            Object.values(renderers ?? {}).forEach(renderer => {
                renderer.htmlMotor.dispose();
            })
        }

        const nodeLeaveEvent = new CustomEvent("nodeLeave", {});
        const nodeElement = document.querySelector("[data-node-key='"+node._key+"']");
        if(nodeElement) {
            nodeElement.dispatchEvent(nodeLeaveEvent);
        }
    }, [Project.state.editedHtml, Project.state.getHtmlRenderer]);

    const onNodeEnter = useCallback((node:Node<any>) => {
        const nodeEnterEvent = new CustomEvent("nodeEnter", {
            bubbles: false
        });
        const nodeElement = document.querySelector("[data-node-key='"+node._key+"']");
        if(nodeElement) {
            nodeElement.dispatchEvent(nodeEnterEvent);
        }
    }, []);


    const onExitCanvas = useCallback(() => {
        if(Project.state.editedHtml) {
            Project.dispatch({
                field: "editedHtml",
                value: undefined
            });
            onCloseEditor.current?.();
        }
    }, [Project.state.editedHtml]);

    const onCanvasClick = useCallback(() => {
        if(Project.state.editedHtml) {
            Project.state.editedHtml.htmlRender.clearBuildingOverlay();
        }
    }, [Project.state.editedHtml])



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
                        let pathToSelected = searchElementWithIdentifier(selectedObject.identifier, Project.state.editedHtml.html.object, instruction);
                        if(pathToSelected) {
                            if(selectedObject.type === "block" && selectedObject.content === undefined) {
                                instruction.key("content").set(copiedObject);

                                const reverseInstruction = getInverseInstruction(Project.state.editedHtml.html.object, instruction.instruction);
                                // used later for CTRL + Z / CTRL + Y

                                await Project.state.updateHtml(instruction.instruction);
                            } else if(selectedObject.type === "list"){
                                instruction.key("content").arrayAdd(copiedObject);

                                const reverseInstruction = getInverseInstruction(Project.state.editedHtml.html.object, instruction.instruction);
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
                        let pathToSelected = searchElementWithIdentifier(selectedObject.identifier, Project.state.editedHtml.html.object, instruction);
                        if (pathToSelected) {
                            instruction.remove();
                            const reverseInstruction = getInverseInstruction(Project.state.editedHtml.html.object, instruction.instruction);
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
        setTimeout(() => {

            if(Project.state.editedHtml) {
                Object.values(Project.state.getHtmlAllRenderer?.() ?? {}).forEach(node =>
                    Object.values(node).forEach(item => item.htmlMotor?.dispose())
                );
                Project.dispatch({
                    field: "editedHtml",
                    value: undefined
                });
                Project.dispatch({
                    field: "html",
                    value: undefined
                });
            }
            gpuMotor.current?.resetScene();
        }, 500);
    }, [Project.state.editedHtml, Project.state.getHtmlAllRenderer]);


    return (
        <div style={{width: "100vw", height: "100vh", position:"relative"}}>
            <SchemaDisplay
                ref={gpuMotor}
                onExitCanvas={onExitCanvas}
                openHtmlEditor={openHtmlEditor}
                onNodeLeave={onNodeLeave}
                onNodeEnter={onNodeEnter}
                onCanvasClick={onCanvasClick}
            />
            <ThemeContextParser/>
            <ProjectLoader/>

            <MultiFade active={activeWindow} timeout={250} extraCss={{position:"absolute", inset:"0px", pointerEvents:"none", overflow: "hidden", zIndex:"10000000"}}>

                <DashboardWorkFlow />

                <SchemaEditor returnToMenu={returnToMenu} />
            </MultiFade>

        </div>
    )
}