import {memo} from "react";
import {HtmlClass} from "../../../utils/html/htmlType";
import {InstructionBuilder} from "../../../utils/sync/InstructionBuilder";

interface HtmlEditorProps  {
    editedHtml?: HtmlClass,
    updateHtml: (instructions:InstructionBuilder) => void,
    hidePanel?: boolean
}

export const HtmlEditor = memo(({
    updateHtml,
    hidePanel,
    editedHtml
}:HtmlEditorProps) => {

    const panelWidth = 300;

    return (
        <div>
            <div style={{
                position:"absolute",
                top:"0",
                left:(hidePanel ? -panelWidth : 0)+"px",
                width:panelWidth+"px",
                height:"100%",
                backgroundColor:"var(--nodius-background-default)",
                boxShadow: "var(--nodius-shadow-4)",
                transition: "var(--nodius-transition-default)",
                pointerEvents:"all",
            }}>
                left
            </div>
            <div style={{
                position:"absolute",
                top:"0",
                right:(hidePanel ? -panelWidth : 0)+"px",
                width:panelWidth+"px",
                height:"100%",
                backgroundColor:"var(--nodius-background-default)",
                boxShadow: "var(--nodius-shadow-4)",
                transition: "var(--nodius-transition-default)",
                pointerEvents:"all",
            }}>
                right
            </div>
        </div>
    )
});

HtmlEditor.displayName = "HtmlEditor";