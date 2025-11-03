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
import {Type} from "lucide-react";
import {InstructionBuilder} from "../../../../../utils/sync/InstructionBuilder";
import {ThemeContext} from "../../../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../../../hooks/useDynamicClass";
import {EditableDiv} from "../../../EditableDiv";
import {ContentEditorProps} from "./types";

// ============================================================================
// CONTENT EDITOR
// ============================================================================

/**
 * Content Editor - Edits text content for HtmlText components
 */
export const ContentEditor = memo(({ content, onUpdate }: ContentEditorProps) => {
    const Theme = useContext(ThemeContext);

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

    const updateContent = async (key: string, value: string) => {
        const newInstruction = content.instruction.clone();
        newInstruction.key("content").key(key).set(value);
        await onUpdate(newInstruction);
    };

    return (
        <div className={contentEditorClass}>
            {Object.entries(content.content).map(([key, value]) => (
                <div key={key} className={contentFieldClass}>
                    <label>
                        <Type height={16} width={16} />
                        {key}
                    </label>
                    <EditableDiv value={value} placeholder={`Enter ${key} content...`} onChange={(e) => updateContent(key, e)}/>
                </div>
            ))}
        </div>
    );
});
ContentEditor.displayName = 'ContentEditor';
