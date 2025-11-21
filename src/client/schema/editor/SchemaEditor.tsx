/**
 * @file SchemaEditor.tsx
 * @description Visual schema editor with multi-panel interface for editing HTML workflows and node configs
 * @module dashboard
 *
 * Main visual editor component providing comprehensive editing capabilities:
 * - SchemaEditor: Multi-panel editor with left/right sidebars and center canvas
 * - Panel system: Component editor, hierarchy tree, type editor, enum editor, entry data selector
 * - Resizable panels: Dynamic width adjustment for left and right panels
 * - WebGPU integration: Forwards ref to WebGpuMotor for graph visualization
 *
 * Key features:
 * - MultiFade animation for smooth panel transitions
 * - Collapsible panels with animated show/hide
 * - Component library fetching and categorization
 * - Dynamic panel width constraints (min/max values)
 * - Integration with ProjectContext for active workflow state
 * - ResizeBar components for user-controlled panel sizing
 */

import {forwardRef, memo, useCallback, useContext, useEffect, useRef, useState} from "react";
import {HtmlBuilderCategoryType, HtmlBuilderComponent} from "../../../utils/html/htmlType";

import {NodeType, NodeTypeConfig} from "../../../utils/graph/graphType";
import {AppMenuProps} from "../../hooks/contexts/ProjectContext";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";
import {ProjectContext} from "../../hooks/contexts/ProjectContext";
import {Fade} from "../../component/animate/Fade";
import {ArrowLeftFromLine, ArrowRightFromLine} from "lucide-react";
import {MultiFade} from "../../component/animate/MultiFade";
import {LeftPanelMenu} from "./menu/LeftPanelMenu";
import {LeftPanelTypeEditor} from "./menu/LeftPanelTypeEditor";
import {LeftPanelEnumEditor} from "./menu/LeftPanelEnumEditor";
import {ResizeBar} from "../../component/animate/ResizeBar";
import {CodeEditorModal} from "../../component/code/CodeEditorModal";
import {LeftPanelComponentEditor} from "./menu/LeftPanelComponentEditor";
import {LeftPaneComponentTree} from "./menu/LeftPanelComponentTree";
import {RightPanelComponentEditor} from "./menu/RightPanelComponentEditor";
import {RightPanelHandleConfig} from "./menu/RightPanelHandleConfig";
import {LeftPanelEntryTypeSelect} from "./menu/LeftPanelEntryTypeSelect";
import {LeftPanelNodeLibrary} from "./menu/LeftPanelNodeLibrary";
import {SaveStatusOverlay} from "./SaveStatusOverlay";


export type editingPanel = "component" | "hierarchy" | "type" | "enum" | "entryData" | "nodeLibrary" | ""

export const SchemaEditor = memo(({}:AppMenuProps) => {

    const [editingPanel, setEditingPanel] = useState<editingPanel>("");
    const [subLeftMenuWidth, setSubLeftMenuWidth] = useState<number>(0);
    const [leftPanelWidth, setLeftPanelWidth] = useState<number>(345);
    const [rightPanelWidth, setRightPanelWidth] = useState<number>(300);

    const leftContainer = useRef<HTMLDivElement>(null);
    const rightContainer = useRef<HTMLDivElement>(null);

    const Project = useContext(ProjectContext);

    const Theme = useContext(ThemeContext);

    // Fetch available components and node configs on mount
    useEffect(() => {
        retrieveComponentList();
        retrieveNodeConfigs();
    }, []);

    const [componentsList, setComponentsList] = useState<
        Partial<Record<HtmlBuilderCategoryType, HtmlBuilderComponent[]>> | undefined
    >(undefined);
    const retrieveComponentListAbortController = useRef<AbortController>(undefined);

    const [nodeConfigsList, setNodeConfigsList] = useState<NodeTypeConfig[] | undefined>(undefined);
    const retrieveNodeConfigsAbortController = useRef<AbortController>(undefined);

    /**
     * Fetches and categorizes available HTML builder components
     * Groups components by category for organized display in the component panel
     */
    const retrieveComponentList = async () => {
        if(retrieveComponentListAbortController.current) {
            retrieveComponentListAbortController.current.abort();
        }

        retrieveComponentListAbortController.current = new AbortController();
        const response = await fetch('/api/builder/components', {
            method: "POST",
            signal: retrieveComponentListAbortController.current.signal,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                workspace: "root",
            }),
        });

        if(response.status === 200) {
            const json = await response.json() as HtmlBuilderComponent[];
            // Group components by category for organized display
            const components = json.reduce((acc, component) => {
                if (!acc[component.category]) {
                    acc[component.category] = [];
                }
                acc[component.category].push(component);
                return acc;
            }, {} as Record<HtmlBuilderCategoryType, HtmlBuilderComponent[]>)
            setComponentsList(components);
        } else {
            setComponentsList(undefined);
        }
    }

    /**
     * Fetches available node configurations from the database
     * Node configs define custom node types that can be placed in the graph
     */
    const retrieveNodeConfigs = async () => {
        if(retrieveNodeConfigsAbortController.current) {
            retrieveNodeConfigsAbortController.current.abort();
        }

        retrieveNodeConfigsAbortController.current = new AbortController();
        try {
            const response = await fetch('/api/nodeconfig/list', {
                method: "POST",
                signal: retrieveNodeConfigsAbortController.current.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspace: "root",
                }),
            });

            if(response.status === 200) {
                const json = await response.json() as NodeTypeConfig[];
                setNodeConfigsList(json);
                for(const config of json) {
                    Project.state.nodeTypeConfig[config._key as NodeType] = config;
                }
                Project.dispatch({
                    field: "nodeTypeConfig",
                    value: {...Project.state.nodeTypeConfig}
                })
            } else {
                setNodeConfigsList(undefined);
            }
        } catch(error) {
            if ((error as Error).name !== 'AbortError') {
                console.error("Error fetching node configs:", error);
                setNodeConfigsList(undefined);
            }
        }
    }

    // Track previous editing state to auto-open component panel when workflow is opened
    const noEditingPrevious = useRef<boolean>(true);
    useEffect(() => {
        // Auto-open component editor when a workflow is opened
        if(noEditingPrevious.current && Project.state.editedHtml) {
            noEditingPrevious.current = false;
            setEditingPanel("component");
        } else if(!noEditingPrevious.current && !Project.state.editedHtml) {
            // Close panel when workflow is closed
            noEditingPrevious.current = true;
            setEditingPanel("");
        }
    }, [Project.state.editedHtml]);


    // Map editing panel to MultiFade index for smooth transitions
    const activeFade = editingPanel === "component" ? 0 : (
        editingPanel === "hierarchy" ? 1 : (
            editingPanel === "type" ? 2 : (
                editingPanel === "enum" ? 3 : (
                    editingPanel === "entryData" ? 4 : (
                        editingPanel === "nodeLibrary" ? 5 : -1
                    )
                )
            )
        )
    );

    return (
        <div>
            <div ref={leftContainer} style={{
                position:"absolute",
                top:"0",
                left:0+"px",
                width:(editingPanel === "" ? subLeftMenuWidth : leftPanelWidth)+"px",
                height:"100%",
                backgroundColor:"var(--nodius-background-default)",
                boxShadow: "var(--nodius-shadow-4)",
                transition: "var(--nodius-transition-default)",
                pointerEvents:"all",

                display:"flex",
                flexDirection:"row"
            }}>
                <CodeEditorModal/>
                <LeftPanelMenu setEditingPanel={setEditingPanel} editingPanel={editingPanel} setMenuWidth={setSubLeftMenuWidth} />
                <div style={{flex:"1"}}>
                    <MultiFade active={activeFade} timeout={200}>

                        <div style={{display:"flex", width:"100%", height:"100%", flexDirection:"column", padding:"8px", gap:"12px"}}>
                            <LeftPanelComponentEditor componentsList={componentsList} />

                        </div>
                        <div style={{display:"flex", width:"100%", height:"100%", flexDirection:"column", padding:"8px", gap:"12px",}}>
                            <LeftPaneComponentTree componentsList={componentsList} />

                        </div>
                        <div style={{display:"flex", width:"100%", height: "100%", flexDirection:"column", padding: "8px", gap:"12px"}}>
                            <LeftPanelTypeEditor />
                        </div>
                        <div style={{display:"flex", width:"100%", height: "100%", flexDirection:"column", padding: "8px", gap:"12px"}}>
                            <LeftPanelEnumEditor />
                        </div>
                        <div style={{display:"flex", width:"100%", height: "100%", flexDirection:"column", padding: "8px", gap:"12px"}}>
                            <LeftPanelEntryTypeSelect />
                        </div>
                        <div style={{display:"flex", width:"100%", height: "100%", flexDirection:"column", padding: "8px", gap:"12px"}}>
                            <LeftPanelNodeLibrary nodeConfigsList={nodeConfigsList} />
                        </div>

                    </MultiFade>
                </div>
                <ResizeBar
                    type={"vertical"}
                    glueTo={"right"}
                    offsetBar={true}
                    value={leftPanelWidth}
                    setValue={setLeftPanelWidth}
                    show={editingPanel !== "" }
                    beforeResize={() => leftContainer.current!.style.transition = "none"}
                    afterResize={() => leftContainer.current!.style.transition = "var(--nodius-transition-default)"}
                    maxValue={600}
                    minValue={345}
                    aditionnalStyle={{zIndex:1}}

                />
                <Fade in={editingPanel !== ""} timeout={300} unmountOnExit={true}>
                    <div style={{position:"absolute", top: "10px", right:"-55px", padding:"6px", backgroundColor:"var(--nodius-background-paper)", cursor:"pointer", borderRadius:"8px"}} onClick={() => {setEditingPanel("")}}>
                        <ArrowLeftFromLine />
                    </div>
                </Fade>
            </div>
            {/* Right panel for HTML component editing */}
            <div ref={rightContainer} style={{
                position:"absolute",
                top:"0",
                right:(!Project.state.editedHtml ? -rightPanelWidth : 0)+"px",
                width:rightPanelWidth+"px",
                height:"100%",
                backgroundColor:"var(--nodius-background-default)",
                boxShadow: "var(--nodius-shadow-4)",
                transition: "var(--nodius-transition-default)",
                pointerEvents:"all",
            }}>
                <RightPanelComponentEditor
                    componentsList={componentsList}
                />
            </div>

            {/* Right panel for handle configuration */}

            <div style={{
                position:"absolute",
                top:"0",
                right:(!Project.state.editedNodeHandle ? -rightPanelWidth : 0)+"px",
                width:rightPanelWidth+"px",
                height:"100%",
                backgroundColor:"var(--nodius-background-default)",
                boxShadow: "var(--nodius-shadow-4)",
                transition: "var(--nodius-transition-default)",
                pointerEvents:"all",
                zIndex: 1,
            }}>
                <RightPanelHandleConfig />
                <Fade in={!!Project.state.editedNodeHandle} timeout={300} unmountOnExit={true}>
                    <div style={{
                        position:"absolute",
                        top: "10px",
                        left:"-55px",
                        padding:"6px",
                        backgroundColor:"var(--nodius-background-paper)",
                        cursor:"pointer",
                        borderRadius:"8px"
                    }} onClick={() => {
                        Project.dispatch({ field: "editedNodeHandle", value: undefined });
                    }}>
                        <ArrowRightFromLine />
                    </div>
                </Fade>
            </div>
            <SaveStatusOverlay right={(Project.state.editedNodeHandle || Project.state.editedHtml ? rightPanelWidth : 0)} />

        </div>
    )
});

SchemaEditor.displayName = "SchemaEditor";