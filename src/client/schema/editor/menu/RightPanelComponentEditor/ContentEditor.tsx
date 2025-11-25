/**
 * @file ContentEditor.tsx
 * @description Content editor component for HtmlText components
 * @module dashboard/Editor/RightPanelStyleEditor
 *
 * Features:
 * - Edit text content for HTML text elements
 * - Multi-line text editing with placeholder support
 * - Styled with consistent theme integration
 */

import {memo, useContext} from "react";
import {Edit3, Type} from "lucide-react";
import {ThemeContext} from "../../../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../../../hooks/useDynamicClass";
import {EditableDiv} from "../../../../component/form/EditableDiv";
import {CurrentEditObject} from "../RightPanelComponentEditor";
import {Instruction, InstructionBuilder} from "../../../../../utils/sync/InstructionBuilder";
import {deepCopy} from "../../../../../utils/objectUtils";
import {ProjectContext} from "../../../../hooks/contexts/ProjectContext";
import {useStableProjectRef} from "../../../../hooks/useStableProjectRef";
import {htmlContentEditorDefinitions} from "../../codeEditorVariableDefinitions";


// ============================================================================
// CONTENT EDITOR
// ============================================================================

export interface ContentEditorProps {
    object: CurrentEditObject;
    onUpdate: (instr: Instruction | Instruction[]) => Promise<boolean>;
}

/**
 * Content Editor - Edits text content for HtmlText components
 */
export const ContentEditor = memo(({ object, onUpdate }: ContentEditorProps) => {
    const Theme = useContext(ThemeContext);
    const Project = useContext(ProjectContext);
    const projectRef = useStableProjectRef();

    const contentEditorClass = useDynamicClass(`
        & {
            width: 100%;
            height: 100%;
            padding: 8px 0;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
    `);

    const contentFieldClass = useDynamicClass(`
        & {
            border-radius: 10px;
            border: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.02)};
            box-shadow: var(--nodius-shadow-1);
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            transition: var(--nodius-transition-default);
        }
        &:hover {
            box-shadow: var(--nodius-shadow-2);
        }
        & label {
            font-weight: 600;
            font-size: 14px;
            color: var(--nodius-text-primary);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        & > div {
            width: 100%;
            min-height: 120px;
            padding: 12px;
            border: 1px solid var(--nodius-background-paper);
            border-radius: 8px;
            background-color: var(--nodius-background-default);
            color: var(--nodius-text-primary);
            font-family: inherit;
            font-size: 14px;
            resize: vertical;
            line-height: 1.6;
        }
        & > div:focus {
            outline: none;
            border-color: var(--nodius-primary-main);
        }
    `);

    const updateTextContent = async (key: string, value: string) => {
        const newInstruction = new InstructionBuilder(object.instruction);
        newInstruction.key("content").key(key).set(value);
        await onUpdate(newInstruction.instruction);
    };


    const actionButtonClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            border: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.2)};
            border-radius: 8px;
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.03)};
            color: var(--nodius-text-primary);
            cursor: pointer;
            transition: var(--nodius-transition-default);
            font-size: 13px;
            font-weight: 500;
            flex: 1;
            min-width: 140px;
            justify-content: center;
        }
        &:hover {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.08)};
            border-color: var(--nodius-primary-main);
            transform: translateY(-1px);
            box-shadow: var(--nodius-shadow-1);
        }
        &:active {
            transform: translateY(0);
        }
        &.primary {
            background-color: ${Theme.state.changeOpacity(Theme.state.primary[Theme.state.theme].main, 0.15)};
            border-color: var(--nodius-primary-main);
            color: var(--nodius-primary-main);
        }
        &.primary:hover {
            background-color: ${Theme.state.changeOpacity(Theme.state.primary[Theme.state.theme].main, 0.25)};
        }
        &.secondary {
            background-color: ${Theme.state.changeOpacity(Theme.state.secondary[Theme.state.theme].main, 0.15)};
            border-color: var(--nodius-secondary-main);
            color: var(--nodius-secondary-main);
        }
        &.secondary:hover {
            background-color: ${Theme.state.changeOpacity(Theme.state.secondary[Theme.state.theme].main, 0.25)};
        }
    `);

    const editInCodeEditor = () => {
        if(object.object.type !== "html") return;


        let nodeId = Project.state.editedHtml?.htmlRenderContext.nodeId;

        if(!nodeId) return;


        const newInstruction = new InstructionBuilder(object.instruction);

        const title = "Html content";

        newInstruction.key("content");
        Project.dispatch({
            field: "editedCode",
            value: [...Project.state.editedCode.filter((e) => e.nodeId !== nodeId && e.title !== title), {
                nodeId: nodeId,
                type: "HTML",
                title: "Html content",
                onChange: async (instructions) => {
                    const clonedInstructions = deepCopy(Array.isArray(instructions) ? instructions : [instructions]);
                    for(const instruction of clonedInstructions) {
                        instruction.p = [...newInstruction.instruction.p??[]]
                    }
                    return onUpdate(clonedInstructions)
                },
                retrieveText: (node) => {
                    let object = projectRef.current.state.editedHtml?.htmlRenderContext.retrieveHtmlObject(node) as any;
                    if(!object) {
                        projectRef.current.dispatch({
                            field: "editedCode",
                            value: projectRef.current.state.editedCode.filter((e) => e.nodeId !== nodeId)
                        });
                    }
                    for(const path of newInstruction.instruction.p ?? []) {
                        object = object[path];
                    }
                    return object;
                },
                variableDefinitions: htmlContentEditorDefinitions
            }]
        });
    }

    return (
        <div className={contentEditorClass}>
            {object.object.type === "text" ? (
                Object.entries(object.object.content).map(([key, value]) => (
                    <div key={key} className={contentFieldClass}>
                        <label>
                            <Type height={16} width={16} />
                            {key}
                        </label>
                        <EditableDiv value={value} placeholder={`Enter ${key} content...`} onChange={(e) => updateTextContent(key, e)}/>
                    </div>
                ))
            ): object.object.type === "html" ?(
                <div  className={contentFieldClass}>
                    <label>
                        <Type height={16} width={16} />
                        HTML
                    </label>
                    <button className={`${actionButtonClass} primary`} onClick={editInCodeEditor}>
                        <Edit3 height={16} width={16} />
                        <span>Edit in Code Editor</span>
                    </button>
                </div>
            ) : null}
        </div>
    );
});
ContentEditor.displayName = 'ContentEditor';