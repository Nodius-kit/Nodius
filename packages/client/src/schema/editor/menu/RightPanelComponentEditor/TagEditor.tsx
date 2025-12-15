import {memo, useContext, useMemo} from "react";
import {ThemeContext} from "../../../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../../../hooks/useDynamicClass";
import {EditableDiv} from "../../../../component/form/EditableDiv";
import {Tag} from "lucide-react";
import {CurrentEditObject} from "../RightPanelComponentEditor";
import {Instruction, InstructionBuilder} from "@nodius/utils";


export interface EditableTag {
    tag: string;
    instruction: InstructionBuilder;
}

export interface TagEditorProps {
    object: CurrentEditObject;
    onUpdate: (instr: Instruction | Instruction[]) => Promise<boolean>;
}



export const TagEditor = memo(({ object, onUpdate }: TagEditorProps) => {
    const Theme = useContext(ThemeContext);

    // Common HTML tags for autocomplete
    const commonTags = useMemo(() => [
        "div", "span", "button", "input", "textarea", "select", "label",
        "p", "h1", "h2", "h3", "h4", "h5", "h6",
        "a", "img", "video", "audio",
        "ul", "ol", "li",
        "table", "thead", "tbody", "tr", "th", "td",
        "form", "fieldset", "legend",
        "header", "footer", "nav", "main", "aside", "section", "article",
        "strong", "em", "code", "pre"
    ], []);

    const tagEditorContainerClass = useDynamicClass(`
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
    `);

    const labelClass = useDynamicClass(`
        & {
            font-weight: 600;
            font-size: 14px;
            color: var(--nodius-text-primary);
            display: flex;
            align-items: center;
            gap: 8px;
        }
    `);

    const updateTag = async (newTag: string) => {
        const newInstruction = new InstructionBuilder(object.instruction);
        newInstruction.key("tag").set(newTag);
        await onUpdate(newInstruction.instruction);
    };

    return (
        <div className={tagEditorContainerClass}>
            <label className={labelClass}>
                <Tag height={16} width={16} />
                HTML Tag
            </label>
            <EditableDiv
                removeSpecialChar={true}
                value={object.object.tag}
                completion={commonTags}
                placeholder="Enter HTML tag..."
                onChange={updateTag}
                style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid var(--nodius-background-paper)",
                    borderRadius: "8px",
                    backgroundColor: "var(--nodius-background-default)",
                    color: "var(--nodius-text-primary)",
                    fontFamily: "'Fira Code', monospace",
                    fontSize: "14px"
                }}
            />
        </div>
    );
});
TagEditor.displayName = 'TagEditor';