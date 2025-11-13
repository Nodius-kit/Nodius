/**
 * @file types.ts
 * @description Shared TypeScript interfaces for RightPanelStyleEditor components
 * @module dashboard/Editor/RightPanelStyleEditor
 */

import {Instruction, InstructionBuilder} from "../../../../../utils/sync/InstructionBuilder";
import {HTMLDomEvent} from "../../../../../utils/html/htmlType";
import {WebGpuMotor} from "../../../motor/webGpuMotor";
import {CSSBlock} from "../../../../../utils/html/htmlCss";

// ============================================================================
// MAIN EDITOR INTERFACES
// ============================================================================

export interface RightPanelStyleEditorProps {
    css: EditableCss;
    events: EditableEvents;
    content?: EditableContent;
    tag: EditableTag;
    onUpdateCss: (cssInstruction: Instruction | Instruction[]) => Promise<boolean>;
    onUpdateEvents: (eventsInstruction: Instruction | Instruction[]) => Promise<boolean>;
    onUpdateContent?: (contentInstruction: Instruction | Instruction[]) => Promise<boolean>;
    onUpdateTag: (tagInstruction: Instruction | Instruction[]) => Promise<boolean>;
    selectedIdentifier?: string
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

// ============================================================================
// CSS EDITOR INTERFACES
// ============================================================================

export interface CssBlockEditorProps {
    block: CSSBlock;
    index: number;
    baseInstruction: InstructionBuilder;
    onUpdate: (instr: Instruction | Instruction[]) => Promise<boolean>;
    availableCss: Record<string, string[]>;
    aditionalCss: string[];
    variableColor: string[];
}

export interface CssRuleEditorProps {
    blockIndex: number;
    ruleIndex: number;
    keyStr: string;
    valueStr: string;
    availableCss: Record<string, string[]>;
    aditionalCss: string[];
    variableColor: string[];
    baseInstruction: InstructionBuilder;
    onUpdate: (instr: Instruction | Instruction[]) => Promise<boolean>;
}

export interface CssEditorProps {
    css: EditableCss;
    onUpdate: (instr: Instruction | Instruction[]) => Promise<boolean>;
}

// ============================================================================
// EVENTS EDITOR INTERFACES
// ============================================================================

export interface EventEditorProps {
    event: HTMLDomEvent<keyof HTMLElementEventMap>;
    index: number;
    baseInstruction: InstructionBuilder;
    onUpdate: (instr: Instruction | Instruction[]) => Promise<boolean>;
    selectedIdentifier?: string
}

export interface EventsEditorProps {
    events: EditableEvents;
    onUpdate: (instr: Instruction | Instruction[]) => Promise<boolean>;
    selectedIdentifier: string | undefined;
}

// ============================================================================
// CONTENT EDITOR INTERFACES
// ============================================================================

export interface ContentEditorProps {
    content: EditableContent;
    onUpdate: (instr: Instruction | Instruction[]) => Promise<boolean>;
}

// ============================================================================
// TAG EDITOR INTERFACES
// ============================================================================

export interface EditableTag {
    tag: string;
    instruction: InstructionBuilder;
}

export interface TagEditorProps {
    tag: EditableTag;
    onUpdate: (instr: Instruction | Instruction[]) => Promise<boolean>;
}
