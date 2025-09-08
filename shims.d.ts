/// <reference types="nodius_jsx/jsx" />
/// <reference types="@webgpu/types" />

declare global {
    interface Window {
        __jsxRuntime?: {
            componentInstances: Map<Node, any>;
            reRenderAllComponents: () => void;
            updateComponent: (oldComponent: Function, newComponent: Function) => void;
        };
        __hmrComponentStore?: Map<string, Function>;
    }
}

export {};