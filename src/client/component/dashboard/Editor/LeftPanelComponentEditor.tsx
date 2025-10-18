import React, {memo, useContext, useEffect, useMemo, useRef, useState} from "react";
import * as Icons from "lucide-react";
import {ChevronDown, ChevronUp, CloudAlert, Search, Box, Info} from "lucide-react";
import {Input} from "../../form/Input";
import {HtmlBuilderCategoryType, HtmlBuilderComponent, HtmlObject} from "../../../../utils/html/htmlType";
import {Card} from "../../form/Card";
import {Collapse} from "../../animate/Collapse";
import {deepCopy, disableTextSelection, enableTextSelection} from "../../../../utils/objectUtils";
import {applyInstruction, Instruction, InstructionBuilder, OpType} from "../../../../utils/sync/InstructionBuilder";
import {searchElementWithIdentifier, travelHtmlObject} from "../../../../utils/html/htmlUtils";
import {useDynamicClass} from "../../../hooks/useDynamicClass";
import {ActionContext, EditedHtmlType, ProjectContext, UpdateHtmlOption} from "../../../hooks/contexts/ProjectContext";
import {ThemeContext} from "../../../hooks/contexts/ThemeContext";

interface LeftPaneComponentEditorProps {
    componentsList: Partial<Record<HtmlBuilderCategoryType, HtmlBuilderComponent[]>> | undefined,
    onPickup?: (component:HtmlBuilderComponent) => Promise<boolean>,
}

export const LeftPanelComponentEditor = memo(({
    componentsList,
    onPickup
}:LeftPaneComponentEditorProps) => {

    const IconDict = Object.fromEntries(Object.entries(Icons));
    const [componentSearch, setComponentSearch] = useState<string>("");
    const [components, setComponents] = useState<
        Partial<Record<HtmlBuilderCategoryType, HtmlBuilderComponent[]>> | undefined
    >(componentsList);

    const [hideCategory, setHideCategory] = useState<string[]>([]);

    const Project = useContext(ProjectContext);
    const Theme = useContext(ThemeContext);

    // may be used in element event, we have to store it in ref for avoiding change while user is dragging component and miss change
    const editedHtmlRef = useRef<EditedHtmlType>(Project.state.editedHtml);
    const updateHtmlRef = useRef<(instructions:Instruction, options?:UpdateHtmlOption) => Promise<ActionContext> | undefined>(Project.state.updateHtml);
    useEffect(() => {
        editedHtmlRef.current = Project.state.editedHtml;
    }, [Project.state.editedHtml]);
    useEffect(() => {
        updateHtmlRef.current = Project.state.updateHtml;
    }, [Project.state.updateHtml]);

    useEffect(() => {
        setComponents(componentsList);
    }, [componentsList]);


    const filteredComponents = useMemo(() => {
        const search = componentSearch.trim().toLowerCase();
        if(!components) {
            return null;
        }
        return Object.fromEntries(
            Object.entries(components)
                .map(([category, items]) => {
                    if (!items) return [category, []]; // skip null/undefined
                    const filtered = items.filter((item) =>
                        item.object.name.toLowerCase().includes(search)
                    );
                    return [category, filtered];
                })
                .filter(([_, items]) => items.length > 0) // remove empty arrays
        ) as Partial<Record<HtmlBuilderCategoryType, HtmlBuilderComponent[]>>;
    }, [components, componentSearch]);

    const onMouseDown = (event:React.MouseEvent, component:HtmlBuilderComponent) => {

        let haveMoved = false;

        const container = document.querySelector("[data-builder-component='"+component.object.name+"']") as HTMLElement;
        if(!container) return;
        const containerSize = container.getBoundingClientRect();

        const newObject = deepCopy(component.object);
        travelHtmlObject(newObject, (obj) => {
            obj.temporary = true;
            return true;
        });

        const overlayContainer = document.createElement("div");
        overlayContainer.style.position = "absolute";
        overlayContainer.style.left = (event.clientX-(containerSize.width/2))+"px";
        overlayContainer.style.top = (event.clientY+3)+"px";
        overlayContainer.style.width = containerSize.width+"px";
        overlayContainer.style.height = containerSize.height+"px";
        overlayContainer.style.zIndex = "10000000";
        overlayContainer.style.display = "flex";
        overlayContainer.style.flexDirection = "column";
        overlayContainer.style.justifyContent = "center";
        overlayContainer.style.alignItems = "center";

        const toCopyStyle = getComputedStyle(container);
        overlayContainer.style.border = toCopyStyle.border;
        overlayContainer.style.borderRadius = toCopyStyle.borderRadius;
        overlayContainer.style.boxShadow = toCopyStyle.boxShadow;

        overlayContainer.style.backgroundColor = "var(--nodius-background-default)";
        overlayContainer.innerHTML = container.innerHTML;


        disableTextSelection();

        let lastX = event.clientX;
        let velocityX = 0;
        let velocityXAdd = 0;
        let rotationAngle = 0;
        let animationId = 0;
        const whileSwingAnimation = () => {
            let diff = 1;
            if(velocityXAdd > diff) {
                velocityXAdd -= diff;
            } else if(velocityXAdd < -diff) {
                velocityXAdd += diff;
            } else {
                velocityXAdd = 0;
            }
            velocityXAdd = Math.max(-45, Math.min(45, velocityXAdd));
            rotationAngle = Math.max(-45, Math.min(45, velocityXAdd*0.4));
            overlayContainer.style.transform = `rotate(${rotationAngle}deg)`;
            animationId = requestAnimationFrame(whileSwingAnimation);
        }

        animationId = requestAnimationFrame(whileSwingAnimation);

        let lastObjectHover:HtmlObject|undefined;
        let lastInstruction:InstructionBuilder|undefined;

        const mouseMove = async (event: MouseEvent) => {
            if(!haveMoved) {
                document.body.appendChild(overlayContainer);
                haveMoved = true;
            }
            overlayContainer.style.left = `${event.clientX - (containerSize.width / 2)}px`;
            overlayContainer.style.top = `${event.clientY + 3}px`;

            velocityX = event.clientX - lastX;
            lastX = event.clientX;

            velocityXAdd += velocityX;

            const hoverElements = document.elementsFromPoint(event.clientX, event.clientY) as HTMLElement[];
            const hoverElement = hoverElements.find((el) => el.getAttribute("data-identifier") != undefined);

            if (!editedHtmlRef.current) return;

            const currentIdentifier = hoverElement?.getAttribute("data-identifier");

            let instruction = new InstructionBuilder();
            let object = currentIdentifier ? searchElementWithIdentifier(currentIdentifier, editedHtmlRef.current.html.object, instruction) : undefined;

            const removeLastInstruction = async (noRedraw?:boolean) => {
                if (lastInstruction) {
                    if(lastInstruction.instruction.o === OpType.ARR_INS) {
                        lastInstruction.instruction.o = OpType.ARR_REM_IDX;
                    } else {
                        lastInstruction.remove();
                    }
                    lastInstruction.instruction.v = undefined;
                    await updateHtmlRef.current!(lastInstruction.instruction, {
                        noRedraw: noRedraw
                    });

                    const newHtmlObject = deepCopy(editedHtmlRef.current!.html.object);
                    if(applyInstruction(deepCopy(editedHtmlRef.current!.html.object), lastInstruction.instruction)) {
                        instruction = new InstructionBuilder();
                        object = currentIdentifier ? searchElementWithIdentifier(currentIdentifier, newHtmlObject, instruction) : undefined;
                    }

                    lastInstruction = undefined;
                    lastObjectHover = undefined;
                }
            };


            if (!object) {
                await removeLastInstruction();
                return;
            }
            if(object.temporary) {
                return;
            }

            const isNewHover = !lastObjectHover || lastObjectHover !== object;
            if (lastObjectHover && lastObjectHover.identifier !== object.identifier) {
                await removeLastInstruction();
            }

            if (!isNewHover) return;

            let shouldAdd = false;


            if (object.type === "block") {
                if (!object.content) {
                    instruction.key("content").set(deepCopy(newObject));
                    shouldAdd = true;
                }
            } else if (object.type === "list") {
                const direction = getComputedStyle(hoverElement!).flexDirection as "row" | "column";
                instruction.key("content");

                if (object.content.length === 0) {
                    instruction.arrayInsertAtIndex(0,deepCopy(newObject));
                    shouldAdd = true;
                } else if(object.content) {
                    let insertAt = 0.5;
                    const indexOfTemporary = object.content.findIndex((obj) => obj.temporary);
                    const posX = event.clientX;
                    const posY = event.clientY;

                    for (let i = 0; i < hoverElement!.children.length; i++) {
                        if (i === indexOfTemporary) continue;

                        const child = hoverElement!.children[i];
                        const bounds = child.getBoundingClientRect();
                        if (direction === "row") {
                            if (posX > bounds.x && posX < bounds.x + bounds.width) {
                                if (posX > bounds.x + (bounds.width / 2)) {  // Assumed fix for likely typo in original code
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
                                if (posY > bounds.y + (bounds.height / 2)) {  // Assumed fix for likely typo in original code
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
                    if(indexOfTemporary != insertAt) {
                        if(indexOfTemporary != -1) {
                            await removeLastInstruction();
                        }
                        instruction.arrayInsertAtIndex(insertAt, deepCopy(newObject));
                        shouldAdd = true;
                    }
                }
            }

            if (shouldAdd) {
                const output:ActionContext|undefined = await updateHtmlRef.current!(instruction.instruction, {
                    targetedIdentifier: object.identifier
                });
                lastObjectHover = object;
                lastInstruction = instruction.clone();
            }
        };

        const mouseOut = async (evt:MouseEvent) => {
            overlayContainer.remove();
            window.removeEventListener("mouseleave", mouseOut);
            window.removeEventListener("mouseup", mouseOut);
            window.removeEventListener("mousemove", mouseMove);
            cancelAnimationFrame(animationId);
            enableTextSelection();
            if(lastInstruction) {
                lastInstruction.instruction.v = undefined;
                if(lastInstruction.instruction.o === OpType.ARR_INS) {
                    lastInstruction.index(lastInstruction.instruction.i!).key("temporary").remove();
                } else {
                    lastInstruction.key("temporary").remove();
                }
                const output:ActionContext|undefined = await updateHtmlRef.current!(lastInstruction.instruction);
                //lastInstruction = undefined;
            }
            if(!haveMoved) {
                if(!(onPickup?.(component) ?? true)) {
                    return;
                }
            }
        }

        window.addEventListener("mouseleave", mouseOut);
        window.addEventListener("mousemove", mouseMove);
        window.addEventListener("mouseup", mouseOut);


    }

    const componentCardClass = useDynamicClass(`
        & {
            border: 2px solid var(--nodius-background-paper);
            border-radius: 12px;
            aspect-ratio: 1 / 1;
            flex: 1;
            max-width: 120px;
            min-width: 85px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 8px;
            padding: 8px;
            cursor: grab;
            box-shadow: var(--nodius-shadow-1);
            transition: var(--nodius-transition-default);
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.02)};
        }

        &:hover {
            background-color: var(--nodius-background-paper);
            transform: translateY(-2px);
            box-shadow: var(--nodius-shadow-2);
        }

        &:active {
            cursor: grabbing;
            transform: scale(0.98);
        }
    `);

    const categoryHeaderClass = useDynamicClass(`
        & {
            display: flex;
            flex-direction: row;
            cursor: pointer;
            padding: 12px;
            border-radius: 10px;
            transition: var(--nodius-transition-default);
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.03)};
            border: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.08)};
        }

        &:hover {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.06)};
        }
    `);

    const infoCardClass = useDynamicClass(`
        & {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.04)};
            border: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
            border-radius: 12px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        & .info-header {
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--nodius-primary-main);
            font-weight: 500;
            font-size: 14px;
        }

        & .info-content {
            font-size: 13px;
            line-height: 1.6;
            color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.7)};
        }
    `);

    return (
        <div style={{display:"flex", flexDirection:"column", gap:"16px", padding:"8px", height:"100%", width:"100%"}}>
            {/* Header Section */}
            <div style={{
                display:"flex",
                flexDirection:"row",
                gap:"12px",
                alignItems:"center",
                borderBottom:"2px solid var(--nodius-primary-main)",
                paddingBottom:"12px"
            }}>
                <div style={{
                    background: "var(--nodius-primary-main)",
                    borderRadius: "8px",
                    padding: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                }}>
                    <Box height={24} width={24} color="white"/>
                </div>
                <div style={{display:"flex", flexDirection:"column"}}>
                    <h5 style={{fontSize:"18px", fontWeight:"600", margin:"0"}}>Components Library</h5>
                    <p style={{fontSize:"12px", opacity:"0.7", margin:"0"}}>Drag and drop to build your interface</p>
                </div>
            </div>

            {/* Info Card */}
            <div className={infoCardClass}>
                <div className="info-header">
                    <Info height={18} width={18}/>
                    <span>How to Use Components</span>
                </div>
                <div className="info-content">
                    Drag components from the library and drop them onto your canvas. Components can be nested and rearranged to create complex layouts.
                </div>
            </div>

            <hr/>

            {/* Search Bar */}
            <Input
                type={"text"}
                placeholder={"Search components..."}
                value={componentSearch}
                onChange={(value) => setComponentSearch(value)}
                startIcon={<Search height={18} width={18}/>}
            />

            {/* Components List */}
            <div style={{flex: 1, overflowY: "auto", paddingRight: "4px"}}>
                {filteredComponents ? (
                    <div style={{display:"flex", flexDirection:"column", gap:"20px"}}>
                        {Object.entries(filteredComponents).map(([category, components]) => (
                            <div style={{display:"flex", flexDirection: "column", gap:"12px"}} key={category}>
                                <div
                                    className={categoryHeaderClass}
                                    onClick={() => {
                                        if(hideCategory.includes(category)) {
                                            setHideCategory(hideCategory.filter(h => h !== category));
                                        } else {
                                            setHideCategory([...hideCategory, category]);
                                        }
                                    }}
                                >
                                    <h3 style={{flex:"1", fontSize:"16px", fontWeight:"600", margin:"0"}}>{category}</h3>
                                    <div style={{display:"flex", alignItems:"center", transition:"transform 0.2s", transform: hideCategory.includes(category) ? "rotate(180deg)" : "rotate(0deg)"}}>
                                        <ChevronDown height={20} width={20}/>
                                    </div>
                                </div>
                                <Collapse in={!hideCategory.includes(category)}>
                                    <div style={{display:"flex", flexDirection:"row", gap:"12px", flexWrap:"wrap", paddingTop:"4px"}}>
                                        {components.map((comp, i) => {
                                            const Icon = IconDict[comp.icon] as any;

                                            return (
                                                <div key={i}
                                                     className={componentCardClass}
                                                     data-builder-component={comp.object.name}
                                                     onMouseDown={(e) => onMouseDown(e, comp)}
                                                     title={`Drag to add ${comp.object.name}`}
                                                >
                                                    {Icon ? (
                                                        <Icon width={40} height={40} strokeWidth={1.5} color={"var(--nodius-primary-main)"} />
                                                    ) : <CloudAlert width={40} height={40} strokeWidth={1.5} color={"var(--nodius-text-secondary)"}/>}
                                                    <h5 style={{
                                                        fontSize:"13px",
                                                        fontWeight:"500",
                                                        color:"var(--nodius-text-primary)",
                                                        textAlign:"center",
                                                        margin:"0",
                                                        lineHeight:"1.3"
                                                    }}>
                                                        {comp.object.name}
                                                    </h5>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </Collapse>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{
                        padding:"32px",
                        textAlign:"center",
                        color:"var(--nodius-red-500)",
                        backgroundColor: Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.03),
                        borderRadius:"12px",
                        border:"2px dashed var(--nodius-red-500)"
                    }}>
                        <CloudAlert height={48} width={48} style={{margin:"0 auto 16px", opacity:0.6}}/>
                        <h5 style={{fontSize:"16px", fontWeight:"600", margin:"0 0 8px 0"}}>Error Loading Components</h5>
                        <p style={{fontSize:"14px", opacity:"0.8", margin:"0"}}>
                            An error occurred while retrieving components. Please try again.
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
});
LeftPanelComponentEditor.displayName = "LeftPaneComponentEditor";