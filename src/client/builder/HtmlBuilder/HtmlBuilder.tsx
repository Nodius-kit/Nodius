import {
    Fragment,
    jsx,
    jsxWithLifecycle,
    useEffect,
    useRef,
    useSilentState,
    useState,
} from "nodius_jsx/jsx-runtime";
import {HtmlClass, HtmlObject, insertEvent} from "./HtmlBuildType";
import {darkenElement, deleteObjectById, HtmlBuildTraversal, replaceObjectById} from "./HtmlBuilderUtils";
import {HtmlBuilderThreeViewer} from "./HtmlBuilderThreeViewer";
import {HtmlBuilderComponentSelect} from "./HtmlBuilderComponentSelect";
import {HtmlBuilderViewport} from "./HtmlBuilderViewport";
import {HtmlBuilderComponentProperties} from "./HtmlBuilderComponentProperties";
import {insertAtIndex} from "../../../utils/numericUtils";

interface HtmlBuilderProps {
    htmlClass:HtmlClass,
    updateClass: () => void,
    closeClass: () => void,
}

export const HtmlBuilder = ({htmlClass, updateClass, closeClass}:HtmlBuilderProps) => {

    const [showOutline, setShowOutline] = useState<boolean>(true);
    const [centerContent, setCenterContent] = useState<boolean>(false);

    const nextHtmlId = useRef<number>(0);

    const eventCache = useRef<Record<number, Array<{name:string, cb:(evt:Event) => void}>>>({});

    const [htmlBuild, setHtmlBuild,  silentUpdateHtmlBuild, triggerDepsHtmlBuild] = useSilentState<any>(/*{
        type: "block",
        tag: "div",
        css: {height:"100%", width:"100%"},
        id: 0
    }*/htmlClass.object);

    const [selectedHtmlObject, setSelectedHtmlObject] = useState<HtmlObject>(htmlBuild);
    const replaceObject = (newObject: HtmlObject): void => {
        // replace object with the same id
        console.log(replaceObjectById(htmlBuild, newObject));
        console.log(htmlBuild);
        if(selectedHtmlObject.id === newObject.id) {
            setSelectedHtmlObject(newObject);
            console.log(newObject);
        }
        setHtmlBuild({...htmlBuild});
    }

    useEffect(() => {
        HtmlBuildTraversal(htmlBuild, (object) => {
            if(object.id != Number.MAX_SAFE_INTEGER) {
                nextHtmlId.current = Math.max(nextHtmlId.current, object.id + 1);
            }
        });
    }, [htmlBuild]);

    useEffect(() => {
        if(selectedHtmlObject) {
            const element = document.querySelector("[data-object-id='"+selectedHtmlObject.id+"']");
            if(element) {
                darkenElement(element as  HTMLElement);
            }
        }
    }, [selectedHtmlObject]);

    const drawHtmlObject = (object:HtmlObject): JSX.Element => {

        const addEvents = (el:HTMLElement) => {
            if(object.events) {
                eventCache.current[object.id] = [];
                object.events.forEach((event) => {
                    const callback =  (evt:Event) => {
                        const fn = new Function("event", event.call);
                        fn(evt);
                    };
                    el.addEventListener(event.name, callback);
                    eventCache.current[object.id].push({name: event.name, cb: callback});
                });
            }
        }
        const removeEvents = (el:HTMLElement) => {
            if(eventCache.current[object.id]) {
                eventCache.current[object.id].forEach((event) => {
                    el.removeEventListener(event.name, event.cb);
                })
            }
        }

        const eventOnMount = (el:HTMLElement) => {
            addEvents(el);
        }
        const eventOnUnMount = (el:HTMLElement) => {
            removeEvents(el);
        }
        const eventOnUpdate = (el:HTMLElement) => {
            removeEvents(el);
            addEvents(el);
        }

        const style = object.css ?? {};
        if(showOutline) {
            style.outline = "1px solid red";
        } else {
            style.outline = "none";
        }
        if(object.type == "block") {

            const onInsert = (e:CustomEvent<insertEvent>) => {
                if(object.id == Number.MAX_SAFE_INTEGER) return;
                if(e.detail.component && (object.content == undefined || !e.detail.preview)) {
                    object.content = {
                        ...e.detail.component.object,
                        id: e.detail.preview ? Number.MAX_SAFE_INTEGER : nextHtmlId.current
                    } as HtmlObject;
                    if( !e.detail.preview) {
                        nextHtmlId.current++;
                        setSelectedHtmlObject(object.content);
                    }
                    silentUpdateHtmlBuild();
                } else if(!e.detail.component && object.content?.id === Number.MAX_SAFE_INTEGER) {
                    object.content = undefined;
                    silentUpdateHtmlBuild();
                }
            }

            const isInserteable = object.id != Number.MAX_SAFE_INTEGER && (object.content == undefined || object.content.id === Number.MAX_SAFE_INTEGER);
            return jsxWithLifecycle(object.tag, {
                'data-object-id': object.id,
                style: { ...object.css, ...style },
                'data-inserteable': isInserteable ? "true" : "false",
                onInsert: isInserteable ? onInsert : undefined,
                children: object.content ? drawHtmlObject(object.content) : jsx(Fragment, {}),
                onMount: eventOnMount,
                onUnmount: eventOnUnMount,
                onUpdate: eventOnUpdate
            });
        } else if(object.type == "text") {
            return jsxWithLifecycle(object.tag, {
                'data-object-id': object.id,
                style: { ...object.css },
                'data-inserteable': "false",
                children: object.content,
                onMount: eventOnMount,
                onUnmount: eventOnUnMount,
                onUpdate: eventOnUpdate
            });

        } else if(object.type == "list") {
            const onInsert = (e:CustomEvent<insertEvent>) => {
                console.log(e);
                if(object.id == Number.MAX_SAFE_INTEGER) return;
                const target = e.target as HTMLElement;
                const direction = getComputedStyle(target).flexDirection as "row"|"column";

                if(object.content.length == 0 && e.detail.component) {
                    // simple push
                    object.content.push({
                        ...e.detail.component.object,
                        id: e.detail.preview ? Number.MAX_SAFE_INTEGER : nextHtmlId.current
                    } as HtmlObject);
                    silentUpdateHtmlBuild();
                } else if(object.content.length > 0  && e.detail.component && !e.detail.preview) {
                    // replace temporary
                    if(object.content.some((obj) => obj.id === Number.MAX_SAFE_INTEGER)) {
                        object.content = object.content.map((obj) => {
                            if (obj.id === Number.MAX_SAFE_INTEGER) {
                                obj.id = nextHtmlId.current;
                                nextHtmlId.current++;
                                setSelectedHtmlObject(obj);
                            }
                            return obj;
                        });
                    } else {
                        // fast add
                        object.content.push({
                            ...e.detail.component.object,
                            id: nextHtmlId.current
                        } as HtmlObject);
                        nextHtmlId.current++;
                    }

                    silentUpdateHtmlBuild();
                } else if(object.content.length > 0  && !e.detail.component && object.content.some((obj) => obj.id === Number.MAX_SAFE_INTEGER)) {
                    // remove temporary
                    object.content = object.content.filter((obj) => obj.id !== Number.MAX_SAFE_INTEGER);
                    silentUpdateHtmlBuild();
                } else if(e.detail.cursorX != undefined && e.detail.cursorY != undefined && e.detail.component) {
                    // calcul position, relatif to other child
                    let insertAt = 0.5;
                    const element = document.querySelector("[data-object-id='"+object.id+"']");
                    const posX = e.detail.cursorX;
                    const posY = e.detail.cursorY;

                    if(element) {
                        const indexOfTemporary = object.content.findIndex((obj) => obj.id === Number.MAX_SAFE_INTEGER);
                        for(let i = 0; i < element.children.length; i++) {
                            if(i === indexOfTemporary) {
                                continue;
                            }
                            const child = element.children[i];
                            const bounds = child.getBoundingClientRect();
                            if(direction == "row") {
                                if (posX > bounds.x && posX < bounds.x + bounds.width) {
                                    if (posX > bounds.x + (bounds.width)) {
                                        insertAt += 0.5;
                                    } else {
                                        insertAt -= 0.5;
                                    }
                                } else if (posX < bounds.x) {
                                    insertAt -= 0.5;
                                    break;
                                } else {
                                    insertAt += 1;
                                }
                            } else {
                                if (posY > bounds.y && posY < bounds.y + bounds.height) {
                                    if (posY > bounds.y + (bounds.height)) {
                                        insertAt += 0.5;
                                    } else {
                                        insertAt -= 0.5;
                                    }
                                } else if (posY < bounds.y) {
                                    insertAt -= 0.5;
                                    break;
                                } else {
                                    insertAt += 1;
                                }
                            }
                        }
                        insertAt = Math.floor(insertAt);
                        if(indexOfTemporary === -1 || (indexOfTemporary !== insertAt && indexOfTemporary-1 !== insertAt && indexOfTemporary+1 !== insertAt) ) {
                            object.content = insertAtIndex(object.content, insertAt, {
                                ...e.detail.component.object,
                                id: Number.MAX_SAFE_INTEGER
                            } as HtmlObject);
                            silentUpdateHtmlBuild();
                        }
                    }
                }
            }

            const isInserteable = object.id != Number.MAX_SAFE_INTEGER;
            return jsxWithLifecycle(object.tag, {
                'data-object-id': object.id,
                style: { ...object.css },
                'data-inserteable': isInserteable ? "true" : "false",
                onInsert: isInserteable ? onInsert : undefined,
                children: object.content.map((obj) => drawHtmlObject(obj)),
                onMount: eventOnMount,
                onUnmount: eventOnUnMount,
                onUpdate: eventOnUpdate
            });
        }
        return <></>
    }

    const removeObject = (object:HtmlObject) => {
        deleteObjectById(htmlBuild, object.id);
        silentUpdateHtmlBuild();
    }

    return (
        <div style={{"display": "flex", height:"100vh"}}>
            <div style={{maxWidth:"300px"}}>
                <div style={{display:"flex", flexDirection:"column", height:"100%"}}>
                    <div style={{height:"50%"}}>
                        <HtmlBuilderThreeViewer object={htmlBuild} selectedObject={selectedHtmlObject} setSelectedObject={setSelectedHtmlObject} removeObject={removeObject} />
                    </div>
                    <div>
                        <HtmlBuilderComponentSelect selectedObject={selectedHtmlObject} />
                    </div>
                </div>
            </div>
            <div style={{flexGrow: "1"}} id={"htmlBuildDraw"}>
                <div style={{display:"flex", width:"100%", height:"100%", flexDirection:"column"}}>
                    <div>
                        <div>
                            <input checked={showOutline} type={"checkbox"} id="config-outline" value={"true"}
                                   onChange={(evt) => {
                                       setShowOutline((evt.target as HTMLInputElement).checked);
                                   }}/>
                            <label for={"config-outline"}>Show outline</label>

                            <input checked={centerContent} type={"checkbox"} id="config-center" value={"true"}
                                   style={{marginLeft:"20px"}}
                                   onChange={(evt) => {
                                       setCenterContent((evt.target as HTMLInputElement).checked);
                                   }}/>
                            <label for={"config-center"}>Center content</label>

                            <button style={{marginLeft:"20px"}} onClick={() => updateClass()}>
                                save
                            </button>

                            <button style={{marginLeft:"20px"}} onClick={() => closeClass()}>
                                close
                            </button>
                        </div>

                    </div>
                    <div style={{flex: "1", padding: "50px"}}>
                        <HtmlBuilderViewport>
                            {drawHtmlObject(htmlBuild)}
                        </HtmlBuilderViewport>
                    </div>
                </div>
            </div>
            <div style={{maxWidth: "300px"}}>
                <HtmlBuilderComponentProperties selectedObject={selectedHtmlObject} replaceObject={replaceObject} invokeUpdate={silentUpdateHtmlBuild}/>
            </div>

        </div>
    )
}