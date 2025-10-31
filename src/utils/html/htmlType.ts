/**
 * @file htmlType.ts
 * @description Type definitions for HTML object structures and workflow classes
 * @module html
 *
 * Comprehensive type system for HTML component definitions:
 * - HtmlObject types: HtmlDiv, HtmlText, HtmlList, HtmlInner, HtmlArray
 * - HtmlClass: Complete workflow class with metadata
 * - Events: DOM events and workflow events
 * - Builder components: Categorized HTML builder component definitions
 *
 * Key features:
 * - Hierarchical HTML object structure with identifiers
 * - CSS block integration via CSSBlock type
 * - Event handling (DOM and workflow events)
 * - Attribute and delimiter support
 * - Category-based builder component organization
 * - Workspace and permission management
 */

import {CSSProperties} from "react";
import {CSSBlock} from "./HtmlCss";

/* ------------ HTML CLASS --------------- */

export const HTMLWorkflowEvent = ["variableChange"] as const;
export type HTMLWorkflowEventType = typeof HTMLWorkflowEvent[number];

export interface HTMLDomEvent<T> {
    name: T;
    description?: string;
    call: string;
}

export interface HTMLWorkFlowEvent<T> {
    name: T;
    description?: string;
    call: string;
}

export interface HtmlBase {
    identifier: string; // auto generated
    id?: string; // user generated
    tag: string;
    css:CSSBlock[],
    domEvents: Array<HTMLDomEvent<keyof HTMLElementEventMap>>,
    workflowEvents: Array<HTMLWorkFlowEvent<HTMLWorkflowEventType>>,
    name:string,
    delimiter?: boolean,
    temporary?:boolean,
    attribute?: Record<string, string>,
}

export interface HtmlArray extends HtmlBase {
    type: "array",
    content: {
        content?: HtmlObject,
        noContent?: HtmlObject,
        numberOfContent: string,
        indexVariableName: string,
    },
}

export interface HtmlDiv extends HtmlBase {
    type: "block",
    content?: HtmlObject,
}

export interface HtmlText extends HtmlBase{
    type: "text",
    content: Record<string, string>
}

export interface HtmlList extends HtmlBase {
    type: "list",
    content: HtmlObject[],
}

export interface HtmlInner extends HtmlBase {
    type: "html",
    content: string,
}

export type HtmlObject = HtmlDiv | HtmlText | HtmlList | HtmlInner | HtmlArray;
export interface HtmlClass {
    htmlNodeKey: string;
    object:HtmlObject,
    version: number;
    // html related info
    name:string,
    description?:string,

    // bdd unique identifier
    _key:string,
    graphKeyLinked: string,


    // aditional info
    category:string,
    permission:number,

    // html unique info
    workspace:string, // user-id or workspace-id


    createdTime: number,
    lastUpdatedTime: number,
}


/* ------------ HTML BUILDER --------------- */
export const HtmlBuilderCategory = ["Most Used Components", "Layout Components"] as const
export type HtmlBuilderCategoryType = typeof HtmlBuilderCategory[number];
export interface HtmlBuilderComponent {
    _keys: string,
    icon: string, // lucide icon name,
    htmlKeyLinked: string,
    workspace: string,
    category: HtmlBuilderCategoryType,
    object: HtmlObject,
}