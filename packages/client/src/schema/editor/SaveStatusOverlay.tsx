/**
 * @file SaveStatusOverlay.tsx
 * @description Save status overlay button showing last save time and providing save controls
 * @module schema/editor
 *
 * Displays save status information and controls:
 * - Time since last save
 * - Unsaved changes indicator
 * - Force save button
 * - Auto-save toggle
 */

import { memo, useContext, useEffect, useState, useRef } from "react";
import { ProjectContext } from "../../hooks/contexts/ProjectContext";
import {Save, Clock, AlertCircle, Settings, EyeOff, ChevronLeft} from "lucide-react";
import { useDynamicClass } from "../../hooks/useDynamicClass";

interface SaveStatusOverlayProps {
    right: number
}

export const SaveStatusOverlay = memo(({
    right
}:SaveStatusOverlayProps) => {
    const Project = useContext(ProjectContext);
    const [showMenu, setShowMenu] = useState(false);
    const [isHidden, setIsHidden] = useState(false);
    const [timeSinceLastSave, setTimeSinceLastSave] = useState<string>("--");
    const menuRef = useRef<HTMLDivElement>(null);

    // Update time since last save every second
    useEffect(() => {
        if (!Project.state.saveStatus) return;

        const updateTime = () => {
            const now = Date.now();
            const diff = now - Project.state.saveStatus!.lastSaveTime;
            const seconds = Math.floor(diff / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);

            if (hours > 0) {
                setTimeSinceLastSave(`${hours}h ${minutes % 60}m ago`);
            } else if (minutes > 0) {
                setTimeSinceLastSave(`${minutes}m ${seconds % 60}s ago`);
            } else {
                setTimeSinceLastSave(`${seconds}s ago`);
            }
        };

        updateTime();
        const interval = setInterval(updateTime, 1000);

        return () => clearInterval(interval);
    }, [Project.state.saveStatus?.lastSaveTime]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };

        if (showMenu) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showMenu, isHidden]);

    const overlayClass = useDynamicClass(`
        & {
            position: absolute;
            pointer-events: all;
            z-index: 2;
            display: flex;
            transition: var(--nodius-transition-default);
            flex-direction: column;
            align-items: flex-end;
            gap: 8px;
        }

        & .save-button {
            background: var(--nodius-background-paper);
            border: 1px solid var(--nodius-divider, rgba(0, 0, 0, 0.12));
            border-radius: 8px;
            padding: 8px 16px;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: var(--nodius-shadow-2);
            user-select: none;
        }

        & .save-button:hover {
            box-shadow: var(--nodius-shadow-4);
        }

        & .save-button.unsaved {
            border-color: var(--nodius-warning-main, #ff9800);
        }

        & .save-icon {
            width: 20px;
            height: 20px;
            color: var(--nodius-text-primary);
        }

        & .save-icon.unsaved {
            color: var(--nodius-warning-main, #ff9800);
        }

        & .save-info {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 2px;
        }

        & .save-time {
            font-size: 14px;
            font-weight: 500;
            color: var(--nodius-text-primary);
            display: flex;
            align-items: center;
            gap: 4px;
        }

        & .save-status {
            font-size: 12px;
            color: var(--nodius-text-secondary);
        }

        & .save-status.unsaved {
            color: var(--nodius-warning-main, #ff9800);
            font-weight: 500;
        }

        & .save-menu {
            background: var(--nodius-background-paper);
            border: 1px solid var(--nodius-divider, rgba(0, 0, 0, 0.12));
            border-radius: 8px;
            padding: 8px;
            box-shadow: var(--nodius-shadow-8);
            min-width: 220px;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        & .menu-item {
            padding: 10px 12px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            transition: background 0.2s ease;
            user-select: none;
        }

        & .menu-item:hover {
            background: var(--nodius-background-hover, rgba(0, 0, 0, 0.04));
        }

        & .menu-item.disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        & .menu-item.disabled:hover {
            background: transparent;
        }

        & .menu-item-icon {
            width: 18px;
            height: 18px;
            color: var(--nodius-text-secondary);
        }

        & .menu-item-text {
            flex: 1;
            font-size: 14px;
            color: var(--nodius-text-primary);
        }

        & .menu-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 20px;
            border-radius: 10px;
            background: var(--nodius-divider, rgba(0, 0, 0, 0.12));
            transition: background 0.2s ease;
            position: relative;
        }

        & .menu-toggle.enabled {
            background: var(--nodius-primary-main, #3b82f6);
        }

        & .menu-toggle-thumb {
            position: absolute;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: white;
            transition: transform 0.2s ease;
            left: 2px;
        }

        & .menu-toggle.enabled .menu-toggle-thumb {
            transform: translateX(20px);
        }

        & .menu-divider {
            height: 1px;
            background: var(--nodius-divider, rgba(0, 0, 0, 0.12));
            margin: 4px 0;
        }
    `);

    if (!Project.state.graph) return null;

    const saveStatus = Project.state.saveStatus;
    const hasUnsavedChanges = saveStatus?.hasUnsavedChanges ?? false;
    const autoSaveEnabled = saveStatus?.autoSaveEnabled ?? true;

    const handleForceSave = async () => {
        if (Project.state.forceSave) {
            await Project.state.forceSave();
        }
        setShowMenu(false);
    };

    const handleToggleAutoSave = async () => {
        if (Project.state.toggleAutoSave) {
            await Project.state.toggleAutoSave(!autoSaveEnabled);
        }
    };


    return (
        <div className={overlayClass} ref={menuRef} style={{right: (isHidden  ? -150 : (16+right))+"px", top:"16px"}}>
            <div
                className={`save-button ${hasUnsavedChanges ? 'unsaved' : ''}`}
                onClick={() => {
                    if(isHidden) {
                        setIsHidden(false);
                    } else {
                        setShowMenu(!showMenu);
                    }
                }}
                style={{paddingLeft: isHidden?"0px":undefined}}
                title="Save status"
            >
                {isHidden ? (
                    <ChevronLeft />
                ) : hasUnsavedChanges ? (
                    <AlertCircle className="save-icon unsaved" />
                ) : (
                    <Clock className="save-icon" />
                )}
                <div className="save-info">
                    <div className="save-time">
                        {timeSinceLastSave}
                    </div>
                    <div className={`save-status ${hasUnsavedChanges ? 'unsaved' : ''}`}>
                        {hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
                    </div>
                </div>
                <Settings className="save-icon" style={{ width: 16, height: 16 }} />
            </div>

            {showMenu && (
                <div className="save-menu">
                    <div
                        className={`menu-item ${!hasUnsavedChanges ? 'disabled' : ''}`}
                        onClick={hasUnsavedChanges ? handleForceSave : undefined}
                        title={hasUnsavedChanges ? "Save all changes now" : "No changes to save"}
                    >
                        <Save className="menu-item-icon" />
                        <span className="menu-item-text">Force Save</span>
                    </div>

                    <div className="menu-divider" />

                    <div
                        className="menu-item"
                        onClick={handleToggleAutoSave}
                        title={autoSaveEnabled ? "Disable automatic saving" : "Enable automatic saving"}
                    >
                        <Clock className="menu-item-icon" />
                        <span className="menu-item-text">Auto-save</span>
                        <div className={`menu-toggle ${autoSaveEnabled ? 'enabled' : ''}`}>
                            <div className="menu-toggle-thumb" />
                        </div>
                    </div>

                    <div className="menu-divider" />

                    <div
                        className="menu-item"
                        onClick={() => {
                            setIsHidden(true);
                            setShowMenu(false);
                        }}
                        title="Hide save status overlay"
                    >
                        <EyeOff className="menu-item-icon" />
                        <span className="menu-item-text">Hide</span>
                    </div>
                </div>
            )}
        </div>
    );
});
