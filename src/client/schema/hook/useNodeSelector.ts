import {useStableProjectRef} from "../../hooks/useStableProjectRef";
import {useRef} from "react";
import {deepEqual} from "../../../utils/objectUtils";

export const useNodeSelector = () => {

    const projectRef = useStableProjectRef();

    const selectorContainer = useRef<{eventContainer:HTMLElement, drawingContainer:HTMLElement}>(undefined);
    const selectingState = useRef<{isSelecting:boolean, startX: number, startY:number, endX:number, endY:number, rect?:HTMLElement}>({isSelecting:false, startX: 0, startY:0, endX:0, endY:0, rect:undefined})


    const mouseDown = (e:MouseEvent) => {
        if(e.button !== 0) return;
        const element = document.elementFromPoint(e.clientX, e.clientY);
        if(!element || element.tagName.toLowerCase() !== "canvas") {
            return;
        }

        selectingState.current.isSelecting = true;
        selectingState.current.startX = e.clientX;
        selectingState.current.startY = e.clientY;
        selectingState.current.endX = e.clientX;
        selectingState.current.endY = e.clientY;


        selectingState.current.rect?.remove();
        selectingState.current.rect = document.createElement("div");
        selectingState.current.rect.style.position = "absolute";
        selectingState.current.rect.style.pointerEvents = "none";
        selectingState.current.rect.style.border = "1px solid var(--nodius-primary-main)";
        selectingState.current.rect.style.top = "-100px";
        selectingState.current.rect.style.left = "-100px";
        selectingState.current.rect.style.width = "0px";
        selectingState.current.rect.style.height = "0px";

        let previousSelectedNode:string[] = [];
        let previousSelectedEdge:string[] = [];

        const mouseMove = (e:MouseEvent) => {
            if(selectingState.current.isSelecting && selectingState.current.rect) {

                selectingState.current.endX = e.clientX;
                selectingState.current.endY = e.clientY;

                const isFartherThan = (x1: number, y1: number, x2: number, y2: number, distance: number) => {
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const distSquared = dx * dx + dy * dy;
                    return distSquared > distance * distance;
                }
                if (!selectingState.current.rect.parentElement && isFartherThan(selectingState.current.startX, selectingState.current.startY, selectingState.current.endX, selectingState.current.endY, 5)) {
                    selectorContainer.current!.drawingContainer.appendChild(selectingState.current.rect!);
                }

                if (selectingState.current.rect.parentElement) {
                    selectingState.current.endX = e.clientX;
                    selectingState.current.endY = e.clientY;

                    const minX = Math.min(selectingState.current.endX, selectingState.current.startX);
                    const minY = Math.min(selectingState.current.endY, selectingState.current.startY);

                    const maxX = Math.max(selectingState.current.endX, selectingState.current.startX);
                    const maxY = Math.max(selectingState.current.endY, selectingState.current.startY);

                    const worldMin = projectRef.current.state.getMotor().screenToWorld({
                        x: minX,
                        y: minY
                    });
                    const worldMax = projectRef.current.state.getMotor().screenToWorld({
                        x: maxX,
                        y: maxY
                    });

                    const newSelectedNode: string[] = [];
                    const newSelectedEdge: string[] = [];
                    for (const [key, node] of projectRef.current.state.graph!.sheets[projectRef.current.state.selectedSheetId!].nodeMap.entries()) {
                        if (node.posX > worldMin.x && node.posY > worldMin.y && node.posX + node.size.width < worldMax.x && node.posY + node.size.height < worldMax.y) {
                            newSelectedNode.push(key);
                        }
                    }
                    for (const selectedNode of newSelectedNode) {
                        const node = projectRef.current.state.graph!.sheets[projectRef.current.state.selectedSheetId!].nodeMap.get(selectedNode)!;
                        const edgesTarget = projectRef.current.state.graph!.sheets[projectRef.current.state.selectedSheetId!].edgeMap.get("target-" + node._key) ?? [];
                        const edgesSource = projectRef.current.state.graph!.sheets[projectRef.current.state.selectedSheetId!].edgeMap.get("source-" + node._key) ?? [];
                        for (const edgeTarget of edgesTarget) {
                            if (newSelectedNode.some((n) => n === edgeTarget.source) && !newSelectedEdge.includes(edgeTarget._key)) {
                                newSelectedEdge.push(edgeTarget._key);
                            }
                        }
                        for (const edgeSource of edgesSource) {
                            if (newSelectedNode.some((n) => n === edgeSource.source) && !newSelectedEdge.includes(edgeSource._key)) {
                                newSelectedEdge.push(edgeSource._key);
                            }
                        }
                    }


                    if(!deepEqual(newSelectedNode, previousSelectedNode)) {
                        projectRef.current.dispatch({
                            field: "selectedNode",
                            value: newSelectedNode
                        });
                    }
                    if(!deepEqual(newSelectedEdge, previousSelectedEdge)) {
                        projectRef.current.dispatch({
                            field: "selectedEdge",
                            value: newSelectedEdge
                        });
                        projectRef.current.state.getMotor().setSelectedEdges(newSelectedEdge);
                    }


                    previousSelectedNode = newSelectedNode;
                    previousSelectedEdge = newSelectedEdge;

                    // Get container offset to convert clientX/Y to container-relative coordinates
                    const containerRect = selectorContainer.current!.drawingContainer.getBoundingClientRect();

                    const left = minX - containerRect.left;
                    const top = minY - containerRect.top;
                    const width = maxX - minX;
                    const height = maxY - minY;

                    selectingState.current.rect.style.left = left + "px";
                    selectingState.current.rect.style.top = top + "px";
                    selectingState.current.rect.style.width = width + "px";
                    selectingState.current.rect.style.height = height + "px";
                }
            }
        }

        const mouseUp = (e:MouseEvent) => {
            if(selectingState.current.isSelecting && selectingState.current.rect) {
                selectingState.current.isSelecting = false;
                if(!selectingState.current.rect.parentElement) {
                    // it mean it didn't to a selection, only a click
                    projectRef.current.dispatch({
                        field: "selectedNode",
                        value: []
                    });
                    projectRef.current.dispatch({
                        field: "selectedEdge",
                        value: []
                    });
                    projectRef.current.state.getMotor().setSelectedEdges([]);

                    if(projectRef.current.state.editedHtml) {
                        projectRef.current.state.editedHtml.htmlRenderContext.htmlRender.getSelectedObject()
                    }
                } else {
                    selectingState.current.rect.remove();
                }
            }
            if(selectorContainer.current) {
                selectorContainer.current.eventContainer.removeEventListener("mousemove", mouseMove);
                selectorContainer.current.eventContainer.removeEventListener("mouseup", mouseUp);
            }
        }
        selectorContainer.current!.eventContainer.addEventListener("mousemove", mouseMove);
        selectorContainer.current!.eventContainer.addEventListener("mouseup", mouseUp);
    }



    const initSelectorContainer = (eventContainer:HTMLElement, drawingContainer:HTMLElement) => {
        if(selectorContainer.current) {
            deInitSelectorContainer();
        }

        selectorContainer.current = {
            drawingContainer: drawingContainer,
            eventContainer: eventContainer,
        }
        selectorContainer.current!.eventContainer.addEventListener("mousedown", mouseDown);
    }

    const deInitSelectorContainer = () => {
        selectorContainer.current?.eventContainer?.removeEventListener("mousedown", mouseDown);
    }


    return {
        initSelectorContainer,
        deInitSelectorContainer
    }
}