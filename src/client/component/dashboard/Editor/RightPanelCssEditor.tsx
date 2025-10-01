import {memo, useMemo, useState} from "react";
import {useDynamicCssListing} from "../../../hooks/useDynamicCssListing";
import {CSSBlock} from "../../../../utils/html/HtmlCss";
import {InstructionBuilder} from "../../../../utils/sync/InstructionBuilder";
import {ChevronDown, ChevronRight, Plus, Trash2} from "lucide-react";
import {Collapse} from "../../animate/Collapse";
import {EditableDiv} from "../../EditableDiv";

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

const CssBlockEditor = memo(({
                                 block,
                                 index,
                                 baseInstruction,
                                 onUpdate,
                                 availableCss,
                                 aditionalCss,
                                 variableColor
                             }: CssBlockEditorProps) => {
    const [isExpanded, setIsExpanded] = useState(true);

    const newRule = async () => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").index(index).key("rules").arrayAdd(["", ""]);
        await onUpdate(newInstruction);
    }

    const onEditSelector = async (value: string) => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").index(index).key("selector").set(value);
        await onUpdate(newInstruction);
    }

    const deleteSelector = async () => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").arrayRemoveIndex(index);
        await onUpdate(newInstruction);
    }

    return (
        <div style={{
            borderRadius: "8px",
            border: "2px solid var(--nodius-background-paper)",
            backgroundColor: "var(--nodius-background-default)",
            boxShadow: "var(--nodius-shadow-1)",
            display: "flex",
            flexDirection: "column",
        }}>
            <div style={{
                backgroundColor: "var(--nodius-background-paper)",
                padding: "5px 10px",
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: "8px"
            }}>
                {isExpanded ? (
                    <ChevronDown height={24} width={24} style={{cursor: "pointer"}} onClick={() => setIsExpanded(false)} />
                ) : (
                    <ChevronRight height={24} width={24} style={{cursor: "pointer"}} onClick={() => setIsExpanded(true)} />
                )}
                <EditableDiv
                    value={block.selector}
                    onChange={async (content) => {
                        await onEditSelector(content);
                    }}
                    style={{height: "100%", flex: "1", border: "1px solid var(--nodius-background-default)", borderRadius: "4px", padding: "2px 5px"}}
                />
                <p>{"{"}</p>
                <Trash2 height={18} width={18} color={"var(--nodius-red-500)"} onClick={async () => await deleteSelector()} style={{cursor: "pointer", marginLeft: "20px"}}/>
            </div>
            <Collapse in={isExpanded}>
                <div style={{display: "flex", flexDirection: "column", gap: "8px", padding: "5px 10px"}}>
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
                        style={{display: "flex", justifyContent: "center", alignItems: "center", border: "2px dashed var(--nodius-background-paper)", padding: "3px 5px", cursor: "pointer", borderRadius: "8px"}}
                        onClick={async () => newRule()}
                    >
                        <Plus color={"var(--nodius-background-paper)"} height={16} width={16}/>
                    </div>
                </div>
            </Collapse>
            <div style={{
                backgroundColor: "var(--nodius-background-paper)",
                padding: "5px 10px"
            }}>
                <p>{"}"}</p>
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
    }, [availableCss, variableColor])


    const onEditKeyRule = async (newKey: string) => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").index(blockIndex).key("rules").index(ruleIndex).index(0).set(newKey);
        await onUpdate(newInstruction);
    }

    const onEditValueRule = async (newValue: string) => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").index(blockIndex).key("rules").index(ruleIndex).index(1).set(newValue);
        await onUpdate(newInstruction);
    }

    return (
        <div style={{display: "flex", flexDirection: "row", gap: "4px", alignItems: "center"}}>
            <EditableDiv
                completion={keyCompletion}
                value={keyStr}
                onChange={async (content) => await onEditKeyRule(content)}
                style={{height: "100%", border: "1px solid var(--nodius-background-paper)", borderRadius: "4px", padding: "2px 8px", minWidth: "48px", minHeight:"30px"}}
            />
            <p>:</p>
            <EditableDiv
                completion={valueCompletion}
                value={valueStr}
                onChange={async (content) => await onEditValueRule(content)}
                style={{height: "100%", flex: "1", border: "1px solid var(--nodius-background-paper)", borderRadius: "4px", padding: "2px 8px", minWidth: "48px", minHeight:"30px"}}
            />
        </div>
    );
});
CssRuleEditor.displayName = 'CssRuleEditor';

export const RightPanelCssEditor = memo(({
                                             onUpdate,
                                             css
                                         }: RightPanelCssEditorProps) => {

    const {
        availableCss,
        aditionalCss,
        variableColor
    } = useDynamicCssListing();

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
        <div style={{width: "100%", height: "100%", padding: "12px", display: "flex", flexDirection: "column", gap: "12px"}}>

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

            <button onClick={newBlock}>New Block</button>
        </div>
    )
});
RightPanelCssEditor.displayName = 'RightPanelCssEditor';