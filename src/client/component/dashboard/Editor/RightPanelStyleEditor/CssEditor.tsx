/**
 * @file CssEditor.tsx
 * @description CSS editor components for styling HTML elements
 * @module dashboard/Editor/RightPanelStyleEditor
 *
 * Components:
 * - **CssRuleEditor**: Individual CSS rule (property: value) editor with autocomplete
 * - **CssBlockEditor**: CSS block with selector and multiple rules
 * - **CssEditor**: Main container managing all CSS blocks
 */

import {memo, useContext, useMemo, useState} from "react";
import {ChevronDown, ChevronRight, Plus, Trash2} from "lucide-react";
import {CSSBlock} from "../../../../../utils/html/HtmlCss";
import {InstructionBuilder} from "../../../../../utils/sync/InstructionBuilder";
import {ThemeContext} from "../../../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../../../hooks/useDynamicClass";
import {useDynamicCssListing} from "../../../../hooks/useDynamicCssListing";
import {Collapse} from "../../../animate/Collapse";
import {EditableDiv} from "../../../EditableDiv";
import {CssBlockEditorProps, CssEditorProps, CssRuleEditorProps} from "./types";

// ============================================================================
// CSS RULE EDITOR
// ============================================================================

/**
 * Renders a single CSS rule (property: value pair)
 */
export const CssRuleEditor = memo(({
    blockIndex,
    ruleIndex,
    keyStr,
    valueStr,
    availableCss,
    aditionalCss,
    variableColor,
    baseInstruction,
    onUpdate
}: CssRuleEditorProps) => {
    const Theme = useContext(ThemeContext);

    const keyCompletion = useMemo(() => Object.keys(availableCss), [availableCss]);
    const valueCompletion = useMemo(() => {
        let valueCompletion = availableCss[keyStr] ?? [];
        const hasColor = valueCompletion.includes("*color*");
        valueCompletion = [
            ...valueCompletion.filter(c => c !== "*color*"),
            ...aditionalCss,
            ...(hasColor ? variableColor : [])
        ];
        return valueCompletion;
    }, [availableCss, keyStr, aditionalCss, variableColor]);

    const ruleContainerClass = useDynamicClass(`
        & {
            display: flex;
            flex-direction: row;
            gap: 4px;
            align-items: center;
            padding: 4px;
            border-radius: 6px;
            transition: background-color 0.2s;
        }
        &:hover {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.04)};
        }
        & .separator {
            font-weight: 600;
            color: var(--nodius-text-secondary);
            font-size: 16px;
        }
    `);

    const onEditKeyRule = async (newKey: string|undefined) => {
        const newInstruction = baseInstruction.clone();
        if(newKey === undefined) {
            if(keyStr !== "") return;
            newInstruction.key("css").index(blockIndex).key("rules").arrayRemoveIndex(ruleIndex);
        } else {
            newInstruction.key("css").index(blockIndex).key("rules").index(ruleIndex).index(0).set(newKey);
        }
        await onUpdate(newInstruction.instruction);
    };

    const onEditValueRule = async (newValue: string) => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").index(blockIndex).key("rules").index(ruleIndex).index(1).set(newValue);
        await onUpdate(newInstruction.instruction);
    };

    return (
        <div className={ruleContainerClass}>
            <EditableDiv
                removeSpecialChar={true}
                completion={keyCompletion}
                value={keyStr}
                onChange={onEditKeyRule}
                onFocusOut={() => onEditKeyRule(undefined)}
                style={{height: "100%", border: "1px solid var(--nodius-background-paper)", borderRadius: "6px", padding: "4px 10px", minWidth: "60px", minHeight:"32px", backgroundColor: "var(--nodius-background-default)"}}
            />
            <p className="separator">:</p>
            <EditableDiv
                removeSpecialChar={true}
                completion={valueCompletion}
                value={valueStr}
                onChange={onEditValueRule}
                style={{height: "100%", flex: "1", border: "1px solid var(--nodius-background-paper)", borderRadius: "6px", padding: "4px 10px", minWidth: "60px", minHeight:"32px", backgroundColor: "var(--nodius-background-default)"}}
            />
        </div>
    );
});
CssRuleEditor.displayName = 'CssRuleEditor';

// ============================================================================
// CSS BLOCK EDITOR
// ============================================================================

/**
 * Renders a single CSS block with a selector and multiple rules
 */
export const CssBlockEditor = memo(({
    block,
    index,
    baseInstruction,
    onUpdate,
    availableCss,
    aditionalCss,
    variableColor
}: CssBlockEditorProps) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const Theme = useContext(ThemeContext);

    const blockContainerClass = useDynamicClass(`
        & {
            border-radius: 10px;
            border: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.02)};
            box-shadow: var(--nodius-shadow-1);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transition: var(--nodius-transition-default);
        }
        &:hover {
            box-shadow: var(--nodius-shadow-2);
        }
    `);

    const blockHeaderClass = useDynamicClass(`
        & {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.06)};
            padding: 8px 12px;
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.08)};
        }
        & .chevron {
            cursor: pointer;
            transition: transform 0.2s;
            color: var(--nodius-text-secondary);
        }
        & .chevron:hover {
            color: var(--nodius-text-primary);
        }
        & .bracket {
            font-weight: 600;
            color: var(--nodius-primary-main);
            font-size: 18px;
        }
        & .delete-btn {
            cursor: pointer;
            transition: all 0.2s;
            margin-left: auto;
        }
        & .delete-btn:hover {
            transform: scale(1.1);
        }
    `);

    const blockContentClass = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            gap: 0px;
            padding: 12px;
        }
    `);

    const addButtonClass = useDynamicClass(`
        & {
            display: flex;
            justify-content: center;
            align-items: center;
            border: 2px dashed ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.15)};
            padding: 6px;
            cursor: pointer;
            border-radius: 8px;
            transition: var(--nodius-transition-default);
            background-color: transparent;
        }
        &:hover {
            border-color: var(--nodius-primary-main);
            background-color: ${Theme.state.changeOpacity(Theme.state.primary[Theme.state.theme].main, 0.05)};
        }
        & svg {
            color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.4)};
            transition: color 0.2s;
        }
        &:hover svg {
            color: var(--nodius-primary-main);
        }
    `);

    const blockFooterClass = useDynamicClass(`
        & {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.06)};
            padding: 8px 12px;
            border-top: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.08)};
        }
        & .bracket {
            font-weight: 600;
            color: var(--nodius-primary-main);
            font-size: 18px;
        }
    `);

    const newRule = async () => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").index(index).key("rules").arrayAdd(["", ""]);
        await onUpdate(newInstruction.instruction);
    };

    const onEditSelector = async (value: string) => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").index(index).key("selector").set(value);
        await onUpdate(newInstruction.instruction);
    };

    const deleteSelector = async () => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").arrayRemoveIndex(index);
        await onUpdate(newInstruction.instruction);
    };

    return (
        <div className={blockContainerClass}>
            <div className={blockHeaderClass}>
                {isExpanded ? (
                    <ChevronDown height={20} width={20} className="chevron" onClick={() => setIsExpanded(false)} />
                ) : (
                    <ChevronRight height={20} width={20} className="chevron" onClick={() => setIsExpanded(true)} />
                )}
                <EditableDiv
                    removeSpecialChar={true}
                    value={block.selector}
                    onChange={onEditSelector}
                    style={{height: "100%", flex: "1", border: "1px solid var(--nodius-background-paper)", borderRadius: "6px", padding: "4px 8px", backgroundColor: "var(--nodius-background-default)"}}
                />
                <p className="bracket">{"{"}</p>
                <Trash2 height={18} width={18} color={"var(--nodius-red-500)"} onClick={deleteSelector} className="delete-btn"/>
            </div>
            <Collapse in={isExpanded}>
                <div className={blockContentClass}>
                    {block.rules.map(([key, value], i2) => (
                        <CssRuleEditor
                            key={i2}
                            blockIndex={index}
                            ruleIndex={i2}
                            keyStr={key}
                            valueStr={value}
                            availableCss={availableCss}
                            aditionalCss={aditionalCss}
                            variableColor={variableColor}
                            baseInstruction={baseInstruction}
                            onUpdate={onUpdate}
                        />
                    ))}
                    <div className={addButtonClass} onClick={newRule}>
                        <Plus height={18} width={18}/>
                    </div>
                </div>
            </Collapse>
            <div className={blockFooterClass}>
                <p className="bracket">{"}"}</p>
            </div>
        </div>
    );
});
CssBlockEditor.displayName = 'CssBlockEditor';

// ============================================================================
// CSS EDITOR MAIN
// ============================================================================

/**
 * CSS Editor - Manages all CSS blocks
 */
export const CssEditor = memo(({ css, onUpdate }: CssEditorProps) => {
    const Theme = useContext(ThemeContext);
    const { availableCss, aditionalCss, variableColor } = useDynamicCssListing();

    const newBlockButtonClass = useDynamicClass(`
        & {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 8px;
            border: 2px dashed ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.2)};
            padding: 12px;
            cursor: pointer;
            border-radius: 10px;
            transition: var(--nodius-transition-default);
            background-color: transparent;
            font-weight: 500;
            font-size: 14px;
            color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.5)};
        }
        &:hover {
            border-color: var(--nodius-primary-main);
            background-color: ${Theme.state.changeOpacity(Theme.state.primary[Theme.state.theme].main, 0.08)};
            color: var(--nodius-primary-main);
        }
        & svg {
            transition: transform 0.2s;
        }
        &:hover svg {
            transform: scale(1.1);
        }
    `);

    const newBlock = async () => {
        const emptyBlock: CSSBlock = {
            selector: "&",
            rules: [],
        };
        const newInstruction = css.instruction.clone();
        newInstruction.key("css").arrayAdd(emptyBlock);
        await onUpdate(newInstruction.instruction);
    };

    return (
        <div style={{width: "100%", height: "100%", padding: "8px 0", display: "flex", flexDirection: "column", gap: "16px"}}>
            {css.css.map((block, i) => (
                <CssBlockEditor
                    key={i}
                    block={block}
                    index={i}
                    baseInstruction={css.instruction}
                    onUpdate={onUpdate}
                    availableCss={availableCss as Record<string, string[]>}
                    aditionalCss={aditionalCss}
                    variableColor={variableColor}
                />
            ))}
            <div className={newBlockButtonClass} onClick={newBlock}>
                <Plus height={20} width={20}/>
                <span>Add CSS Block</span>
            </div>
        </div>
    );
});
CssEditor.displayName = 'CssEditor';
