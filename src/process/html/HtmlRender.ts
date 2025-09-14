import {CSSProperties} from "react";
import {HtmlObject, HTMLWorkflowEventType, HtmlBase} from "../../utils/html/htmlType";
import {deepCopy} from "../../utils/objectUtils";
import "./HtmlRenderUtility";

interface ObjectStorage {
    element: HTMLElement,
    object: HtmlObject,
    domEvents: Map<string, Array<((event: any) => void)>>,
    workflowEvents: Map<string, Array<((event: any) => void)>>,
    storage: Record<string, any>,
    extraVariable: Record<string, any>,
}

interface ChildInfo {
    obj: HtmlObject,
    extra: Record<string, any>,
}

type AsyncFunctionConstructor = new (...args: string[]) => (...args: any[]) => Promise<any>;
const AsyncFunction: AsyncFunctionConstructor = Object.getPrototypeOf(async function () {
}).constructor;

export class HtmlRender {

    private readonly container: HTMLElement;
    private previousObject: HtmlObject | undefined;
    private readonly objectStorage: Map<string, ObjectStorage> = new Map<string, ObjectStorage>();
    private globalStorage: Record<string, any> = {};
    private readonly workflowEventMap: Map<Partial<HTMLWorkflowEventType>, ObjectStorage[]> = new Map();
    private language: Language = "en";
    private buildingMode: boolean = false;


    constructor(container: HTMLElement, option?: { buildingMode?: boolean, language: Language }) {
        if (!container) {
            throw new Error("HtmlRender: Container is null");
        }
        this.container = container;
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

    public setLanguage(lang: Language): void {
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
        };

        if (object.id) element.id = object.id;

        Object.entries(object.css).forEach(([key, value]) => {
            if (value !== undefined) {
                (element.style as any)[key] = value;
            }
        });

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

        element.dataset.identifier = newObject.identifier;

        if (newObject.id !== oldObject.id) {
            element.id = newObject.id || "";
        }

        // Update CSS: unset removed styles
        Object.keys(oldObject.css).forEach(key => {
            if (!(key in newObject.css)) {
                (element.style as any)[key] = "";
            }
        });
        // Apply new/changed styles
        Object.entries(newObject.css).forEach(([key, value]) => {
            if (value !== undefined) {
                (element.style as any)[key] = value;
            }
        });

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
            if (element.textContent !== newText) {
                element.textContent = newText;
            }
            return;
        } else if (newObject.type === "html") {
            const newHtml = await this.parseContent(newObject.content, storage);
            if (element.innerHTML !== newHtml) {
                element.innerHTML = newHtml;
            }
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
                await this.renderCreate(childInfo.obj, element, childInfo.extra, nextNode);
                const newStorage = this.objectStorage.get(idf)!;
                lastInserted = newStorage.element;
            }
        }

        // Remove unmatched old children
        for (const old of oldChildMap.values()) {
            this.disposeElement(old.storage.object.identifier);
        }
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
            return object.content.map(c => ({ obj: c, extra: extraVar }));
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
        this.objectStorage.clear();
        this.workflowEventMap.clear();
        this.globalStorage = {};
        this.container.innerHTML = "";
        this.previousObject = undefined;
    }

    private disposeElement(identifier: string): void {
        const storage = this.objectStorage.get(identifier);
        if (!storage) return;

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

}