/**
 * @file RightPanelHandleConfig.tsx
 * @description Right panel for editing node handle configuration
 * @module dashboard/Editor
 *
 * Displays and allows editing of selected node handle properties:
 * - Type configuration (input/output)
 * - Position mode (auto/fixed)
 * - Handle deletion
 * - Point deletion
 *
 * Features:
 * - Real-time handle updates via WebSocket
 * - Type-safe instruction building
 * - Synchronized updates with graph rendering
 */

import {memo, useContext, useEffect, useMemo, useState} from "react";
import { ProjectContext } from "../../../hooks/contexts/ProjectContext";
import { ThemeContext } from "../../../hooks/contexts/ThemeContext";
import { InstructionBuilder } from "../../../../utils/sync/InstructionBuilder";
import { useDynamicClass } from "../../../hooks/useDynamicClass";
import { Settings, Trash2 } from "lucide-react";
import {Node} from "../../../../utils/graph/graphType";

export const RightPanelHandleConfig = memo(() => {
    const Project = useContext(ProjectContext);
    const Theme = useContext(ThemeContext);

    const editedHandle = Project.state.editedNodeHandle;

    const [node, setNode] = useState<Node<any>>();

    const retrieveNode = () => {
        setNode(Project.state.graph!.sheets[Project.state.selectedSheetId!].nodeMap.get(editedHandle!.nodeId));
    }

    useEffect(() => {
        if (!editedHandle || !Project.state.graph || !Project.state.selectedSheetId) return undefined;
        retrieveNode();
    }, [editedHandle, Project.state.graph, Project.state.selectedSheetId]);

    const handleConfig = useMemo(() => {
        if (!node || !editedHandle) return undefined;
        return node.handles[editedHandle.side];
    }, [node, editedHandle]);

    const point = useMemo(() => {
        if (!handleConfig || editedHandle === undefined) return undefined;
        return handleConfig.point[editedHandle.pointIndex];
    }, [handleConfig, editedHandle]);

    // Styles
    const panelClass = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            gap: 16px;
            padding: 16px;
            height: 100%;
            overflow-y: auto;
        }
    `);

    const sectionClass = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 12px;
            background: var(--nodius-background-paper);
            border-radius: 8px;
            border: 1px solid var(--nodius-divider);
        }
    `);

    const headerClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            font-weight: 600;
            color: var(--nodius-text-primary);
            margin-bottom: 4px;
        }
    `);

    const buttonGroupClass = useDynamicClass(`
        & {
            display: flex;
            gap: 4px;
        }
    `);

    const buttonClass = useDynamicClass(`
        & {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid var(--nodius-divider);
            border-radius: 4px;
            background: var(--nodius-background-default);
            color: var(--nodius-text-primary);
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            text-align: center;
        }
        &:hover {
            background: var(--nodius-background-hover);
        }
        &.active {
            background: var(--nodius-primary);
            color: white;
            border-color: var(--nodius-primary);
        }
    `);

    const deleteButtonClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 8px 12px;
            border: 1px solid #ef4444;
            border-radius: 4px;
            background: transparent;
            color: #ef4444;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            width: 100%;
        }
        &:hover {
            background: #ef4444;
            color: white;
        }
    `);

    const labelClass = useDynamicClass(`
        & {
            font-size: 12px;
            font-weight: 500;
            color: var(--nodius-text-secondary);
            margin-bottom: 4px;
        }
    `);

    const infoClass = useDynamicClass(`
        & {
            font-size: 11px;
            color: var(--nodius-text-disabled);
            font-style: italic;
        }
    `);

    // Handlers
    const handleTypeChange = async (type: "in" | "out") => {
        if (!editedHandle || !Project.state.updateGraph) return;

        const instruction = new InstructionBuilder();
        instruction.key("handles")
            .key(editedHandle.side)
            .key("point")
            .index(editedHandle.pointIndex)
            .key("type")
            .set(type);

        await Project.state.updateGraph([{
            nodeId: editedHandle.nodeId,
            i: instruction.instruction
        }]);
        retrieveNode();
    };

    const handlePositionModeChange = async (mode: "separate" | "fix") => {
        if (!editedHandle || !Project.state.updateGraph || !node || !handleConfig) return;

        const instructions = [];

        // Update position mode
        const modeInstruction = new InstructionBuilder();
        modeInstruction.key("handles").key(editedHandle.side).key("position").set(mode);
        instructions.push({
            nodeId: editedHandle.nodeId,
            i: modeInstruction.instruction
        });

        // Handle offset based on mode
        if (mode === "separate") {
            // Remove offset when switching to auto
            const offsetInstruction = new InstructionBuilder();
            offsetInstruction.key("handles")
                .key(editedHandle.side)
                .key("point")
                .index(editedHandle.pointIndex)
                .key("offset")
                .remove();
            instructions.push({
                nodeId: editedHandle.nodeId,
                i: offsetInstruction.instruction
            });
        } else {
            // Set default offset when switching to fixed
            const percentage = (editedHandle.pointIndex + 0.5) / handleConfig.point.length;
            let defaultOffset: number;

            switch (editedHandle.side) {
                case 'T':
                case 'D':
                    defaultOffset = percentage * node.size.width;
                    break;
                case 'L':
                case 'R':
                    defaultOffset = percentage * node.size.height;
                    break;
                default:
                    defaultOffset = 0;
            }

            const offsetInstruction = new InstructionBuilder();
            offsetInstruction.key("handles")
                .key(editedHandle.side)
                .key("point")
                .index(editedHandle.pointIndex)
                .key("offset")
                .set(defaultOffset);
            instructions.push({
                nodeId: editedHandle.nodeId,
                i: offsetInstruction.instruction
            });
        }

        await Project.state.updateGraph(instructions);
        retrieveNode();
    };

    const handleDeletePoint = async () => {
        if (!editedHandle || !Project.state.updateGraph) return;

        const instruction = new InstructionBuilder();
        instruction.key("handles")
            .key(editedHandle.side)
            .key("point")
            .arrayRemoveIndex(editedHandle.pointIndex);

        await Project.state.updateGraph([{
            nodeId: editedHandle.nodeId,
            i: instruction.instruction
        }]);
        retrieveNode();

        // Close the panel after deletion
        Project.dispatch({ field: "editedNodeHandle", value: undefined });
    };

    const handleDeleteHandle = async () => {
        if (!editedHandle || !Project.state.updateGraph) return;

        const instruction = new InstructionBuilder();
        instruction.key("handles").key(editedHandle.side).remove();

        await Project.state.updateGraph([{
            nodeId: editedHandle.nodeId,
            i: instruction.instruction
        }]);
        retrieveNode();

        // Close the panel after deletion
        Project.dispatch({ field: "editedNodeHandle", value: undefined });
    };

    // If no handle is selected, show empty state
    if (!editedHandle || !node || !handleConfig || !point) {
        return (
            <div className={panelClass}>
                <div className={sectionClass}>
                    <div className={infoClass}>
                        Select a node handle to configure its properties
                    </div>
                </div>
            </div>
        );
    }

    const sideLabels = {
        'T': 'Top',
        'D': 'Bottom',
        'L': 'Left',
        'R': 'Right',
        '0': 'Center'
    };

    return (
        <div className={panelClass}>
            {/* Header */}
            <div className={sectionClass}>
                <div className={headerClass}>
                    <Settings size={16} />
                    Handle Configuration
                </div>
                <div className={infoClass}>
                    {sideLabels[editedHandle.side]} side - Point {editedHandle.pointIndex + 1}
                </div>
            </div>

            {/* Type Selection */}
            <div className={sectionClass}>
                <div className={labelClass}>Connection Type</div>
                <div className={buttonGroupClass}>
                    <button
                        className={`${buttonClass} ${point.type === 'in' ? 'active' : ''}`}
                        onClick={() => handleTypeChange('in')}
                    >
                        INPUT
                    </button>
                    <button
                        className={`${buttonClass} ${point.type === 'out' ? 'active' : ''}`}
                        onClick={() => handleTypeChange('out')}
                    >
                        OUTPUT
                    </button>
                </div>
                <div className={infoClass}>
                    Input handles receive data, output handles send data
                </div>
            </div>

            {/* Position Mode */}
            <div className={sectionClass}>
                <div className={labelClass}>Position Mode</div>
                <div className={buttonGroupClass}>
                    <button
                        className={`${buttonClass} ${handleConfig.position === 'separate' ? 'active' : ''}`}
                        onClick={() => handlePositionModeChange('separate')}
                    >
                        AUTO
                    </button>
                    <button
                        className={`${buttonClass} ${handleConfig.position === 'fix' ? 'active' : ''}`}
                        onClick={() => handlePositionModeChange('fix')}
                    >
                        FIXED
                    </button>
                </div>
                <div className={infoClass}>
                    {handleConfig.position === 'separate'
                        ? 'Points are automatically distributed'
                        : 'Points can be positioned manually by dragging'
                    }
                </div>
            </div>

            {/* Delete Point */}
            <div className={sectionClass}>
                <div className={labelClass}>Delete Point</div>
                <button className={deleteButtonClass} onClick={handleDeletePoint}>
                    <Trash2 size={14} />
                    Delete This Point
                </button>
                <div className={infoClass}>
                    Remove this connection point from the handle
                </div>
            </div>

            {/* Delete Handle */}
            <div className={sectionClass}>
                <div className={labelClass}>Delete Handle</div>
                <button className={deleteButtonClass} onClick={handleDeleteHandle}>
                    <Trash2 size={14} />
                    Delete Entire Handle
                </button>
                <div className={infoClass}>
                    Remove all connection points from this side
                </div>
            </div>
        </div>
    );
});

RightPanelHandleConfig.displayName = "RightPanelHandleConfig";
