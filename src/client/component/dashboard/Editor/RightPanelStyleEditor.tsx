/**
 * @file RightPanelStyleEditor.tsx
 * @description Unified editor for HTML component styling and events
 * @module dashboard/Editor
 *
 * Provides a tabbed interface for editing:
 * - **CSS Styles**: Visual CSS editor with multiple blocks, selectors, and rules
 * - **DOM Events**: Event handlers for click, hover, input, etc.
 *
 * Key Features:
 * - **Tabbed Interface**: Switch between CSS and Events editing
 * - **Multiple CSS Blocks**: Each component can have multiple CSS blocks with different selectors
 * - **Event Management**: Add, edit, and remove DOM event handlers
 * - **Inline Editing**: Direct editing using EditableDiv with autocomplete
 * - **Instruction-Based Updates**: All changes go through InstructionBuilder for undo/redo support
 *
 * Architecture:
 * - RightPanelStyleEditor: Main tabbed component
 * - CssEditor: CSS blocks editor
 * - EventsEditor: DOM events editor
 * - CssBlockEditor: Individual CSS block with selector and rules
 * - CssRuleEditor: Individual CSS rule (property: value) with autocomplete
 */

import {memo, useContext, useMemo, useState} from "react";
import {useDynamicCssListing} from "../../../hooks/useDynamicCssListing";
import {CSSBlock} from "../../../../utils/html/HtmlCss";
import {InstructionBuilder} from "../../../../utils/sync/InstructionBuilder";
import {ChevronDown, ChevronRight, Code, MousePointer, Plus, Trash2, Type} from "lucide-react";
import {Collapse} from "../../animate/Collapse";
import {EditableDiv} from "../../EditableDiv";
import {ThemeContext} from "../../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../../hooks/useDynamicClass";
import {HTMLDomEvent} from "../../../../utils/html/htmlType";
import {ProjectContext} from "../../../hooks/contexts/ProjectContext";

// ============================================================================
// INTERFACES
// ============================================================================

interface RightPanelStyleEditorProps {
    css: EditableCss;
    events: EditableEvents;
    content?: EditableContent;
    onUpdateCss: (cssInstruction: InstructionBuilder) => Promise<void>;
    onUpdateEvents: (eventsInstruction: InstructionBuilder) => Promise<void>;
    onUpdateContent?: (contentInstruction: InstructionBuilder) => Promise<void>;
}

export interface EditableCss {
    css: CSSBlock[];
    instruction: InstructionBuilder;
}

export interface EditableEvents {
    events: Array<HTMLDomEvent<keyof HTMLElementEventMap>>;
    instruction: InstructionBuilder;
}

export interface EditableContent {
    content: Record<string, string>;
    instruction: InstructionBuilder;
    isTextType: boolean;
}

interface CssBlockEditorProps {
    block: CSSBlock;
    index: number;
    baseInstruction: InstructionBuilder;
    onUpdate: (instr: InstructionBuilder) => Promise<void>;
    availableCss: Record<string, string[]>;
    aditionalCss: string[];
    variableColor: string[];
}

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

interface EventEditorProps {
    event: HTMLDomEvent<keyof HTMLElementEventMap>;
    index: number;
    baseInstruction: InstructionBuilder;
    onUpdate: (instr: InstructionBuilder) => Promise<void>;
}

// ============================================================================
// CSS EDITOR COMPONENTS
// ============================================================================

/**
 * Renders a single CSS rule (property: value pair)
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
        await onUpdate(newInstruction);
    };

    const onEditValueRule = async (newValue: string) => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").index(blockIndex).key("rules").index(ruleIndex).index(1).set(newValue);
        await onUpdate(newInstruction);
    };

    return (
        <div className={ruleContainerClass}>
            <EditableDiv
                completion={keyCompletion}
                value={keyStr}
                onChange={onEditKeyRule}
                onFocusOut={() => onEditKeyRule(undefined)}
                style={{height: "100%", border: "1px solid var(--nodius-background-paper)", borderRadius: "6px", padding: "4px 10px", minWidth: "60px", minHeight:"32px", backgroundColor: "var(--nodius-background-default)"}}
            />
            <p className="separator">:</p>
            <EditableDiv
                completion={valueCompletion}
                value={valueStr}
                onChange={onEditValueRule}
                style={{height: "100%", flex: "1", border: "1px solid var(--nodius-background-paper)", borderRadius: "6px", padding: "4px 10px", minWidth: "60px", minHeight:"32px", backgroundColor: "var(--nodius-background-default)"}}
            />
        </div>
    );
});
CssRuleEditor.displayName = 'CssRuleEditor';

/**
 * Renders a single CSS block with a selector and multiple rules
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
        await onUpdate(newInstruction);
    };

    const onEditSelector = async (value: string) => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").index(index).key("selector").set(value);
        await onUpdate(newInstruction);
    };

    const deleteSelector = async () => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("css").arrayRemoveIndex(index);
        await onUpdate(newInstruction);
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

/**
 * CSS Editor - Manages all CSS blocks
 */
const CssEditor = memo(({ css, onUpdate }: { css: EditableCss; onUpdate: (instr: InstructionBuilder) => Promise<void> }) => {
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
        await onUpdate(newInstruction);
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

// ============================================================================
// EVENTS EDITOR COMPONENTS
// ============================================================================

/**
 * Individual event editor
 */
const EventEditor = memo(({ event, index, baseInstruction, onUpdate }: EventEditorProps) => {
    const Theme = useContext(ThemeContext);
    const Project = useContext(ProjectContext);
    const [isExpanded, setIsExpanded] = useState(true);

    const eventContainerClass = useDynamicClass(`
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

    const eventHeaderClass = useDynamicClass(`
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
            color: var(--nodius-text-primary);
        }
        & .chevron:hover {
            color: var(--nodius-text-primary);
        }
        & .event-type {
            font-weight: 600;
            color: var(--nodius-primary-main);
            background-color: ${Theme.state.changeOpacity(Theme.state.primary[Theme.state.theme].main, 0.1)};
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 13px;
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

    const eventContentClass = useDynamicClass(`
        & {
            padding: 12px;
        }
        & > div {
            width: 100%;
            min-height: 150px;
            padding: 12px;
            border: 1px solid var(--nodius-background-paper);
            border-radius: 8px;
            background-color: var(--nodius-background-default);
            color: var(--nodius-text-primary);
            font-family: 'Fira Code', monospace;
            font-size: 13px;
        }
        & > div:focus {
            outline: none;
            border-color: var(--nodius-primary-main);
        }
    `);

    const deleteEvent = async () => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("domEvents").arrayRemoveIndex(index);
        await onUpdate(newInstruction);
    };

    const updateEventCode = async (newCode: string) => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("domEvents").index(index).key("call").set(newCode);
        await onUpdate(newInstruction);
    };

    const editInCodeEditor = () => {
        if(!Project.state.editedHtml) return;
        let nodeId:string|undefined = undefined;
        if(Project.state.editedHtml.targetType === "node") {
            nodeId = Project.state.editedHtml.target._key;
        } else {
            nodeId = "0";
        }

        if(!nodeId) return;

        const newInstruction = baseInstruction.clone();
        newInstruction.key("domEvents").index(index).key("call");
        Project.dispatch({
            field: "editedCode",
            value: [...Project.state.editedCode, {
                nodeId: nodeId,
                title: event.name,
                path: [...Project.state.editedHtml.pathOfRender, ...newInstruction.instruction.p!],
                baseText: event.call
            }]
        });
    }

    return (
        <div className={eventContainerClass}>
            <div className={eventHeaderClass}>
                {isExpanded ? (
                    <ChevronDown height={20} width={20} className="chevron" onClick={() => setIsExpanded(false)} />
                ) : (
                    <ChevronRight height={20} width={20} className="chevron" onClick={() => setIsExpanded(true)} />
                )}
                <span className="event-type">on{event.name}</span>
                <Trash2 height={18} width={18} color={"var(--nodius-red-500)"} onClick={deleteEvent} className="delete-btn"/>
            </div>
            <Collapse in={isExpanded}>
                <div className={eventContentClass}>
                    <EditableDiv
                        value={event.call}
                        placeholder={`// Event handler code&#10;console.log('Event triggered');`}
                        onChange={(e) => updateEventCode(e)} resizable={true}
                        style={{
                            width:"100%",
                            minHeight:"100px"
                        }}
                    />
                    <button onClick={editInCodeEditor}>Edit in code editor</button>
                </div>
            </Collapse>
        </div>
    );
});
EventEditor.displayName = 'EventEditor';

/**
 * Events Editor - Manages all DOM events
 */
const EventsEditor = memo(({ events, onUpdate }: { events: EditableEvents; onUpdate: (instr: InstructionBuilder) => Promise<void> }) => {
    const Theme = useContext(ThemeContext);

    const newEventButtonClass = useDynamicClass(`
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

    const newEvent = async () => {
        const emptyEvent: HTMLDomEvent<"click"> = {
            name: "click",
            call: ""
        };
        const newInstruction = events.instruction.clone();
        newInstruction.key("domEvents").arrayAdd(emptyEvent);
        await onUpdate(newInstruction);
    };

    return (
        <div style={{width: "100%", height: "100%", padding: "8px 0", display: "flex", flexDirection: "column", gap: "16px"}}>
            {events.events.map((event, i) => (
                <EventEditor
                    key={i}
                    event={event}
                    index={i}
                    baseInstruction={events.instruction}
                    onUpdate={onUpdate}
                />
            ))}
            <div className={newEventButtonClass} onClick={newEvent}>
                <Plus height={20} width={20}/>
                <span>Add Event Handler</span>
            </div>
        </div>
    );
});
EventsEditor.displayName = 'EventsEditor';

// ============================================================================
// CONTENT EDITOR COMPONENT
// ============================================================================

/**
 * Content Editor - Edits text content for HtmlText components
 */
const ContentEditor = memo(({ content, onUpdate }: { content: EditableContent; onUpdate: (instr: InstructionBuilder) => Promise<void> }) => {
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Main tabbed style editor with CSS and Events tabs
 */
export const RightPanelStyleEditor = memo(({
    css,
    events,
    content,
    onUpdateCss,
    onUpdateEvents,
    onUpdateContent
}: RightPanelStyleEditorProps) => {
    const [activeTab, setActiveTab] = useState<'css' | 'events' | 'content'>(() => {
        // Default to content tab if it's a text component
        return content?.isTextType ? 'content' : 'css';
    });
    const Theme = useContext(ThemeContext);

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

    return (
        <div style={{width: "100%", height: "100%", display: "flex", flexDirection: "column"}}>
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
            </div>

            <div style={{flex: 1, overflowY: "auto", overflowX: "hidden"}}>
                {activeTab === 'css' && <CssEditor css={css} onUpdate={onUpdateCss} />}
                {activeTab === 'events' && <EventsEditor events={events} onUpdate={onUpdateEvents} />}
            </div>
        </div>
    );
});
RightPanelStyleEditor.displayName = 'RightPanelStyleEditor';
