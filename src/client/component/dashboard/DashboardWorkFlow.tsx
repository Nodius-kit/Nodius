import {memo, useCallback, useRef} from "react";
import {HtmlClass, HtmlObject} from "../../../utils/html/htmlType";
import {Graph} from "../../../utils/graph/graphType";
import {HtmlRender} from "../../../process/html/HtmlRender";

interface DashboardWorkFlowProps {
    openHtmlClass: (html:HtmlClass) => void,
    openGraph: (graph:Graph) => void,
}

const object:HtmlObject = {
    tag: "div",
    css: {
        backgroundColor:"var(--nodius-background-default)",
        display:"flex",
        justifyContent:"center",
        width:"100%",
        height:"100%",
    },

    domEvents: [
        {
            name: "load",
            call: `
                globalStorage.load = true;
            
                if(currentStorage.retrieveCategoriesAbort) {
                    currentStorage.retrieveCategoriesAbort.abort();
                }
                currentStorage.retrieveCategoriesAbort = new AbortController();
                const response = await fetch('http://localhost:8426/api/category/list', {
                    method: "POST",
                    signal: currentStorage.retrieveCategoriesAbort.signal,
                    headers: {
                        "Content-Type": "application/json",
                    }
                });
                if(response.status === 200) {
                    const json = await response.json();
                    globalStorage.categories = json;
                    console.log(json);
                }
                
                globalStorage.load = false;
            `
        }
    ],

    identifier: "root",
    type: "block",
    content: {
        tag: "div",
        identifier: "0",
        type:"list",
        css: {flex:"1", display:"flex", maxWidth:"1200px", flexDirection:"column"},
        content: [
            {
                type:"array",
                tag:"div",
                css: {flex:"1", display:"flex", flexDirection:"row", gap:"10px"},
                identifier: "1",
                workflowEvents: [
                    {
                        name: "variableChange",
                        call: `
                            if (event.variable === 'htmlClass') {
                                renderElement();
                            }
                        `
                    }
                ],
                content: {
                    numberOfContent: "LEN(globalStorage.categories)",
                    indexVariableName: "index",
                    content: {
                        type:"html",
                        css: {},
                        identifier: "2",
                        tag:"div",
                        content: "index {{index}}",
                    },
                    noContent: {
                        type:"html",
                        css: {},
                        identifier: "2",
                        tag:"div",
                        content: "no content ",
                    }
                }
            }
        ]
    }

}

export const DashboardWorkFlow = memo(({
    openGraph,
    openHtmlClass
}:DashboardWorkFlowProps) => {

    const renderDashboard = useRef<HtmlRender>(undefined);

    const setContainer = useCallback((node: HTMLDivElement | null) => {
        if (node) {
            if(!renderDashboard.current) {
                renderDashboard.current = new HtmlRender(node);
            }
            renderDashboard.current.render(object);
        } else if(renderDashboard.current) {
            renderDashboard.current.dispose();
        }
    }, []);

    return (
        <div ref={setContainer} style={{width:"100%", height:"100%", pointerEvents:"all"}}>

        </div>
    )
});