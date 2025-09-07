/// <reference types="nodius_jsx/jsx" />


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