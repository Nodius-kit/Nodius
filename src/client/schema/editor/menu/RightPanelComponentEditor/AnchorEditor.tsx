import {memo, useContext} from "react";
import {CurrentEditObject} from "../RightPanelComponentEditor";
import {Instruction, InstructionBuilder} from "../../../../../utils/sync/InstructionBuilder";
import {ThemeContext} from "../../../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../../../hooks/useDynamicClass";
import {EditableDiv} from "../../../../component/form/EditableDiv";
import {Link, Type} from "lucide-react";

export interface AnchorEditorProps {
    object: CurrentEditObject;
    onUpdate: (instr: Instruction | Instruction[]) => Promise<boolean>;
}

export const AnchorEditor = memo(({
    object,
    onUpdate
}: AnchorEditorProps) => {
    const Theme = useContext(ThemeContext);

    const anchorEditorContainerClass = useDynamicClass(`
        & {
            border-radius: 10px;
            border: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.02)};
            box-shadow: var(--nodius-shadow-1);
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            transition: var(--nodius-transition-default);
        }
        &:hover {
            box-shadow: var(--nodius-shadow-2);
        }
    `);

    const fieldClass = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            gap: 8px;
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

    const updateUrl = async (newUrl: string) => {
        const newInstruction = new InstructionBuilder(object.instruction);
        newInstruction.key("content").key("url").set(newUrl);
        await onUpdate(newInstruction.instruction);
    };

    const updateText = async (lang: string, value: string) => {
        const newInstruction = new InstructionBuilder(object.instruction);
        newInstruction.key("content").key("text").key(lang).set(value);
        await onUpdate(newInstruction.instruction);
    };

    if (object.object.type !== "link") return null;

    const linkContent = object.object.content as { url: string; text: Record<string, string> };

    return (
        <div className={anchorEditorContainerClass}>
            {/* URL Field */}
            <div className={fieldClass}>
                <label className={labelClass}>
                    <Link height={16} width={16} />
                    URL
                </label>
                <EditableDiv
                    value={linkContent.url}
                    placeholder="Enter URL (e.g., https://example.com)..."
                    onChange={updateUrl}
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

            {/* Text Fields (multi-language) */}
            {Object.entries(linkContent.text).map(([lang, text]) => (
                <div key={lang} className={fieldClass}>
                    <label className={labelClass}>
                        <Type height={16} width={16} />
                        Text ({lang})
                    </label>
                    <EditableDiv
                        value={text}
                        placeholder={`Enter link text for ${lang}...`}
                        onChange={(value) => updateText(lang, value)}
                        style={{
                            width: "100%",
                            padding: "12px",
                            border: "1px solid var(--nodius-background-paper)",
                            borderRadius: "8px",
                            backgroundColor: "var(--nodius-background-default)",
                            color: "var(--nodius-text-primary)",
                            fontSize: "14px"
                        }}
                    />
                </div>
            ))}
        </div>
    );
});
AnchorEditor.displayName = "AnchorEditor";