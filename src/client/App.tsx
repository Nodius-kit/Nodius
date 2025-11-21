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
import {deepCopy, documentHaveActiveElement, Point} from "../utils/objectUtils";
import {getInverseInstruction, Instruction, InstructionBuilder} from "../utils/sync/InstructionBuilder";
import {searchElementWithIdentifier} from "../utils/html/htmlUtils";
import {GraphInstructions} from "../utils/sync/wsObject";
import {getHandleInfo} from "../utils/graph/handleUtils";
import {Edge, Node} from "../utils/graph/graphType";
import {useStableProjectRef} from "./hooks/useStableProjectRef";


export const App = () => {

    const Theme = useContext(ThemeContext);
    const Project = useContext(ProjectContext);
    const projectRef = useStableProjectRef();
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
                } else if(Project.state.selectedNode.length > 0 && !Project.state.editedNodeConfig) {
                    const sheets = Project.state.graph.sheets[Project.state.selectedSheetId];
                    if(!sheets) return;
                    const edges = Array.from(sheets.edgeMap.values()).flat();
                    sessionStorage.setItem("copiedEdgeNode", JSON.stringify({
                        node: Project.state.selectedNode.map((n) => sheets.nodeMap.get(n)),
                        edge: Project.state.selectedEdge.map((e) => edges.find((edge) => edge._key === e)),
                    }));
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
                } else if(Project.state.selectedNode.length > 0 && !Project.state.editedNodeConfig) {
                    const copiedObject = sessionStorage.getItem("copiedEdgeNode")
                        ? JSON.parse(sessionStorage.getItem("copiedEdgeNode")!) as {node:Node<any>[], edge:Edge[]}
                        : undefined;

                    if (copiedObject?.node.length) {

                        // On ne garde que les edges dont source ET target sont bien dans les nodes copiés
                        copiedObject.edge = copiedObject.edge.filter((e) =>
                            copiedObject.node.some((n) => n._key === e.source) &&
                            copiedObject.node.some((n) => n._key === e.target)
                        );

                        const totalElements = copiedObject.node.length + copiedObject.edge.length;
                        const ids = await Project.state.generateUniqueId!(totalElements);
                        if (!ids) return;

                        const motor = Project.state.getMotor();
                        const userCursor = motor.getCursorPosition();
                        const worldCursor = motor.screenToWorld(userCursor);

                        // Calcul de la bounding box
                        let minX = Infinity, minY = Infinity;
                        let maxX = -Infinity, maxY = -Infinity;

                        // Map old → new node id
                        const nodeIdMap = new Map<string, string>();

                        let idIndex = 0;

                        // On traite d'abord les nodes : nouveau _key + bbox + map
                        for (const node of copiedObject.node) {
                            nodeIdMap.set(node._key, ids[idIndex]); // on garde l’ancien avant de l’écraser
                            node._key = ids[idIndex];
                            idIndex++;

                            minX = Math.min(minX, node.posX);
                            minY = Math.min(minY, node.posY);
                            maxX = Math.max(maxX, node.posX + node.size.width);
                            maxY = Math.max(maxY, node.posY + node.size.height);
                        }

                        const width = maxX - minX;
                        const height = maxY - minY;

                        // Translation pour centrer autour du curseur
                        for (const node of copiedObject.node) {
                            node.posX = node.posX - minX + worldCursor.x - width / 2;
                            node.posY = node.posY - minY + worldCursor.y - height / 2;
                        }

                        // On traite les edges : nouveau _key + mise à jour source/target
                        for (const edge of copiedObject.edge) {
                            edge._key = ids[idIndex];
                            idIndex++;

                            // Ici la correction critique
                            edge.source = nodeIdMap.get(edge.source)!; // le ! est safe car on a filtré avant
                            edge.target = nodeIdMap.get(edge.target)!;
                        }

                        await Project.state.batchCreateElements!(copiedObject.node, copiedObject.edge);
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

                    // save original sheet id
                    const baseSheetId = projectRef.current.state.selectedSheetId!;

                    // original node and edge
                    let saved_node:Node<any>[] = Project.state.selectedNode.filter((n) => n !== "root").map((sn) => projectRef.current.state.graph!.sheets[baseSheetId].nodeMap.get(sn)!);

                    const edges = Array.from(projectRef.current.state.graph!.sheets[baseSheetId].edgeMap.values()).flat();
                    let saved_edge:Edge[] = Project.state.selectedEdge.map((se) => edges.find((e) => e._key === se)!);

                    // original nodeId list and edgeId list
                    let nodeId: string[] = saved_node.map((n) => n._key);
                    let edgeId: string[] = saved_edge.map((e) => e._key);

                    await Project.state.batchDeleteElements!(nodeId,edgeId);

                    projectRef.current.state.addCancellableAction!(async () => {
                        //ahead
                        if(projectRef.current.state.selectedSheetId === baseSheetId) {
                            await Project.state.batchDeleteElements!(nodeId,edgeId);
                            return true;
                        }
                        return false;
                    }, async () => {
                        //back
                        if(projectRef.current.state.selectedSheetId === baseSheetId) {
                            const ids = await projectRef.current.state.generateUniqueId!(saved_node.length + saved_edge.length);
                            if(!ids) return false;
                            let ids_index = 0;
                            saved_node = saved_node.map((sn) => deepCopy(sn));
                            saved_edge = saved_edge.map((sn) => deepCopy(sn));
                            nodeId = saved_node.map((n) => n._key);
                            edgeId = saved_edge.map((e) => e._key);
                            await Project.state.batchCreateElements!(saved_node,saved_edge);
                            return true;
                        }
                        return false;
                    })

                } else if(Project.state.editedNodeHandle) {
                    const node = Project.state.graph?.sheets[Project.state.selectedSheetId ?? ""].nodeMap.get(Project.state.editedNodeHandle.nodeId);
                    if(!node) return;
                    const handleInfo = getHandleInfo(node, Project.state.editedNodeHandle.pointId);
                    if(!handleInfo) return;

                    const instruction = new InstructionBuilder();
                    instruction.key("handles")
                        .key(Project.state.editedNodeHandle.side)
                        .key("point")
                        .index(handleInfo.index).remove();

                    await Project.state.updateGraph!([{
                        nodeId: Project.state.editedNodeHandle.nodeId,
                        i: instruction.instruction,
                        targetedIdentifier: handleInfo.point.id
                    }]);
                    Project.dispatch({
                        field: "editedNodeHandle",
                        value: undefined
                    });
                }
            }
        }
        document.addEventListener("keydown", keyDown);
        return () => {
            document.removeEventListener("keydown", keyDown);
        }
    }, [Project.state.editedHtml, Project.state.selectedNode, Project.state.batchDeleteElements, Project.state.graph, Project.state.selectedSheetId, Project.state.updateGraph, Project.state.editedNodeHandle]);


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