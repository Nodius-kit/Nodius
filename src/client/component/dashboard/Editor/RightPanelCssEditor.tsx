/**
 * @file RightPanelCssEditor.tsx
 * @description CSS block editor for HTML component styling
 * @module dashboard/Editor
 *
 * Provides a visual CSS editor for styling HTML components with multiple CSS blocks.
 * Each block contains:
 * - A CSS selector (e.g., "&", "& .child", "&:hover")
 * - Multiple CSS rules (key-value pairs like "color: red", "padding: 10px")
 *
 * Key Features:
 * - **Multiple CSS Blocks**: Each component can have multiple CSS blocks with different selectors
 * - **Inline Editing**: Direct editing of selectors, property names, and values using EditableDiv
 * - **Autocomplete**: Intelligent suggestions for CSS properties and values from useDynamicCssListing
 * - **Color Variables**: Automatically includes theme color variables in autocomplete for color properties
 * - **Instruction-Based Updates**: All changes go through InstructionBuilder for undo/redo support
 * - **Collapsible Blocks**: Expand/collapse individual CSS blocks for better organization
 * - **Add/Remove**: Easily add new blocks and rules, or delete existing ones
 *
 * Architecture:
 * - RightPanelCssEditor: Main component that renders all CSS blocks
 * - CssBlockEditor: Individual CSS block with selector and rules
 * - CssRuleEditor: Individual CSS rule (property: value) with autocomplete
 */

import {memo, useContext, useMemo, useState} from "react";
import {useDynamicCssListing} from "../../../hooks/useDynamicCssListing";
import {CSSBlock} from "../../../../utils/html/HtmlCss";
import {InstructionBuilder} from "../../../../utils/sync/InstructionBuilder";
import {ChevronDown, ChevronRight, Plus, Trash2} from "lucide-react";
import {Collapse} from "../../animate/Collapse";
import {EditableDiv} from "../../EditableDiv";
import {ThemeContext} from "../../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../../hooks/useDynamicClass";

interface RightPanelCssEditorProps {
    css: EditableCss;
    onUpdate: (cssInstruction: InstructionBuilder) => Promise<void>;
}

export interface EditableCss {css:CSSBlock[], instruction:InstructionBuilder}

interface CssBlockEditorProps {
    block: CSSBlock;
    index: number;
    baseInstruction: InstructionBuilder;
    onUpdate: (instr: InstructionBuilder) => Promise<void>;
    availableCss: Record<string, string[]>;
    aditionalCss: string[];
    variableColor: string[];
}

/**
 * Renders a single CSS block with a selector and multiple rules
 * Example: "& .button { color: red; padding: 10px; }"
 * The selector is editable, and users can add/remove rules
 */
const CssBlockEditor = memo(({
                                 block,
                                 index,
                                 baseInstruction,
                                 onUpdate,
                                 availableCss,
                                 aditionalCss,
                                 variableColor
                             }: CssBlockEditorProps) => {
    // CSS blocks start expanded for immediate editing
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

    /**
     * Adds a new empty CSS rule to this block
     * Creates an instruction to add ["", ""] (empty key-value pair) to the rules array
     */
    const newRule = async () => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").index(index).key("rules").arrayAdd(["", ""]);
        await onUpdate(newInstruction);
    }

    /**
     * Updates the CSS selector for this block
     * Example: changing "&" to "& .child" or "&:hover"
     */
    const onEditSelector = async (value: string) => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").index(index).key("selector").set(value);
        await onUpdate(newInstruction);
    }

    /**
     * Deletes this entire CSS block from the component
     * Removes the block from the css array at the current index
     */
    const deleteSelector = async () => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").arrayRemoveIndex(index);
        await onUpdate(newInstruction);
    }

    return (
        <div className={blockContainerClass}>
            <div className={blockHeaderClass}>
                {isExpanded ? (
                    <ChevronDown height={20} width={20} className="chevron" onClick={() => setIsExpanded(false)} />
                ) : (
                    <ChevronRight height={20} width={20} className="chevron" onClick={() => setIsExpanded(true)} />
                )}
                <EditableDiv
                    value={block.selector}
                    onChange={async (content) => {
                        await onEditSelector(content);
                    }}
                    style={{height: "100%", flex: "1", border: "1px solid var(--nodius-background-paper)", borderRadius: "6px", padding: "4px 8px", backgroundColor: "var(--nodius-background-default)"}}
                />
                <p className="bracket">{"{"}</p>
                <Trash2 height={18} width={18} color={"var(--nodius-red-500)"} onClick={async () => await deleteSelector()} className="delete-btn"/>
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
                    <div
                        className={addButtonClass}
                        onClick={async () => newRule()}
                    >
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

interface CssRuleEditorProps {
    blockIndex: number;
    ruleIndex: number;
    keyStr: string;
    valueStr: string;
    availableCss: Record<string, string[]>;
    aditionalCss: string[];
    variableColor: string[];
    baseInstruction: InstructionBuilder;
    onUpdate: (instr: InstructionBuilder) => Promise<void>;
}

/**
 * Renders a single CSS rule (property: value pair)
 * Example: "color: red" or "padding: 10px"
 * Provides autocomplete suggestions for both property names and values
 */
const CssRuleEditor = memo(({
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

    // Autocomplete suggestions for CSS property names (e.g., "color", "padding", "margin")
    const keyCompletion = useMemo(() => Object.keys(availableCss), [availableCss]);

    // Autocomplete suggestions for CSS values based on the selected property
    // Special handling: if property accepts colors (marked with "*color*"), include theme color variables
    const valueCompletion = useMemo(() => {
        let valueCompletion = availableCss[keyStr] ?? [];
        const hasColor = valueCompletion.includes("*color*");
        valueCompletion = [
            ...valueCompletion.filter(c => c !== "*color*"),  // Remove the marker
            ...aditionalCss,                                   // Add custom values
            ...(hasColor ? variableColor : [])                 // Add color variables if applicable
        ];
        return valueCompletion;
    }, [availableCss, variableColor])

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

    /**
     * Updates the CSS property name (left side of the colon)
     * Example: changing "color" to "background-color"
     * Rule is stored as [key, value] tuple, so we update index 0
     */
    const onEditKeyRule = async (newKey: string) => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").index(blockIndex).key("rules").index(ruleIndex).index(0).set(newKey);
        await onUpdate(newInstruction);
    }

    /**
     * Updates the CSS property value (right side of the colon)
     * Example: changing "red" to "#ff0000"
     * Rule is stored as [key, value] tuple, so we update index 1
     */
    const onEditValueRule = async (newValue: string) => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").index(blockIndex).key("rules").index(ruleIndex).index(1).set(newValue);
        await onUpdate(newInstruction);
    }

    return (
        <div className={ruleContainerClass}>
            <EditableDiv
                completion={keyCompletion}
                value={keyStr}
                onChange={async (content) => await onEditKeyRule(content)}
                style={{height: "100%", border: "1px solid var(--nodius-background-paper)", borderRadius: "6px", padding: "4px 10px", minWidth: "60px", minHeight:"32px", backgroundColor: "var(--nodius-background-default)"}}
            />
            <p className="separator">:</p>
            <EditableDiv
                completion={valueCompletion}
                value={valueStr}
                onChange={async (content) => await onEditValueRule(content)}
                style={{height: "100%", flex: "1", border: "1px solid var(--nodius-background-paper)", borderRadius: "6px", padding: "4px 10px", minWidth: "60px", minHeight:"32px", backgroundColor: "var(--nodius-background-default)"}}
            />
        </div>
    );
});
CssRuleEditor.displayName = 'CssRuleEditor';

/**
 * Main CSS editor component that displays all CSS blocks for a component
 * Uses useDynamicCssListing to provide intelligent autocomplete suggestions
 */
export const RightPanelCssEditor = memo(({
                                             onUpdate,
                                             css
                                         }: RightPanelCssEditorProps) => {

    const Theme = useContext(ThemeContext);

    // Get CSS autocomplete data: property names, values, and theme color variables
    const {
        availableCss,
        aditionalCss,
        variableColor
    } = useDynamicCssListing();

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

    /**
     * Creates a new empty CSS block with default selector "&"
     * The "&" selector refers to the component itself (SCSS-style)
     */
    const newBlock = async () => {
        const emptyBlock: CSSBlock = {
            selector: "&",
            rules: [],
        }
        const newInstruction = css.instruction.clone();
        newInstruction.key("css").arrayAdd(emptyBlock);
        await onUpdate(newInstruction);
    }

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
    )
});
RightPanelCssEditor.displayName = 'RightPanelCssEditor';