import {memo, useCallback, useContext, useEffect, useRef, MouseEvent, forwardRef} from "react";
import {WebGpuMotor} from "./motor/webGpuMotor";
import {ThemeContext} from "../hooks/contexts/ThemeContext";

interface SchemaDisplayProps {
    onDoubleClickOnCanvas: (evt:MouseEvent) => void
}
export const SchemaDisplay = memo(forwardRef<WebGpuMotor, SchemaDisplayProps>(({
    onDoubleClickOnCanvas
}, motorRef) => {

    const canvasRef = useRef<HTMLCanvasElement|null>(null);
    const containerRef = useRef<HTMLDivElement|null>(null);

    const Theme = useContext(ThemeContext);


    useEffect(() => {
        if (!containerRef.current || !canvasRef.current) return;

        const motor = new WebGpuMotor();

        // assign motor to forwarded ref properly
        if (typeof motorRef === "function") {
            motorRef(motor);
        } else if (motorRef) {
            motorRef.current = motor;
        }

        motor
            .init(containerRef.current, canvasRef.current, {
                backgroundType: "dotted"
            })
            .then(() => {
                motor.resetViewport();
                motor.enableInteractive(false);
            });

        // optional: cleanup when unmounting
        return () => {
            if (motorRef && typeof motorRef !== "function") {
                motorRef.current = null;
            }
        };
    }, [motorRef]);


    const onDoubleClick = useCallback((evt:MouseEvent) => {
        onDoubleClickOnCanvas(evt);
    }, [onDoubleClickOnCanvas])

    return (
        <div ref={containerRef} style={{height:'100%', width: '100%', backgroundColor:'white', position:"relative"}}>
            <canvas ref={canvasRef} style={{filter: `invert(${Theme.state.theme === "dark" ? 1 : 0})`, transition: "all 0.25s ease-in-out"}} onDoubleClick={onDoubleClick}>

            </canvas>
        </div>
    )
}));