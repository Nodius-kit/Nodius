
import "./public/css/theme.css"



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
import {HtmlClass} from "../utils/html/htmlType";
import {MultiFade} from "./component/animate/MultiFade";
import {HtmlEditor} from "./component/dashboard/HtmlEditor";
import {InstructionBuilder} from "../utils/sync/InstructionBuilder";
import {WebGpuMotor} from "./schema/motor/webGpuMotor";
import {Graph} from "../utils/graph/graphType";
import {DashboardWorkFlow} from "./component/dashboard/DashboardWorkFlow";

// App component
export const App = () => {

    const [editedHtml, setEditedHtml] = useState<HtmlClass|undefined>(undefined);
    const [hideEditPanel, setHideEditPanel] = useState<boolean>(false);

    const [graph, setGraph] = useState<Graph>();

    const motorRef = useRef<WebGpuMotor | null>(null);

    const Theme = useCreateReducer<ThemeContextType>({
        initialState: ThemeContextDefaultValue
    });

    const Project = useCreateReducer<ProjectContextType>({
        initialState: ProjectContextDefaultValue,
    });

    useEffect(() => {
        if(!window.nodius) {
            window.nodius = {
                storage: {
                    htmlClass: new Map(),
                    graphs: new Map()
                }
            }
        }
    }, []);

    const openHtmlClass = useCallback((html:HtmlClass) => {
        if(!motorRef.current) return;

        // reset state
        setHideEditPanel(false);
        motorRef.current.enableInteractive(false);

        if(html.graphKeyLinked) {
            // retrieve graph

        }
        setEditedHtml(html);
    }, []);

    const openGraph = useCallback((graph:Graph) => {

    }, []);

    const updateHtml = useCallback((instructions:InstructionBuilder) => {

    }, [editedHtml]);

    /*
    if user is currently editing html, double click on canvas mean exit the editor
     */
    const onDoubleClickOnCanvas = useCallback((evt:MouseEvent) => {
        if(!motorRef.current) return;
        if(!graph) {
            if (confirm("Move to a HTML Workflow ?")) {

            }
            return;
        }
        if(!hideEditPanel) {
            setHideEditPanel(true);
            motorRef.current.enableInteractive(true);
        }
    }, [hideEditPanel, graph])

    return (
        <ThemeContext.Provider value={Theme} >
            <ProjectContext.Provider value={Project} >
                <div style={{width: "100vw", height: "100vh", position:"relative"}}>
                    <SchemaDisplay onDoubleClickOnCanvas={onDoubleClickOnCanvas} ref={motorRef}/>
                    <ThemeContextParser/>
                    <ProjectLoader/>

                    <MultiFade active={editedHtml != undefined ? 1 : (0)} timeout={250} extraCss={{position:"absolute", inset:"0px", pointerEvents:"none"}}>

                        <DashboardWorkFlow openHtmlClass={openHtmlClass} openGraph={openGraph} />

                        <HtmlEditor editedHtml={editedHtml} hidePanel={hideEditPanel} updateHtml={updateHtml}/>
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
