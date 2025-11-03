/**
 * @file EventsEditor.tsx
 * @description DOM event editor components for handling user interactions
 * @module dashboard/Editor/RightPanelStyleEditor
 *
 * Components:
 * - **EventEditor**: Individual DOM event handler editor
 * - **EventsEditor**: Main container managing all event handlers
 *
 * Features:
 * - Switch between code editor and node-based workflow
 * - Create handle points for visual workflow connections
 * - Direct code editing with syntax highlighting
 */

import {memo, useContext, useState} from "react";
import {ChevronDown, ChevronRight, Plus, Trash2} from "lucide-react";
import {HTMLDomEvent} from "../../../../../utils/html/htmlType";
import {InstructionBuilder} from "../../../../../utils/sync/InstructionBuilder";
import {ThemeContext} from "../../../../hooks/contexts/ThemeContext";
import {ProjectContext} from "../../../../hooks/contexts/ProjectContext";
import {useDynamicClass} from "../../../../hooks/useDynamicClass";
import {Collapse} from "../../../animate/Collapse";
import {generateUniqueHandlePointId} from "../../../../schema/hooks/useHandleRenderer";
import {getHandlePosition} from "../../../../schema/motor/webGpuMotor/handleUtils";
import {EventEditorProps, EventsEditorProps} from "./types";

// ============================================================================
// EVENT EDITOR
// ============================================================================

/**
 * Individual event editor
 */
export const EventEditor = memo(({ event, index, baseInstruction, onUpdate, getMotor, selectedIdentifier }: EventEditorProps) => {
    const Theme = useContext(ThemeContext);
    const Project = useContext(ProjectContext);
    const [isExpanded, setIsExpanded] = useState(true);

    const eventContainerClass = useDynamicClass(`
        & {
            border-radius: 10px;
            border: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.02)};
            box-shadow: var(--nodius-shadow-1);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transition: var(--nodius-transition-default);
        }
        &:hover {
            box-shadow: var(--nodius-shadow-2);
        }
    `);

    const eventHeaderClass = useDynamicClass(`
        & {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.06)};
            padding: 8px 12px;
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.08)};
        }
        & .chevron {
            cursor: pointer;
            transition: transform 0.2s;
            color: var(--nodius-text-primary);
        }
        & .chevron:hover {
            color: var(--nodius-text-primary);
        }
        & .event-type {
            font-weight: 600;
            color: var(--nodius-primary-main);
            background-color: ${Theme.state.changeOpacity(Theme.state.primary[Theme.state.theme].main, 0.1)};
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 13px;
        }
        & .delete-btn {
            cursor: pointer;
            transition: all 0.2s;
            margin-left: auto;
        }
        & .delete-btn:hover {
            transform: scale(1.1);
        }
    `);

    const eventContentClass = useDynamicClass(`
        & {
            padding: 12px;
        }
        & > div {
            width: 100%;
            min-height: 150px;
            padding: 12px;
            border: 1px solid var(--nodius-background-paper);
            border-radius: 8px;
            background-color: var(--nodius-background-default);
            color: var(--nodius-text-primary);
            font-family: 'Fira Code', monospace;
            font-size: 13px;
        }
        & > div:focus {
            outline: none;
            border-color: var(--nodius-primary-main);
        }
    `);

    const deleteEvent = async () => {
        const newInstruction = baseInstruction.clone();
        newInstruction.key("domEvents").arrayRemoveIndex(index);
        await onUpdate(newInstruction);
    };

    const editInCodeEditor = () => {
        if(!Project.state.editedHtml) return;
        let nodeId:string|undefined = undefined;
        if(Project.state.editedHtml.targetType === "node") {
            nodeId = Project.state.editedHtml.target._key;
        } else {
            nodeId = "0";
        }

        if(!nodeId) return;

        const newInstruction = baseInstruction.clone();
        newInstruction.key("domEvents").index(index).key("call");
        Project.dispatch({
            field: "editedCode",
            value: [...Project.state.editedCode, {
                nodeId: nodeId,
                title: event.name,
                path: [...Project.state.editedHtml.pathOfRender, ...newInstruction.instruction.p!],
                baseText: event.call
            }]
        });
    }

    const switchToNode = async () => {
        if(!Project.state.editedHtml||!Project.state.graph||!Project.state.selectedSheetId||!Project.state.updateGraph) return;
        let nodeId:string|undefined = undefined;
        if(Project.state.editedHtml.targetType === "node") {
            nodeId = Project.state.editedHtml.target._key;
        } else {
            nodeId = "0";
        }

        if(!nodeId) return;

        let node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(nodeId);
        if(!node) return;

        const handlePointId = generateUniqueHandlePointId(node);
        const instructionHandle = new InstructionBuilder();
        instructionHandle.key("handles").key("R");
        if(!node.handles["R"]) {
            instructionHandle.set({
                position: "separate",
                point: [{
                    type: "out",
                    id:handlePointId,
                    accept: "HtmlEvent",
                    display: "",
                    linkedHtmlId: selectedIdentifier
                }]
            });
        } else {
            instructionHandle.key("point").arrayAdd({
                type: "out",
                id:handlePointId,
                accept: "HtmlEvent",
                display: "",
                linkedHtmlId: selectedIdentifier
            });
        }
        const output = await Project.state.updateGraph([{
            nodeId: nodeId,
            i: instructionHandle.instruction,
        }]);
        if(output.status) {

            const newInstruction = baseInstruction.clone();
            newInstruction.key("domEvents").index(index).key("call").set("[!]CALL-HANDLE-"+handlePointId);
            await onUpdate(newInstruction);

            let node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(nodeId);
            if(!node) return;

            const handleInfoPoint = getHandlePosition(node, handlePointId);
            console.log(handleInfoPoint);
            if(!handleInfoPoint) return;
            getMotor()!.smoothFitToArea({
               maxX: handleInfoPoint.x+20,
                minX: handleInfoPoint.x-20,
                maxY: handleInfoPoint.y+20,
                minY: handleInfoPoint.y-20
            }, {
                duration: 1000,
                padding: 200
            });
        }

    }

    const switchToCode = async () => {
        if(!Project.state.editedHtml||!Project.state.graph||!Project.state.selectedSheetId||!Project.state.updateGraph) return;

        let nodeId:string|undefined = undefined;
        if(Project.state.editedHtml.targetType === "node") {
            nodeId = Project.state.editedHtml.target._key;
        } else {
            nodeId = "0";
        }

        if(!nodeId) return;

        const node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(nodeId);
        if(!node) return;


        const handlePointId = event.call.substring("[!]CALL-HANDLE-".length);
        const handlePointIndex = node.handles["R"]!.point.findIndex((p) => p.id === handlePointId);
        if(handlePointIndex === -1) return;

        const instructionHandle = new InstructionBuilder();
        instructionHandle.key("handles").key("R").key("point").arrayRemoveIndex(handlePointIndex);
        const output = await Project.state.updateGraph([{
            nodeId: nodeId,
            i: instructionHandle.instruction,
        }]);
        if(output.status) {

            const newInstruction = baseInstruction.clone();
            newInstruction.key("domEvents").index(index).key("call").set("");
            await onUpdate(newInstruction);
        }
    }

    return (
        <div className={eventContainerClass}>
            <div className={eventHeaderClass}>
                {isExpanded ? (
                    <ChevronDown height={20} width={20} className="chevron" onClick={() => setIsExpanded(false)} />
                ) : (
                    <ChevronRight height={20} width={20} className="chevron" onClick={() => setIsExpanded(true)} />
                )}
                <span className="event-type">on{event.name}</span>
                <Trash2 height={18} width={18} color={"var(--nodius-red-500)"} onClick={deleteEvent} className="delete-btn"/>
            </div>
            <Collapse in={isExpanded}>
                <div className={eventContentClass}>
                    {event.call.startsWith("[!]CALL-HANDLE-") ? (
                        <button onClick={switchToCode}>Switch to code editor</button>
                    ) : (
                        <>
                            <button onClick={editInCodeEditor}>Edit in code editor</button>
                            <button onClick={switchToNode}>Switch to node</button>
                        </>
                    )}
                </div>
            </Collapse>
        </div>
    );
});
EventEditor.displayName = 'EventEditor';

// ============================================================================
// EVENTS EDITOR MAIN
// ============================================================================

/**
 * Events Editor - Manages all DOM events
 */
export const EventsEditor = memo(({ events, onUpdate, getMotor, selectedIdentifier }: EventsEditorProps) => {
    const Theme = useContext(ThemeContext);

    const newEventButtonClass = useDynamicClass(`
        & {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 8px;
            border: 2px dashed ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.2)};
            padding: 12px;
            cursor: pointer;
            border-radius: 10px;
            transition: var(--nodius-transition-default);
            background-color: transparent;
            font-weight: 500;
            font-size: 14px;
            color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.5)};
        }
        &:hover {
            border-color: var(--nodius-primary-main);
            background-color: ${Theme.state.changeOpacity(Theme.state.primary[Theme.state.theme].main, 0.08)};
            color: var(--nodius-primary-main);
        }
        & svg {
            transition: transform 0.2s;
        }
        &:hover svg {
            transform: scale(1.1);
        }
    `);

    const newEvent = async () => {
        const emptyEvent: HTMLDomEvent<"click"> = {
            name: "click",
            call: ""
        };
        const newInstruction = events.instruction.clone();
        newInstruction.key("domEvents").arrayAdd(emptyEvent);
        await onUpdate(newInstruction);
    };

    return (
        <div style={{width: "100%", height: "100%", padding: "8px 0", display: "flex", flexDirection: "column", gap: "16px"}}>
            {events.events.map((event, i) => (
                <EventEditor
                    key={i}
                    event={event}
                    index={i}
                    baseInstruction={events.instruction}
                    onUpdate={onUpdate}
                    getMotor={getMotor}
                    selectedIdentifier={selectedIdentifier}
                />
            ))}
            <div className={newEventButtonClass} onClick={newEvent}>
                <Plus height={20} width={20}/>
                <span>Add Event Handler</span>
            </div>
        </div>
    );
});
EventsEditor.displayName = 'EventsEditor';
