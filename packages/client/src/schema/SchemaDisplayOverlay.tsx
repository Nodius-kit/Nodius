import { memo, useCallback, useContext } from "react";
import { ProjectContext } from "../hooks/contexts/ProjectContext";
import { useDynamicClass } from "../hooks/useDynamicClass";
import { Plus, X, Edit2, Maximize } from "lucide-react";
import toast from "react-hot-toast";

export interface SchemaDisplayOverlayProps {
    centerOnRootNode: () => void;
}

export const SchemaDisplayOverlay = memo(({ centerOnRootNode }: SchemaDisplayOverlayProps) => {
    const Project = useContext(ProjectContext);

    const centerButtonClass = useDynamicClass(`
        & {
            position: absolute;
            bottom: 10px;
            right: 10px;
            background-color: var(--nodius-background-paper);
            box-shadow: var(--nodius-shadow-2);
            padding: 8px;
            border-radius: 8px;
            cursor: pointer;
            transition: var(--nodius-transition-default);
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: all;
            z-index: 12;
        }

        &:hover {
            background-color: var(--nodius-background-hover, rgba(0, 0, 0, 0.1));
            box-shadow: var(--nodius-shadow-4);
        }

        &:active {
            transform: scale(0.95);
        }
    `);

    const sheetListClass = useDynamicClass(`
        & {
            position:absolute;
            width:100%;
            display:flex;
            flex-direction:row;
            justify-content:center;
            bottom:0;
            overflow:hidden;
            pointer-events: all;
            z-index: 11;
            gap: 10px;
        }

        & > div.sheet-tab {
            background-color: var(--nodius-background-paper);
            box-shadow: var(--nodius-shadow-2);
            padding: 8px 16px;
            font-size: 16px;
            font-weight: 500;
            border-radius: 8px 8px 0px 0px;
            transform: translateY(30px);
            cursor:pointer;
            transition: var(--nodius-transition-default);
            display: flex;
            align-items: center;
            gap: 8px;
            position: relative;
        }

        & > div.sheet-tab.selected {
            border: 1px solid var(--nodius-primary-main)
        }

        &:hover > div.sheet-tab {
            transform: translateY(2px);
        }

        & .sheet-actions {
            display: none;
            align-items: center;
            gap: 4px;
            margin-left: 4px;
        }

        & .sheet-tab:hover .sheet-actions {
            display: flex;
        }

        & .sheet-action-btn {
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: background-color 0.2s;
            padding: 2px;
        }

        & .sheet-action-btn:hover {
            background-color: var(--nodius-background-hover, rgba(0, 0, 0, 0.1));
        }

        & .sheet-action-btn.delete:hover {
            background-color: var(--nodius-error-light, rgba(244, 67, 54, 0.1));
            color: var(--nodius-error-main, #f44336);
        }

        & .sheet-name {
            user-select: none;
        }

    `);

    if (Project.state.editedNodeConfig) {
        return null;
    }

    return (
        <>
            <div
                className={centerButtonClass}
                onClick={centerOnRootNode}
                title="Center on root node"
            >
                <Maximize size={20} />
            </div>
            <SheetListing sheetListClass={sheetListClass} />
        </>
    );
});

interface SheetListingProps {
    sheetListClass: string;
}

const SheetListing = memo(({ sheetListClass }: SheetListingProps) => {
    const Project = useContext(ProjectContext);

    const handleSheetClick = useCallback((sheetKey: string, e: React.MouseEvent) => {
        // Only change sheet if not clicking on action buttons
        if (!(e.target as HTMLElement).closest('.sheet-actions')) {
            Project.dispatch({
                field: "selectedSheetId",
                value: sheetKey
            });
        }
    }, [Project]);

    const handleRenameSheet = useCallback(async (sheetKey: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const currentName = Project.state.graph!.sheetsList[sheetKey];
        const newName = prompt("Rename sheet", currentName);
        if (newName && newName !== currentName) {
            if (Object.values(Project.state.graph!.sheetsList).includes(newName)) {
                toast.error("Sheet name already used");
            } else {
                await Project.state.renameSheet!(sheetKey, newName);
            }
        }
    }, [Project]);

    const handleDeleteSheet = useCallback(async (sheetKey: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete sheet "${Project.state.graph!.sheetsList[sheetKey]}"? This will delete all nodes and edges in this sheet.`)) {
            // If deleting current sheet, switch to sheet "0" first
            if (sheetKey === Project.state.selectedSheetId) {
                Project.dispatch({
                    field: "selectedSheetId",
                    value: "0"
                });
            }
            await Project.state.removeSheet!(sheetKey);
        }
    }, [Project]);

    const handleCreateSheet = useCallback(async () => {
        const sheetName = prompt("Sheet name");
        if (sheetName) {
            if (Object.values(Project.state.graph!.sheetsList).includes(sheetName)) {
                toast.error("Sheet name already used");
            } else {
                await Project.state.createSheet!(sheetName);
            }
        }
    }, [Project]);

    return (
        <div className={sheetListClass}>
            {
                Object.keys(Project.state.graph?.sheetsList ?? {}).map((sheetKey, i) => (
                    <div
                        key={i}
                        className={`sheet-tab ${sheetKey === Project.state.selectedSheetId ? "selected" : ""}`}
                        onClick={(e) => handleSheetClick(sheetKey, e)}
                    >
                        <span className="sheet-name">{Project.state.graph!.sheetsList[sheetKey]}</span>
                        <div className="sheet-actions">
                            <div
                                className="sheet-action-btn rename"
                                onClick={(e) => handleRenameSheet(sheetKey, e)}
                                title="Rename sheet"
                            >
                                <Edit2 size={14} />
                            </div>
                            {sheetKey !== "0" && (
                                <div
                                    className="sheet-action-btn delete"
                                    onClick={(e) => handleDeleteSheet(sheetKey, e)}
                                    title="Delete sheet"
                                >
                                    <X size={14} />
                                </div>
                            )}
                        </div>
                    </div>
                ))
            }
            <div
                className="sheet-tab selected"
                style={{ color: "var(--nodius-primary-main)" }}
                onClick={handleCreateSheet}
            >
                <Plus />
            </div>
        </div>
    );
});

export { SheetListing };
