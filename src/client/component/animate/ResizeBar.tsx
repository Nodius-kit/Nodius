import React, {CSSProperties, memo, useContext} from "react";
import {Fade} from "./Fade";
import {Collapse} from "./Collapse";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";
import {disableTextSelection, enableTextSelection} from "../../../utils/objectUtils";

interface ResizeBarProps {
    type: "vertical" | "horizontal";
    glueTo: "right" | "left" | "top" | "bottom";
    offsetBar?:boolean;
    value: number,
    setValue: (value: number) => void;
    maxValue?: number;
    minValue?: number;
    show?: boolean;
    beforeResize?: () => void;
    afterResize?: () => void;
}

export const ResizeBar = memo(({
    glueTo,
    offsetBar,
    type,
    setValue,
    value,
    show = true,
    afterResize,
    beforeResize,
    minValue = -Infinity,
    maxValue = Infinity,
}:ResizeBarProps) => {

    const Theme = useContext(ThemeContext);

    const barWidth = 8;

    const style:CSSProperties = {
        position:"absolute",
    }
    if(type === "vertical") {
        style.width = barWidth+"px";
        style.height = "100%";
    } else {
        style.width = "100%";
        style.height = barWidth+"px";
    }

    if(glueTo === "top") {
        style.top = offsetBar ? (-barWidth)+"px" : "0px";
    } else if(glueTo === "left") {
        style.left = offsetBar ? (-barWidth)+"px" : "0px";
    } else if(glueTo === "right") {
        style.right = offsetBar ? (-barWidth)+"px" : "0px";
    } else if(glueTo === "bottom") {
        style.bottom = offsetBar ? (-barWidth)+"px" : "0px";
    }

    style.display = "flex";
    style.justifyContent = "center";
    style.alignItems = "center";
    style.backgroundColor = "var(--nodius-background-resizeBar)";
    style.cursor = type === "vertical" ? "col-resize" : "row-resize"


    const mouseDown = (evt:React.MouseEvent) => {
        const startX = evt.clientX;
        const startY = evt.clientY;
        const baseValue = value;

        beforeResize?.();

        const mouseMove = (evt:MouseEvent) => {
            const newX = evt.clientX;
            const newY = evt.clientY;

            if (type === "vertical") {
                const deltaX = newX - startX;
                const newValue = baseValue + deltaX;
                setValue(Math.min(maxValue, Math.max(minValue, newValue)));
            } else if (type === "horizontal") {
                const deltaY = newY - startY;
                const newValue = baseValue + deltaY;
                setValue(Math.min(maxValue, Math.max(minValue, newValue)));
            }
        }

        const mouseUp = () => {
            console.log("up");
            window.removeEventListener("mouseout", mouseUp);
            window.removeEventListener("mouseup", mouseUp);
            window.removeEventListener("mousemove", mouseMove);
            enableTextSelection();
            afterResize?.();
        }
        disableTextSelection();
        window.addEventListener("mouseup", mouseUp);
        window.addEventListener("mousemove", mouseMove);

    }

    return (
        <Collapse in={show} timeout={200} >
            <div style={style} onMouseDown={mouseDown}>
                <div style={{
                    height: type === "vertical" ? 40 : barWidth/2,
                    width: type === "horizontal" ? 40 : barWidth/2,
                    backgroundColor:Theme.state.changeBrightness(Theme.state.background[Theme.state.theme].resizeBar, 0.5, Theme.state.theme === "dark" ? "positive" : "negative"),
                    borderRadius:barWidth/2
                }}>

                </div>
            </div>
        </Collapse>
    )
})