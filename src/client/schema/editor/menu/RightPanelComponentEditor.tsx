/**
 * @file RightPanelComponentEditor.tsx
 * @description Right panel for editing selected HTML component properties
 * @module dashboard/Editor
 *
 * Displays and allows editing of the currently selected HTML component:
 * - CSS style editor (via RightPanelCssEditor)
 * - Hover preview highlighting
 * - Component selection management
 * - Real-time style updates with visual feedback
 *
 * Features:
 * - Live component selection from canvas
 * - Hover state management for preview
 * - Integration with CSS editor panel
 * - Component identifier tracking
 * - Synchronized updates with canvas rendering
 *
 * This panel works in conjunction with the left panels to provide a complete
 * component editing experience.
 */

import {memo, useCallback, useContext, useEffect, useMemo, useState} from "react";
import {HtmlBuilderCategoryType, HtmlBuilderComponent, HtmlObject} from "../../../../utils/html/htmlType";
import {Instruction, InstructionBuilder} from "../../../../utils/sync/InstructionBuilder";
import {ObjectStorage} from "../../../../process/html/HtmlRender";
import {searchElementWithIdentifier} from "../../../../utils/html/htmlUtils";
import {ProjectContext} from "../../../hooks/contexts/ProjectContext";
import {ThemeContext} from "../../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../../hooks/useDynamicClass";
import {Paintbrush, Info, Code, MousePointer, Type} from "lucide-react";
import { TagEditor } from "./RightPanelComponentEditor/TagEditor";
import { IconEditor } from "./RightPanelComponentEditor/IconEditor";
import {CssEditor} from "./RightPanelComponentEditor/CssEditor";
import {EventsEditor} from "./RightPanelComponentEditor/EventsEditor";
import {ContentEditor} from "./RightPanelComponentEditor/ContentEditor";
import {Collapse} from "../../../component/animate/Collapse";
import {AnchorEditor} from "./RightPanelComponentEditor/AnchorEditor";
import {ImageEditor} from "./RightPanelComponentEditor/ImageEditor";

interface RightPanelComponentEditorProps {
    componentsList: Partial<Record<HtmlBuilderCategoryType, HtmlBuilderComponent[]>> | undefined,
}

export interface CurrentEditObject {object: HtmlObject, instruction:Instruction}


export const RightPanelComponentEditor = memo(({
    componentsList
}: RightPanelComponentEditorProps) => {

    const Project = useContext(ProjectContext);
    const Theme = useContext(ThemeContext);

    const [hoverIdentifier, setHoverIdentifier] = useState<string|undefined>(undefined);
    const [selectedIdentifier, setSelectedIdentifier] = useState<string|undefined>(undefined);

    const [activeTab, setActiveTab] = useState<'css' | 'events' | 'content'>("css");

    const onBuildingHover = (objectStorage?:ObjectStorage) => {
        setHoverIdentifier(objectStorage?.object.identifier);
    }

    const onBuildingSelect = (objectStorage?:ObjectStorage) => {
        setSelectedIdentifier(objectStorage?.object.identifier);
    }



    const currentEditable:CurrentEditObject|undefined = useMemo(() => {
        if(!selectedIdentifier || !Project.state.editedHtml) {
            setActiveTab("css"); // reset;
            return undefined;
        }

        const node = Project.state.editedHtml.htmlRenderContext.retrieveNode();
        if(!node) return undefined;

        const instruction = new InstructionBuilder();
        const object = searchElementWithIdentifier(selectedIdentifier, Project.state.editedHtml.htmlRenderContext.retrieveHtmlObject(node), instruction);

        if(!object) return undefined;

        return {
            object: object,
            instruction: instruction.instruction
        }
    }, [Project.state.editedHtml, selectedIdentifier]);



    useEffect(() => {
        if(Project.state.editedHtml) {
            Project.state.editedHtml.htmlRenderContext.htmlRender.addBuildingInteractEventMap("select", onBuildingSelect);
            Project.state.editedHtml.htmlRenderContext.htmlRender.addBuildingInteractEventMap("hover", onBuildingHover);
            return () => {
                if(Project.state.editedHtml) {
                    Project.state.editedHtml.htmlRenderContext.htmlRender.removeBuildingInteractEventMap("select", onBuildingSelect);
                    Project.state.editedHtml.htmlRenderContext.htmlRender.removeBuildingInteractEventMap("hover", onBuildingHover);
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

    const tabsContainerClass = useDynamicClass(`
        & {
            display: flex;
            gap: 8px;
            border-bottom: 2px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
            padding: 8px 0;
            margin-bottom: 8px;
        }
    `);

    const tabClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            border-radius: 8px 8px 0 0;
            cursor: pointer;
            transition: var(--nodius-transition-default);
            font-weight: 500;
            font-size: 14px;
            background-color: transparent;
            color: var(--nodius-text-primary);
        }
        &:hover {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.04)};
            color: var(--nodius-text-primary);
        }
        &.active {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.06)};
            color: var(--nodius-primary-main);
            border-bottom: 2px solid var(--nodius-primary-main);
        }
    `);

    const updateObject = useCallback(async (contentInstruction: Instruction[] | Instruction) => {
        const output = await Project.state.editedHtml?.updateHtmlObject(
            Array.isArray(contentInstruction) ? contentInstruction.map((i) => ({
                i: i,
                applyUniqIdentifier: "identifier",
                triggerHtmlRender: true,
            })) : [
                {
                    i: contentInstruction,
                    applyUniqIdentifier: "identifier",
                    triggerHtmlRender: true,
                }
            ]

        );
        return output?.status ?? false;
    }, [currentEditable, Project.state.editedHtml]);

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
                {(currentEditable) ? (
                    <div style={{width: "100%", height: "100%", display: "flex", flexDirection: "column"}}>
                        {/* Tag Editor - Visible for non-icon types */}
                        <Collapse in={currentEditable.object.type !== "icon"}>
                            <div style={{marginBottom: "16px"}}>
                                <TagEditor object={currentEditable} onUpdate={updateObject} />
                            </div>
                        </Collapse>
                        {/* Icon Editor - Visible only for icon type */}
                        <Collapse in={currentEditable.object.type === "icon"}>
                            <div style={{marginBottom: "16px"}}>
                                <IconEditor object={currentEditable} onUpdate={updateObject} />
                            </div>
                        </Collapse>

                        <Collapse in={currentEditable.object.type === "link"}>
                            <div style={{marginBottom: "16px"}}>
                                <AnchorEditor object={currentEditable} onUpdate={updateObject} />
                            </div>
                        </Collapse>

                        <Collapse in={currentEditable.object.type === "image"}>
                            <div style={{marginBottom: "16px"}}>
                                <ImageEditor object={currentEditable} onUpdate={updateObject} />
                            </div>
                        </Collapse>
                        {/* Tabs */}
                        <div className={tabsContainerClass}>
                            <div
                                className={`${tabClass} ${activeTab === 'css' ? 'active' : ''}`}
                                onClick={() => setActiveTab('css')}
                            >
                                <Code height={18} width={18} />
                                <span>CSS</span>
                            </div>
                            <div
                                className={`${tabClass} ${activeTab === 'events' ? 'active' : ''}`}
                                onClick={() => setActiveTab('events')}
                            >
                                <MousePointer height={18} width={18} />
                                <span>Events</span>
                            </div>
                            {(currentEditable.object.type === "html" || currentEditable.object.type === "text") && (
                                <div
                                    className={`${tabClass} ${activeTab === 'content' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('content')}
                                >
                                    <Type height={18} width={18} />
                                    <span>Content</span>
                                </div>
                            )}
                        </div>

                        <div style={{flex: 1, overflowY: "auto", overflowX: "hidden"}}>
                            {activeTab === 'css' && <CssEditor object={currentEditable} onUpdate={updateObject} />}
                            {activeTab === 'events' && <EventsEditor object={currentEditable} onUpdate={updateObject}/>}
                            {activeTab === 'content' && <ContentEditor object={currentEditable}  onUpdate={updateObject} />}
                        </div>
                    </div>
                ) : (
                    <div className={emptyStateClass}>
                        <Paintbrush height={48} width={48} style={{margin:"0 auto 16px", opacity:0.6}}/>
                        <h5>No Component Selected</h5>
                        <p>Select a component from the canvas to edit its styles and events</p>
                    </div>
                )}
            </div>
        </div>
    )
});
RightPanelComponentEditor.displayName = "RightPanelComponentEditor";