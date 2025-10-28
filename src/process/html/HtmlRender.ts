/**
 * @file HtmlRender.ts
 * @description Core HTML rendering engine for dynamic component rendering and event management
 * @module process/html
 *
 * Provides the main rendering engine for HTML workflows:
 * - HtmlRender: Main class for rendering and managing HTML components
 * - Event system: DOM events, workflow events, and building mode events
 * - Storage management: Per-element storage and global state
 * - Building mode: Interactive editor with hover/select functionality
 * - Dynamic rendering: Reactive updates based on data changes
 *
 * Key features:
 * - Efficient DOM diffing and updates
 * - Dynamic CSS block application
 * - Event listener management with cleanup
 * - Proxy-based global storage for reactive state
 * - Multi-language support
 * - Debug overlay for development
 * - Async function execution for event handlers
 */

import {CSSProperties} from "react";
import {HtmlObject, HTMLWorkflowEventType, HtmlBase} from "../../utils/html/htmlType";
import {deepCopy} from "../../utils/objectUtils";
import "./HtmlRenderUtility";
import {applyCSSBlocks, removeCSSBlocks} from "../../utils/html/HtmlCss";

export interface ObjectStorage {
    element: HTMLElement,
    object: HtmlObject,
    domEvents: Map<string, Array<((event: any) => void)>>,
    workflowEvents: Map<string, Array<((event: any) => void)>>,
    storage: Record<string, any>,
    extraVariable: Record<string, any>,
    debugEvents: Map<string, Array<((event: any) => void)>>,
    debugOverlay?: HTMLElement,
    // Track external changes for three-way merge
    externalChanges: {
        attributes: Set<string>,       // Attributes modified externally
        textContent: boolean,           // Text content modified externally
        innerHTML: boolean,             // HTML content modified externally
        classList: Set<string>,         // CSS classes added/removed externally
    },
    mutationObserver?: MutationObserver,  // Observer for tracking external changes
}

interface ChildInfo {
    obj: HtmlObject,
    extra: Record<string, any>,
}

export interface HtmlRenderOption {
    buildingMode?: boolean,
    language?: string,
    noFirstRender?: boolean,
}


export type AsyncFunctionConstructor = new (...args: string[]) => (...args: any[]) => Promise<any>;
export const AsyncFunction: AsyncFunctionConstructor = Object.getPrototypeOf(async function () {
}).constructor;

export class HtmlRender {

    private uniqueCounter: number = 0;
    private readonly container: HTMLElement;
    private readonly superContainer: HTMLElement;
    private previousObject: HtmlObject | undefined;
    private readonly objectStorage: Map<string, ObjectStorage> = new Map<string, ObjectStorage>();
    private globalStorage: Record<string, any> = {};
    private readonly workflowEventMap: Map<Partial<HTMLWorkflowEventType>, ObjectStorage[]> = new Map();
    private language: string = "en";


    /* building mode */
    private buildingMode: boolean = false;
    private selectedObjectIdentifier:string|undefined;
    private hoverObjectIdentifier:string|undefined;
    private readonly buildingInteractEventMap: Map<"hover"|"select", ((objectStorage?:ObjectStorage) => void)[]> = new Map();
    /* ------------- */


    constructor(container: HTMLElement, option?: HtmlRenderOption) {
        if (!container) {
            throw new Error("HtmlRender: Container is null");
        }

        this.superContainer = document.createElement("div");
        this.superContainer.style.position = "relative";
        this.superContainer.style.width = "100%";
        this.superContainer.style.height = "100%";
        container.appendChild(this.superContainer);

        this.container = document.createElement("div");
        this.container.style.width = "100%";
        this.container.style.height = "100%";
        this.superContainer.appendChild(this.container);

        this.buildingMode = option?.buildingMode ?? false;
        this.language = option?.language ?? "en";
        this.globalStorage = new Proxy({}, {
            set: (target:any, prop: string, val) => {
                target[prop] = val;
                this.dispatchWorkFlowEvent("variableChange", { variable: prop, value: val });
                return true;
            }
        });
    }

    public setVariableInGlobalStorage(key: string, value: any) {
        this.globalStorage[key] = value;
    }

    public async setBuildingMode(value: boolean) {
        if (!this.container) {
            throw new Error("HtmlRender: Container is null");
        }
        if(value == this.buildingMode) return;
        if (this.buildingMode && !value) {
            for (const storage of this.objectStorage.values()) {
                if (storage.debugOverlay) {
                    storage.debugOverlay.remove();
                    storage.debugOverlay = undefined;
                }
            }
        }
        this.buildingMode = value;
        if (this.previousObject !== undefined) {
            await this.render(this.previousObject);
        }
    }
    public async setBuildingSelectedObjectIdentifier(identifier: string) {
        this.selectedObjectIdentifier = identifier;
        if (this.previousObject !== undefined) {
            await this.render(this.previousObject);
        }
    }

    public clearBuildingOverlay() {
        if(this.hoverObjectIdentifier) {
            const hoverStorage = this.objectStorage.get(this.hoverObjectIdentifier);
            if (hoverStorage) {
                if (hoverStorage.debugOverlay) {
                    hoverStorage.debugOverlay.remove();
                    hoverStorage.debugOverlay = undefined;
                }
            }
            this.hoverObjectIdentifier = undefined;
        }
        let events = this.buildingInteractEventMap.get("hover") ?? [];
        for(const event of events) {
            event(undefined);
        }
        if(this.selectedObjectIdentifier) {
            const selectedStorage = this.objectStorage.get(this.selectedObjectIdentifier);
            if (selectedStorage) {
                if (selectedStorage.debugOverlay) {
                    selectedStorage.debugOverlay.remove();
                    selectedStorage.debugOverlay = undefined;
                }
            }
        }
        events = this.buildingInteractEventMap.get("select") ?? [];
        for(const event of events) {
            event(undefined);
        }
        document.querySelectorAll("[data-render-building-mode-overlay]").forEach((el)=> el.remove());
    }

    public setLanguage(lang: string): void {
        if (!this.container) {
            throw new Error("HtmlRender: Container is null");
        }
        this.language = lang;
        if (this.previousObject !== undefined) {
            this.render(this.previousObject);
        }
    }

    public async render(object: HtmlObject) {
        if (!this.container) {
            throw new Error("HtmlRender: Container is null");
        }
        const start = performance.now();
        const existingRoot = this.container.firstElementChild as HTMLElement | null;
        if (!this.previousObject || !existingRoot || existingRoot.dataset.identifier !== object.identifier) {
            this.container.innerHTML = "";
            await this.renderCreate(object, this.container);
        } else {
            const storage = this.objectStorage.get(object.identifier);
            if (storage) {
                await this.updateDOM(object, storage.element, storage, {});
            }
        }
        if (this.previousObject == undefined) {
            this.dispatchDomEvent(new Event("load", { bubbles: true }), true);
        }
        this.previousObject = deepCopy(object);
        const end = performance.now();
        const durationMicro = (end - start);
        console.log("Render time taken in MS:", durationMicro);
        //console.trace();
    }

    private async renderCreate(object: HtmlObject, parent: HTMLElement, extraVar: Record<string, any> = {}, insertBefore: Node | null = null) {
        const element = document.createElement(object.tag);
        element.dataset.identifier = object.identifier;

        const storage: ObjectStorage = {
            element: element,
            object: object,
            domEvents: new Map(),
            workflowEvents: new Map(),
            storage: new Proxy({}, {
                set: (target:any, prop: string, val) => {
                    target[prop] = val;
                    this.dispatchWorkFlowEvent("variableChange", { variable: prop, value: val });
                    return true;
                }
            }),
            extraVariable: extraVar,
            debugEvents: new Map(),
            externalChanges: {
                attributes: new Set<string>(),
                textContent: false,
                innerHTML: false,
                classList: new Set<string>(),
            },
        };



        if (object.id) element.id = object.id;

        if (object.attribute) {
            Object.entries(object.attribute).forEach(([key, value]) => {
                if (key !== 'id' && key !== 'data-identifier' && key !== 'style' && !key.startsWith('on')) {
                    element.setAttribute(key, value);
                }
            });
        }


        if(object.css) {
            applyCSSBlocks(element, object.css);
        }

        if (object.domEvents) {
            object.domEvents.forEach((event) => {
                const caller = (evt: Event) => {
                    this.callDOMEvent(evt, storage, event.call);
                }
                element.addEventListener(event.name, caller);
                const events = storage.domEvents.get(event.name) ?? [];
                events.push(caller);
                storage.domEvents.set(event.name, events);
            });
        }
        if (object.workflowEvents) {
            object.workflowEvents.forEach((event) => {
                const caller = (evt: any) => {
                    this.callWorkFlowEvent(evt, storage, event.call);
                }
                const events = storage.workflowEvents.get(event.name) ?? [];
                events.push(caller);
                storage.workflowEvents.set(event.name, events);
                let listeners = this.workflowEventMap.get(event.name);
                if (!listeners) {
                    listeners = [];
                    this.workflowEventMap.set(event.name, listeners);
                }
                if (!listeners.includes(storage)) {
                    listeners.push(storage);
                }
            })
        }
        this.objectStorage.set(object.identifier, storage);
        parent.insertBefore(element, insertBefore);
        this.addDebugListeners(storage);

        if (object.type === "text") {
            element.textContent = await this.parseContent(object.content[this.language], storage);
        } else if (object.type === "html") {
            element.innerHTML = await this.parseContent(object.content, storage);
        } else {
            const childrenInfo = await this.getChildrenInfo(object, extraVar, storage);
            for (const childInfo of childrenInfo) {
                await this.renderCreate(childInfo.obj, element, childInfo.extra);
            }
        }

        // Set up MutationObserver to track external changes
        this.setupExternalChangeTracking(storage);
    }

    private async updateDOM(newObject: HtmlObject, element: HTMLElement, storage: ObjectStorage, extraVar: Record<string, any>) {
        const oldObject = storage.object;

        if (newObject.tag !== oldObject.tag) {
            const newElement = document.createElement(newObject.tag);
            while (element.firstChild) {
                newElement.appendChild(element.firstChild);
            }
            element.parentNode!.replaceChild(newElement, element);
            storage.element = newElement;
            element = newElement;
        }
        this.removeDebugListeners(storage);

        element.dataset.identifier = newObject.identifier;

        if (newObject.id !== oldObject.id) {
            element.id = newObject.id || "";
        }

        // Three-way merge for attributes
        // Remove old attributes not in new (unless externally modified)
        if (oldObject.attribute) {
            Object.keys(oldObject.attribute).forEach(key => {
                if (key !== 'id' && key !== 'data-identifier' && key !== 'style' && !key.startsWith('on')) {
                    if (!newObject.attribute || !(key in newObject.attribute)) {
                        // Only remove if NOT externally modified
                        if (!storage.externalChanges.attributes.has(key)) {
                            this.setAttributeInternal(element, key, null);
                        }
                    }
                }
            });
        }

        // Update changed or new attributes (preserving external changes)
        if (newObject.attribute) {
            Object.entries(newObject.attribute).forEach(([key, value]) => {
                if (key !== 'id' && key !== 'data-identifier' && key !== 'style' && !key.startsWith('on')) {
                    const oldValue = oldObject.attribute?.[key];
                    const wasExternallyModified = storage.externalChanges.attributes.has(key);

                    // Three-way merge logic:
                    // 1. If attribute wasn't in old object, it's new -> set it
                    // 2. If attribute changed in new object (oldValue !== value), set it
                    // 3. If attribute was externally modified and unchanged in object, preserve external value
                    if (oldValue === undefined) {
                        // New attribute in object
                        this.setAttributeInternal(element, key, value);
                        storage.externalChanges.attributes.delete(key); // Reset tracking
                    } else if (oldValue !== value) {
                        // Attribute changed in object definition
                        this.setAttributeInternal(element, key, value);
                        storage.externalChanges.attributes.delete(key); // Reset tracking
                    }
                    // Else: unchanged in object, preserve current DOM value (may be external change)
                }
            });
        }

        // Three-way merge for CSS blocks
        // Store current CSS classes from object definition before changes
        const oldCssClassesFromObject = new Set<string>();
        if (oldObject.css) {
            Array.from(element.classList).forEach(cls => {
                if (cls.startsWith('css-')) {
                    oldCssClassesFromObject.add(cls);
                }
            });
        }

        // Check if CSS blocks changed
        const cssChanged = JSON.stringify(oldObject.css) !== JSON.stringify(newObject.css);

        if (cssChanged) {
            // CSS definition changed -> remove old CSS classes and apply new ones
            if (oldObject.css) {
                removeCSSBlocks(element, oldObject.css);
            }
            if (newObject.css) {
                applyCSSBlocks(element, newObject.css);
            }
            // Clear external CSS tracking since we're applying fresh CSS
            storage.externalChanges.classList.clear();
        } else {
            // CSS definition unchanged -> preserve any external class modifications
            // Re-apply CSS if needed to ensure consistency (in case classes were removed externally)
            const currentCssClasses = Array.from(element.classList).filter(cls => cls.startsWith('css-'));
            const hasAllOriginalCssClasses = Array.from(oldCssClassesFromObject).every(cls =>
                element.classList.contains(cls)
            );

            if (!hasAllOriginalCssClasses && newObject.css) {
                // Some CSS classes from object definition are missing -> re-apply
                applyCSSBlocks(element, newObject.css);
            }
        }


        // Update domEvents: remove all old, add new
        for (const [name, listeners] of storage.domEvents.entries()) {
            listeners.forEach(listener => element.removeEventListener(name, listener));
        }
        storage.domEvents.clear();
        if (newObject.domEvents) {
            newObject.domEvents.forEach(event => {
                const caller = (evt: Event) => this.callDOMEvent(evt, storage, event.call);
                element.addEventListener(event.name, caller);
                const events = storage.domEvents.get(event.name) || [];
                events.push(caller);
                storage.domEvents.set(event.name, events);
            });
        }

        // Update workflowEvents: remove old from maps, clear, add new
        for (const name of storage.workflowEvents.keys()) {
            const listeners = this.workflowEventMap.get(name as HTMLWorkflowEventType);
            if (listeners) {
                const index = listeners.indexOf(storage);
                if (index !== -1) {
                    listeners.splice(index, 1);
                }
            }
        }
        storage.workflowEvents.clear();
        if (newObject.workflowEvents) {
            newObject.workflowEvents.forEach(event => {
                const caller = (evt: any) => this.callWorkFlowEvent(evt, storage, event.call);
                const events = storage.workflowEvents.get(event.name) || [];
                events.push(caller);
                storage.workflowEvents.set(event.name, events);
                let mapListeners = this.workflowEventMap.get(event.name);
                if (!mapListeners) {
                    mapListeners = [];
                    this.workflowEventMap.set(event.name, mapListeners);
                }
                if (!mapListeners.includes(storage)) {
                    mapListeners.push(storage);
                }
            });
        }

        storage.object = newObject;
        storage.extraVariable = extraVar;

        if (newObject.type === "text") {
            const newText = await this.parseContent(newObject.content[this.language], storage);
            const oldText = await this.parseContent((oldObject.content as any)[this.language], storage);

            // Three-way merge for text content:
            // Only update if content definition changed OR not externally modified
            if (oldText !== newText) {
                // Content changed in object definition -> update
                this.setTextContentInternal(element, newText);
                storage.externalChanges.textContent = false; // Reset tracking
            } else if (!storage.externalChanges.textContent) {
                // Content unchanged in object and not externally modified -> ensure sync
                if (element.textContent !== newText) {
                    this.setTextContentInternal(element, newText);
                }
            }
            // Else: content unchanged in object but externally modified -> preserve external value

            this.addDebugListeners(storage);
            return;
        } else if (newObject.type === "html") {
            const newHtml = await this.parseContent(newObject.content, storage);
            const oldHtml = await this.parseContent(oldObject.content as string, storage);

            // Three-way merge for HTML content:
            // Only update if content definition changed OR not externally modified
            if (oldHtml !== newHtml) {
                // Content changed in object definition -> update
                this.setInnerHTMLInternal(element, newHtml);
                storage.externalChanges.innerHTML = false; // Reset tracking
            } else if (!storage.externalChanges.innerHTML) {
                // Content unchanged in object and not externally modified -> ensure sync
                if (element.innerHTML !== newHtml) {
                    this.setInnerHTMLInternal(element, newHtml);
                }
            }
            // Else: content unchanged in object but externally modified -> preserve external value

            this.addDebugListeners(storage);
            return;
        }

        // Reconcile children for block, list, array
        const newChildrenInfo = await this.getChildrenInfo(newObject, extraVar, storage);

        const oldChildMap: Map<string, { element: HTMLElement, storage: ObjectStorage }> = new Map();
        for (const child of Array.from(element.children) as HTMLElement[]) {
            const idf = child.dataset.identifier;
            if (idf) {
                const childStorage = this.objectStorage.get(idf);
                if (childStorage) {
                    oldChildMap.set(idf, { element: child, storage: childStorage });
                } else {
                    child.remove();
                }
            } else {
                child.remove();
            }
        }

        let lastInserted: Node | null = null;
        for (const childInfo of newChildrenInfo) {
            const idf = childInfo.obj.identifier;
            const old = oldChildMap.get(idf);
            if (old) {
                await this.updateDOM(childInfo.obj, old.element, old.storage, childInfo.extra);
                if (old.element.previousSibling !== lastInserted) {
                    element.insertBefore(old.element, lastInserted ? lastInserted.nextSibling : element.firstChild);
                }
                lastInserted = old.element;
                oldChildMap.delete(idf);
            } else {
                const nextNode = lastInserted ? lastInserted.nextSibling : element.firstChild;
                await this.renderCreate(childInfo.obj, element, childInfo.extra, element.contains(nextNode) ? nextNode : null);
                const newStorage = this.objectStorage.get(idf)!;
                lastInserted = newStorage.element;
            }
        }

        // Remove unmatched old children AFTER processing new ones
        for (const old of oldChildMap.values()) {
            this.disposeElement(old.storage.object.identifier);
        }
        this.addDebugListeners(storage);
    }

    /**
     * Helper to set attribute without triggering external change tracking
     */
    private setAttributeInternal(element: HTMLElement, key: string, value: string | null): void {
        (element as any).__htmlRenderInternalUpdate = true;
        if (value === null) {
            element.removeAttribute(key);
        } else {
            element.setAttribute(key, value);
        }
        // Use setTimeout to ensure the flag is cleared after the mutation is processed
        setTimeout(() => {
            delete (element as any).__htmlRenderInternalUpdate;
        }, 0);
    }

    /**
     * Helper to set text content without triggering external change tracking
     */
    private setTextContentInternal(element: HTMLElement, content: string): void {
        (element as any).__htmlRenderInternalUpdate = true;
        element.textContent = content;
        setTimeout(() => {
            delete (element as any).__htmlRenderInternalUpdate;
        }, 0);
    }

    /**
     * Helper to set innerHTML without triggering external change tracking
     */
    private setInnerHTMLInternal(element: HTMLElement, content: string): void {
        (element as any).__htmlRenderInternalUpdate = true;
        element.innerHTML = content;
        setTimeout(() => {
            delete (element as any).__htmlRenderInternalUpdate;
        }, 0);
    }

    /**
     * Sets up MutationObserver to track external DOM changes
     * This allows preserving external modifications during updates
     */
    private setupExternalChangeTracking(storage: ObjectStorage): void {
        // Disconnect existing observer if any
        if (storage.mutationObserver) {
            storage.mutationObserver.disconnect();
        }

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                // Skip mutations from our own updates
                if ((mutation.target as any).__htmlRenderInternalUpdate) {
                    continue;
                }

                switch (mutation.type) {
                    case 'attributes':
                        const attrName = mutation.attributeName;
                        if (attrName === 'class') {
                            // Track class changes
                            const oldClasses = mutation.oldValue ? mutation.oldValue.split(' ') : [];
                            const newClasses = Array.from((mutation.target as HTMLElement).classList);

                            // Find added classes
                            newClasses.forEach(cls => {
                                if (!oldClasses.includes(cls)) {
                                    storage.externalChanges.classList.add(cls);
                                }
                            });

                            // Find removed classes
                            oldClasses.forEach(cls => {
                                if (!newClasses.includes(cls)) {
                                    storage.externalChanges.classList.add(cls);
                                }
                            });
                        } else if (attrName && attrName !== 'data-identifier') {
                            // Track that this attribute was modified externally
                            storage.externalChanges.attributes.add(attrName);
                        }
                        break;

                    case 'characterData':
                    case 'childList':
                        // If the element has text type, mark textContent as externally changed
                        if (storage.object.type === 'text' && mutation.type === 'characterData') {
                            storage.externalChanges.textContent = true;
                        }
                        // If the element has html type, mark innerHTML as externally changed
                        else if (storage.object.type === 'html' && mutation.type === 'childList') {
                            storage.externalChanges.innerHTML = true;
                        }
                        break;
                }
            }
        });

        // Observe attributes, character data, and child list changes
        observer.observe(storage.element, {
            attributes: true,
            attributeOldValue: true,
            characterData: true,
            characterDataOldValue: true,
            childList: true,
            subtree: false,  // Don't track changes in children (they have their own observers)
        });

        storage.mutationObserver = observer;
    }

    private async getChildrenInfo(object: HtmlObject, extraVar: Record<string, any>, storage: ObjectStorage): Promise<ChildInfo[]> {
        const env = {
            currentElement: storage.element,
            htmlObject: object,
            currentStorage: storage.storage,
            globalStorage: this.globalStorage,
            ...extraVar
        };
        if (object.type === "block") {
            if (object.content) {
                return [{ obj: object.content, extra: extraVar }];
            }
            return [];
        } else if (object.type === "list") {
            return (object.content ?? []).map(c => ({ obj: c, extra: extraVar }));
        } else if (object.type === "array") {
            const codeNumberOfContent = object.content.numberOfContent.trim().startsWith("return") ? object.content.numberOfContent : "return " + object.content.numberOfContent;
            const length = await this.callFunction(codeNumberOfContent, env);
            if (length === 0) {
                if (object.content.noContent) {
                    return [{ obj: object.content.noContent, extra: extraVar }];
                }
                return [];
            } else if (object.content.content) {
                const children: ChildInfo[] = [];
                for (let i = 0; i < length; i++) {
                    const newObject = deepCopy(object.content.content);
                    newObject.identifier = object.content.content.identifier + "-" + i;
                    const childExtra = { ...extraVar, [object.content.indexVariableName]: i };
                    children.push({ obj: newObject, extra: childExtra });
                }
                return children;
            }
            return [];
        }
        return [];
    }

    private callDOMEvent(event: any, objectStorage: ObjectStorage, call: string): void {
        this.callFunction(call, {
            event: event,
            currentElement: objectStorage.element,
            htmlObject: objectStorage.object,
            currentStorage: objectStorage.storage,
            globalStorage: this.globalStorage,
            ...objectStorage.extraVariable,
            renderElementWithId: this.renderElementWithId,
            renderElementWithIdentifier: this.renderElementWithIdentifier,
            renderElement: () => this.renderElementWithIdentifier(objectStorage.object.identifier)
        })
    }

    /* DOM related event */
    public dispatchDomEvent(event: Event, searchIt: boolean): void {
        if (!this.container) return;
        if (!searchIt) { // simple dispatch
            this.container.dispatchEvent(event);
        } else {
            for (const [identifier, storage] of this.objectStorage.entries()) {
                if (storage.domEvents.has(event.type)) {
                    storage.domEvents.get(event.type)!.forEach((call) => call(event));
                }
            }
        }
    }

    /* external workflow related event */
    public dispatchWorkFlowEvent(eventName: string, event: any): void {
        const storages = this.workflowEventMap.get(eventName as HTMLWorkflowEventType) ?? [];
        for (const storage of storages) {
            if (storage.workflowEvents.has(eventName)) {
                storage.workflowEvents.get(eventName)!.forEach((call) => call(event));
            }
        }
    }

    private callWorkFlowEvent(event: any, objectStorage: ObjectStorage, call: string): void {
        this.callFunction(call, {
            event: event,
            currentElement: objectStorage.element,
            htmlObject: objectStorage.object,
            currentStorage: objectStorage.storage,
            globalStorage: this.globalStorage,
            ...objectStorage.extraVariable,
            renderElementWithId: this.renderElementWithId,
            renderElementWithIdentifier: this.renderElementWithIdentifier,
            renderElement: () => this.renderElementWithIdentifier(objectStorage.object.identifier)
        });
    }

    public dispose(): void {
        if (this.previousObject) {
            this.disposeElement(this.previousObject.identifier);
        }
        this.clearBuildingOverlay();
        this.objectStorage.clear();
        this.workflowEventMap.clear();
        this.globalStorage = {};
        this.container.innerHTML = "";
        this.previousObject = undefined;
    }

    private disposeElement(identifier: string): void {
        const storage = this.objectStorage.get(identifier);
        if (!storage) return;

        // Disconnect MutationObserver
        if (storage.mutationObserver) {
            storage.mutationObserver.disconnect();
            storage.mutationObserver = undefined;
        }

        // Remove DOM listeners
        for (const [name, listeners] of storage.domEvents.entries()) {
            listeners.forEach(listener => storage.element.removeEventListener(name, listener));
        }
        storage.domEvents.clear();

        // Remove workflow mappings
        for (const name of storage.workflowEvents.keys()) {
            const listeners = this.workflowEventMap.get(name as HTMLWorkflowEventType);
            if (listeners) {
                const index = listeners.indexOf(storage);
                if (index !== -1) {
                    listeners.splice(index, 1);
                }
            }
        }
        storage.workflowEvents.clear();

        this.removeDebugListeners(storage);

        // Recurse children
        for (const child of Array.from(storage.element.children) as HTMLElement[]) {
            const idf = child.dataset.identifier;
            if (idf) {
                this.disposeElement(idf);
            }
        }

        // Remove element
        storage.element.remove();

        // Delete storage
        this.objectStorage.delete(identifier);
    }

    private async callFunction(code: string, env: Record<string, any>): Promise<any> {
        const fct = new AsyncFunction(...[...Object.keys(env), code]);
        return await fct(...[...Object.values(env)]);
    }

    /* utility to trigger re render only one component and it's child*/
    public renderElementWithId = (id: string) => {
        for (const storage of this.objectStorage.values()) {
            if (storage.element.id === id) {
                this.renderElementWithIdentifier(storage.object.identifier);
                return;
            }
        }
    }

    /* same but with identifier */
    public renderElementWithIdentifier = (identifier: string) => {
        const storage = this.objectStorage.get(identifier);
        if (!storage) return;
        this.updateDOM(storage.object, storage.element, storage, storage.extraVariable);
    }

    private async parseContent(content: string, objectStorage: ObjectStorage): Promise<string> {
        const regex = /\{\{(.*?)\}\}/g; // Non-greedy match for {{content}}

        const matches = [...content.matchAll(regex)];
        if (matches.length === 0) return content;

        // Process each match asynchronously
        const replacements = await Promise.all(
            matches.map(async (match) => {
                const inner = match[1].trim();
                return await this.callFunction(
                    inner.startsWith("return") ? inner : "return " + inner,
                    {
                        currentElement: objectStorage.element,
                        htmlObject: objectStorage.object,
                        currentStorage: objectStorage.storage,
                        globalStorage: this.globalStorage,
                        ...objectStorage.extraVariable,
                    }
                );
            })
        );

        // Rebuild content with resolved replacements
        let replaced = content;
        matches.forEach((match, i) => {
            replaced = replaced.replace(match[0], replacements[i]);
        });

        return replaced;
    }

    private addDebugListeners(storage: ObjectStorage) {
        if (!this.buildingMode) return;

        storage.element.setAttribute("temporary", storage.object.temporary ? "true" : "false");

        // this interaction is only available for entry component, so the parent should be null or having delimiter=true
        const parentIdentifier = storage.element.parentElement?.getAttribute("data-identifier");
        if(
            !storage.element.parentElement || (parentIdentifier &&!this.objectStorage.has(parentIdentifier)) || (parentIdentifier &&!this.objectStorage.get(parentIdentifier)!.object.delimiter)
        ) {
            return;
        }

        const lookForZoom = (element:HTMLElement):number => {
            const zoom = parseFloat(getComputedStyle(element).zoom);
            if(element.parentElement) {
                return zoom * lookForZoom(element.parentElement);
            }
            return zoom;
        }


        const createOverlay = (backgroundColor:string) => {
            const zoom = lookForZoom(this.superContainer);
            const overlay = document.createElement('div');
            overlay.setAttribute("data-render-building-mode-overlay", "true");
            overlay.style.position = 'absolute';
            overlay.style.pointerEvents = 'none';
            overlay.style.border = '2px solid '+backgroundColor;
            overlay.style.boxSizing = 'border-box';

            const rect = storage.element.getBoundingClientRect();
            const parentRect = this.superContainer.getBoundingClientRect();
            overlay.style.left = `${(rect.left - parentRect.left) / zoom}px`;
            overlay.style.top = `${(rect.top - parentRect.top) / zoom}px`;
            overlay.style.width = `${(rect.width) / zoom}px`;
            overlay.style.height = `${(rect.height) / zoom}px`;

            const overlayName = document.createElement("div");
            overlayName.style.position = 'absolute';
            overlayName.style.backgroundColor = backgroundColor;
            overlayName.style.color = "var(--nodius-secondary-contrastText)";
            overlayName.style.top = "0";
            overlayName.style.left = "0";
            overlayName.style.fontSize = "12px";
            overlayName.style.userSelect = "none";
            overlayName.innerText = storage.object.name;
            overlayName.style.padding="0px 3px";
            overlayName.style.borderBottomRightRadius = "5px";
            overlay.appendChild(overlayName);

            return overlay;
        }

        /*if(storage.object.identifier === this.selectedObjectIdentifier || storage.object.identifier === this.hoverObjectIdentifier) {

            const overlay = createOverlay(storage.object.identifier === this.hoverObjectIdentifier ? 'var(--nodius-secondary-light)' : 'var(--nodius-secondary-main)');
            storage.debugOverlay = overlay;
            this.superContainer.appendChild(overlay);
        }*/

        const onEnter = (evt: Event) => {
            evt.stopPropagation();
            if(storage.object.identifier !== this.selectedObjectIdentifier && !storage.object.temporary) {
                const events = this.buildingInteractEventMap.get("hover") ?? [];
                if(this.hoverObjectIdentifier) {
                    const hoverStorage = this.objectStorage.get(this.hoverObjectIdentifier);
                    if (hoverStorage) {
                        if (hoverStorage.debugOverlay) {
                            hoverStorage.debugOverlay.remove();
                            hoverStorage.debugOverlay = undefined;
                        }
                    }
                    this.hoverObjectIdentifier = undefined;
                }
                const overlay = createOverlay('var(--nodius-secondary-light)');
                storage.debugOverlay = overlay;
                this.superContainer.appendChild(overlay);
                this.hoverObjectIdentifier = storage.object.identifier;
                for(const event of events) {
                    event(storage);
                }
            }
        };
        const onLeave = (evt: Event) => {
            evt.stopPropagation();
            if (storage.debugOverlay && storage.object.identifier !== this.selectedObjectIdentifier) {
                storage.debugOverlay.remove();
                storage.debugOverlay = undefined;
                const events = this.buildingInteractEventMap.get("hover") ?? [];
                for(const event of events) {
                    event(undefined);
                }
            }
            if((evt.target as HTMLElement).parentElement) {
                (evt.target as HTMLElement).parentElement!.dispatchEvent(new Event("mouseenter"))
            }
        };
        const onClick = (evt: Event) => {
            evt.stopPropagation();
            if(storage.object.temporary) return;
            this.clearBuildingOverlay();
            this.selectedObjectIdentifier = storage.object.identifier;
            const overlay = createOverlay('var(--nodius-secondary-main)');
            storage.debugOverlay = overlay;
            this.superContainer.appendChild(overlay);
            const events = this.buildingInteractEventMap.get("select") ?? [];
            for(const event of events) {
                event(storage);
            }
        };

        const listeners: { [key: string]: (evt: Event) => void } = {
            mouseenter: onEnter,
            mouseleave: onLeave,
            click: onClick,
        };

        for (const [type, listener] of Object.entries(listeners)) {
            storage.element.addEventListener(type, listener);
            const events = storage.debugEvents.get(type) ?? [];
            events.push(listener);
            storage.debugEvents.set(type, events);
        }
    }


    private removeDebugListeners(storage: ObjectStorage) {
        for (const [name, listeners] of storage.debugEvents.entries()) {
            listeners.forEach(listener => storage.element.removeEventListener(name, listener));
        }
        storage.debugEvents.clear();
        if (storage.debugOverlay) {
            storage.debugOverlay.remove();
            storage.debugOverlay = undefined;
        }
    }

    public addBuildingInteractEventMap(type:"hover"|"select",callback: (objectStorage?:ObjectStorage) => void) {
        const events = this.buildingInteractEventMap.get(type) ?? [];
        events.push(callback);
        this.buildingInteractEventMap.set(type, events);
    }

    public removeBuildingInteractEventMap(type:"hover"|"select",callback: (objectStorage?:ObjectStorage) => void) {
        const events = this.buildingInteractEventMap.get(type) ?? [];
        this.buildingInteractEventMap.set(type, events.filter((ev) => ev !== callback));
    }

    public pushBuildingInteractEvent(type:"hover"|"select", identifier?:string) {
        if(identifier) {
            const element = document.querySelector("[data-identifier='" + identifier + "']") as HTMLElement;
            if (element) {
                element.dispatchEvent(type === "hover" ? new Event("mouseenter") : new Event("click"));
            }
        } else {

            if(type === "hover" && this.hoverObjectIdentifier) {
                const hoverStorage = this.objectStorage.get(this.hoverObjectIdentifier);
                if (hoverStorage) {
                    if (hoverStorage.debugOverlay) {
                        hoverStorage.debugOverlay.remove();
                        hoverStorage.debugOverlay = undefined;
                    }
                }
                this.hoverObjectIdentifier = undefined;
            }
            else if(type === "select" && this.selectedObjectIdentifier) {
                const selectedStorage = this.objectStorage.get(this.selectedObjectIdentifier);
                if (selectedStorage) {
                    if (selectedStorage.debugOverlay) {
                        selectedStorage.debugOverlay.remove();
                        selectedStorage.debugOverlay = undefined;
                    }
                }
            }
        }

    }

    public getSelectedObject = ():HtmlObject|undefined => {
        return this.selectedObjectIdentifier ? this.objectStorage.get(this.selectedObjectIdentifier)?.object : undefined;
    }

    public generateUniqueIdentifier(): string {
        let id: string;
        do {
            this.uniqueCounter++;
            id = this.uniqueCounter.toString();
        } while (Array.from(this.objectStorage.values()).some((sto) => sto.object.identifier == id));
        return id;
    }

}