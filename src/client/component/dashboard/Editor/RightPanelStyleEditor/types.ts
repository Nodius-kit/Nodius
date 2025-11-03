/**
 * @file types.ts
 * @description Shared TypeScript interfaces for RightPanelStyleEditor components
 * @module dashboard/Editor/RightPanelStyleEditor
 */

import {CSSBlock} from "../../../../../utils/html/HtmlCss";
import {InstructionBuilder} from "../../../../../utils/sync/InstructionBuilder";
import {HTMLDomEvent} from "../../../../../utils/html/htmlType";
import {WebGpuMotor} from "../../../../schema/motor/webGpuMotor";

// ============================================================================
// MAIN EDITOR INTERFACES
// ============================================================================

export interface RightPanelStyleEditorProps {
    css: EditableCss;
    events: EditableEvents;
    content?: EditableContent;
    tag: EditableTag;
    onUpdateCss: (cssInstruction: InstructionBuilder) => Promise<void>;
    onUpdateEvents: (eventsInstruction: InstructionBuilder) => Promise<void>;
    onUpdateContent?: (contentInstruction: InstructionBuilder) => Promise<void>;
    onUpdateTag: (tagInstruction: InstructionBuilder) => Promise<void>;
    getMotor: () => (WebGpuMotor | undefined);
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
    onUpdate: (instr: InstructionBuilder) => Promise<void>;
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
    onUpdate: (instr: InstructionBuilder) => Promise<void>;
}

export interface CssEditorProps {
    css: EditableCss;
    onUpdate: (instr: InstructionBuilder) => Promise<void>;
}

// ============================================================================
// EVENTS EDITOR INTERFACES
// ============================================================================

export interface EventEditorProps {
    event: HTMLDomEvent<keyof HTMLElementEventMap>;
    index: number;
    baseInstruction: InstructionBuilder;
    onUpdate: (instr: InstructionBuilder) => Promise<void>;
    getMotor: () => (WebGpuMotor | undefined);
    selectedIdentifier?: string
}

export interface EventsEditorProps {
    events: EditableEvents;
    onUpdate: (instr: InstructionBuilder) => Promise<void>;
    getMotor: () => (WebGpuMotor | undefined);
    selectedIdentifier: string | undefined;
}

// ============================================================================
// CONTENT EDITOR INTERFACES
// ============================================================================

export interface ContentEditorProps {
    content: EditableContent;
    onUpdate: (instr: InstructionBuilder) => Promise<void>;
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
    onUpdate: (instr: InstructionBuilder) => Promise<void>;
}
