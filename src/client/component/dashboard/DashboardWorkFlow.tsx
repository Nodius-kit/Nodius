import {memo, useCallback, useContext, useEffect, useRef} from "react";
import {HtmlClass, HtmlObject} from "../../../utils/html/htmlType";
import {Graph} from "../../../utils/graph/graphType";
import {HtmlRender} from "../../../process/html/HtmlRender";
import {ProjectContext} from "../../hooks/contexts/ProjectContext";

interface DashboardWorkFlowProps {
}

const object:HtmlObject = {
    tag: "div",
    css: [{
        selector: "&",
        rules: [
            ["background-color", "var(--nodius-background-default)"],
            ["display", "flex"],
            ["justify-content", "center"],
            ["width", "100%"],
            ["height", "100%"]
        ]
    }],
    name: "Container",
    delimiter: true,

    domEvents: [
        {
            name: "load",
            call: `
                globalStorage.load = true;
                // retrieve category
                if(currentStorage.retrieveCategoriesAbort) {
                    currentStorage.retrieveCategoriesAbort.abort();
                }
                currentStorage.retrieveCategoriesAbort = new AbortController();
                let response = await fetch('http://localhost:8426/api/category/list', {
                    method: "POST",
                    signal: currentStorage.retrieveCategoriesAbort.signal,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        workspace: "root"
                    })
                });
                if(response.status === 200) {
                    const json = await response.json();
                    globalStorage.categories = json;
                }
                
                // retrieve HTML WF
                if(currentStorage.retrieveHtmlAbort) {
                    currentStorage.retrieveHtmlAbort.abort();
                }
                currentStorage.retrieveHtmlAbort = new AbortController();
                response = await fetch('http://localhost:8426/api/graph/get', {
                    method: "POST",
                    signal: currentStorage.retrieveHtmlAbort.signal,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        workspace: "root",
                        retrieveHtml: {
                            buildGraph: false,
                            length: 20,
                            offset: 0
                        }
                    }),
                });
                if(response.status === 200) {
                    const json = await response.json();
                    globalStorage.htmlClass = json;
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
        name: "Column",
        delimiter: true,
        type:"list",
        css: [{
            selector: "&",
            rules: [
                ["flex", "1"],
                ["display", "flex"],
                ["max-width", "1200px"],
                ["flex-direction", "column"]
            ]
        }],
        content: [
            {
                type:"array",
                tag:"div",
                name: "Conditional Row",
                delimiter: true,
                css: [
                    {
                        selector: "&",
                        rules: [
                            ["flex", "1"],
                            ["display", "flex"],
                            ["flex-direction", "row"],
                            ["gap", "10px"],
                            ["margin", "20px"]
                        ]
                    }
                ],
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
                    numberOfContent: "LEN(globalStorage.htmlClass)",
                    indexVariableName: "index",
                    content: {
                        type:"block",
                        name: "Container",
                        delimiter: true,
                        css: [],
                        identifier: "2",
                        tag:"div",
                        content: {
                            type:"list",
                            css: [
                                {
                                    selector: "&",
                                    rules: [
                                        ["padding", "50px"],
                                        ["border", "1px solid var(--nodius-grey-700)"],
                                        ["border-radius", "10px"],
                                        ["background-color", "var(--nodius-background-paper)"]
                                    ]
                                }
                            ],
                            identifier: "3",
                            tag: "div",
                            content: [
                                {
                                    type: "text",
                                    tag: "p",
                                    name: "Text",
                                    delimiter: true,
                                    identifier:"5",
                                    css: [],
                                    content: {
                                        "fr": "HTML: {{globalStorage.htmlClass[index].html.name}}",
                                        "en": "HTML: {{globalStorage.htmlClass[index].html.name}}",
                                    },
                                },
                                {
                                    type:"text",
                                    tag:"button",
                                    name: "Text",
                                    delimiter: true,
                                    identifier: "4",
                                    css: [],
                                    content: {
                                        "fr": "edit",
                                        "en": "edit",
                                    },
                                    domEvents: [
                                        {
                                            name:"click",
                                            call: `
                                                const action = await globalStorage.openHtmlClass(globalStorage.htmlClass[index].html, globalStorage.htmlClass[index].graph);
                                                console.log(action);
                                            `
                                        }
                                    ]
                                },
                                {
                                    type:"text",
                                    tag:"button",
                                    name: "Text",
                                    delimiter: true,
                                    identifier: "6",
                                    css: [],
                                    content: {
                                        "fr": "delete",
                                        "en": "delete",
                                    },
                                    domEvents: [
                                        {
                                            name:"click",
                                            call: `
                                               if(currentStorage.retrieveHtmlAbort) {
                                                   currentStorage.retrieveHtmlAbort.abort();
                                               }
                                               currentStorage.retrieveHtmlAbort = new AbortController();
                                               response = await fetch('http://localhost:8426/api/graph/delete', {
                                                   method: "POST",
                                                   signal: currentStorage.retrieveHtmlAbort.signal,
                                                   headers: {
                                                       "Content-Type": "application/json",
                                                   },
                                                   body: JSON.stringify({
                                                       htmlToken: globalStorage.htmlClass[index].html._key
                                                   }),
                                               });
                                            `
                                        }
                                    ]
                                }
                            ]
                        },
                    },
                    noContent: {
                        type:"block",
                        name: "Container",
                        delimiter: true,
                        css: [],
                        identifier: "2-nocontent",
                        tag:"div",
                        content: {
                            type: "list",
                            name: "Row",
                            delimiter: true,
                            css: [
                                {
                                    selector: "&",
                                    rules: [
                                        ["padding", "50px"],
                                        ["border", "1px solid var(--nodius-grey-700)"],
                                        ["border-radius", "10px"],
                                        ["background-color", "var(--nodius-background-paper)"]
                                    ]
                                }
                            ],
                            identifier: "3-nocontent",
                            tag: "div",
                            content: [
                                {
                                    type:"text",
                                    tag:"button",
                                    name: "Text",
                                    delimiter: true,
                                    identifier: "4-nocontent",
                                    css: [],
                                    content: {
                                        "fr": "Create",
                                        "en": "Create",
                                    },
                                    domEvents: [
                                        {
                                            name:"click",
                                            call: `
                                                const name = prompt("Name");
                                                 if(currentStorage.createHtmlClassAbort) {
                                                    currentStorage.createHtmlClassAbort.abort();
                                                }
                                                currentStorage.createHtmlClassAbort = new AbortController();
                                                let response = await fetch('http://localhost:8426/api/graph/create', {
                                                    method: "POST",
                                                    signal: currentStorage.createHtmlClassAbort.signal,
                                                    headers: {
                                                        "Content-Type": "application/json",
                                                    },
                                                    body: JSON.stringify({
                                                        htmlClass: {
                                                            workspace: "root",
                                                            category: "default",
                                                            name: name,
                                                            permission: 0,
                                                            object: {
                                                                type: "block",
                                                                name: "Container",
                                                                delimiter: true,
                                                                tag: "div",
                                                                css: [
                                                                    {
                                                                      selector: "&",
                                                                      rules: [
                                                                        ["height", "100%"],
                                                                        ["width", "100%"]
                                                                      ]
                                                                    }
                                                                ],
                                                                identifier: "root"
                                                            }
                                                        },
                                                    })
                                                });
                                                if(response.status === 200) {
                                                    renderElementWithIdentifier("root");
                                                }
                                             
                                            `
                                        }
                                    ]
                                }
                            ]
                        },
                    }
                }
            }
        ]
    }

}

export const DashboardWorkFlow = memo(({

}:DashboardWorkFlowProps) => {


    const renderDashboard = useRef<HtmlRender>(undefined);
    const Project = useContext(ProjectContext);

    const container = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if(!Project.state.openHtmlClass) return;
        if(container.current) {
            renderDashboard.current = new HtmlRender(container.current);
            renderDashboard.current.setVariableInGlobalStorage("openHtmlClass", Project.state.openHtmlClass);
            renderDashboard.current.setVariableInGlobalStorage("openHtmlClass", Project.state.openNodeConfig);
            renderDashboard.current.render(object);
        }

        return () => {
            if(renderDashboard.current) {
                renderDashboard.current.dispose();
                renderDashboard.current = undefined;
            }
        }
    }, [container.current]);

    return (
        <div ref={container} style={{width:"100%", height:"100%", pointerEvents:"all"}}>

        </div>
    )
});