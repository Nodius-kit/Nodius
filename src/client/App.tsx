import {JSX, useContext, useEffect, useRef} from "react";
import {ThemeContext} from "./hooks/contexts/ThemeContext";
import {ProjectContext} from "./hooks/contexts/ProjectContext";
import {WebGpuMotor} from "./schema/motor/webGpuMotor";
import {GraphicalMotor} from "./schema/motor/graphicalMotor";
import {ThemeContextParser} from "./hooks/contexts/ThemeContextParser";
import {MultiFade} from "./component/animate/MultiFade";
import {useSocketSync} from "./hooks/useSocketSync";


export const App = () => {

    const Theme = useContext(ThemeContext);
    const Project = useContext(ProjectContext);
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
        });

        Project.dispatch({
            field: "getMotor",
            value: getMotor
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
            <MultiFade
                active={Project.state.appMenu.findIndex((m) => m.id === Project.state.activeAppMenuId)}
                timeout={250}
                extraCss={{
                    position: 'absolute',
                    inset: "0px",
                    overflow:"hidden",
                    zIndex: "10000000"
                }}
            >
                {Project.state.appMenu.map((M, i) => (
                    <M.element key={i} getMotor={Project.state.getMotor} />
                ))}

            </MultiFade>

        </div>)
}