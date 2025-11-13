/**
 * @file LeftPaneMenu.tsx
 * @description Left sidebar navigation menu for the schema editor
 * @module dashboard/Editor
 *
 * Vertical icon-based menu for switching between editor panels:
 * - Component Editor: Edit component properties and structure
 * - Component Tree: View and navigate component hierarchy
 * - Type Editor: Define and manage custom data types
 * - Enum Editor: Create and edit enum values
 * - Entry Type Select: Choose and configure entry data types
 *
 * Features:
 * - Icon-based navigation with visual feedback
 * - Active panel highlighting
 * - Disabled state for unavailable actions
 * - Theme-aware styling with hover effects
 * - Auto-calculates menu width based on icon size and padding
 */

import {JSX, memo, useContext, useEffect, useMemo} from "react";
import {editingPanel} from "../SchemaEditor";
import {BetweenHorizontalStart, Binary, Cable, Code, CopyPlus, Frame, List, Boxes} from "lucide-react";
import {ThemeContext} from "../../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../../hooks/useDynamicClass";
import {EditedCodeContext, ProjectContext} from "../../../hooks/contexts/ProjectContext";
import {useStableProjectRef} from "../../../hooks/useStableProjectRef";
import {GraphInstructions} from "../../../../utils/sync/wsObject";

interface LeftPaneMenuProps {
    setEditingPanel: (value:editingPanel) => void,
    editingPanel: editingPanel,
    setMenuWidth: (width: number) => void,
}

interface iconActionListType {
    name:string,
    actions: Array<{
        icon: JSX.Element;
        onClick: () => void;
        selected: boolean;
        disabled: boolean;
        hided?:boolean;
    }>
}

export const LeftPanelMenu = memo((
    {
        setEditingPanel,
        editingPanel,
        setMenuWidth
    }:LeftPaneMenuProps
) => {

    const Theme = useContext(ThemeContext);

    const iconColor = "var(--nodius-text-secondary)";
    const iconHoverColor = "var(--nodius-text-primary)";
    const iconBackground = "transparent";
    const iconHoverBackground = Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.08);
    const iconSelectedBackground = "var(--nodius-primary-main)";
    const iconSize = 24; // width & height of icon
    const iconPadding = 12; // padding outside icon
    const iconGap = 12; // space between icon
    const border = "2px solid var(--nodius-background-paper)";

    const Project = useContext(ProjectContext);
    const projectRef = useStableProjectRef();

    useEffect(() => {
        if(setMenuWidth) {
            setMenuWidth(iconSize + (iconPadding * 2));
        }
    }, [setMenuWidth]);

    const iconButtonClass = useDynamicClass(`
        & {
            background-color: ${iconBackground};
            color: ${iconColor};
            transition:var(--nodius-transition-default);
            border-radius:8px;
        }
        &:hover:not(.disabled) {
            background-color: ${iconHoverBackground};
            color: ${iconHoverColor};
            cursor: pointer;
        }
        &.selected {
            background-color: ${iconSelectedBackground};
        }
        &.disabled {
            opacity: 0.5;
        }
    `);

    const iconActionList:iconActionListType[] = useMemo(() => [
        {
            name: "Build",
            actions: [
                {
                    icon: <Code  width={iconSize} height={iconSize} />,
                    onClick: () => {
                        if(projectRef.current.state.editedCode.some((ed) => ed.nodeId === "0")) {
                            Project.dispatch({
                                field: "editedCode",
                                value: projectRef.current.state.editedCode.filter((e) => e.nodeId !== "0")
                            });
                        } else {
                            const nodeConfig = projectRef.current.state.nodeTypeConfig[projectRef.current.state.editedNodeConfig ?? ""];
                            if(!nodeConfig) return;
                            Project.dispatch({
                                field: "editedCode",
                                value: [
                                    ...projectRef.current.state.editedCode,
                                    {
                                        nodeId: "0",
                                        title: `Node ${nodeConfig.displayName} Logic`,
                                        onChange: async (instructions) => {
                                            if(Array.isArray(instructions)) {
                                                for(const instruction of instructions) {
                                                    instruction.p = ["process", ...instruction.p ?? []];
                                                }
                                                const instructionToGraph: Array<GraphInstructions> = instructions.map((i) => (
                                                    {
                                                        nodeId: "0",
                                                        i: i
                                                    }
                                                ));
                                                const output = await projectRef.current.state.updateGraph!(instructionToGraph);
                                                return output.status;
                                            } else {
                                                instructions.p = ["process", ...instructions.p ?? []];
                                                const output = await projectRef.current.state.updateGraph!([
                                                    {
                                                        i: instructions,
                                                        nodeId: "0"
                                                    }
                                                ]);
                                                return output.status;
                                            }
                                        },
                                        retrieveText: (node) => node.process
                                    } as EditedCodeContext
                                ]
                            });
                        }
                    },
                    selected: Project.state.editedNodeConfig != undefined && Project.state.editedCode.some((ed) => ed.nodeId === "0"),
                    disabled: !Project.state.editedNodeConfig || !(Project.state.selectedNode.length === 1 && Project.state.selectedNode[0] === "0"),
                    hided: !Project.state.editedNodeConfig
                },
                {
                    icon: <CopyPlus  width={iconSize} height={iconSize} />,
                    onClick: () => {
                        setEditingPanel(editingPanel === "component" ? "" : "component");
                    },
                    selected: editingPanel === "component",
                    disabled: Project.state.editedHtml === undefined
                },
                {
                    icon: <BetweenHorizontalStart  width={iconSize} height={iconSize} />,
                    onClick: () => {
                        setEditingPanel(editingPanel === "hierarchy" ? "" : "hierarchy");
                    },
                    selected: editingPanel === "hierarchy",
                    disabled: Project.state.editedHtml === undefined
                }
            ]
        },
        {
            name: "Nodes",
            actions: [
                {
                    icon: <Boxes width={iconSize} height={iconSize}/>,
                    onClick: () => {
                        setEditingPanel(editingPanel === "nodeLibrary" ? "" : "nodeLibrary");
                    },
                    selected: editingPanel === "nodeLibrary",
                    disabled: false
                }
            ],
        },
        {
            name: "Connect",
            actions: [
                {
                    icon: <Cable width={iconSize} height={iconSize}/>,
                    onClick: () => {
                        setEditingPanel(editingPanel === "entryData" ? "" : "entryData");
                    },
                    selected: editingPanel === "entryData",
                    disabled: false,
                },
                {
                    icon: <Binary width={iconSize} height={iconSize}/>,
                    onClick: () => {
                        setEditingPanel(editingPanel === "type" ? "" : "type");
                    },
                    selected: editingPanel === "type",
                    disabled: false
                },
                {
                    icon: <List width={iconSize} height={iconSize}/>,
                    onClick: () => {
                        setEditingPanel(editingPanel === "enum" ? "" : "enum");
                    },
                    selected: editingPanel === "enum",
                    disabled: false
                }
            ]
        }
    ], [setEditingPanel, editingPanel, iconSize,  Project.state.selectedNode, Project.state.editedCode, Project.state.editedNodeConfig, Project.state.editedHtml]);

    return (
        <div style={{height:"100%", width:(iconSize+ (iconPadding*2))+"px", borderRight:border, display:"flex", flexDirection:"column", boxShadow: "var(--nodius-shadow-1)"}}>
            <div style={{height:"40px", display:"flex", justifyContent:"center", alignItems:"center", boxShadow: "var(--nodius-shadow-1)"}}>
                <Frame style={{color:iconColor, cursor:"pointer"}} width={iconSize} height={iconSize} onClick={() => {
                    Project.dispatch({
                        field: "activeAppMenuId",
                        value: "home"
                    });
                }} />
            </div>
            {
                iconActionList.filter((list) => !list.actions.every((a) => a.hided)).map((category, i) => (
                    <div key={i} style={{borderTop:border, display:"flex", flexDirection:"column", alignItems:"center", gap:"2px", marginTop: i > 0 ? "8px" : undefined}}>
                        <p style={{fontSize:"12px", color:iconColor, paddingTop: (iconGap/2)+"px", paddingBottom:(iconGap/2)+"px"}}>{category.name}</p>
                        {category.actions.map((action, i2) => (
                            <div
                                key={i2}
                                style={{padding: (iconGap/2)+"px", display: action.hided ? "none" : "initial"}}
                                className={`${iconButtonClass} ${action.selected ? "selected" : ""} ${action.disabled ? "disabled" : ""}`}
                                onClick={action.disabled ? undefined : action.onClick}
                            >
                                {action.icon}
                            </div>
                        ))}
                    </div>
                ))
            }


        </div>
    )
});
LeftPanelMenu.displayName = "LeftPaneMenu";