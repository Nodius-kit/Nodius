import {forwardRef, memo, useContext, useEffect, useRef, useState} from "react";
import {HtmlBuilderCategoryType, HtmlBuilderComponent} from "../../../utils/html/htmlType";
import {LeftPaneMenu} from "./Editor/LeftPaneMenu";
import {MultiFade} from "../animate/MultiFade";
import {LeftPanelComponentEditor} from "./Editor/LeftPanelComponentEditor";
import {ResizeBar} from "../animate/ResizeBar";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";
import {ArrowLeftFromLine} from "lucide-react";
import {Fade} from "../animate/Fade";
import {LeftPaneComponentTree} from "./Editor/LeftPanelComponentTree";
import {RightPanelComponentEditor} from "./Editor/RightPanelComponentEditor";
import {LeftPanelTypeEditor} from "./Editor/LeftPanelTypeEditor";
import {LeftPanelEnumEditor} from "./Editor/LeftPanelEnumEditor";
import {LeftPanelEntryTypeSelect} from "./Editor/LeftPanelEntryTypeSelect";
import {ProjectContext} from "../../hooks/contexts/ProjectContext";
import {WebGpuMotor} from "../../schema/motor/webGpuMotor";

interface SchemaEditorProps  {
    returnToMenu: () => void,
}

export type editingPanel = "component" | "hierarchy" | "type" | "enum" | "entryData" | ""

export const SchemaEditor = memo(forwardRef<WebGpuMotor, SchemaEditorProps>(({
    returnToMenu,
}, motorRef) => {

    const [editingPanel, setEditingPanel] = useState<editingPanel>("");
    const [subLeftMenuWidth, setSubLeftMenuWidth] = useState<number>(0);
    const [leftPanelWidth, setLeftPanelWidth] = useState<number>(345);
    const [rightPanelWidth, setRightPanelWidth] = useState<number>(300);

    const leftContainer = useRef<HTMLDivElement>(null);
    const rightContainer = useRef<HTMLDivElement>(null);

    const Project = useContext(ProjectContext);

    const Theme = useContext(ThemeContext);


    useEffect(() => {
        retrieveComponentList();
    }, []);

    const [componentsList, setComponentsList] = useState<
        Partial<Record<HtmlBuilderCategoryType, HtmlBuilderComponent[]>> | undefined
    >(undefined);
    const retrieveComponentListAbortController = useRef<AbortController>(undefined);
    const retrieveComponentList = async () => {
        if(retrieveComponentListAbortController.current) {
            retrieveComponentListAbortController.current.abort();
        }

        retrieveComponentListAbortController.current = new AbortController();
        const response = await fetch('http://localhost:8426/api/builder/components', {
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

    const noEditingPrevious = useRef<boolean>(true);
    useEffect(() => {
        if(noEditingPrevious.current && Project.state.editedHtml) {
            noEditingPrevious.current = false;
            setEditingPanel("component");
        } else if(!noEditingPrevious.current && !Project.state.editedHtml) {
            noEditingPrevious.current = true;
            setEditingPanel("");
        }
    }, [Project.state.editedHtml]);

    const activeFade = editingPanel === "component" ? 0 : (
        editingPanel === "hierarchy" ? 1 : (
            editingPanel === "type" ? 2 : (
                editingPanel === "enum" ? 3 : (
                    editingPanel === "entryData" ? 4 : -1
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
                <LeftPaneMenu setEditingPanel={setEditingPanel} editingPanel={editingPanel} setMenuWidth={setSubLeftMenuWidth} returnToMenu={returnToMenu} />
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
                    </MultiFade>
                </div>
                <ResizeBar
                    type={"vertical"}
                    glueTo={"right"}
                    offsetBar={true}
                    value={leftPanelWidth}
                    setValue={setLeftPanelWidth}
                    show={editingPanel !== "" && Project.state.editedHtml != undefined}
                    beforeResize={() => leftContainer.current!.style.transition = "none"}
                    afterResize={() => leftContainer.current!.style.transition = "var(--nodius-transition-default)"}
                    maxValue={600}
                    minValue={345}
                />
                <Fade in={editingPanel !== ""} timeout={300} unmountOnExit={true}>
                    <div style={{position:"absolute", top: "10px", right:"-55px", padding:"6px", backgroundColor:"var(--nodius-background-paper)", cursor:"pointer", borderRadius:"8px"}} onClick={() => {setEditingPanel("")}}>
                        <ArrowLeftFromLine />
                    </div>
                </Fade>
            </div>
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
                <RightPanelComponentEditor componentsList={componentsList} />
            </div>
        </div>
    )
}));

SchemaEditor.displayName = "SchemaEditor";