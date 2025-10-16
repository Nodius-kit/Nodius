import {CSSProperties, memo, useCallback, useContext, useEffect, useMemo, useState} from "react";
import {HtmlBuilderCategoryType, HtmlBuilderComponent} from "../../../../utils/html/htmlType";
import {InstructionBuilder} from "../../../../utils/sync/InstructionBuilder";
import {ObjectStorage} from "../../../../process/html/HtmlRender";
import {EditableCss, RightPanelCssEditor} from "./RightPanelCssEditor";
import {searchElementWithIdentifier} from "../../../../utils/html/htmlUtils";
import {CSSBlock} from "../../../../utils/html/HtmlCss";
import {deepCopy} from "../../../../utils/objectUtils";
import {ProjectContext} from "../../../hooks/contexts/ProjectContext";
import {ThemeContext} from "../../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../../hooks/useDynamicClass";
import {Paintbrush, Info} from "lucide-react";

interface RightPanelComponentEditorProps {
    componentsList: Partial<Record<HtmlBuilderCategoryType, HtmlBuilderComponent[]>> | undefined,
}


export const RightPanelComponentEditor = memo(({
    componentsList,
}: RightPanelComponentEditorProps) => {

    const Project = useContext(ProjectContext);
    const Theme = useContext(ThemeContext);

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

    const infoCardClass = useDynamicClass(`
        & {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.04)};
            border: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
            border-radius: 12px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        & .info-header {
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--nodius-primary-main);
            font-weight: 500;
            font-size: 14px;
        }

        & .info-content {
            font-size: 13px;
            line-height: 1.6;
            color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.7)};
        }
    `);

    const emptyStateClass = useDynamicClass(`
        & {
            padding: 32px;
            text-align: center;
            color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.5)};
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.03)};
            border-radius: 12px;
            border: 2px dashed ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.2)};
        }

        & h5 {
            font-size: 16px;
            font-weight: 600;
            margin: 0 0 8px 0;
        }

        & p {
            font-size: 14px;
            opacity: 0.8;
            margin: 0;
        }
    `);

    return (
        <div style={{display:"flex", flexDirection:"column", gap:"16px", padding:"8px", height:"100%", width:"100%"}}>
            {/* Header Section */}
            <div style={{
                display:"flex",
                flexDirection:"row",
                gap:"12px",
                alignItems:"center",
                borderBottom:"2px solid var(--nodius-primary-main)",
                paddingBottom:"12px"
            }}>
                <div style={{
                    background: "var(--nodius-primary-main)",
                    borderRadius: "8px",
                    padding: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                }}>
                    <Paintbrush height={24} width={24} color="white"/>
                </div>
                <div style={{display:"flex", flexDirection:"column"}}>
                    <h5 style={{fontSize:"18px", fontWeight:"600", margin:"0"}}>Style Editor</h5>
                    <p style={{fontSize:"12px", opacity:"0.7", margin:"0"}}>Customize component appearance</p>
                </div>
            </div>

            {/* Info Card */}
            <div className={infoCardClass}>
                <div className="info-header">
                    <Info height={18} width={18}/>
                    <span>Component Styling</span>
                </div>
                <div className="info-content">
                    Select a component from the canvas to edit its CSS properties and styling rules.
                </div>
            </div>

            <hr/>

            {/* Content */}
            <div style={{flex: 1, overflowY: "auto", overflowX: "hidden"}}>
                {currentCss ? (
                    <RightPanelCssEditor css={currentCss} onUpdate={updateCss} />
                ) : (
                    <div className={emptyStateClass}>
                        <Paintbrush height={48} width={48} style={{margin:"0 auto 16px", opacity:0.6}}/>
                        <h5>No Component Selected</h5>
                        <p>Select a component from the canvas to edit its styles</p>
                    </div>
                )}
            </div>
        </div>
    )
});
RightPanelComponentEditor.displayName = "RightPanelComponentEditor";