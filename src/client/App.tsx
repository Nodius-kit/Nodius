import {JSX, useContext, useEffect, useRef} from "react";
import {ThemeContext} from "./hooks/contexts/ThemeContext";
import {ProjectContext} from "./hooks/contexts/ProjectContext";
import {WebGpuMotor} from "./schema/motor/webGpuMotor";
import {GraphicalMotor} from "./schema/motor/graphicalMotor";
import {ThemeContextParser} from "./hooks/contexts/ThemeContextParser";
import {MultiFade} from "./component/animate/MultiFade";
import {useSocketSync} from "./hooks/useSocketSync";
import {HomeWorkflow} from "./menu/homeWorkflow/HomeWorkflow";
import {SchemaDisplay} from "./schema/SchemaDisplay";
import {SchemaEditor} from "./schema/editor/SchemaEditor";
import {documentHaveActiveElement} from "../utils/objectUtils";
import {getInverseInstruction, Instruction, InstructionBuilder} from "../utils/sync/InstructionBuilder";
import {searchElementWithIdentifier} from "../utils/html/htmlUtils";
import {GraphInstructions} from "../utils/sync/wsObject";


export const App = () => {

    const Theme = useContext(ThemeContext);
    const Project = useContext(ProjectContext);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const motorRef = useRef<GraphicalMotor>(undefined);

    useSocketSync();

    useEffect(() => {
        if (!canvasRef.current || !containerRef.current) return;
        if(motorRef.current) return;

        motorRef.current = new WebGpuMotor();
        motorRef.current.init(containerRef.current, canvasRef.current, {
            backgroundType: "dotted"
        }).then(() => {
            if(!motorRef.current) return;
            motorRef.current.resetViewport();
            motorRef.current.enableInteractive(true);
            Project.dispatch({
                field: "getMotor",
                value: getMotor
            });
        });


        // Cleanup function: dispose motor on unmount or hot reload
        return () => {
            if (motorRef.current) {
                motorRef.current.dispose();
                motorRef.current = undefined;
            }
        };
    }, []);

    const getMotor = () => {
        return motorRef.current!;
    }


    useEffect(() => {
        Project.dispatch({
            field: "appMenu",
            value: [
                {
                    id: "home",
                    pointerEvent: true,
                    element: HomeWorkflow
                },
                {
                    id: "schemaEditor",
                    pointerEvent: false,
                    element: SchemaEditor
                }
            ]
        });
    }, []);

    useEffect(() => {
        const keyDown = async (event:KeyboardEvent) => {
            if(!Project.state.graph || !Project.state.selectedSheetId) return;
            // Normalize key detection
            const key = event.key.toLowerCase();

            if(documentHaveActiveElement()) return;

            if (event.ctrlKey && key === "c") {
                if(Project.state.editedHtml != undefined) {
                    // in html
                    const copiedObject = Project.state.editedHtml.htmlRenderContext.htmlRender.getSelectedObject();
                    if(copiedObject) {
                        sessionStorage.setItem("copiedHtmlObject", JSON.stringify(copiedObject));
                    }
                }
            }else if (event.ctrlKey && key === "v") {
                if(Project.state.editedHtml != undefined ) {
                    // in html
                    const copiedObject = sessionStorage.getItem("copiedHtmlObject") ? JSON.parse(sessionStorage.getItem("copiedHtmlObject")!) : undefined;
                    const selectedObject = Project.state.editedHtml.htmlRenderContext.htmlRender.getSelectedObject();

                    const node = Project.state.editedHtml.htmlRenderContext.retrieveNode();
                    if(!node) return;

                    if(copiedObject && selectedObject) {

                        const instruction = new InstructionBuilder();
                        let pathToSelected = searchElementWithIdentifier(selectedObject.identifier, Project.state.editedHtml.htmlRenderContext.retrieveHtmlObject(node), instruction);
                        if(pathToSelected) {
                            if(selectedObject.type === "block" && selectedObject.content === undefined) {
                                instruction.key("content").set(copiedObject);

                                const output = await Project.state.editedHtml.updateHtmlObject([{
                                    i: instruction.instruction,
                                    triggerHtmlRender: true,
                                    applyUniqIdentifier: "identifier",
                                }]);
                                if(output.status) {
                                    const reverseInstruction = getInverseInstruction(Project.state.editedHtml.htmlRenderContext.retrieveHtmlObject(node), instruction.instruction);
                                    // used later for CTRL + Z / CTRL + Y
                                }
                            } else if(selectedObject.type === "list"){
                                instruction.key("content").arrayAdd(copiedObject);

                                const output = await Project.state.editedHtml.updateHtmlObject([{
                                    i: instruction.instruction,
                                    triggerHtmlRender: true,
                                    applyUniqIdentifier: "identifier",
                                }]);
                                if(output.status) {
                                    const reverseInstruction = getInverseInstruction(Project.state.editedHtml.htmlRenderContext.retrieveHtmlObject(node), instruction.instruction);
                                    // used later for CTRL + Z / CTRL + Y
                                }
                            }
                        }
                    }
                }
            } else if (key === "delete") {
                if(Project.state.editedHtml != undefined ) {
                    // in html
                    const selectedObject = Project.state.editedHtml.htmlRenderContext.htmlRender.getSelectedObject();

                    const instructionsGraph: GraphInstructions[] = [];
                    const intructionsHtml:Instruction[] = [];

                    if (selectedObject && selectedObject.identifier !== "root") {
                        const instruction = new InstructionBuilder();

                        const node = Project.state.editedHtml.htmlRenderContext.retrieveNode();
                        if(!node) return;

                        let pathToSelected = searchElementWithIdentifier(selectedObject.identifier, Project.state.editedHtml.htmlRenderContext.retrieveHtmlObject(node), instruction);
                        if (pathToSelected) {
                            instruction.remove();
                            const reverseInstruction = getInverseInstruction(Project.state.editedHtml.htmlRenderContext.retrieveHtmlObject(node), instruction.instruction);
                            // used later for CTRL + Z / CTRL + Y

                            intructionsHtml.push(instruction.instruction);

                            // now check that there is no handle related in the node and edge
                            for (const [handleSide, handleData] of Object.entries(node.handles)) {
                                if (!handleData?.point?.length) continue;

                                const points = handleData.point;

                                // Iterate backwards since you might be removing elements
                                for (let i = points.length - 1; i >= 0; i--) {
                                    const point = points[i];

                                    if (point.linkedHtmlId === selectedObject.identifier) {
                                        const instruction = new InstructionBuilder()
                                            .key("handles")
                                            .key(handleSide)
                                            .key("point")
                                            .index(i)
                                            .remove();

                                        instructionsGraph.push({
                                            nodeId: node._key!,
                                            i: instruction,
                                            targetedIdentifier: point.id
                                        });
                                    }
                                }
                            }
                        }
                    }
                    if(intructionsHtml.length > 0) {
                        const output = await Project.state.editedHtml.updateHtmlObject(intructionsHtml.map((i) => ({
                            i: i,
                            triggerHtmlRender: true,
                            applyUniqIdentifier: "identifier",
                        })));
                    }
                    if(instructionsGraph.length > 0) {
                        const output = await Project.state.updateGraph!(instructionsGraph);
                    }
                } else if(Project.state.selectedEdge.length > 0 || Project.state.selectedNode.length > 0 && Project.state.batchDeleteElements) {

                    await Project.state.batchDeleteElements!(Project.state.selectedNode.filter((n) => n !== "root"),Project.state.selectedEdge );
                }
            }
        }
        document.addEventListener("keydown", keyDown);
        return () => {
            document.removeEventListener("keydown", keyDown);
        }
    }, [Project.state.editedHtml, Project.state.selectedNode, Project.state.batchDeleteElements, Project.state.graph, Project.state.selectedSheetId, Project.state.updateGraph]);


    return (
        <div style={{width: "100vw", height: "100vh", position:"relative"}} ref={containerRef}>
            <ThemeContextParser/>
            <canvas
                ref={canvasRef}
                style={{
                    filter: `invert(${Theme.state.theme === "dark" ? 1 : 0})`,
                    transition: "filter 0.25s ease-in-out"
                }}
                data-graph-motor=""
            />
            <SchemaDisplay/>
            <MultiFade
                active={Project.state.appMenu.findIndex((m) => m.id === Project.state.activeAppMenuId)}
                timeout={250}
                extraCss={{
                    position: 'absolute',
                    inset: "0px",
                    overflow:"hidden",
                    zIndex: "10000000",
                    pointerEvents: Project.state.appMenu.find((m) => m.id === Project.state.activeAppMenuId)?.pointerEvent ? "all" : "none"
                }}
            >
                {Project.state.appMenu.map((M, i) => (
                    <M.element key={i}  />
                ))}

            </MultiFade>

        </div>)
}