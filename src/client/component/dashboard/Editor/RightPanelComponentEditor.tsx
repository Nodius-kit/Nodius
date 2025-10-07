import {CSSProperties, memo, useCallback, useContext, useEffect, useMemo, useState} from "react";
import {HtmlBuilderCategoryType, HtmlBuilderComponent} from "../../../../utils/html/htmlType";
import {InstructionBuilder} from "../../../../utils/sync/InstructionBuilder";
import {ObjectStorage} from "../../../../process/html/HtmlRender";
import {EditableCss, RightPanelCssEditor} from "./RightPanelCssEditor";
import {searchElementWithIdentifier} from "../../../../utils/html/htmlUtils";
import {CSSBlock} from "../../../../utils/html/HtmlCss";
import {deepCopy} from "../../../../utils/objectUtils";
import {ProjectContext} from "../../../hooks/contexts/ProjectContext";

interface RightPanelComponentEditorProps {
    componentsList: Partial<Record<HtmlBuilderCategoryType, HtmlBuilderComponent[]>> | undefined,
}


export const RightPanelComponentEditor = memo(({
    componentsList,
}: RightPanelComponentEditorProps) => {

    const Project = useContext(ProjectContext);

    const [hoverIdentifier, setHoverIdentifier] = useState<string|undefined>(undefined);
    const [selectedIdentifier, setSelectedIdentifier] = useState<string|undefined>(undefined);

    const onBuildingHover = (objectStorage?:ObjectStorage) => {
        setHoverIdentifier(objectStorage?.object.identifier);
    }

    const onBuildingSelect = (objectStorage?:ObjectStorage) => {
        setSelectedIdentifier(objectStorage?.object.identifier);
    }


    const currentCss:EditableCss|undefined = useMemo(() => {
        if(selectedIdentifier && Project.state.editedHtml) {
            const instruction = new InstructionBuilder();
            const object = searchElementWithIdentifier(selectedIdentifier, Project.state.editedHtml.html.object, instruction);
            if(object) {
                return {
                    css:object.css ?? [],
                    instruction: instruction
                }
            }
        }
        return undefined;
    }, [Project.state.editedHtml, selectedIdentifier]);

    const updateCss = useCallback(async (cssInstruction: InstructionBuilder) => {
        if(currentCss) {
            await Project.state.updateHtml!(cssInstruction.instruction);
        }
    }, [currentCss, Project.state.updateHtml]);

    useEffect(() => {
        if(Project.state.editedHtml) {
            Project.state.editedHtml.htmlRender.addBuildingInteractEventMap("select", onBuildingSelect);
            Project.state.editedHtml.htmlRender.addBuildingInteractEventMap("hover", onBuildingHover);
            return () => {
                if(Project.state.editedHtml) {
                    Project.state.editedHtml.htmlRender.removeBuildingInteractEventMap("select", onBuildingSelect);
                    Project.state.editedHtml.htmlRender.removeBuildingInteractEventMap("hover", onBuildingHover);
                }
            }
        }
    }, [ Project.state.editedHtml]);

    return (
        <div style={{width:"100%", height:"100%", overflowY:"auto", overflowX:"hidden"}}>
            {currentCss ? (
                <RightPanelCssEditor css={currentCss} onUpdate={updateCss} />
            ) : null}
        </div>
    )
});
RightPanelComponentEditor.displayName = "RightPanelComponentEditor";