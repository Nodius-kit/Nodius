import {memo, useContext, useEffect, useRef, useState} from "react";
import {HtmlClass} from "../../../utils/html/htmlType";
import {ProjectContext} from "../../hooks/contexts/ProjectContext";
import {Graph} from "../../../utils/graph/graphType";
import {MultiFade} from "../animate/MultiFade";

interface DashboardWorkspaceProps {
    openHtmlClass: (html:HtmlClass) => void
}

export const DashboardWorkspace = memo(({openHtmlClass}:DashboardWorkspaceProps) => {

    const Project = useContext(ProjectContext);

    const [htmlClass, setHtmlClass] = useState<HtmlClass[]>([]);
    const [graphs, setGraphs] = useState<Graph[]>([]);

    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>("default");

    const [activeTab, setActiveTab] = useState<number>(0);

    useEffect(() => {
        retrieveHtmlBuild();
        return () => {
            if(retrieveHtmlBuildAbortControler.current) {
                retrieveHtmlBuildAbortControler.current.abort();
            }
        }
    }, [selectedCategory]);

    useEffect(() => {
        retrieveCategories();
        return () => {
            if(retrieveCategoriesAbort.current) {
                retrieveCategoriesAbort.current.abort();
            }
        }
    }, []);

    useEffect(() => {
        htmlClass.forEach((html) => {
            window.nodius.storage.htmlClass.set(html.workspace+"-"+html.identifier, html);
        })
    }, [htmlClass]);
    useEffect(() => {
        graphs.forEach((graph) => {
            window.nodius.storage.graphs.set(graph.workspace+"-"+graph.identifier, graph);
        })
    }, [graphs]);

    const retrieveCategoriesAbort = useRef<AbortController|undefined>(undefined);
    const retrieveCategories = async () => {
        if(retrieveCategoriesAbort.current) {
            retrieveCategoriesAbort.current.abort();
        }
        retrieveCategoriesAbort.current = new AbortController();
        const response = await fetch(`http://localhost:8426/api/htmlclass/categories`, {
            method: "POST",
            signal: retrieveCategoriesAbort.current.signal,
            headers: {
                "Content-Type": "application/json",
            },
        });
        if(response.status === 200) {
            const json = await response.json();
            console.log("category", json);
            setAvailableCategories(json);
        }
        retrieveCategoriesAbort.current = undefined;
    };

    const retrieveHtmlBuildAbortControler = useRef<AbortController>(undefined);
    const retrieveHtmlBuild = async () => {
        Project.dispatch({
            field:"loader",
            value: {...Project.state.loader, active:true}
        });

        if(retrieveHtmlBuildAbortControler.current) {
            retrieveHtmlBuildAbortControler.current.abort();
        }
        retrieveHtmlBuildAbortControler.current = new AbortController();
        const response = await fetch(`http://localhost:8426/api/htmlclass/list/${selectedCategory}`, {
            method: "POST",
            signal: retrieveHtmlBuildAbortControler.current.signal,
            headers: {
                "Content-Type": "application/json",
            },
        });
        if(response.status === 200) {
            const json = await response.json();
            console.log("html", json);
            setHtmlClass(json);
        }
        retrieveHtmlBuildAbortControler.current = undefined;
        Project.dispatch({
            field:"loader",
            value: {...Project.state.loader, active:false}
        });
    }

    const createHtmlClassAbort = useRef<AbortController|undefined>(undefined);
    const createHtmlClass = async () => {
        const className = prompt("New html class name:");
        if(!className || className.trim().length === 0) return;

        if(createHtmlClassAbort.current) {
            createHtmlClassAbort.current.abort();
        }
        createHtmlClassAbort.current = new AbortController();

        const newClass:Omit<HtmlClass, "_key"> = {
            workspace: "user",
            identifier: "",
            description: "",
            owner: "",
            version: 0,
            category: "default",
            permission: 0,
            object: {
                type: "block",
                tag: "div",
                css: {height:"100%", width:"100%"},
                idenfitier: "root"
            },
            name: className
        }
        const response = await fetch(`http://localhost:8426/api/htmlclass/create`, {
            method: "POST",
            signal: createHtmlClassAbort.current.signal,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                htmlClass: newClass
            }),
        });
        if(response.status === 200) {
            await retrieveHtmlBuild();
        }
        createHtmlClassAbort.current = undefined;
    }

    return (
        <div style={{backgroundColor:"var(--nodius-background-default)", display:"flex", justifyContent:"center", width:"100%", height:"100%", pointerEvents:"all"}}>
            <div style={{flex:"1", display:"flex", maxWidth:"1200px", flexDirection:"column"}}>

                <div>
                    <button onClick={() => setActiveTab(0)}>
                        Workflows
                    </button>
                    <button onClick={() => setActiveTab(1)}>
                        Web Workflows
                    </button>
                </div>

                <div style={{flex:"1"}}>
                    <MultiFade active={activeTab} timeout={250}>
                        <div style={{display:"flex", flexDirection:"row"}}>
                            {graphs.map((graph, i) => (
                                <div key={i} style={{width:"300px", height:"400px", backgroundColor:"var(--nodius-background-paper)"}}>
                                    {graph.name}
                                </div>
                            ))}
                        </div>
                        <div style={{display:"flex", flexDirection:"row", gap:"10px"}}>
                            {htmlClass.map((html, i) => (
                                <div key={i} style={{   width:"200px",
                                    height:"300px",
                                    backgroundColor:"var(--nodius-background-paper)",
                                    display:"flex",
                                    justifyContent:"center",
                                    flexDirection:"column",
                                    alignItems:"center",
                                    cursor:"pointer"
                                }} onClick={() => openHtmlClass(html)}>
                                    {html.name}
                                </div>
                            ))}
                            <div style={{
                                width:"200px",
                                height:"300px",
                                backgroundColor:"var(--nodius-background-paper)",
                                display:"flex",
                                justifyContent:"center",
                                flexDirection:"column",
                                alignItems:"center",
                                cursor:"pointer"

                            }} onClick={() => createHtmlClass()}>
                                create one
                            </div>
                        </div>
                    </MultiFade>
                </div>

            </div>
        </div>
    )
});
DashboardWorkspace.displayName = "DashboardWorkspace";
