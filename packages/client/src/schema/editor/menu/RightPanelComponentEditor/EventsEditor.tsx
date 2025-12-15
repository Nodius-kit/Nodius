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
import {ChevronDown, ChevronRight, Plus, Trash2, Code2, Workflow, Edit3} from "lucide-react";
import {HTMLDomEvent, HTMLWorkflowEvent} from "@nodius/utils";
import {Instruction, InstructionBuilder} from "@nodius/utils";
import {ThemeContext} from "../../../../hooks/contexts/ThemeContext";
import {ProjectContext} from "../../../../hooks/contexts/ProjectContext";
import {useDynamicClass} from "../../../../hooks/useDynamicClass";
import {CurrentEditObject} from "../RightPanelComponentEditor";
import {useStableProjectRef} from "../../../../hooks/useStableProjectRef";
import {deepCopy} from "@nodius/utils";
import {generateUniqueHandlePointId} from "../../../hook/useHandleRenderer";
import {getHandlePosition} from "@nodius/utils";
import {EditableDiv} from "../../../../component/form/EditableDiv";
import {Collapse} from "../../../../component/animate/Collapse";
import {domEventEditorDefinitions} from "../../codeEditorVariableDefinitions";


// Common DOM event types
const COMMON_DOM_EVENTS = [
    "click", "dblclick", "mousedown", "mouseup", "mousemove", "mouseenter", "mouseleave", "mouseover", "mouseout",
    "keydown", "keyup", "keypress",
    "focus", "blur", "focusin", "focusout",
    "input", "change", "submit",
    "scroll", "resize",
    "load", "unload",
    "drag", "dragstart", "dragend", "dragenter", "dragleave", "dragover", "drop",
    "touchstart", "touchmove", "touchend", "touchcancel"
];

// ============================================================================
// EVENT EDITOR
// ============================================================================


export interface EventEditorProps {
    event: HTMLDomEvent<keyof HTMLElementEventMap | typeof HTMLWorkflowEvent[number]>;
    index: number;
    baseInstruction: Instruction;
    onUpdate: (instr: Instruction | Instruction[]) => Promise<boolean>;
    object: CurrentEditObject;
}

export interface EventsEditorProps {
    object: CurrentEditObject;
    onUpdate: (instr: Instruction | Instruction[]) => Promise<boolean>;
}


/**
 * Individual event editor
 */
export const EventEditor = memo(({ event, index, baseInstruction, onUpdate, object }: EventEditorProps) => {
    const Theme = useContext(ThemeContext);
    const Project = useContext(ProjectContext);
    const projectRef = useStableProjectRef();
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
            padding: 12px;
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.08)};
        }
        & .chevron {
            cursor: pointer;
            transition: transform 0.2s;
            color: var(--nodius-text-secondary);
            flex-shrink: 0;
        }
        & .chevron:hover {
            color: var(--nodius-text-primary);
        }
        & .event-type-container {
            display: flex;
            align-items: center;
            gap: 6px;
            flex: 1;
        }
        & .event-type-label {
            font-size: 12px;
            font-weight: 600;
            color: var(--nodius-text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            flex-shrink: 0;
        }
        & .delete-btn {
            cursor: pointer;
            transition: all 0.2s;
            flex-shrink: 0;
            padding: 4px;
            border-radius: 6px;
        }
        & .delete-btn:hover {
            background-color: ${Theme.state.changeOpacity(Theme.state.error[Theme.state.theme].main, 0.1)};
            transform: scale(1.05);
        }
    `);

    const eventContentClass = useDynamicClass(`
        & {
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
    `);

    const actionButtonsClass = useDynamicClass(`
        & {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
    `);

    const actionButtonClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            border: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.2)};
            border-radius: 8px;
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.03)};
            color: var(--nodius-text-primary);
            cursor: pointer;
            transition: var(--nodius-transition-default);
            font-size: 13px;
            font-weight: 500;
            flex: 1;
            min-width: 140px;
            justify-content: center;
        }
        &:hover {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.08)};
            border-color: var(--nodius-primary-main);
            transform: translateY(-1px);
            box-shadow: var(--nodius-shadow-1);
        }
        &:active {
            transform: translateY(0);
        }
        &.primary {
            background-color: ${Theme.state.changeOpacity(Theme.state.primary[Theme.state.theme].main, 0.15)};
            border-color: var(--nodius-primary-main);
            color: var(--nodius-primary-main);
        }
        &.primary:hover {
            background-color: ${Theme.state.changeOpacity(Theme.state.primary[Theme.state.theme].main, 0.25)};
        }
        &.secondary {
            background-color: ${Theme.state.changeOpacity(Theme.state.secondary[Theme.state.theme].main, 0.15)};
            border-color: var(--nodius-secondary-main);
            color: var(--nodius-secondary-main);
        }
        &.secondary:hover {
            background-color: ${Theme.state.changeOpacity(Theme.state.secondary[Theme.state.theme].main, 0.25)};
        }
    `);

    const deleteEvent = async () => {
        if(!Project.state.graph || !Project.state.selectedSheetId) return;
        if(event.call.startsWith("[!]CALL-HANDLE-")) {
            const handlePointId = event.call.substring("[!]CALL-HANDLE-".length);
            // remove edge

            let nodeId = Project.state.editedHtml?.htmlRenderContext.nodeId;

            if(!nodeId) return;

            const node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(nodeId);
            if(!node) return;

            const edge = Project.state.graph.sheets[Project.state.selectedSheetId].edgeMap.get("source-"+node._key) ?? [];
            const toRemoveEdgeId = edge.filter((e) => e.sourceHandle === handlePointId).map((e) => e._key);
            if(toRemoveEdgeId.length > 0) {
                const output = await Project.state.batchDeleteElements!([], toRemoveEdgeId);
                if(!output.status) {
                    return;
                }
            }
        }

        const newInstruction = new InstructionBuilder(baseInstruction);
        newInstruction.key("domEvents").arrayRemoveIndex(index);
        await onUpdate(newInstruction.instruction);
    };

    const updateEventName = async (newName: string) => {
        const newInstruction = new InstructionBuilder(baseInstruction);
        newInstruction.key("domEvents").index(index).key("name").set(newName);
        await onUpdate(newInstruction.instruction);
    };

    const editInCodeEditor = () => {
        if(!Project.state.editedHtml) return;
        let nodeId = Project.state.editedHtml?.htmlRenderContext.nodeId;

        if(!nodeId) return;


        const newInstruction = new InstructionBuilder(baseInstruction);
        newInstruction.key("domEvents").index(index).key("call");
        Project.dispatch({
            field: "editedCode",
            value: [...Project.state.editedCode.filter((e) => e.nodeId !== nodeId && e.title !== event.name), {
                nodeId: nodeId,
                title: event.name,
                onChange: async (instructions) => {
                    const clonedInstructions = deepCopy(Array.isArray(instructions) ? instructions : [instructions]);
                    for(const instruction of clonedInstructions) {
                        instruction.p = [...newInstruction.instruction.p??[]]
                    }
                    return onUpdate(clonedInstructions)
                },
                retrieveText: (node) => {
                    let object = projectRef.current.state.editedHtml?.htmlRenderContext.retrieveHtmlObject(node) as any;
                    if(!object) {
                        projectRef.current.dispatch({
                            field: "editedCode",
                            value: projectRef.current.state.editedCode.filter((e) => e.nodeId !== nodeId)
                        });
                    }
                    for(const path of newInstruction.instruction.p ?? []) {
                        object = object[path];
                    }
                    return object;
                },
                variableDefinitions: domEventEditorDefinitions
            }]
        });
    }

    const switchToNode = async () => {
        if(!Project.state.editedHtml||!Project.state.graph||!Project.state.selectedSheetId||!Project.state.updateGraph) return;
        let nodeId = Project.state.editedHtml?.htmlRenderContext.nodeId;


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
                    linkedHtmlId: object.object.identifier
                }]
            });
        } else {
            instructionHandle.key("point").arrayAdd({
                type: "out",
                id:handlePointId,
                accept: "HtmlEvent",
                display: "",
                linkedHtmlId: object.object.identifier
            });
        }
        const output = await Project.state.updateGraph([{
            nodeId: nodeId,
            i: instructionHandle.instruction,
        }]);
        if(output.status) {

            const newInstruction = new InstructionBuilder(baseInstruction);
            newInstruction.key("domEvents").index(index).key("call").set("[!]CALL-HANDLE-"+handlePointId);
            await onUpdate(newInstruction.instruction);

            let node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(nodeId);
            if(!node) return;

            const handleInfoPoint = getHandlePosition(node, handlePointId);
            if(!handleInfoPoint) return;
            projectRef.current.state.getMotor().smoothFitToArea({
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

        let nodeId = Project.state.editedHtml?.htmlRenderContext.nodeId;

        if(!nodeId) return;

        const node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(nodeId);
        if(!node) return;


        const handlePointId = event.call.substring("[!]CALL-HANDLE-".length);
        const handlePointIndex = node.handles["R"]!.point.findIndex((p) => p.id === handlePointId);
        if(handlePointIndex === -1) return;

        const instructionHandle = new InstructionBuilder();
        instructionHandle.key("handles").key("R").key("point").arrayRemoveIndex(handlePointIndex);


        // remove edge
        const edge = Project.state.graph.sheets[Project.state.selectedSheetId].edgeMap.get("source-"+node._key) ?? [];
        const toRemoveEdgeId = edge.filter((e) => e.sourceHandle === handlePointId).map((e) => e._key);
        if(toRemoveEdgeId.length > 0) {
            const output = await Project.state.batchDeleteElements!([], toRemoveEdgeId);
            if(!output.status) {
                return;
            }
        }



        // remove handle
        const output = await Project.state.updateGraph([{
            nodeId: nodeId,
            i: instructionHandle.instruction,
        }]);


        if(output.status) {

            const newInstruction = new InstructionBuilder(baseInstruction);
            newInstruction.key("domEvents").index(index).key("call").set("");
            await onUpdate(newInstruction.instruction);
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
                <div className="event-type-container">
                    <span className="event-type-label">on</span>
                    <div style={{flex:"1"}}>
                        <EditableDiv
                            value={event.name}
                            removeSpecialChar={true}
                            disableNewlines={true}
                            completion={COMMON_DOM_EVENTS}
                            onChange={updateEventName}
                            placeholder="event name"
                            style={{
                                width:"100%",
                                padding: "6px 12px",
                                border: "1px solid var(--nodius-background-paper)",
                                borderRadius: "6px",
                                backgroundColor: "var(--nodius-background-default)",
                                color: "var(--nodius-primary-main)",
                                fontFamily: "'Fira Code', monospace",
                                fontSize: "13px",
                                fontWeight: "600"
                            }}
                        />
                    </div>
                </div>
                <Trash2 height={18} width={18} color={"var(--nodius-red-500)"} onClick={deleteEvent} className="delete-btn"/>
            </div>
            <Collapse in={isExpanded}>
                <div className={eventContentClass}>
                    <div className={actionButtonsClass}>
                        {event.call.startsWith("[!]CALL-HANDLE-") ? (
                            <button className={`${actionButtonClass} primary`} onClick={switchToCode}>
                                <Code2 height={16} width={16} />
                                <span>Switch to Code Editor</span>
                            </button>
                        ) : (
                            <>
                                <button className={`${actionButtonClass} primary`} onClick={editInCodeEditor}>
                                    <Edit3 height={16} width={16} />
                                    <span>Edit in Code Editor</span>
                                </button>
                                <button className={`${actionButtonClass} secondary`} onClick={switchToNode}>
                                    <Workflow height={16} width={16} />
                                    <span>Switch to Node</span>
                                </button>
                            </>
                        )}
                    </div>
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
export const EventsEditor = memo(({ object, onUpdate }: EventsEditorProps) => {
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
        const newInstruction = new InstructionBuilder(object.instruction);
        newInstruction.key("domEvents").arrayAdd(emptyEvent);
        await onUpdate(newInstruction.instruction);
    };

    return (
        <div style={{width: "100%", height: "100%", padding: "8px 0", display: "flex", flexDirection: "column", gap: "16px"}}>
            {object.object.domEvents.map((event, i) => (
                <EventEditor
                    key={i}
                    event={event}
                    index={i}
                    baseInstruction={object.instruction}
                    onUpdate={onUpdate}
                    object={object}
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
