/**
 * @file useStableProjectRef.ts
 * @description Hook for maintaining stable ref to ProjectContext to prevent stale closures
 * @module hooks
 *
 * This hook solves the three-layer rendering problem in Nodius:
 * 1. React layer (UI components)
 * 2. DOM event layer (node interactions)
 * 3. WebGPU layer (background and edges)
 *
 * Problem: DOM event handlers capture ProjectContext.state at attachment time,
 * creating stale closures that don't reflect current state.
 *
 * Solution: Use a ref that's always up-to-date, allowing DOM events to access
 * the latest state without recreating handlers on every Project.state change.
 *
 * @example
 * // Instead of this (causes stale closures):
 * const handler = useCallback(() => {
 *   Project.state.updateGraph(...) // Stale!
 * }, [Project.state.updateGraph]);
 *
 * // Use this (always fresh):
 * const projectRef = useStableProjectRef();
 * const handler = useCallback(() => {
 *   projectRef.current.state.updateGraph(...) // Always current!
 * }, []); // Empty deps - handler is stable
 */

import { useContext, useEffect, useRef } from "react";
import { ProjectContext, ProjectContextProps } from "./contexts/ProjectContext";

/**
 * Returns a ref to ProjectContext that's always synchronized with latest state
 *
 * This prevents stale closures in:
 * - DOM event handlers
 * - WebGPU motor callbacks
 * - Long-running async operations
 * - RequestAnimationFrame loops
 *
 * @returns Ref object containing current ProjectContext
 */
export function useStableProjectRef(): React.MutableRefObject<ProjectContextProps> {
    const Project = useContext(ProjectContext);
    const projectRef = useRef<ProjectContextProps>(Project);

    // Keep ref synchronized with latest Project context
    useEffect(() => {
        projectRef.current = Project;
    }, [Project]);

    return projectRef;
}

/**
 * Type-safe getter for accessing stable project state
 * Useful for extracting specific state values with fresh data guarantee
 *
 * @example
 * const getUpdateGraph = useStableProjectGetter(p => p.state.updateGraph);
 * // Later in DOM event:
 * const updateGraph = getUpdateGraph();
 * await updateGraph(instructions);
 */
export function useStableProjectGetter<T>(
    selector: (project: ProjectContextProps) => T
): () => T {
    const projectRef = useStableProjectRef();

    return () => selector(projectRef.current);
}
