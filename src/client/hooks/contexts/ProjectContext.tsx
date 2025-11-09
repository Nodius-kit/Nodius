/**
 * @file ProjectContext.tsx
 * @description Global project state context for workflow and graph management
 * @module hooks/contexts
 *
 * Provides centralized state management for the entire project:
 * - ProjectContext: React context for project-wide state and operations
 * - Workflow editing: openHtmlClass, editedHtml, updateHtml operations
 * - Node configuration: openNodeConfig, editedNodeConfig management
 * - Graph operations: updateGraph, batch create/delete elements
 * - HTML rendering: Manages multiple HtmlRender instances per node
 * - Data types: Custom data types and enums management
 * - Synchronization: Real-time sync state and message handling
 *
 * Key features:
 * - Loader state for UI feedback during operations
 * - Node type configuration registry
 * - HTML renderer lifecycle management
 * - Unique ID generation for graph elements
 * - WebSocket message catch-up for reconnection scenarios
 */
import {createContext, Dispatch} from "react";
import {ActionType} from "../useCreateReducer";

export interface ProjectContextProps {
    state: ProjectContextType;
    dispatch: Dispatch<ActionType<ProjectContextType>>;
}

export const ProjectContext = createContext<ProjectContextProps>(undefined!);

export interface ProjectContextType {
    selectedNode: string[],
    selectedEdge: string[],
}
export const ProjectContextDefaultValue: ProjectContextType = {
    selectedNode: [],
    selectedEdge: [],
}
