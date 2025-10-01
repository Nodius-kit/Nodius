import {HtmlBuilderCategoryType, HtmlBuilderComponent, HtmlObject} from "../../../../utils/html/htmlType";
import {EditedHtmlType, UpdateHtmlOption} from "../../../main";
import {InstructionBuilder} from "../../../../utils/sync/InstructionBuilder";
import React, {CSSProperties, Fragment, memo, useCallback, useContext, useEffect, useMemo, useState} from "react";
import {ChevronDown, ChevronRight, CirclePlus, CloudAlert, DiamondPlus, ListTree, Plus} from "lucide-react";
import * as Icons from "lucide-react";
import {ThemeContext} from "../../../hooks/contexts/ThemeContext";
import {ObjectStorage} from "../../../../process/html/HtmlRender";
import {useElementSize} from "../../../hooks/useElementSize";
import {LinkedCard} from "../../form/LinkedCard";
import {LeftPanelComponentEditor} from "./LeftPanelComponentEditor";
import {searchElementWithIdentifier, travelObject} from "../../../../utils/html/htmlUtils";
import {deepCopy, disableTextSelection, enableTextSelection} from "../../../../utils/objectUtils";

interface LeftPaneComponentTreeProps {
    componentsList: Partial<Record<HtmlBuilderCategoryType, HtmlBuilderComponent[]>> | undefined,
    editedHtml: EditedHtmlType,
    updateHtml: (instructions:InstructionBuilder, options?:UpdateHtmlOption) => Promise<void>,
}

interface FlatNode {
    object: HtmlObject;
    depth: number;
    isHidden: boolean; // For quick check, though we'll filter them out
}

interface ComponentCardStockage {identifier:string, element:HTMLElement}

export const LeftPaneComponentTree = memo(({
   editedHtml,
   componentsList,
   updateHtml
} : LeftPaneComponentTreeProps) => {

    const Theme = useContext(ThemeContext);

    const [hoverIdentifier, setHoverIdentifier] = useState<string|undefined>(undefined);
    const [selectedIdentifier, setSelectedIdentifier] = useState<string|undefined>(undefined);
    const [hidedIdentifier, setHidedIdentifier] = useState<Set<string>>(new Set());

    const treeContainer = useElementSize();

    const onBuildingHover = (objectStorage?:ObjectStorage) => {
        setHoverIdentifier(objectStorage?.object.identifier);
    }

    const onBuildingSelect = (objectStorage?:ObjectStorage) => {
        setSelectedIdentifier(objectStorage?.object.identifier);
    }

    useEffect(() => {
        if(editedHtml) {
            editedHtml.htmlRender.addBuildingInteractEventMap("select", onBuildingSelect);
            editedHtml.htmlRender.addBuildingInteractEventMap("hover", onBuildingHover);
            return () => {
                editedHtml.htmlRender.removeBuildingInteractEventMap("select", onBuildingSelect);
                editedHtml.htmlRender.removeBuildingInteractEventMap("hover", onBuildingHover);
            }
        }
    }, [editedHtml]);

    const [showComponentCard, setShowComponentCard] = useState<ComponentCardStockage>();

    const closeLinkedCard = useCallback(() => {
        setShowComponentCard(undefined);
    }, []);

    const onPickup = useCallback((component:HtmlBuilderComponent) => {
        if(!editedHtml) return false;
        if(!showComponentCard) return false;

        let instruction = new InstructionBuilder();
        let object = searchElementWithIdentifier(showComponentCard.identifier, editedHtml.html.object, instruction);
        if(object) {
            if(object.type === "block") {
                instruction.key("content").set(deepCopy(component.object));
                updateHtml(instruction);
            } else if(object.type === "list") {
                instruction.key("content").arrayAdd(deepCopy(component.object));
                updateHtml(instruction);
            }
        }
        closeLinkedCard();
        return false;
    }, [editedHtml, updateHtml, closeLinkedCard, showComponentCard]);

    const flatNodes = useMemo(() => {
        const nodes: FlatNode[] = [];
        const traverse = (obj: HtmlObject, depth: number = 0) => {
            const isHidden = hidedIdentifier.has(obj.identifier);
            nodes.push({ object: obj, depth, isHidden });
            if (!isHidden) {
                if (obj.type === 'block' && obj.content) {
                    traverse(obj.content, depth + 1);
                } else if (obj.type === 'list' && obj.content) {
                    obj.content.forEach((child) => traverse(child, depth + 1));
                }
            }
        };
        if (editedHtml) {
            traverse(editedHtml.html.object);
        }
        return nodes.filter((node) => !node.isHidden); // Only visible nodes
    }, [editedHtml, hidedIdentifier]);

    return (
        <>
            <div style={{display:"flex", flexDirection:"row", gap:"10px",alignItems:"center", borderBottom:"2px solid var(--nodius-background-paper)", paddingBottom:"5px"}}>
                <ListTree height={26} width={26}/>
                <h5 style={{fontSize:"16px", fontWeight:"400"}}>Component Tree</h5>
            </div>
            <div ref={treeContainer.refCallBack} style={{flex:"1", width:"100%", height:"100%", position:"relative"}}>
                <div style={{position:"absolute", inset:"0", overflowX:"hidden"}}>
                    {flatNodes.map(({ object, depth }) => (
                        <TreeNode
                            key={object.identifier} // Unique key
                            object={object}
                            depth={depth}
                            componentsList={componentsList}
                            editedHtml={editedHtml}
                            updateHtml={updateHtml}
                            hoverIdentifier={hoverIdentifier}
                            setHoverIdentifier={setHoverIdentifier}
                            selectedIdentifier={selectedIdentifier}
                            setSelectedIdentifier={setSelectedIdentifier}
                            hidedIdentifier={hidedIdentifier}
                            setHidedIdentifier={setHidedIdentifier}
                            setShowComponentCard={setShowComponentCard}
                        />
                    ))}
                </div>
            </div>
            {showComponentCard ? (
                <LinkedCard
                    element={showComponentCard.element}
                    show={true}
                    width={300}
                    height={600}
                    placement="right"
                    offset={10}
                    background={true}
                    zIndex={10000000}
                    onClose={closeLinkedCard}
                    closeOnBackgroundClick={true}
                >
                    <div style={{display:"flex", width:"100%", height:"100%", flexDirection:"column", padding:"8px", gap:"12px", overflowY:"auto"}}>
                        <LeftPanelComponentEditor componentsList={componentsList} editedHtml={editedHtml} updateHtml={updateHtml} onPickup={onPickup}/>
                    </div>
                </LinkedCard>
            ) : null}

        </>
    )
})

interface TreeNodeProps {
    object: HtmlObject;
    depth: number;
    componentsList: Partial<Record<HtmlBuilderCategoryType, HtmlBuilderComponent[]>> | undefined;
    editedHtml: EditedHtmlType;
    updateHtml: (instructions: InstructionBuilder, options?: UpdateHtmlOption) => Promise<void>;
    hoverIdentifier: string | undefined;
    setHoverIdentifier: React.Dispatch<React.SetStateAction<string | undefined>>;
    selectedIdentifier: string | undefined;
    setSelectedIdentifier: React.Dispatch<React.SetStateAction<string | undefined>>;
    hidedIdentifier: Set<string>; // Change to Set for performance
    setHidedIdentifier: React.Dispatch<React.SetStateAction<Set<string>>>;
    setShowComponentCard:(value:ComponentCardStockage) => void
}

const IconDict = Object.fromEntries(Object.entries(Icons));

const TreeNode = memo(({ object, depth, ...props }: TreeNodeProps) => {
    const { componentsList, editedHtml, updateHtml, hoverIdentifier, setHoverIdentifier, selectedIdentifier, setSelectedIdentifier, hidedIdentifier, setHidedIdentifier } = props;
    const Theme = useContext(ThemeContext);

    // Stabilize handlers with useCallback
    const onMouseEnter = useCallback((evt: React.MouseEvent) => {
        evt.stopPropagation();
        setHoverIdentifier(object.identifier);
        editedHtml?.htmlRender.pushBuildingInteractEvent('hover', object.identifier);
    }, [editedHtml, object.identifier, setHoverIdentifier]);

    const onMouseLeave = useCallback((evt: React.MouseEvent) => {
        evt.stopPropagation();
        setHoverIdentifier(undefined);
        editedHtml?.htmlRender.pushBuildingInteractEvent('hover', undefined);
    }, [editedHtml, setHoverIdentifier]);

    const onClick = useCallback((evt: React.MouseEvent) => {
        evt.stopPropagation();
        setSelectedIdentifier(object.identifier);
        editedHtml?.htmlRender.pushBuildingInteractEvent('select', object.identifier);
    }, [editedHtml, object.identifier, setSelectedIdentifier]);

    const onMouseDown = useCallback((evt: React.MouseEvent) => {
        evt.stopPropagation();

        const refElement = document.querySelector("[data-tree-object-name='"+object.identifier+"']") as HTMLElement;
        if(!refElement) return;

        const rect = refElement.getBoundingClientRect();

        const element = document.createElement("div");
        element.style.position = "absolute";

        const paddingTop = 5;
        const paddingLeft = 10;

        const width = rect.width + paddingLeft*2;
        const height = rect.height + paddingTop*2;

        element.style.padding = `${paddingTop}px ${paddingLeft}px`;
        element.style.width = `${width}px`;
        element.style.height = `${height}px`;
        element.style.zIndex = "10000001";
        element.style.borderRadius = "8px";
        element.style.border = "2px solid var(--nodius-background-paper)";
        element.style.backgroundColor = "var(--nodius-background-default)";
        element.style.display = "flex";
        element.style.justifyContent = "center";
        element.style.alignItems = "center";
        element.style.flexDirection = "row";
        element.style.gap = "8px";
        element.innerHTML = refElement.innerHTML;
        for(let i = 0; i < element.children.length; i++) {
            if(i > 1) {
                element.children[i].remove(); // keep only svg and title
            }
        }

        const placeElement = (clientX:number, clientY:number) => {
            element.style.left = (clientX-width/2)+"px";
            element.style.top = (clientY+2)+"px";
        }

        disableTextSelection();

        placeElement(evt.clientX, evt.clientY);

        let lastX = evt.clientX;
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
            element.style.transform = `rotate(${rotationAngle}deg)`;
            animationId = requestAnimationFrame(whileSwingAnimation);
        }

        animationId = requestAnimationFrame(whileSwingAnimation);
        const onMouseMove = (evt:MouseEvent) => {
            if(!Array.from(document.body.childNodes).some(node => node === element)) {
                document.body.appendChild(element);
            }

            placeElement(evt.clientX, evt.clientY);
            velocityX = evt.clientX - lastX;
            lastX = evt.clientX;
            velocityXAdd += velocityX;
        }

        const onMouseUp = async (evt:MouseEvent) => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            window.removeEventListener("mouseleave", onMouseUp);
            cancelAnimationFrame(animationId);
            enableTextSelection();
            element.remove();

            if(!editedHtml) return;

            const hoverElements = document.elementsFromPoint(evt.clientX, evt.clientY) as HTMLElement[];
            const hoverElement = hoverElements.find((el) => el.getAttribute("data-tree-object") != undefined);
            if(hoverElement && hoverElement.getAttribute("data-tree-object") != undefined) {
                const identifier = hoverElement.getAttribute("data-tree-object")!;
                if(identifier === object.identifier) {
                    return;
                }
                if(!travelObject(object, (obj) => {
                    return identifier !== obj.identifier;
                })) {
                    return;
                }

                const instructionTo = new InstructionBuilder(); // get path of the destinated object
                let objectTo = searchElementWithIdentifier(identifier, editedHtml.html.object, instructionTo);

                const instructionFrom = new InstructionBuilder(); // get path of the current object
                let objectFrom = searchElementWithIdentifier(object.identifier, editedHtml.html.object, instructionFrom);
                if(objectTo && objectFrom && objectFrom.identifier == object.identifier) {
                    if(objectTo.type === "block" && objectTo.content === undefined) {
                        instructionFrom.objectMove(instructionTo.key("content").instruction.p!);
                        await updateHtml(instructionFrom);
                    } else if(objectTo.type === "list") {
                        instructionFrom.objectInsert(instructionTo.key("content").instruction.p!);
                        await updateHtml(instructionFrom);
                    }
                    editedHtml.htmlRender.clearBuildingOverlay();
                }
            }

        }

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        window.addEventListener("mouseleave", onMouseUp);
    }, [editedHtml, object.identifier, updateHtml]); // Add dependencies

    const toggleHide = useCallback((evt: React.MouseEvent) => {
        evt.stopPropagation();
        const newSet = new Set(hidedIdentifier);
        if (newSet.has(object.identifier)) {
            newSet.delete(object.identifier);
        } else {
            newSet.add(object.identifier);
        }
        setHidedIdentifier(newSet);
    }, [hidedIdentifier, object.identifier, setHidedIdentifier]);


    const canHaveChild = (object.type === "block" && object.content == undefined) || object.type === "list";

    const hoverStyle: CSSProperties = hoverIdentifier === object.identifier ? { backgroundColor: Theme.state.changeOpacity(Theme.state.secondary[Theme.state.theme].light, 0.5) } : {};
    const selectedStyle: CSSProperties = selectedIdentifier === object.identifier ? { backgroundColor: Theme.state.changeOpacity(Theme.state.secondary[Theme.state.theme].main, 0.3) } : {};

    let Icon = undefined;
    for(const components of Object.values(componentsList ?? {})) {
        const component = components.find((c) => c.object.name === object.name);
        if(component) {
            Icon = IconDict[component.icon] as any;
            break;
        }
    }

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'row',
                paddingLeft: '8px',
                width: '100%',
            }}
            data-tree-object={object.identifier}
            data-depth={depth}
        >
            {Array.from({length: depth}).map((_, i) => (
                <div key={i} style={{
                    minWidth: "10px",
                    maxWidth: "10px",
                    borderLeft: `1px solid ${Theme.state.changeOpacity(Theme.state.text[Theme.state.theme].secondary, 0.3)}`
                }}/>
            ))}
            <div style={{ width: '100%', position: 'relative' }}>
                <div
                    style={{ display: 'flex', flexDirection: 'row', gap: '5px', marginLeft: '-2px', cursor: 'pointer', padding: '2px 0px' }}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    onMouseDown={onMouseDown}
                    onClick={onClick}
                >
                    <div style={{display:"flex", flexDirection:"row", gap:"5px"}} data-tree-object-name={object.identifier}>
                        {Icon ? (
                            <Icon width={24} height={24} strokeWidth={1} color={"var(--nodius-text-secondary)"} />
                        ) : <CloudAlert width={24} height={24} strokeWidth={1} color={"var(--nodius-text-secondary)"}/>}

                        <h5 style={{fontWeight:"400", fontSize:"16px"}} color={"var(--nodius-text-secondary)"}>{object.name}</h5>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'row', justifyContent: 'right', gap: '6px', alignItems: 'center' }}>
                        {canHaveChild && <CirclePlus height={22} width={22} strokeWidth={1} onClick={(evt) => {
                            evt.stopPropagation();
                            props.setShowComponentCard({identifier: object.identifier, element:evt.target as HTMLElement});
                        }} />}
                        {hidedIdentifier.has(object.identifier) ? (
                            <ChevronRight width={16} height={16} onClick={toggleHide} />
                        ) : (
                            <ChevronDown width={16} height={16} onClick={toggleHide} />
                        )}
                    </div>
                </div>
                <div
                    style={{
                        position: 'absolute',
                        pointerEvents: 'none',
                        backgroundColor: Theme.state.changeOpacity(Theme.state.secondary[Theme.state.theme].light, 0.15),
                        borderRadius: '6px',
                        left: '-8px',
                        top: 0,
                        height: '100%',
                        width: 'calc(100% + 7px)',
                        display: hoverIdentifier === object.identifier ? 'block' : 'none',
                    }}
                />
            </div>
            <div
                style={{ position: 'absolute', left: 0, width: depth * 9 + 7, height: '28px', cursor: 'pointer' }}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onMouseDown={onMouseDown}
                onClick={onClick}
            />
            <div style={{ position: 'absolute', left: 0, pointerEvents: 'none', width: '100%', height: '28px', borderRadius: '6px', ...hoverStyle, ...selectedStyle }} />
        </div>
    );
});