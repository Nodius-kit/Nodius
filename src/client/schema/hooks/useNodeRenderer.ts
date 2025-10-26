/**
 * @file useNodeRenderer.ts
 * @description Hook for managing HTML renderers for nodes with proper dependency tracking
 * @module schema/hooks
 */

import { useRef, useCallback, useEffect } from "react";
import { htmlRenderContext } from "../../hooks/contexts/ProjectContext";

export interface RendererDependencies {
    currentEntryDataType?: any;
    enumTypes?: any[];
    dataTypes?: any[];
}

export interface NodeRendererInfo {
    nodeKey: string;
    htmlRenderer?: htmlRenderContext;
}

export interface UseNodeRendererOptions {
    dependencies: RendererDependencies;
    getNodeConfig: (nodeType: string) => any;
}

/**
 * Hook for managing HTML renderers with proper dependency tracking
 */
export function useNodeRenderer(options: UseNodeRendererOptions) {
    const { dependencies, getNodeConfig } = options;

    const nodeRenderers = useRef<Map<string, NodeRendererInfo>>(new Map());
    const previousDependencies = useRef<RendererDependencies>({});

    /**
     * Register a new renderer for a node
     */
    const registerRenderer = useCallback((nodeKey: string, htmlRenderer?: htmlRenderContext) => {
        nodeRenderers.current.set(nodeKey, { nodeKey, htmlRenderer });

        // Set initial dependencies
        if (htmlRenderer) {
            htmlRenderer.htmlMotor.setVariableInGlobalStorage("allDataTypes", dependencies.dataTypes);
            htmlRenderer.htmlMotor.setVariableInGlobalStorage("allEnumTypes", dependencies.enumTypes);
            htmlRenderer.htmlMotor.setVariableInGlobalStorage("globalCurrentEntryDataType", dependencies.currentEntryDataType);
        }
    }, [dependencies]);

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

        // Update global storage variables
        info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("allDataTypes", dependencies.dataTypes);
        info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("allEnumTypes", dependencies.enumTypes);
        info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("globalCurrentEntryDataType", dependencies.currentEntryDataType);

        // Trigger re-render with updated config
        const nodeConfig = getNodeConfig(nodeType);
        if (nodeConfig?.content) {

            await info.htmlRenderer.htmlMotor.render(nodeConfig.content);
        }
    }, [dependencies, getNodeConfig]);

    /**
     * Update dependencies for all renderers
     */
    const updateAllRendererDependencies = useCallback(async (): Promise<void> => {
        const updates = Array.from(nodeRenderers.current.values()).map(async (info) => {
            if (!info.htmlRenderer) return;

            info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("allDataTypes", dependencies.dataTypes);
            info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("allEnumTypes", dependencies.enumTypes);
            info.htmlRenderer.htmlMotor.setVariableInGlobalStorage("globalCurrentEntryDataType", dependencies.currentEntryDataType);
        });

        await Promise.all(updates);
    }, [dependencies]);

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
            previousDependencies.current.dataTypes !== dependencies.dataTypes;

        if (depsChanged) {
            previousDependencies.current = {
                currentEntryDataType: dependencies.currentEntryDataType,
                enumTypes: dependencies.enumTypes,
                dataTypes: dependencies.dataTypes,
            };

            updateAllRendererDependencies();
        }
    }, [dependencies, updateAllRendererDependencies]);

    return {
        registerRenderer,
        unregisterRenderer,
        getRenderer,
        updateRendererDependencies,
        updateAllRendererDependencies,
        clearAllRenderers,
    };
}
