
import "./public/css/theme.css"
import "@fontsource/roboto";


import {SchemaDisplay} from "./schema/SchemaDisplay";
import {useCreateReducer} from "./hooks/useCreateReducer";
import {
    ThemeContext,
    ThemeContextDefaultValue,
    ThemeContextType
} from "./hooks/contexts/ThemeContext";
import {
    ProjectContext,
    ProjectContextDefaultValue,
    ProjectContextType,
} from "./hooks/contexts/ProjectContext";
import {createRoot} from "react-dom/client";
import {MouseEvent, useCallback, useEffect, useRef, useState} from "react";
import {ProjectLoader} from "./component/animate/ProjectLoader";
import {ThemeContextParser} from "./hooks/contexts/ThemeContextParser";
import {HtmlClass, HtmlObject} from "../utils/html/htmlType";
import {MultiFade} from "./component/animate/MultiFade";
import {
    applyInstruction,
    createInstruction,
    getInverseInstruction,
    InstructionBuilder
} from "../utils/sync/InstructionBuilder";
import {WebGpuMotor} from "./schema/motor/webGpuMotor";
import {Graph, Node, NodeType, NodeTypeConfig, NodeTypeHtmlConfig} from "../utils/graph/graphType";
import {DashboardWorkFlow} from "./component/dashboard/DashboardWorkFlow";
import {api_graph_html} from "../utils/requests/type/api_workflow.type";
import {edgeArrayToMap, findFirstNodeByType, nodeArrayToMap} from "../utils/graph/nodeUtils";
import {HtmlRender, HtmlRenderOption} from "../process/html/HtmlRender";
import {searchElementWithIdentifier, travelObject} from "../utils/html/htmlUtils";
import {deepCopy, documentHaveActiveElement} from "../utils/objectUtils";
import {SchemaEditor} from "./component/dashboard/SchemaEditor";

export interface UpdateHtmlOption {
    targetedIdentifier?:string,
    noRedraw?:boolean,
}

// App component
export const App = () => {

    const [editedHtml, setEditedHtml] = useState<EditedHtmlType>(undefined);
    const [selectedSheetIndex, setSelectedSheetIndex] = useState<number>(0);
    const [activeWindow, setActiveWindow] = useState<number>(0);

    const htmlRenderer = useRef<Record<string, HtmlRender>>({});

    const [nodeTypeConfig, setNodeTypeConfig] = useState<Record<NodeType, NodeTypeConfig>>({
        "html": NodeTypeHtmlConfig as NodeTypeConfig
    });



    const [graph, setGraph] = useState<Graph>();
    const [html, setHtml] = useState<HtmlClass>();

    const gpuMotor = useRef<WebGpuMotor | null>(null);

    const Theme = useCreateReducer<ThemeContextType>({
        initialState: ThemeContextDefaultValue
    });

    const Project = useCreateReducer<ProjectContextType>({
        initialState: ProjectContextDefaultValue,
    });


    const openHtmlClassAbortController = useRef<AbortController>(undefined);
    const openHtmlClass = useCallback(async (html:HtmlClass, graph?:Graph) => {
        if(!gpuMotor.current) return;

        // reset state
        //setHideEditPanel(false);
        //gpuMotor.current.enableInteractive(false);
        let htmlGraph = graph;

        if(!htmlGraph || htmlGraph.sheets == undefined) {
            // retrieve graph
            if(openHtmlClassAbortController.current) {
                openHtmlClassAbortController.current.abort();
            }
            openHtmlClassAbortController.current = new AbortController();
            const response = await fetch('http://localhost:8426/api/graph/get', {
                method: "POST",
                signal: openHtmlClassAbortController.current.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspace: "root",
                    retrieveGraph: {
                        buildGraph: true,
                        token: html.graphKeyLinked
                    }
                } as api_graph_html),
            });
            if(response.status === 200) {
                const json = await response.json() as Omit<Graph, "sheets">;
                if(!json) {
                    console.error("Can't retrieve graph with key",html.graphKeyLinked);
                }

                // convert dict to map for each sheet (map can't be send over JSON, so with use dict with key _sheet)
                htmlGraph = {
                    ...json,
                    sheets: Object.fromEntries(
                        Object.entries(json._sheets).map(([sheet, data]) => [
                            sheet,
                            {
                                nodeMap: nodeArrayToMap(data.nodes),
                                edgeMap: edgeArrayToMap(data.edges)
                            },
                        ])
                    ),
                };
                delete (htmlGraph as any)["_sheets"];
            }
        }
        setSelectedSheetIndex(0);
        setGraph(htmlGraph);
        setEditedHtml(undefined);
        setActiveWindow(1);
        setHtml(html);

        if(!gpuMotor.current || !htmlGraph) return;

        const htmlNode = findFirstNodeByType(htmlGraph, "html");
        if(htmlNode) {
            htmlNode.data = html.object;
        }

        gpuMotor.current.setScene({
           nodes: htmlGraph.sheets[htmlGraph.sheetsList[0]].nodeMap,
           edges: htmlGraph.sheets[htmlGraph.sheetsList[0]].edgeMap
        });
        gpuMotor.current.resetViewport();
    }, []);

    const openGraph = useCallback((graph:Graph) => {

    }, []);


    const onCloseEditor = useRef<() => void>(undefined);
    const openHtmlEditor = useCallback((node:Node<any>,htmlRender:HtmlRender, onClose?: () => void) => {
        if(!gpuMotor.current) return;
        onCloseEditor.current = onClose;
        if(node.type === "html" && html) {
            setEditedHtml({node:node, html:html, htmlRender:htmlRender});
        }
    }, [html]);
    const onNodeLeave = useCallback((node:Node<any>) => {
        if(node._key === editedHtml?.node._key) {
            setEditedHtml(undefined);
            onCloseEditor.current?.();
        }

        const nodeLeaveEvent = new CustomEvent("nodeLeave", {});
        const nodeElement = document.querySelector("[data-node-key='"+node._key+"']");
        if(nodeElement) {
            nodeElement.dispatchEvent(nodeLeaveEvent);
        }
    }, [editedHtml]);

    const onNodeEnter = useCallback((node:Node<any>) => {
        const nodeEnterEvent = new CustomEvent("nodeEnter", {});
        const nodeElement = document.querySelector("[data-node-key='"+node._key+"']");
        if(nodeElement) {
            nodeElement.dispatchEvent(nodeEnterEvent);
        }
    }, []);

    const initiateNewHtmlRenderer = useCallback(async (id:string, container:HTMLElement, options?:HtmlRenderOption) => {
        htmlRenderer.current[id] = new HtmlRender(container, options);
        return htmlRenderer.current[id];
    }, []);
    const getHtmlRenderer = useCallback((id:string) => htmlRenderer.current[id], []);


    const updateHtml = useCallback(async (instructions:InstructionBuilder, options?:UpdateHtmlOption) => {
        if(!editedHtml) return;
        const insertedObject = instructions.getValue<HtmlObject>();
        if(insertedObject && insertedObject.identifier != undefined) {
            // ensure each new element have unique identifier
            travelObject(insertedObject, (obj) => {
                obj.identifier = editedHtml.htmlRender.generateUniqueIdentifier();
                return true;
            });
        }
        const newHtml = applyInstruction(editedHtml.html.object, instructions.instruction, (objectBeingApplied) => {
            if(options?.targetedIdentifier && objectBeingApplied != undefined && !Array.isArray(objectBeingApplied) && "identifier" in objectBeingApplied) {
                const object:HtmlObject = objectBeingApplied;
                if(object.identifier !== options?.targetedIdentifier) {
                    console.error("wrong action, target:", options?.targetedIdentifier, "found:", object.identifier);
                    return false;
                }
                return true;
            }
            return true;
        });
        if(newHtml.success) {
            editedHtml.html.object = newHtml.value;
            setEditedHtml({...editedHtml});
            editedHtml.node.data = editedHtml.html.object;
            if(!options?.noRedraw) {
                await editedHtml.htmlRender.render(editedHtml.html.object);
            }
        } else {
            console.error(newHtml);
        }
    }, [editedHtml]);


    const updateGraph = useCallback(async (instructions:InstructionBuilder) => {
        if(!graph) return;

    }, [graph])


    const onExitCanvas = useCallback(() => {
        if(editedHtml) {
            setEditedHtml(undefined);
            onCloseEditor.current?.();
        }
    }, [editedHtml]);

    const onCanvasClick = useCallback(() => {
        if(editedHtml) {
            editedHtml.htmlRender.clearBuildingOverlay();
        }
    }, [editedHtml])



    useEffect(() => {
        const keyDown = async (event:KeyboardEvent) => {
            // Normalize key detection
            const key = event.key.toLowerCase();

            if(documentHaveActiveElement()) return;

            if (event.ctrlKey && key === "c") {
                if(editedHtml != undefined) {
                    // in html
                    const copiedObject = editedHtml.htmlRender.getSelectedObject();
                    if(copiedObject) {
                        sessionStorage.setItem("copiedHtmlObject", JSON.stringify(copiedObject));
                    }
                }
            }else if (event.ctrlKey && key === "v") {
                if(editedHtml != undefined) {
                    // in html
                    const copiedObject = sessionStorage.getItem("copiedHtmlObject") ? JSON.parse(sessionStorage.getItem("copiedHtmlObject")!) : undefined;
                    const selectedObject = editedHtml.htmlRender.getSelectedObject();
                    if(copiedObject && selectedObject) {

                        const instruction = new InstructionBuilder();
                        let pathToSelected = searchElementWithIdentifier(selectedObject.identifier, editedHtml.html.object, instruction);
                        if(pathToSelected) {
                            if(selectedObject.type === "block" && selectedObject.content === undefined) {
                                instruction.key("content").set(copiedObject);

                                const reverseInstruction = getInverseInstruction(editedHtml.html.object, instruction.instruction);
                                // used later for CTRL + Z / CTRL + Y

                                await updateHtml(instruction);
                            } else if(selectedObject.type === "list"){
                                instruction.key("content").arrayAdd(copiedObject);

                                const reverseInstruction = getInverseInstruction(editedHtml.html.object, instruction.instruction);
                                // used later for CTRL + Z / CTRL + Y

                                await updateHtml(instruction);
                            }
                        }
                    }
                }
            } else if (key === "delete") {
                if(editedHtml != undefined) {
                    // in html
                    const selectedObject = editedHtml.htmlRender.getSelectedObject();
                    if (selectedObject && selectedObject.identifier !== "root") {
                        const instruction = new InstructionBuilder();
                        let pathToSelected = searchElementWithIdentifier(selectedObject.identifier, editedHtml.html.object, instruction);
                        if (pathToSelected) {
                            instruction.remove();
                            const reverseInstruction = getInverseInstruction(editedHtml.html.object, instruction.instruction);
                            // used later for CTRL + Z / CTRL + Y

                            await updateHtml(instruction);
                        }
                    }
                }
            }
        }
        document.addEventListener("keydown", keyDown);
        return () => {
            document.removeEventListener("keydown", keyDown);
        }
    }, [editedHtml, updateHtml]);

    const returnToMenu = useCallback(() => {
        setActiveWindow(0);
        setTimeout(() => {

            if(editedHtml) {
                Object.values(htmlRenderer.current).forEach((item) => {
                    item.dispose();
                });
                setEditedHtml(undefined);
                setHtml(undefined);
            }
            gpuMotor.current?.resetScene();
        }, 500);
    }, [editedHtml]);


    return (
        <ThemeContext.Provider value={Theme} >
            <ProjectContext.Provider value={Project} >
                <div style={{width: "100vw", height: "100vh", position:"relative"}}>
                    <SchemaDisplay
                        ref={gpuMotor}
                        onExitCanvas={onExitCanvas}
                        openHtmlEditor={openHtmlEditor}
                        onNodeLeave={onNodeLeave}
                        nodeTypeConfig={nodeTypeConfig}
                        onNodeEnter={onNodeEnter}
                        getHtmlRenderer={getHtmlRenderer}
                        initiateNewHtmlRenderer={initiateNewHtmlRenderer}
                        onCanvasClick={onCanvasClick}
                    />
                    <ThemeContextParser/>
                    <ProjectLoader/>

                    <MultiFade active={activeWindow} timeout={250} extraCss={{position:"absolute", inset:"0px", pointerEvents:"none", overflow: "hidden", zIndex:"10000000"}}>

                        <DashboardWorkFlow openHtmlClass={openHtmlClass} openGraph={openGraph} />

                        <SchemaEditor editedHtml={editedHtml} updateHtml={updateHtml} returnToMenu={returnToMenu} graph={graph} />
                    </MultiFade>

                </div>
            </ProjectContext.Provider>
        </ThemeContext.Provider>
    );
};


// Get the root element
const root = document.getElementById('root');

if (!root) {
    throw new Error('Root element not found');
}
createRoot(root).render(
    <App />
);
// Render the app

