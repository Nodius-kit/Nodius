import {memo, useCallback, useContext, useEffect, useRef, useState, MouseEvent} from "react";
import { ProjectContext } from "../hooks/contexts/ProjectContext";
import { useDynamicClass } from "../hooks/useDynamicClass";
import { Plus, X, Edit2, Maximize } from "lucide-react";
import toast from "react-hot-toast";
import {Button} from "../component/form/Button";
import {Card} from "../component/form/Card";
import { Edge, Node, getGraphBounds, generateGraphSVGString, flatEdgeMap } from "@nodius/utils";
import {ThemeContext} from "../hooks/contexts/ThemeContext";
import {useStableProjectRef} from "../hooks/useStableProjectRef";

export interface SchemaDisplayOverlayProps {
    centerOnRootNode: () => void;
    getVisibleNode: () => Node<any>[];
    getVisibleEdge: () => Edge[];
    getContainer: () => HTMLDivElement;
}

export const SchemaDisplayOverlay = memo(({ centerOnRootNode, getVisibleNode, getVisibleEdge, getContainer }: SchemaDisplayOverlayProps) => {
    const Project = useContext(ProjectContext);
    const projectRef = useStableProjectRef();
    const Theme = useContext(ThemeContext);

    const showCenterOnRootNode = Project.state.editedNodeConfig == undefined;
    const showSheetListing = Project.state.graph && !Project.state.graph.metadata?.noMultipleSheet;

    const minimapWidth = 240;
    const minimapHeight = 140;
    const minimapWorking = useRef<boolean>(false); // avoid overload
    const [minimapSvg, setMinimapSvg] = useState<{
        bounds: {minX: number, minY: number, width: number, height: number},
        svg: string,
        scale: number,
        offsetX: number,
        offsetY: number,
        viewport: { x: number; y: number; width: number; height: number }
    } | undefined>(undefined);
    const intervalMinimap = (theme: "dark"|"light") => {
        if(!projectRef.current.state.graph || !projectRef.current.state.selectedSheetId || !projectRef.current.state.getMotor()) return;
        if(minimapWorking.current) return;
        minimapWorking.current = true;

        const sheet = projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId];
        const nodeList: Node<any>[] = Array.from(sheet.nodeMap.values());
        const edgeList: Edge[] = flatEdgeMap(sheet.edgeMap);
        const motor = projectRef.current.state.getMotor();
        const container = getContainer();
        const containerRect = container.getBoundingClientRect();

        // 1. Calculate Viewport
        const tl = motor.screenToWorld({ x: 0, y: 0 });
        const br = motor.screenToWorld({ x: containerRect.width, y: containerRect.height });
        // Handle rotation or negative scales if necessary (simple min/max here)
        const visMinX = Math.min(tl.x, br.x);
        const visMaxX = Math.max(tl.x, br.x);
        const visMinY = Math.min(tl.y, br.y);
        const visMaxY = Math.max(tl.y, br.y);

        const vp = {
            x: visMinX,
            y: visMinY,
            height: visMaxY - visMinY,
            width: visMaxX - visMinX,
        };

        // 2. Calculate Combined Bounds (Nodes + Viewport)
        const graphB = getGraphBounds(nodeList);
        const combinedMinX = Math.min(graphB.minX, vp.x);
        const combinedMinY = Math.min(graphB.minY, vp.y);
        const combinedMaxX = Math.max(graphB.minX + graphB.width, vp.x + vp.width);
        const combinedMaxY = Math.max(graphB.minY + graphB.height, vp.y + vp.height);

        const PADDING = 50;
        const finalBounds = {
            minX: combinedMinX - PADDING,
            minY: combinedMinY - PADDING,
            width: (combinedMaxX - combinedMinX) + (PADDING * 2),
            height: (combinedMaxY - combinedMinY) + (PADDING * 2),
        };

        // 3. ✨ NEW: Calculate Scale "Contain" & Centering Offsets
        const scaleX = minimapWidth / finalBounds.width;
        const scaleY = minimapHeight / finalBounds.height;
        const scale = Math.min(scaleX, scaleY); // Fit entirely visible

        const renderedWidth = finalBounds.width * scale;
        const renderedHeight = finalBounds.height * scale;

        const offsetX = (minimapWidth - renderedWidth) / 2;
        const offsetY = (minimapHeight - renderedHeight) / 2;

        // 4. Generate SVG
        const svgString = generateGraphSVGString(nodeList, edgeList, finalBounds, theme);
        const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(svgString)));
        const url = `data:image/svg+xml;base64,${base64}`;

        setMinimapSvg({
            svg: url,
            bounds: finalBounds,
            scale: scale,
            offsetX: offsetX,
            offsetY: offsetY,
            viewport: vp
        });

        minimapWorking.current = false;
    }

    useEffect(() => {
        const intervalId = setInterval(() => intervalMinimap(Theme.state.theme), 100);
        return () => {
            clearInterval(intervalId);
        }
    }, [Theme.state.theme, getVisibleNode, getVisibleEdge]);

    const isPointInRect = (x: number, y: number, rect: {x: number, y: number, w: number, h: number}) => {
        return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    };
    const handleMinimapClick = (e: MouseEvent<HTMLDivElement>) => {
        if (!minimapSvg || !projectRef.current || !projectRef.current.state.graph || !projectRef.current.state.selectedSheetId || !projectRef.current.state.getMotor()) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const clickX_pixel = e.clientX - rect.left;
        const clickY_pixel = e.clientY - rect.top;

        const worldX = minimapSvg.bounds.minX + ((clickX_pixel - minimapSvg.offsetX) / minimapSvg.scale);
        const worldY = minimapSvg.bounds.minY + ((clickY_pixel - minimapSvg.offsetY) / minimapSvg.scale);

        const sheet = projectRef.current.state.graph.sheets[projectRef.current.state.selectedSheetId];
        if(!sheet) return;

        // Find clicked node
        const clickedNode = Array.from(sheet.nodeMap.values()).reverse().find(node => {
            return isPointInRect(worldX, worldY, {
                x: node.posX,
                y: node.posY,
                w: node.size.width,
                h: node.size.height
            });
        });

        const motor = projectRef.current.state.getMotor();
        if (clickedNode) {
            motor.smoothFitToNode(clickedNode._key);
        } else {
            motor.smoothTransitionTo({
                x: worldX,
                y: worldY,
                zoom: motor.getTransform().scale
            });
        }
    };

    const minimapContainer = useDynamicClass(`
        & {
            width: ${minimapWidth}px;
            height: ${minimapHeight}px; /* FIXED HEIGHT */
            position: absolute;
            overflow: hidden;
            border: 1px solid #ccc;
            border-radius: 8px;
            background: ${Theme.state.theme === "dark" ? '#1e1e1e' : '#f3f4f6'};
            right: 8px;
            bottom: 8px;
            z-index: 9999;
            cursor: crosshair;
            pointer-events: all;
        }
        
        & > img {
            /* Position absolute to center manually */
            position: absolute;
            display: block;
            user-select: none;
            pointer-events: none; 
            /* Width/Height/Top/Left set via inline styles below */
        }
        
        & > div {
            position: absolute;
            border: 2px solid #3b82f6;
            background-color: rgba(59, 130, 246, 0.2);
            pointer-events: none; 
        }
    `);

    const centerButtonClass = useDynamicClass(`
        & {
            position: absolute;
            bottom: 8px;
            right: ${minimapWidth + 16}px;
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
            z-index: 9999;
        }

        &:hover {
            background-color: var(--nodius-background-hover, rgba(0, 0, 0, 0.1));
            box-shadow: var(--nodius-shadow-4);
        }

        &:active {
            transform: scale(0.95);
        }
    `);

    return (
        <>

            {showCenterOnRootNode && (
                <>
                    {minimapSvg && (
                        <div
                            className={minimapContainer}
                            onClick={handleMinimapClick}
                        >
                            <img
                                src={minimapSvg.svg}
                                alt="Minimap"
                                style={{
                                    left: minimapSvg.offsetX,
                                    top: minimapSvg.offsetY,
                                    width: minimapSvg.bounds.width * minimapSvg.scale,
                                    height: minimapSvg.bounds.height * minimapSvg.scale,
                                }}
                            />
                            <div
                                style={{
                                    left: ((minimapSvg.viewport.x - minimapSvg.bounds.minX) * minimapSvg.scale) + minimapSvg.offsetX,
                                    top: ((minimapSvg.viewport.y - minimapSvg.bounds.minY) * minimapSvg.scale) + minimapSvg.offsetY,
                                    width: minimapSvg.viewport.width * minimapSvg.scale,
                                    height: minimapSvg.viewport.height * minimapSvg.scale,
                                }}
                            />
                        </div>
                    )}
                    <div
                        className={centerButtonClass}
                        onClick={centerOnRootNode}
                        title="Center on root node"
                    >
                        <Maximize size={20} />
                    </div>
                </>
            )}
            {showSheetListing && (
                <SheetListing />
            )}
        </>
    );
});

interface SheetListingProps {
}

const SheetListing = memo(({ }: SheetListingProps) => {
    const Project = useContext(ProjectContext);

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
        <>
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
            {
                Project.state.connectionState === "disconnected" && (
                    <div style={{
                        position:"absolute",
                        inset:"0",
                        backgroundColor: "var(--nodius-background-default)",
                        zIndex: 99999999,
                        display:"flex",
                        justifyContent:"center",
                        alignItems:"center",
                        pointerEvents:"all"
                    }}>
                        <Card>
                            <div style={{display:"flex", flexDirection:"column", gap:"15px"}}>
                                <h4>Nodius is open in another window. Click on "Use here" to use Nodius in that window.</h4>
                                <div style={{display:"flex", flexDirection:"row", justifyContent:"end", gap:"10px"}}>
                                    <Button onClick={() => {
                                        window.close();
                                    }} size={"small"} variant={"outlined"}>
                                        Fermer
                                    </Button>
                                    <Button onClick={() => {
                                        window.location.reload();
                                    }} size={"small"}>
                                        Use here
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </div>
                )
            }
        </>
    );
});

export { SheetListing };
