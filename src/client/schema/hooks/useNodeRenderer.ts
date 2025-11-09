/**
 * @file useNodeRenderer.ts
 * @description Hook for managing HTML renderers for nodes with proper dependency tracking
 * @module schema/hooks
 *
 * REFACTORED: Now uses ref pattern for dependencies to prevent callback recreations
 */

import { useRef, useCallback, useEffect } from "react";
import { htmlRenderContext } from "../../hooks/contexts/ProjectContext";
import {deepCopy} from "../../../utils/objectUtils";
import {useStableProjectRef} from "../../hooks/useStableProjectRef";
import {DataTypeClass, EnumClass} from "../../../utils/dataType/dataType";
import {Node} from "../../../utils/graph/graphType";

export interface RendererDependencies {
    currentEntryDataType?: DataTypeClass;
    enumTypes?: EnumClass[];
    dataTypes?: DataTypeClass[];
    updateNode?: (node: Node<any>) => Promise<any>;
}

export interface NodeRendererInfo {
    nodeKey: string;
    htmlRenderer?: htmlRenderContext;
}

export interface UseNodeRendererOptions {
    dependencies: RendererDependencies;
}

/**
 * Hook for managing HTML renderers with proper dependency tracking
 * Uses ref pattern to avoid recreating callbacks on every dependency change
 */
export function useNodeRenderer(options: UseNodeRendererOptions) {
    const { dependencies } = options;

    const nodeRenderers = useRef<Map<string, NodeRendererInfo>>(new Map());
    const previousDependencies = useRef<RendererDependencies>({});
    const projectRef = useStableProjectRef();

    // Store current dependencies in ref for stable callback access
    const dependenciesRef = useRef<RendererDependencies>(dependencies);
    useEffect(() => {
        dependenciesRef.current = dependencies;
    }, [dependencies]);

    /**
     * Register a new renderer for a node
     */
    const registerRenderer = useCallback((nodeKey: string, htmlRenderer?: htmlRenderContext) => {
        nodeRenderers.current.set(nodeKey, { nodeKey, htmlRenderer });

        // Set initial dependencies using ref for fresh values
        if (htmlRenderer) {
            const deps = dependenciesRef.current;
            htmlRenderer.htmlMotor.setVariableInGlobalStorage("allDataTypes", deps.dataTypes);
            htmlRenderer.htmlMotor.setVariableInGlobalStorage("allEnumTypes", deps.enumTypes);
            htmlRenderer.htmlMotor.setVariableInGlobalStorage("globalCurrentEntryDataType", deps.currentEntryDataType);
            htmlRenderer.htmlMotor.setVariableInGlobalStorage("updateNode", deps.updateNode);

            // Create a getter function that always returns the fresh node from the graph
            const getNode = () => {
                const graph = projectRef.current.state.graph;
                const sheetId = projectRef.current.state.selectedSheetId;
                if (!graph || !sheetId) return undefined;
                const node = deepCopy(graph.sheets[sheetId]?.nodeMap.get(nodeKey));
                console.log(node);
                return node;
            };
            htmlRenderer.htmlMotor.setVariableInGlobalStorage("node", getNode());
            htmlRenderer.htmlMotor.setVariableInGlobalStorage("getNode", getNode);
        }
    }, []); // No dependencies - stable callback

    /**
     * Unregister a renderer
     */
    const unregisterRenderer = useCallback((nodeKey: string) => {
        const info = nodeRenderers.current.get(nodeKey);

        if (info?.htmlRenderer) {
            info.htmlRenderer.htmlMotor.dispose();
        }
        nodeRenderers.current.delete(nodeKey);
    }, []);

    /**
     * Get a renderer info by node key
     */
    const getRenderer = useCallback((nodeKey: string): NodeRendererInfo | undefined => {
        return nodeRenderers.current.get(nodeKey);
    }, []);

    /**
     * Update dependencies for a specific renderer
     */
    const updateRendererDependencies = useCallback(async (
        nodeKey: string,
        nodeType: string
    ): Promise<void> => {
        const info = nodeRenderers.current.get(nodeKey);
        if (!info?.htmlRenderer) return;

        // Update global storage variables using ref for fresh values
        const deps = dependenciesRef.current;
        info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("allDataTypes", deps.dataTypes);
        info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("allEnumTypes", deps.enumTypes);
        info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("globalCurrentEntryDataType", deps.currentEntryDataType);
        info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("updateNode", deps.updateNode);

        // Update node getter
        const getNode = () => {
            const graph = projectRef.current.state.graph;
            const sheetId = projectRef.current.state.selectedSheetId;
            if (!graph || !sheetId) return undefined;
            return deepCopy(graph.sheets[sheetId]?.nodeMap.get(nodeKey));
        };
        info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("node", getNode());
        info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("getNode", getNode);

        // Trigger re-render with updated config
        const nodeConfig = projectRef.current.state.nodeTypeConfig[nodeType];
        if (nodeConfig?.content) {
            await info.htmlRenderer.htmlMotor.render(nodeConfig.content);
        }
    }, []); // Only getNodeConfig dependency

    /**
     * Update dependencies for all renderers
     */
    const updateAllRendererDependencies = useCallback(async (): Promise<void> => {
        const deps = dependenciesRef.current;
        const updates = Array.from(nodeRenderers.current.values()).map(async (info) => {
            if (!info.htmlRenderer) return;

            info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("allDataTypes", deps.dataTypes);
            info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("allEnumTypes", deps.enumTypes);
            info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("globalCurrentEntryDataType", deps.currentEntryDataType);
            info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("updateNode", deps.updateNode);

            // Update node getter
            const getNode = () => {
                const graph = projectRef.current.state.graph;
                const sheetId = projectRef.current.state.selectedSheetId;
                if (!graph || !sheetId) return undefined;
                return deepCopy(graph.sheets[sheetId]?.nodeMap.get(info.nodeKey));
            };
            info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("node", getNode());
            info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("getNode", getNode);
        });

        await Promise.all(updates);
    }, []); // No dependencies - stable callback

    /**
     * Clear all renderers
     */
    const clearAllRenderers = useCallback(() => {
        nodeRenderers.current.forEach(info => {
            if (info.htmlRenderer) {
                info.htmlRenderer.htmlMotor.dispose();
            }
        });
        nodeRenderers.current.clear();
    }, []);

    /**
     * Check if dependencies have changed and trigger updates
     */
    useEffect(() => {
        const depsChanged =
            previousDependencies.current.currentEntryDataType !== dependencies.currentEntryDataType ||
            previousDependencies.current.enumTypes !== dependencies.enumTypes ||
            previousDependencies.current.dataTypes !== dependencies.dataTypes ||
            previousDependencies.current.updateNode !== dependencies.updateNode;

        if (depsChanged) {
            previousDependencies.current = {
                currentEntryDataType: dependencies.currentEntryDataType,
                enumTypes: dependencies.enumTypes,
                dataTypes: dependencies.dataTypes,
                updateNode: dependencies.updateNode,
            };

            updateAllRendererDependencies();
        }
    }, [dependencies]); // updateAllRendererDependencies is stable, no need in deps

    return {
        registerRenderer,
        unregisterRenderer,
        getRenderer,
        updateRendererDependencies,
        updateAllRendererDependencies,
        clearAllRenderers,
    };
}
