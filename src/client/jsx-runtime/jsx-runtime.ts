// Types for our JSX runtime
export interface VNode {
    type: string | Function;
    props: Record<string, any>;
    children: (VNode | string | number | null | undefined)[];
    key?: string | number;
}

// HMR Support
interface JSXRuntimeHMR {
    componentInstances: Map<Node, ComponentInstance>;
    reRenderAllComponents: () => void;
    updateComponent: (oldComponent: Function, newComponent: Function) => void;
}

export type ComponentProps = Record<string, any> & {
    children?: JSX.Element | JSX.Element[] | string | number | null | undefined;
};

export type FunctionComponent<P = {}> = (props: P & ComponentProps) => JSX.Element;

// Types for hooks
interface StateHook<T = unknown> {
    type: 'state';
    value: T;
}

interface EffectHook {
    type: 'effect';
    effect: () => void | (() => void);
    cleanup?: (() => void) | null;
    deps: unknown[];
    hasRun: boolean;
}

interface UseMemoHook<T = any> {
    type: 'memo';
    value: T;
    deps: any[] | undefined;
    hasRun: boolean;
}

interface RefHook<T = any> {
    type: 'ref';
    current: T;
}

interface SilentStateHook<T = unknown> {
    type: 'silentState';
    value: T;
    depVersion: number; // Version for dependency tracking
}

interface UseCallbackHook<T extends (...args: any[]) => any = any> {
    type: 'callback';
    callback: T;
    deps: any[] | undefined;
    hasRun: boolean;
}

type Hook = StateHook | EffectHook | UseMemoHook | RefHook | SilentStateHook | UseCallbackHook;

// Component Instance tracking
interface ComponentInstance {
    hooks: Hook[];
    vnode: VNode;
    rendered: VNode | null;
    domNode: Node | null;
    childInstances: Map<string, ComponentInstance>;
    container: HTMLElement | null;
}

// Hook system
let currentComponent: ComponentInstance | null = null;
let hookIndex = 0;

// Global instance tracking - use a Map with stable keys
const componentInstances = new Map<Node, ComponentInstance>();


// useCallback implementation
export function useCallback<T extends (...args: any[]) => any>(
    callback: T,
    deps?: any[]
): T {
    if (!currentComponent) {
        throw new Error('useCallback must be called inside a component');
    }

    const component = currentComponent;
    const index = hookIndex++;

    // Initialize hook if it doesn't exist
    if (!component.hooks[index]) {
        component.hooks[index] = {
            type: 'callback',
            callback,
            deps: deps,
            hasRun: true
        } as UseCallbackHook<T>;
    }

    const hook = component.hooks[index] as UseCallbackHook<T>;

    // Check if dependencies have changed
    const hasChanged = !hook.hasRun ||
        (deps === undefined && hook.deps !== undefined) ||
        (deps !== undefined && hook.deps === undefined) ||
        (deps && hook.deps && deps.some((dep, i) => dep !== hook.deps![i]));

    if (hasChanged) {
        hook.callback = callback;
        hook.deps = deps;
        hook.hasRun = true;
    }

    return hook.callback;
}

// useState implementation
export function useState<T>(initialValue: T): [T, (newValue: T | ((prev: T) => T)) => void] {
    if (!currentComponent) {
        throw new Error('useState must be called inside a component');
    }

    const component = currentComponent;
    const index = hookIndex++;


    // Initialize hook if it doesn't exist
    if (!component.hooks[index]) {
        component.hooks[index] = {
            type: 'state',
            value: typeof initialValue === 'function' ? initialValue() : initialValue
        };
    }

    const hook = component.hooks[index] as StateHook<T>;

    const setValue = (newValue: T | ((prev: T) => T)) => {
        const nextValue = typeof newValue === 'function'
            ? (newValue as (prev: T) => T)(hook.value)
            : newValue;


        if (nextValue !== hook.value) {
            hook.value = nextValue;
            // Re-render component
            reRenderComponent(component);
        }
    };

    return [hook.value, setValue];
}


// useRef implementation
export function useRef<T>(initialValue: T): { current: T } {
    if (!currentComponent) {
        throw new Error('useRef must be called inside a component');
    }

    const component = currentComponent;
    const index = hookIndex++;

    // Initialize hook if it doesn't exist
    if (!component.hooks[index]) {
        component.hooks[index] = {
            type: 'ref',
            current: initialValue
        } as RefHook<T>;
    }

    const hook = component.hooks[index] as RefHook<T>;

    return hook;
}

// useSilentState implementation
export function useSilentState<T>(initialValue: T): [T, (newValue: T | ((prev: T) => T)) => void, () => void, () => void] {
    if (!currentComponent) {
        throw new Error('useSilentState must be called inside a component');
    }

    const component = currentComponent;
    const index = hookIndex++;

    // Initialize hook if it doesn't exist
    if (!component.hooks[index]) {
        component.hooks[index] = {
            type: 'silentState',
            value: typeof initialValue === 'function' ? initialValue() : initialValue,
            depVersion: 0
        };
    }

    const hook = component.hooks[index] as SilentStateHook<T>;

    const setValue = (newValue: T | ((prev: T) => T)) => {
        const nextValue = typeof newValue === 'function'
            ? (newValue as (prev: T) => T)(hook.value)
            : newValue;

        hook.value = nextValue;
        hook.depVersion++; // Increment for dependency tracking
        reRenderComponent(component);
    };

    const silentUpdate = () => {
        // Force re-render without changing value or dependency version
        reRenderComponent(component);
    };

    const triggerDeps = () => {
        // Increment dependency version without changing value
        hook.depVersion++;
        reRenderComponent(component);
    };

    return [hook.value, setValue, silentUpdate, triggerDeps];
}

// useEffect implementation
export function useEffect(effect: (() => void | (() => void)), deps?: any[]): void {
    if (!currentComponent) {
        throw new Error('useEffect must be called inside a component');
    }

    const component = currentComponent;
    const index = hookIndex++;

    const hook: EffectHook = (component.hooks[index] as EffectHook) || {
        type: 'effect',
        effect: effect,
        cleanup: null,
        deps: deps ?? [],
        hasRun: false,
    };

    const hasChanged = !hook.hasRun ||
        (deps === undefined && hook.deps !== undefined) ||
        (deps !== undefined && hook.deps === undefined) ||
        (deps && hook.deps && deps.some((dep, i) => {
            const oldDep = hook.deps![i];
            // Check if dep is a silent state hook with different version
            if (dep && typeof dep === 'object' && 'depVersion' in dep &&
                oldDep && typeof oldDep === 'object' && 'depVersion' in oldDep) {
                return dep.depVersion !== oldDep.depVersion;
            }
            return dep !== oldDep;
        }));


    if (hasChanged) {
        // Schedule effect to run after render
        setTimeout(() => {
            // Cleanup previous effect
            if (hook.cleanup && typeof hook.cleanup === 'function') {
                hook.cleanup();
            }
            // Run new effect
            const cleanup = effect();
            hook.cleanup = cleanup || null;
        }, 0);

        hook.deps = deps ?? [];
        hook.hasRun = true;
    }

    component.hooks[index] = hook;
}

// useMemo implementation
export function useMemo<T>(factory: () => T, deps?: any[]): T {
    if (!currentComponent) {
        throw new Error('useMemo must be called inside a component');
    }

    const component = currentComponent;
    const index = hookIndex++;

    // Initialize hook if it doesn't exist
    if (!component.hooks[index]) {
        component.hooks[index] = {
            type: 'memo',
            value: factory(),
            deps: deps,
            hasRun: true
        } as UseMemoHook<T>;
    }

    const hook = component.hooks[index] as UseMemoHook<T>;

    // Check if dependencies have changed
    const hasChanged = !hook.hasRun ||
        (deps === undefined && hook.deps !== undefined) ||
        (deps !== undefined && hook.deps === undefined) ||
        (deps && hook.deps && deps.some((dep, i) => {
            const oldDep = hook.deps![i];
            // Check if dep is a silent state hook with different version
            if (dep && typeof dep === 'object' && 'depVersion' in dep &&
                oldDep && typeof oldDep === 'object' && 'depVersion' in oldDep) {
                return dep.depVersion !== oldDep.depVersion;
            }
            return dep !== oldDep;
        }));

    if (hasChanged) {
        hook.value = factory();
        hook.deps = deps;
        hook.hasRun = true;
    }

    return hook.value;
}

// Re-render a component
function reRenderComponent(component: ComponentInstance): void {
    if (!component.domNode || typeof component.vnode.type !== 'function') return;

    // Save focus information
    const activeElement = document.activeElement;
    const selectionStart = (activeElement as HTMLInputElement)?.selectionStart;
    const selectionEnd = (activeElement as HTMLInputElement)?.selectionEnd;

    // Save old rendered state
    const oldRendered = component.rendered;

    // Reset hook index for re-render
    const prevComponent = currentComponent;
    const prevHookIndex = hookIndex;

    currentComponent = component;
    hookIndex = 0;

    try {
        // Re-execute component function
        const props = { ...component.vnode.props };
        if (component.vnode.children.length > 0) {
            props.children = component.vnode.children.length === 1
                ? component.vnode.children[0]
                : component.vnode.children;
        }

        const newVNode = component.vnode.type(props);

        // Patch the DOM with the new VNode
        if (component.domNode && component.domNode.parentNode) {
            const parent = component.domNode.parentNode as HTMLElement;
            const newDomNode = patchDOM(component.domNode, component.rendered, newVNode, parent, component);

            if (newDomNode !== component.domNode) {
                component.domNode = newDomNode;
            }

            component.rendered = newVNode;
        }

        // Restore focus if needed
        if (activeElement && document.body.contains(activeElement)) {
            (activeElement as HTMLElement).focus();

            // Only restore selection for input types that support it
            if (selectionStart !== undefined && selectionEnd !== undefined) {
                const inputElement = activeElement as HTMLInputElement;
                const supportsSelection = inputElement.type && [
                    'text', 'password', 'search', 'tel', 'url', 'email', 'textarea'
                ].includes(inputElement.type.toLowerCase());

                if (supportsSelection || activeElement.tagName.toLowerCase() === 'textarea') {
                    try {
                        inputElement.setSelectionRange(selectionStart, selectionEnd);
                    } catch (e) {
                        // Ignore errors for unsupported input types
                    }
                }
            }
        }
    } finally {
        currentComponent = prevComponent;
        hookIndex = prevHookIndex;
    }
    // After successful re-render, check for onUpdate callback
    if (component.domNode instanceof HTMLElement) {
        const callbacks = lifecycleCallbacks.get(component.domNode);
        if (callbacks?.onUpdate) {
            setTimeout(() => {
                callbacks.onUpdate!(
                    component.domNode as HTMLElement,
                    oldRendered?.props || {},
                    component.rendered?.props || {}
                );
            }, 0);
        }
    }
}

function callUnmountCallbacks(node: Node): void {
    // Call unmount for this node
    const callbacks = lifecycleCallbacks.get(node);
    if (callbacks?.onUnmount && node instanceof HTMLElement) {
        callbacks.onUnmount(node);
        lifecycleCallbacks.delete(node);
    }

    // Recursively call for all children
    node.childNodes.forEach(child => {
        callUnmountCallbacks(child);
    });

    // Also check for component instances
    const instance = componentInstances.get(node);
    if (instance) {
        componentInstances.delete(node);
    }
}

// Expose runtime for HMR
if (typeof window !== 'undefined') {
    (window as any).__jsxRuntime = {
        componentInstances,
        reRenderAllComponents,
        updateComponent,
    } as JSXRuntimeHMR;
}

// Function to re-render all component instances
function reRenderAllComponents(): void {
    // Get all component instances
    const instances = Array.from(componentInstances.values());

    // Re-render each component
    instances.forEach(instance => {
        if (instance.vnode && typeof instance.vnode.type === 'function') {
            reRenderComponent(instance);
        }
    });
}

// Function to update a specific component type
function updateComponent(oldComponent: Function, newComponent: Function): void {
    // Find all instances of the old component
    const instancesToUpdate: ComponentInstance[] = [];

    componentInstances.forEach((instance) => {
        if (instance.vnode && instance.vnode.type === oldComponent) {
            instancesToUpdate.push(instance);
        }
    });

    // Update each instance with the new component
    instancesToUpdate.forEach(instance => {
        // Preserve the component's state (hooks)
        const preservedHooks = instance.hooks;

        // Update the component type
        instance.vnode = {
            ...instance.vnode,
            type: newComponent
        };

        // Re-render with preserved state
        const prevComponent = currentComponent;
        const prevHookIndex = hookIndex;

        currentComponent = instance;
        hookIndex = 0;

        try {
            // Restore hooks
            instance.hooks = preservedHooks;

            // Re-execute component with new implementation
            const props = { ...instance.vnode.props };
            if (instance.vnode.children.length > 0) {
                props.children = instance.vnode.children.length === 1
                    ? instance.vnode.children[0]
                    : instance.vnode.children;
            }

            const newRendered = newComponent(props);

            // Patch the DOM
            if (instance.domNode && instance.domNode.parentNode) {
                const parent = instance.domNode.parentNode as HTMLElement;
                const newDomNode = patchDOM(
                    instance.domNode,
                    instance.rendered,
                    newRendered,
                    parent,
                    instance
                );

                if (newDomNode !== instance.domNode) {
                    // Update instance tracking if DOM node changed
                    componentInstances.delete(instance.domNode);
                    componentInstances.set(newDomNode, instance);
                    instance.domNode = newDomNode;
                }

                instance.rendered = newRendered;
            }
        } finally {
            currentComponent = prevComponent;
            hookIndex = prevHookIndex;
        }
    });
}

// Patch DOM - the heart of the reconciliation algorithm
function patchDOM(
    domNode: Node,
    oldVNode: VNode | string | number | null | undefined,
    newVNode: VNode | string | number | null | undefined,
    parent: HTMLElement,
    parentInstance?: ComponentInstance
): Node {
    // Handle null/undefined
    if (newVNode === null || newVNode === undefined) {
        callUnmountCallbacks(domNode);
        parent.removeChild(domNode);
        return document.createTextNode('');
    }

    // If old was null/undefined, create new
    if (oldVNode === null || oldVNode === undefined) {
        const newNode = createDOMNode(newVNode, parent, parentInstance);
        if (newNode) {
            parent.replaceChild(newNode, domNode);
            return newNode;
        }
        return domNode;
    }

    // Handle text nodes
    if ((typeof oldVNode === 'string' || typeof oldVNode === 'number') &&
        (typeof newVNode === 'string' || typeof newVNode === 'number')) {
        if (String(oldVNode) !== String(newVNode)) {
            domNode.textContent = String(newVNode);
        }
        return domNode;
    }

    // Type changed - recreate
    if (typeof oldVNode !== typeof newVNode ||
        (typeof oldVNode === 'object' && typeof newVNode === 'object' &&
            oldVNode.type !== newVNode.type)) {
        callUnmountCallbacks(domNode);
        const newNode = createDOMNode(newVNode, parent, parentInstance);
        if (newNode) {
            parent.replaceChild(newNode, domNode);
            return newNode;
        }
        return domNode;
    }

    // Both are VNodes with same type
    if (typeof oldVNode === 'object' && typeof newVNode === 'object') {
        // Handle fragments
        if (newVNode.type === 'fragment') {
            // Fragment patching is complex, for now recreate
            const newNode = createDOMNode(newVNode, parent, parentInstance);
            if (newNode) {
                parent.replaceChild(newNode, domNode);
                return newNode;
            }
            return domNode;
        }

        // Handle function components
        if (typeof newVNode.type === 'function') {
            const instance = componentInstances.get(domNode);
            if (instance && instance.vnode.type === newVNode.type) {
                // Same component type - update props and re-render
                instance.vnode = newVNode;

                const prevComponent = currentComponent;
                const prevHookIndex = hookIndex;
                currentComponent = instance;
                hookIndex = 0;

                try {
                    const props = { ...newVNode.props };
                    if (newVNode.children.length > 0) {
                        props.children = newVNode.children.length === 1
                            ? newVNode.children[0]
                            : newVNode.children;
                    }

                    const rendered = newVNode.type(props);
                    const newDomNode = patchDOM(domNode, instance.rendered, rendered, parent, instance);
                    instance.rendered = rendered;

                    if (newDomNode !== domNode) {
                        componentInstances.delete(domNode);
                        componentInstances.set(newDomNode, instance);
                        instance.domNode = newDomNode;
                        return newDomNode;
                    }

                    return domNode;
                } finally {
                    currentComponent = prevComponent;
                    hookIndex = prevHookIndex;
                }
            } else {
                // Different component or no instance - recreate
                const newNode = createDOMNode(newVNode, parent, parentInstance);
                if (newNode) {
                    parent.replaceChild(newNode, domNode);
                    return newNode;
                }
                return domNode;
            }
        }

        // Handle HTML elements
        if (typeof newVNode.type === 'string' && domNode instanceof HTMLElement) {
            // Store old props for the callback
            const oldProps = { ...oldVNode.props };
            const newProps = { ...newVNode.props };

            // Update attributes
            patchAttributes(domNode, oldVNode.props, newVNode.props);

            // Patch children
            patchChildren(domNode, oldVNode.children, newVNode.children, parentInstance);

            // Check for onUpdate callback in the new VNode
            const newLifecycle = (newVNode as any).__lifecycle;
            const existingCallbacks = lifecycleCallbacks.get(domNode);

            // Update stored callbacks if needed
            if (newLifecycle) {
                const callbacks: any = { ...existingCallbacks };
                if (newLifecycle.onUnmount) callbacks.onUnmount = newLifecycle.onUnmount;
                if (newLifecycle.onUpdate) callbacks.onUpdate = newLifecycle.onUpdate;
                lifecycleCallbacks.set(domNode, callbacks);
            }

            // Call onUpdate if it exists (either from new or existing callbacks)
            const currentCallbacks = lifecycleCallbacks.get(domNode);
            if (currentCallbacks?.onUpdate) {
                // Call onUpdate after the DOM has been updated
                setTimeout(() => {
                    currentCallbacks.onUpdate!(domNode, oldProps, newProps);
                }, 0);
            }

            return domNode;
        }
    }

    // Fallback - recreate
    const newNode = createDOMNode(newVNode, parent, parentInstance);
    if (newNode) {
        parent.replaceChild(newNode, domNode);
        return newNode;
    }
    return domNode;
}

// Patch attributes
function patchAttributes(element: HTMLElement, oldProps: Record<string, any>, newProps: Record<string, any>): void {
    // Remove old attributes
    for (const key in oldProps) {
        if (!(key in newProps)) {
            if (key === 'ref') {
                // Clear old ref
                if (oldProps[key]) {
                    if (typeof oldProps[key] === 'function') {
                        oldProps[key](null);
                    } else if (oldProps[key] && typeof oldProps[key] === 'object' && 'current' in oldProps[key]) {
                        oldProps[key].current = null;
                    }
                }
            } else if (key === 'className') {
                element.className = '';
            } else if (key.startsWith('on')) {
                // Remove event listener (we'll need to track these properly in production)
                const eventName = key.toLowerCase().substring(2);
                element.removeEventListener(eventName, oldProps[key]);
            } else {
                element.removeAttribute(key);
            }
        }
    }

    // Add/update new attributes
    for (const key in newProps) {
        if (oldProps[key] !== newProps[key]) {
            if (key === 'ref') {
                // Handle ref changes
                if (oldProps[key] !== newProps[key]) {
                    // Clear old ref
                    if (oldProps[key]) {
                        if (typeof oldProps[key] === 'function') {
                            oldProps[key](null);
                        } else if (oldProps[key] && typeof oldProps[key] === 'object' && 'current' in oldProps[key]) {
                            oldProps[key].current = null;
                        }
                    }

                    // Set new ref
                    if (newProps[key]) {
                        if (typeof newProps[key] === 'function') {
                            setTimeout(() => {
                                newProps[key](element);
                            }, 0);
                        } else if (newProps[key] && typeof newProps[key] === 'object' && 'current' in newProps[key]) {
                            newProps[key].current = element;
                        }
                    }
                }
            } else if (key === 'className') {
                element.className = newProps[key];
            } else if (key.startsWith('on')) {
                const eventName = key.toLowerCase().substring(2);
                if (oldProps[key]) {
                    element.removeEventListener(eventName, oldProps[key]);
                }
                element.addEventListener(eventName, newProps[key]);
            } else if (key === 'style' && typeof newProps[key] === 'object') {
                if (oldProps[key] && typeof oldProps[key] === 'object') {
                    Object.keys(oldProps[key]).forEach(styleProp => {
                        if (!(styleProp in newProps[key])) {
                            (element.style as any)[styleProp] = '';
                        }
                    });
                }
                Object.assign(element.style, newProps[key]);
            } else if (key === 'value' && (element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
                element.value = newProps[key];
            } else if (key === 'checked' && element instanceof HTMLInputElement) {
                element.checked = newProps[key];
            } else if (newProps[key] !== false && newProps[key] !== null && newProps[key] !== undefined) {
                element.setAttribute(key, String(newProps[key]));
            }
        }
    }
}

// Patch children with key support
function patchChildren(
    parent: HTMLElement,
    oldChildren: (VNode | string | number | null | undefined)[],
    newChildren: (VNode | string | number | null | undefined)[],
    parentInstance?: ComponentInstance
): void {
    const oldKeyed = new Map<string | number, { node: Node, vnode: VNode | string | number }>();
    const newKeyed = new Map<string | number, VNode>();
    const oldNodes = Array.from(parent.childNodes);

    // Build maps for keyed elements
    oldChildren.forEach((child, i) => {
        if (child && typeof child === 'object' && child.key !== undefined) {
            oldKeyed.set(child.key, { node: oldNodes[i], vnode: child });
        }
    });

    newChildren.forEach(child => {
        if (child && typeof child === 'object' && child.key !== undefined) {
            newKeyed.set(child.key, child);
        }
    });

    // Patch children
    const maxLength = Math.max(oldChildren.length, newChildren.length);

    for (let i = 0; i < maxLength; i++) {
        const oldChild = oldChildren[i];
        const newChild = newChildren[i];
        const oldNode = oldNodes[i];

        // Handle keyed elements
        if (newChild && typeof newChild === 'object' && newChild.key !== undefined) {
            const existing = oldKeyed.get(newChild.key);
            if (existing) {
                // Move and patch existing keyed element
                if (oldNodes[i] !== existing.node) {
                    parent.insertBefore(existing.node, oldNodes[i] || null);
                }
                patchDOM(existing.node, existing.vnode, newChild, parent, parentInstance);
                continue;
            }
        }

        if (!oldNode && newChild !== null && newChild !== undefined) {
            // Add new child
            const newNode = createDOMNode(newChild, parent, parentInstance);
            if (newNode) {
                parent.appendChild(newNode);
            }
        } else if (oldNode && (newChild === null || newChild === undefined)) {
            // Remove old child
            callUnmountCallbacks(oldNode);
            parent.removeChild(oldNode);
        } else if (oldNode) {
            // Patch existing child
            patchDOM(oldNode, oldChild, newChild, parent, parentInstance);
        }
    }
}

//type for lifecycle props
export interface LifecycleProps {
    onMount?: (element: HTMLElement) => void;
    onUnmount?: (element: HTMLElement) => void;
    onUpdate?: (element: HTMLElement, oldProps: Record<string, any>, newProps: Record<string, any>) => void;
}
// Track lifecycle callbacks for DOM nodes
const lifecycleCallbacks = new WeakMap<Node, {
    onUnmount?: (element: HTMLElement) => void;
    onUpdate?: (element: HTMLElement, oldProps: Record<string, any>, newProps: Record<string, any>) => void;
}>();

//  jsx function with lifecycle support
export function jsxWithLifecycle(
    type: string | FunctionComponent,
    props: (Record<string, any> & LifecycleProps) | null,
    key?: string | number
): JSX.Element {
    const { children, onMount, onUnmount, onUpdate, ...restProps } = props || {};

    // Store lifecycle callbacks in a special property
    const vnode: VNode = {
        type,
        props: restProps,
        children: flattenChildren(children),
        key
    };

    // Add lifecycle callbacks as non-enumerable properties so they don't interfere
    if (onMount || onUnmount || onUpdate) {
        Object.defineProperty(vnode, '__lifecycle', {
            value: { onMount, onUnmount, onUpdate},
            enumerable: false,
            configurable: true
        });
    }

    return vnode;
}

// Helper function to flatten children arrays
function flattenChildren(children: any): any[] {
    const flattened: any[] = [];

    const flatten = (item: any) => {
        if (Array.isArray(item)) {
            item.forEach(flatten);
        } else if (item !== null && item !== undefined) {
            flattened.push(item);
        }
    };

    if (Array.isArray(children)) {
        children.forEach(flatten);
    } else if (children !== null && children !== undefined) {
        flattened.push(children);
    }

    return flattened;
}

// JSX Factory Functions
export function jsx(
    type: string | FunctionComponent,
    props: Record<string, any> | null,
    key?: string|number
): JSX.Element {
    const { children, ...restProps } = props || {};
    return {
        type,
        props: restProps,
        children: flattenChildren(children),
        key
    };
}

export function jsxs(
    type: string | FunctionComponent,
    props: Record<string, any> | null,
    key?: string|number
): JSX.Element {
    return jsx(type, props, key);
}

// Fragment support
export function Fragment({ children, key }: { children?: any, key?: string|number }): VNode {
    return {
        type: 'fragment',
        props: {},
        children: Array.isArray(children) ? children : [children],
        key: key
    };
}

// Create DOM Node - updated to track component instances properly
export function createDOMNode(
    vnode: VNode | string | number | null | undefined,
    container?: HTMLElement,
    parentInstance?: ComponentInstance
): Node | null {
    if (vnode === null || vnode === undefined) return null;

    // Handle text nodes
    if (typeof vnode === 'string' || typeof vnode === 'number') {
        return document.createTextNode(String(vnode));
    }

    // Handle VNodes
    if (typeof vnode === 'object' && 'type' in vnode) {
        // Handle Fragment
        if (vnode.type === 'fragment') {
            const fragment = document.createDocumentFragment();
            vnode.children.forEach(child => {
                const childNode = createDOMNode(child, container, parentInstance);
                if (childNode) fragment.appendChild(childNode);
            });
            return fragment;
        }

        // Handle function components
        if (typeof vnode.type === 'function') {
            // Create component instance
            const componentInstance: ComponentInstance = {
                hooks: [],
                vnode,
                rendered: null,
                domNode: null,
                childInstances: new Map(),
                container: container || null
            };

            // Set current component context
            const prevComponent = currentComponent;
            const prevHookIndex = hookIndex;
            currentComponent = componentInstance;
            hookIndex = 0;

            try {
                const props = { ...vnode.props };
                if (vnode.children.length > 0) {
                    props.children = vnode.children.length === 1
                        ? vnode.children[0]
                        : vnode.children;
                }

                const rendered = vnode.type(props);
                componentInstance.rendered = rendered;

                const domNode = createDOMNode(rendered, container, componentInstance);
                componentInstance.domNode = domNode;

                // Track this instance
                if (domNode) {
                    componentInstances.set(domNode, componentInstance);
                }

                return domNode;
            } finally {
                currentComponent = prevComponent;
                hookIndex = prevHookIndex;
            }
        }

        // Handle HTML elements
        if (typeof vnode.type === 'string') {
            const element = document.createElement(vnode.type);

            // Get lifecycle callbacks if they exist
            const lifecycle = (vnode as any).__lifecycle;

            // Set attributes
            Object.entries(vnode.props).forEach(([key, value]) => {
                if (key === 'ref') {
                    // Handle ref prop
                    if (value) {
                        if (typeof value === 'function') {
                            // Callback ref
                            setTimeout(() => {
                                value(element);
                            },0);
                        } else if (value && typeof value === 'object' && 'current' in value) {
                            // Ref object (from useRef)
                            value.current = element;
                        }
                    }
                } else if (key === 'className') {
                    element.className = value;
                } else if (key === 'onClick' || key.startsWith('on')) {
                    const eventName = key.toLowerCase().substring(2);
                    element.addEventListener(eventName, value);
                } else if (key === 'style' && typeof value === 'object') {
                    element.style.cssText = '';
                    Object.assign(element.style, value);
                } else if (key === 'value' && (element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
                    // Pour les select, on doit attendre que les enfants soient ajoutés avant de définir la valeur
                    if (element instanceof HTMLSelectElement) {
                        // On définira la valeur après l'ajout des enfants
                        setTimeout(() => {
                            element.value = value;
                        }, 0);
                    } else {
                        element.value = value;
                    }
                } else if (key === 'checked' && element instanceof HTMLInputElement) {
                    element.checked = value;
                } else if (value !== false && value !== null && value !== undefined) {
                    element.setAttribute(key, String(value));
                }
            });

            // Append children
            vnode.children.forEach(child => {
                const childNode = createDOMNode(child, container, parentInstance);
                if (childNode) element.appendChild(childNode);
            });

            // Handle lifecycle callbacks
            if (lifecycle) {
                // Store callbacks for later use
                const callbacks: any = {};
                if (lifecycle.onUnmount) callbacks.onUnmount = lifecycle.onUnmount;
                if (lifecycle.onUpdate) callbacks.onUpdate = lifecycle.onUpdate;

                if (Object.keys(callbacks).length > 0) {
                    lifecycleCallbacks.set(element, callbacks);
                }

                // Call onMount after element is fully constructed
                if (lifecycle.onMount) {
                    setTimeout(() => {
                        lifecycle.onMount(element);
                    }, 0);
                }
            }

            return element;
        }
    }

    return null;
}

// Render function
export function render(vnode: Element | string | number | null | undefined, container: HTMLElement): void {
    const existingNode = container.firstChild;

    if (existingNode) {
        // Patch existing content
        const rootVNode = (container as any).__vnode;
        patchDOM(existingNode, rootVNode, vnode as unknown as VNode, container);
    } else {
        // Initial render
        const domNode = createDOMNode(vnode as unknown as VNode, container);
        if (domNode) {
            container.appendChild(domNode);
            // Track root container for HMR
            if ((window as any).__jsxRuntime) {
                (window as any).__jsxRuntime.rootContainer = container;
            }
        }
    }

    // Store vnode for future patches
    (container as any).__vnode = vnode;
}

export interface CSSProperties {
    // Display & Positioning
    display?: 'none' | 'block' | 'inline' | 'inline-block' | 'flex' | 'inline-flex' | 'grid' | 'inline-grid' | 'table' | 'table-row' | 'table-cell' | 'list-item' | 'contents' | string;
    position?: 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky' | string;
    top?: string | number;
    right?: string | number;
    bottom?: string | number;
    left?: string | number;
    zIndex?: string | number;

    // Box Model
    width?: string | number;
    height?: string | number;
    minWidth?: string | number;
    minHeight?: string | number;
    maxWidth?: string | number;
    maxHeight?: string | number;
    margin?: string | number;
    marginTop?: string | number;
    marginRight?: string | number;
    marginBottom?: string | number;
    marginLeft?: string | number;
    padding?: string | number;
    paddingTop?: string | number;
    paddingRight?: string | number;
    paddingBottom?: string | number;
    paddingLeft?: string | number;

    // Border
    border?: string;
    borderTop?: string;
    borderRight?: string;
    borderBottom?: string;
    borderLeft?: string;
    borderWidth?: string | number;
    borderTopWidth?: string | number;
    borderRightWidth?: string | number;
    borderBottomWidth?: string | number;
    borderLeftWidth?: string | number;
    borderStyle?: 'none' | 'solid' | 'dashed' | 'dotted' | 'double' | 'groove' | 'ridge' | 'inset' | 'outset' | string;
    borderTopStyle?: 'none' | 'solid' | 'dashed' | 'dotted' | 'double' | 'groove' | 'ridge' | 'inset' | 'outset' | string;
    borderRightStyle?: 'none' | 'solid' | 'dashed' | 'dotted' | 'double' | 'groove' | 'ridge' | 'inset' | 'outset' | string;
    borderBottomStyle?: 'none' | 'solid' | 'dashed' | 'dotted' | 'double' | 'groove' | 'ridge' | 'inset' | 'outset' | string;
    borderLeftStyle?: 'none' | 'solid' | 'dashed' | 'dotted' | 'double' | 'groove' | 'ridge' | 'inset' | 'outset' | string;
    borderColor?: string;
    borderTopColor?: string;
    borderRightColor?: string;
    borderBottomColor?: string;
    borderLeftColor?: string;
    borderRadius?: string | number;
    borderTopLeftRadius?: string | number;
    borderTopRightRadius?: string | number;
    borderBottomLeftRadius?: string | number;
    borderBottomRightRadius?: string | number;

    // Background
    background?: string;
    backgroundColor?: string;
    backgroundImage?: string;
    backgroundSize?: 'auto' | 'cover' | 'contain' | string;
    backgroundPosition?: string;
    backgroundRepeat?: 'repeat' | 'no-repeat' | 'repeat-x' | 'repeat-y' | 'space' | 'round' | string;
    backgroundAttachment?: 'scroll' | 'fixed' | 'local' | string;
    backgroundClip?: 'border-box' | 'padding-box' | 'content-box' | 'text' | string;
    backgroundOrigin?: 'border-box' | 'padding-box' | 'content-box' | string;

    // Typography
    color?: string;
    font?: string;
    fontFamily?: string;
    fontSize?: string | number;
    fontWeight?: 'normal' | 'bold' | 'bolder' | 'lighter' | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | string | number;
    fontStyle?: 'normal' | 'italic' | 'oblique' | string;
    fontVariant?: string;
    lineHeight?: string | number;
    textAlign?: 'left' | 'right' | 'center' | 'justify' | 'start' | 'end' | string;
    textDecoration?: string;
    textDecorationLine?: 'none' | 'underline' | 'overline' | 'line-through' | string;
    textDecorationColor?: string;
    textDecorationStyle?: 'solid' | 'double' | 'dotted' | 'dashed' | 'wavy' | string;
    textDecorationThickness?: string | number;
    textTransform?: 'none' | 'capitalize' | 'uppercase' | 'lowercase' | string;
    textIndent?: string | number;
    textShadow?: string;
    letterSpacing?: string | number;
    wordSpacing?: string | number;
    whiteSpace?: 'normal' | 'nowrap' | 'pre' | 'pre-line' | 'pre-wrap' | 'break-spaces' | string;
    wordBreak?: 'normal' | 'break-all' | 'keep-all' | 'break-word' | string;
    wordWrap?: 'normal' | 'break-word' | 'anywhere' | string;
    textOverflow?: 'clip' | 'ellipsis' | string;

    // Flexbox
    flex?: string | number;
    flexBasis?: string | number;
    flexDirection?: 'row' | 'row-reverse' | 'column' | 'column-reverse' | string;
    flexFlow?: string;
    flexGrow?: number | string;
    flexShrink?: number | string;
    flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse' | string;
    justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly' | 'start' | 'end' | string;
    alignItems?: 'stretch' | 'flex-start' | 'flex-end' | 'center' | 'baseline' | 'start' | 'end' | string;
    alignSelf?: 'auto' | 'stretch' | 'flex-start' | 'flex-end' | 'center' | 'baseline' | 'start' | 'end' | string;
    alignContent?: 'stretch' | 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly' | 'start' | 'end' | string;

    // Grid
    grid?: string;
    gridArea?: string;
    gridAutoColumns?: string;
    gridAutoFlow?: 'row' | 'column' | 'dense' | 'row dense' | 'column dense' | string;
    gridAutoRows?: string;
    gridColumn?: string;
    gridColumnEnd?: string | number;
    gridColumnStart?: string | number;
    gridRow?: string;
    gridRowEnd?: string | number;
    gridRowStart?: string | number;
    gridTemplate?: string;
    gridTemplateAreas?: string;
    gridTemplateColumns?: string;
    gridTemplateRows?: string;
    gap?: string | number;
    rowGap?: string | number;
    columnGap?: string | number;

    // Visual Effects
    opacity?: string | number;
    visibility?: 'visible' | 'hidden' | 'collapse' | string;
    overflow?: 'visible' | 'hidden' | 'scroll' | 'auto' | string;
    overflowX?: 'visible' | 'hidden' | 'scroll' | 'auto' | string;
    overflowY?: 'visible' | 'hidden' | 'scroll' | 'auto' | string;
    boxShadow?: string;
    filter?: string;
    backdropFilter?: string;
    clipPath?: string;
    mask?: string;

    // Transforms & Animation
    transform?: string;
    transformOrigin?: string;
    transformStyle?: 'flat' | 'preserve-3d' | string;
    perspective?: string | number;
    perspectiveOrigin?: string;
    transition?: string;
    transitionProperty?: string;
    transitionDuration?: string;
    transitionTimingFunction?: string;
    transitionDelay?: string;
    animation?: string;
    animationName?: string;
    animationDuration?: string;
    animationTimingFunction?: string;
    animationDelay?: string;
    animationIterationCount?: string | number;
    animationDirection?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse' | string;
    animationFillMode?: 'none' | 'forwards' | 'backwards' | 'both' | string;
    animationPlayState?: 'running' | 'paused' | string;
    zoom?: number|string;

    // Interaction
    cursor?: 'auto' | 'default' | 'pointer' | 'text' | 'wait' | 'move' | 'help' | 'not-allowed' | 'grab' | 'grabbing' | string;
    pointerEvents?: 'auto' | 'none' | 'visiblePainted' | 'visibleFill' | 'visibleStroke' | 'visible' | 'painted' | 'fill' | 'stroke' | 'all' | string;
    userSelect?: 'auto' | 'none' | 'text' | 'all' | 'contain' | string;
    resize?: 'none' | 'both' | 'horizontal' | 'vertical' | 'block' | 'inline' | string;

    // List
    listStyle?: string;
    listStyleType?: string;
    listStylePosition?: 'inside' | 'outside' | string;
    listStyleImage?: string;

    // Table
    tableLayout?: 'auto' | 'fixed' | string;
    borderCollapse?: 'separate' | 'collapse' | string;
    borderSpacing?: string | number;
    captionSide?: 'top' | 'bottom' | string;
    emptyCells?: 'show' | 'hide' | string;

    // Content
    content?: string;
    quotes?: string;

    // Other
    boxSizing?: 'content-box' | 'border-box' | string;
    clear?: 'none' | 'left' | 'right' | 'both' | string;
    float?: 'none' | 'left' | 'right' | string;
    verticalAlign?: 'baseline' | 'sub' | 'super' | 'text-top' | 'text-bottom' | 'middle' | 'top' | 'bottom' | string | number;
    direction?: 'ltr' | 'rtl' | string;
    unicodeBidi?: 'normal' | 'embed' | 'isolate' | 'bidi-override' | 'isolate-override' | 'plaintext' | string;
    writingMode?: 'horizontal-tb' | 'vertical-rl' | 'vertical-lr' | string;

    // CSS Custom Properties (CSS Variables)
    [key: `--${string}`]: string | number;

    // Webkit/Browser specific properties
    WebkitAppearance?: string;
    WebkitTransform?: string;
    WebkitTransition?: string;
    WebkitAnimation?: string;
    WebkitFilter?: string;
    WebkitBackdropFilter?: string;
    WebkitBoxShadow?: string;
    WebkitTextFillColor?: string;
    WebkitBackgroundClip?: string;
    MozAppearance?: string;
    msOverflowStyle?: string;
    scrollbarWidth?: 'auto' | 'thin' | 'none' | string;

    // Allow any other CSS property as string
    [key: string]: string | number | undefined;
}

export type PropsWithChildren<P = {}> = P & {
    children?: JSX.Element | JSX.Element[] | string | number | null | undefined;
};

// Listen for HMR updates
if (typeof window !== 'undefined') {
    window.addEventListener('custom-jsx-hmr-update', ((event: CustomEvent) => {
        const { component, oldComponent } = event.detail;
        updateComponent(oldComponent, component);
    }) as EventListener);
}

export const __hmr = {
    reRenderAllComponents,
    updateComponent,
    componentInstances,
};
