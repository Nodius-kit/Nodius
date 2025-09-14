
import {Fade} from "./Fade";
import {ProjectContext} from "../../hooks/contexts/ProjectContext";
import {memo, useCallback, useContext, useEffect, useRef} from "react";
import {HtmlObject} from "../../../utils/html/htmlType";
import {HtmlRender} from "../../../process/html/HtmlRender";

const object:HtmlObject = {
    tag: "div",
    css: {},
    identifier: "0",
    type: "html",
    content: `
       <svg width="300" height="150" xmlns="http://www.w3.org/2000/svg">
          <path 
            fill="none" 
            style="stroke: var(--nodius-primary-main);" 
            stroke-width="15" 
            stroke-linecap="round" 
            stroke-dasharray="300 385" 
            stroke-dashoffset="0" 
            d="M275 75c0 31-27 50-50 50-58 0-92-100-150-100-28 0-50 22-50 50s23 50 50 50c58 0 92-100 150-100 24 0 50 19 50 50Z">
              <animate 
                attributeName="stroke-dashoffset" 
                calcMode="spline" 
                dur="2s" 
                values="685;-685" 
                keySplines="0 0 1 1" 
                repeatCount="indefinite" />
          </path>
        </svg>
    `
}

export const ProjectLoader = memo(() => {
    const Project = useContext(ProjectContext);

    const renderSvg = useRef<HtmlRender>(undefined);

    const setContainer = useCallback((node: HTMLDivElement | null) => {
        if (node && !renderSvg.current) {
            renderSvg.current = new HtmlRender(node);
            renderSvg.current.render(object);
        } else if(renderSvg.current) {
            renderSvg.current.dispose();
        }
    }, []);

    return (
        <Fade in={false} unmountOnExit={true}>
            <div ref={setContainer} style={{width:'100%', height:'100%', position:'absolute', display:"flex", justifyContent:"center", alignItems:"center", inset:"0px", backgroundColor:"var(--nodius-background-default)"}} >
            </div>
        </Fade>
    )
});
ProjectLoader.displayName = "ProjectLoader";