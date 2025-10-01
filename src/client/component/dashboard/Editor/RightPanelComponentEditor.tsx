import {CSSProperties, memo, useCallback, useEffect, useMemo, useState} from "react";
import {HtmlBuilderCategoryType, HtmlBuilderComponent} from "../../../../utils/html/htmlType";
import {EditedHtmlType, UpdateHtmlOption} from "../../../main";
import {InstructionBuilder} from "../../../../utils/sync/InstructionBuilder";
import {ObjectStorage} from "../../../../process/html/HtmlRender";
import {EditableCss, RightPanelCssEditor} from "./RightPanelCssEditor";
import {searchElementWithIdentifier} from "../../../../utils/html/htmlUtils";
import {CSSBlock} from "../../../../utils/html/HtmlCss";
import {deepCopy} from "../../../../utils/objectUtils";

interface RightPanelComponentEditorProps {
    componentsList: Partial<Record<HtmlBuilderCategoryType, HtmlBuilderComponent[]>> | undefined,
    editedHtml: EditedHtmlType,
    updateHtml: (instructions:InstructionBuilder, options?:UpdateHtmlOption) => Promise<void>,
}


export const RightPanelComponentEditor = memo(({
    componentsList,
    updateHtml,
    editedHtml
}: RightPanelComponentEditorProps) => {

    const [hoverIdentifier, setHoverIdentifier] = useState<string|undefined>(undefined);
    const [selectedIdentifier, setSelectedIdentifier] = useState<string|undefined>(undefined);

    const onBuildingHover = (objectStorage?:ObjectStorage) => {
        setHoverIdentifier(objectStorage?.object.identifier);
    }

    const onBuildingSelect = (objectStorage?:ObjectStorage) => {
        setSelectedIdentifier(objectStorage?.object.identifier);
    }


    const currentCss:EditableCss|undefined = useMemo(() => {
        if(selectedIdentifier && editedHtml) {
            const instruction = new InstructionBuilder();
            const object = searchElementWithIdentifier(selectedIdentifier, editedHtml.html.object, instruction);
            if(object) {
                return {
                    css:object.css ?? [],
                    instruction: instruction
                }
            }
        }
        return undefined;
    }, [editedHtml, selectedIdentifier]);

    const updateCss = useCallback(async (cssInstruction: InstructionBuilder) => {
        if(currentCss) {
            await updateHtml(cssInstruction);
        }
    }, [currentCss, updateHtml]);

    useEffect(() => {
        if(editedHtml) {
            editedHtml.htmlRender.addBuildingInteractEventMap("select", onBuildingSelect);
            editedHtml.htmlRender.addBuildingInteractEventMap("hover", onBuildingHover);
            return () => {
                editedHtml.htmlRender.removeBuildingInteractEventMap("select", onBuildingSelect);
                editedHtml.htmlRender.removeBuildingInteractEventMap("hover", onBuildingHover);
            }
        }
    }, [editedHtml]);

    return (
        <div style={{width:"100%", height:"100%", overflowY:"auto", overflowX:"hidden"}}>
            {currentCss ? (
                <RightPanelCssEditor css={currentCss} onUpdate={updateCss} />
            ) : null}
        </div>
    )
});
RightPanelComponentEditor.displayName = "RightPanelComponentEditor";