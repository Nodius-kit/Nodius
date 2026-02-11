import {memo, useContext, useMemo, useCallback, useRef, useEffect} from "react";
import {ThemeContext} from "../../../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../../../hooks/useDynamicClass";
import {Sparkles, CloudAlert} from "lucide-react";
import {CurrentEditObject} from "../RightPanelComponentEditor";
import {deepCopy, Instruction, InstructionBuilder} from "@nodius/utils";
import {ProjectContext} from "../../../../hooks/contexts/ProjectContext";
import {openIconParam, openIconPickerModal} from "../../../../component/form/IconPickerModal";
import * as Icons from "lucide-static";

export interface IconEditorProps {
    object: CurrentEditObject;
    onUpdate: (instr: Instruction | Instruction[]) => Promise<boolean>;
}



export const IconEditor = memo(({ object, onUpdate }: IconEditorProps) => {
    const Theme = useContext(ThemeContext);
    const Project = useContext(ProjectContext);

    const iconEditorContainerClass = useDynamicClass(`
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

    const iconPreviewClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            border: 2px solid var(--nodius-background-paper);
            border-radius: 12px;
            background-color: var(--nodius-background-default);
            cursor: pointer;
            transition: var(--nodius-transition-default);
            min-height: 80px;
        }
        &:hover {
            border-color: var(--nodius-primary-main);
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.04)};
            transform: translateY(-2px);
            box-shadow: var(--nodius-shadow-2);
        }
    `);

    const iconNameClass = useDynamicClass(`
        & {
            font-family: 'Fira Code', monospace;
            font-size: 14px;
            color: var(--nodius-text-secondary);
            text-align: center;
            margin-top: 8px;
        }
    `);

    const iconClassParent = useDynamicClass(`
        & > svg {
            height: 48px;
            width: 48px;
            stroke-width:1.5px;
            color: var(--nodius-primary-main)
        }
    `);

    const currentObject = useRef<CurrentEditObject>(undefined!);
    useEffect(() => {
        currentObject.current = object;
    }, [object]);

    const openIconPicker = useCallback(async () => {
        if (!Project.state.editedHtml) return;
        const iconPickerModalParam:openIconParam = {
            modalNodeId: Project.state.editedHtml.htmlRenderContext.nodeId,
            onSelectIcon: async (iconName: string) => {
                const newInstruction = new InstructionBuilder(object.instruction);
                newInstruction.key("content").set(iconName);
                await onUpdate(newInstruction.instruction);
            },
            getCurrentSelectedIcon: () => currentObject.current.object.content as string
        }
        await openIconPickerModal(iconPickerModalParam);
    }, [Project.state.editedHtml, onUpdate]);

    const CurrentIcon:string = useMemo(() => {
        let Icon = Icons[object.object.content as keyof typeof Icons] as any;
        if (!Icon) {
            Icon = Icons["CloudAlert" as keyof typeof Icons] as any;
        }
        return Icon;
    }, [object.object.content]);

    if (object.object.type !== "icon") return null;

    return (
        <div className={iconEditorContainerClass}>
            <label className={labelClass}>
                <Sparkles height={16} width={16} />
                Icon Selection
            </label>
            <div
                className={iconPreviewClass}
                onClick={openIconPicker}
                title="Click to change icon"
            >
                <div className={iconClassParent} dangerouslySetInnerHTML={{__html: CurrentIcon}} />
            </div>
            <div className={iconNameClass}>
                {(object.object.content as string) || "No icon selected"}
            </div>
        </div>
    );
});
IconEditor.displayName = 'IconEditor';
