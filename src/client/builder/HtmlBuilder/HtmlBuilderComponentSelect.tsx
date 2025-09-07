import {BuilderComponent, HtmlObject, HtmlText, insertEvent} from "./HtmlBuildType";
import {deepCopy} from "../../../utils/numericUtils";

interface HtmlBuilderComponentSelectProps {
    selectedObject:HtmlObject
}

const allComponents:BuilderComponent[] = [
    {
        name: "Block",
        object: {
            type: "block",
            tag: "div",
            css: {
                paddingTop: "15px",
                paddingBottom: "15px",
                paddingRight: "15px",
                paddingLeft: "15px",
                minHeight:"50px"
            },
            id: 0
        }
    },
    {
        name: "text",
        object: {
            type: "text",
            tag: "div",
            css: {},
            content: "Your text here",
            id: 0
        }
    },
    {
        name:"row",
        object: {
            type:"list",
            tag:"div",
            css: {
                display:"flex",
                paddingTop: "15px",
                paddingBottom: "15px",
                paddingRight: "15px",
                paddingLeft: "15px",
                minHeight:"50px"
            },
            content: [],
            id: 0
        }
    }
]

export const HtmlBuilderComponentSelect = ({selectedObject}:HtmlBuilderComponentSelectProps) => {



    const onMouseDown = (e:MouseEvent) => {

        //lets find data-index
        const deepSearch = (element:HTMLElement) : undefined|{component:BuilderComponent, element:HTMLElement} => {
            if(element.hasAttribute("data-index")) {
                return {component: allComponents[parseInt(element.getAttribute("data-index")!)], element:element};
            } else {
                return (!element.parentElement || element.parentElement.tagName.toLowerCase() === "body") ? undefined : deepSearch(element.parentElement);
            }
        }

        const search = deepSearch(e.target as HTMLElement);
        if(!search) return;

        const element = search.element;
        const component = deepCopy(search.component);

        if(e.ctrlKey) {
            // fast
            if(!selectedObject) return;

            const element = document.querySelector("[data-object-id='"+selectedObject.id+"']") as HTMLElement;
            if(element.hasAttribute("data-inserteable") && element.getAttribute("data-inserteable") === "true") {
                element.dispatchEvent(new CustomEvent("insert", {
                    detail: {
                        component:component,
                        preview:false,
                    },
                    bubbles: false,
                }));
            }
            return;
        }

        const startX = e.clientX;
        const startY = e.clientY;

        const floatingElement = document.createElement("div");

        const rect = element.getBoundingClientRect();

        floatingElement.style.position = "absolute";
        floatingElement.style.left = (startX-rect.width/2) + "px";
        floatingElement.style.top = startY + "px";


        floatingElement.style.height = rect.height + "px";
        floatingElement.style.width = rect.width + "px";

        floatingElement.appendChild(element.cloneNode(true));

        document.body.appendChild(floatingElement);

        element.style.scale="0";
        let lastPointedElement:HTMLElement|undefined;

        const onMouseMove = (e:MouseEvent) => {
            floatingElement.style.left = (e.clientX-rect.width/2) +"px";
            floatingElement.style.top = e.clientY +"px";

            let pointedElement = document.elementFromPoint(e.clientX , e.clientY-2)!;
            if(pointedElement && pointedElement.hasAttribute("data-inserteable") && pointedElement.getAttribute("data-inserteable") === "false") {
                pointedElement = pointedElement.parentElement! as HTMLElement;
            }

            if(lastPointedElement && pointedElement != lastPointedElement && lastPointedElement.hasAttribute("data-object-id")) {
                lastPointedElement.dispatchEvent(new CustomEvent<insertEvent>("insert", {
                    detail: {
                        cursorX: e.clientX,
                        cursorY: e.clientY,
                    }, // tell to reset
                    bubbles: false,
                }));
                lastPointedElement = undefined;
            }

            /*if(!pointedElement || !pointedElement.hasAttribute("data-inserteable") || pointedElement.getAttribute("data-inserteable") === "false") {
                if(lastPointedElement != undefined) {
                    lastPointedElement.dispatchEvent(new CustomEvent<insertEvent>("insert", {
                        detail: {
                            cursorX: e.clientX,
                            cursorY: e.clientY,
                        }, // tell to reset
                        bubbles: false,
                    }));
                    lastPointedElement = undefined;
                }
                return;
            }*/


            lastPointedElement = pointedElement as HTMLElement;
            pointedElement.dispatchEvent(new CustomEvent<insertEvent>("insert", {
                detail: {
                    component:component,
                    preview:true,
                    cursorX: e.clientX,
                    cursorY: e.clientY,
                },
                bubbles: false,
            }));
        }
        const onMouseUp = (e:MouseEvent) => {
            element.style.scale = "1";
            document.body.removeChild(floatingElement);

            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);

            let pointedElement = document.elementFromPoint(e.clientX , e.clientY-2);
            if(pointedElement && pointedElement.hasAttribute("data-inserteable") && pointedElement.getAttribute("data-inserteable") === "false") {
                pointedElement = pointedElement!.parentElement as HTMLElement;
            }
            if(!pointedElement || !pointedElement.hasAttribute("data-inserteable")) return;
            pointedElement.dispatchEvent(new CustomEvent("insert", {
                detail: {
                    component:component,
                    preview:false,
                },
                bubbles: false,
            }));
        }

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }


    return (
        <div style={{"display":"flex", flexDirection:"row", height:"100%", width:"100%", flexWrap:"wrap", gap:"10px"}}>
            {allComponents.map((component, i) => (
                <div key={i} style={{padding:"5px 10px", border: "1px solid black", transition:"all 0.3s ease-in-out", cursor:"pointer"}} data-index={i} onMouseDown={onMouseDown} >
                    {component.name}
                </div>
            ))}

        </div>
    )
}