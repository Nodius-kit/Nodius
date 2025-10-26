/**
 * @file LeftPanelComponentEditor.tsx
 * @description Component library panel for drag-and-drop HTML component building
 * @module dashboard/Editor
 *
 * Provides a searchable library of reusable HTML components that can be:
 * - Dragged onto the canvas to add to the current HTML structure
 * - Organized by category (Most Used, Layout, etc.)
 * - Filtered by search query
 * - Collapsed/expanded by category
 *
 * Features:
 * - Drag-and-drop component insertion with smart positioning
 * - Live search filtering across all categories
 * - Category collapse/expand state management
 * - Visual feedback during drag operations with swing animation
 * - Icon-based component representation
 * - Theme-aware styling
 *
 * Drag-and-Drop System:
 * ----------------------
 * The drag system handles insertion into two container types:
 *
 * 1. BLOCK containers (type: "block"):
 *    - Can only contain one child element
 *    - Component is inserted if block is empty
 *    - Uses direct content assignment (instruction.key("content").set())
 *
 * 2. LIST containers (type: "list"):
 *    - Can contain multiple children in row or column layout
 *    - Smart positioning based on cursor location relative to existing children
 *    - Uses array insertion with calculated index (instruction.arrayInsertAtIndex())
 *    - Supports both horizontal (row) and vertical (column) flex directions
 *
 * Temporary Element System:
 * -------------------------
 * During drag, a temporary copy of the component is inserted at the target position:
 * - All objects in the dragged component are marked with `temporary: true`
 * - The temporary flag prevents user interaction during drag
 * - HtmlRender sets `[temporary="true"]` attribute on DOM elements
 * - On drop (mouse up), the temporary flag is removed via instruction
 * - If drag is cancelled (mouse leave), the temporary element is removed
 *
 * Server Synchronization:
 * ----------------------
 * - Uses instruction-based updates sent to server via WebSocket
 * - Awaits server confirmation before processing next position change
 * - The `moveWorking` flag prevents concurrent instruction processing
 * - Instructions are sent as single operations (not batched)
 * - Server validates and broadcasts changes to other connected clients
 *
 * Performance Considerations:
 * --------------------------
 * - Event listeners attached to window (not individual elements)
 * - Uses requestAnimationFrame for smooth swing animation
 * - Refs prevent stale closures during long-lived drag operations
 * - Smart position calculation only runs when hovering over new target
 */

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

    /**
     * Store Project state values in refs to avoid stale closures during drag operations
     *
     * During drag, the mouse event handlers are long-lived closures that capture
     * the initial state values. If Project.state changes during drag, the handlers
     * would still reference old values. Using refs ensures we always access the
     * latest state without recreating the event handlers.
     */
    const editedHtmlRef = useRef<EditedHtmlType>(Project.state.editedHtml);
    const updateHtmlRef = useRef<(instructions: Instruction, options?: UpdateHtmlOption) => Promise<ActionContext> | undefined>(Project.state.updateHtml);

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

    /**
     * Handles mouse down event to initiate drag and drop of a component
     *
     * This creates a visual overlay that follows the cursor and handles the logic for:
     * - Detecting drop targets (blocks and lists)
     * - Smart positioning within lists based on cursor position
     * - Temporary component insertion during drag
     * - Final placement with temporary flag removal on drop
     *
     * @param event - React mouse event from the component card
     * @param component - The HtmlBuilderComponent being dragged
     */
    const onMouseDown = (event: React.MouseEvent, component: HtmlBuilderComponent) => {
        let haveMoved = false;

        // Get the component card element to clone its appearance
        const container = document.querySelector("[data-builder-component='" + component.object.name + "']") as HTMLElement;
        if (!container) return;
        const containerSize = container.getBoundingClientRect();

        // Deep copy the component and mark all nested objects as temporary
        // The temporary flag prevents interaction and helps identify placeholder elements
        const newObject = deepCopy(component.object);
        travelHtmlObject(newObject, (obj) => {
            obj.temporary = true;
            return true;
        });

        // Create visual overlay that follows the cursor during drag
        const overlayContainer = document.createElement("div");
        overlayContainer.style.position = "absolute";
        overlayContainer.style.left = (event.clientX - (containerSize.width / 2)) + "px";
        overlayContainer.style.top = (event.clientY + 3) + "px";
        overlayContainer.style.width = containerSize.width + "px";
        overlayContainer.style.height = containerSize.height + "px";
        overlayContainer.style.zIndex = "10000000";
        overlayContainer.style.display = "flex";
        overlayContainer.style.flexDirection = "column";
        overlayContainer.style.justifyContent = "center";
        overlayContainer.style.alignItems = "center";

        // Copy visual styling from the original component card
        const toCopyStyle = getComputedStyle(container);
        overlayContainer.style.border = toCopyStyle.border;
        overlayContainer.style.borderRadius = toCopyStyle.borderRadius;
        overlayContainer.style.boxShadow = toCopyStyle.boxShadow;

        overlayContainer.style.backgroundColor = "var(--nodius-background-default)";
        overlayContainer.innerHTML = container.innerHTML;

        // Prevent text selection during drag
        disableTextSelection();

        // Variables for swing animation effect
        let lastX = event.clientX;
        let velocityX = 0;
        let velocityXAdd = 0;
        let rotationAngle = 0;
        let animationId = 0;

        /**
         * Animation loop for the swinging rotation effect
         * Gradually dampens the rotation angle based on horizontal velocity
         */
        const whileSwingAnimation = () => {
            const dampening = 1;
            if (velocityXAdd > dampening) {
                velocityXAdd -= dampening;
            } else if (velocityXAdd < -dampening) {
                velocityXAdd += dampening;
            } else {
                velocityXAdd = 0;
            }
            // Clamp rotation between -45 and 45 degrees
            velocityXAdd = Math.max(-45, Math.min(45, velocityXAdd));
            rotationAngle = Math.max(-45, Math.min(45, velocityXAdd * 0.4));
            overlayContainer.style.transform = `rotate(${rotationAngle}deg)`;
            animationId = requestAnimationFrame(whileSwingAnimation);
        };

        animationId = requestAnimationFrame(whileSwingAnimation);

        /**
         * Tracks the last temporary element that was inserted during drag
         * Contains both the target object and the instruction used to insert it
         */
        let lastTemporaryElement: { object: HtmlObject; instruction: Instruction } | undefined;

        /**
         * Prevents overlapping execution of mouse move logic
         * Ensures we wait for server response before processing next position
         */
        let moveWorking = false;

        /**
         * Mouse move handler during drag operation
         * Updates overlay position, detects drop targets, and manages temporary element placement
         */
        const mouseMove = async (event: MouseEvent) => {
            // Safety checks
            if (!Project.state.graph || !Project.state.selectedSheetId) {
                return;
            }

            // Append overlay to body on first movement
            if (!haveMoved) {
                document.body.appendChild(overlayContainer);
                haveMoved = true;
            }

            // Update overlay position to follow cursor
            overlayContainer.style.left = `${event.clientX - (containerSize.width / 2)}px`;
            overlayContainer.style.top = `${event.clientY + 3}px`;

            // Calculate velocity for swing animation
            velocityX = event.clientX - lastX;
            lastX = event.clientX;
            velocityXAdd += velocityX;

            // Check if edited HTML context exists
            if (!editedHtmlRef.current) {
                return;
            }

            // Prevent concurrent execution - wait for server response
            if (moveWorking) return;
            moveWorking = true;

            // Find HTML element under cursor with data-identifier attribute
            const hoverElements = document.elementsFromPoint(event.clientX, event.clientY) as HTMLElement[];
            const hoverElement = hoverElements.find((el) => el.getAttribute("data-identifier") != undefined);

            /**
             * Converts an insertion instruction to a removal instruction
             * Handles both array insertions and direct content assignments
             *
             * @param baseInstruction - The original insertion instruction
             * @returns Removal instruction that undoes the insertion
             */
            const removeInstruction = (baseInstruction: Instruction): Instruction => {
                const instruction = new InstructionBuilder();
                instruction.instruction = deepCopy(baseInstruction);

                if (instruction.instruction.o === OpType.ARR_INS) {
                    // Convert array insertion to array removal by index
                    instruction.instruction.o = OpType.ARR_REM_IDX;
                } else {
                    // Remove the content property
                    instruction.remove();
                }
                instruction.instruction.v = undefined;
                return instruction.instruction;
            };

            /**
             * Removes the last temporary element that was inserted
             * Sends removal instruction to server and clears tracking
             */
            const removeLastElement = async () => {
                const instruction = removeInstruction(lastTemporaryElement!.instruction);
                const result = await updateHtmlRef.current!(instruction);
                lastTemporaryElement = undefined;
            };

            // Process hover target if element exists
            if (hoverElement) {
                // Check if we've moved to a new target element
                const hoveredIdentifier = hoverElement.getAttribute("data-identifier");
                const isNewTarget = !lastTemporaryElement ||
                    (hoveredIdentifier != undefined && hoveredIdentifier !== lastTemporaryElement.object.identifier);

                if (isNewTarget) {
                    // Skip if hovering over a temporary element (our own placeholder)
                    if (hoverElement.getAttribute("temporary") === "true") {
                        moveWorking = false;
                        return;
                    }

                    // Remove previous temporary element if it exists
                    if (lastTemporaryElement) {
                        await removeLastElement();
                    }

                    // Build instruction path to the hovered element
                    const instruction = new InstructionBuilder();
                    const object = searchElementWithIdentifier(hoveredIdentifier!, editedHtmlRef.current!.html, instruction);

                    if (object) {
                        let shouldAdd = false;

                        // Handle insertion based on target type
                        if (object.type === "block") {
                            // Blocks can only contain one child - only add if empty
                            if (!object.content) {
                                instruction.key("content").set(deepCopy(newObject));
                                shouldAdd = true;
                            }
                        } else if (object.type === "list") {
                            // Lists can contain multiple children - calculate smart insertion position
                            const direction = getComputedStyle(hoverElement!).flexDirection as "row" | "column";
                            instruction.key("content");

                            if (object.content.length === 0) {
                                // Empty list - insert at beginning
                                instruction.arrayInsertAtIndex(0, deepCopy(newObject));
                                shouldAdd = true;
                            } else if (object.content) {
                                /**
                                 * Smart position calculation based on cursor position relative to existing children
                                 * - For row direction: uses X-axis position
                                 * - For column direction: uses Y-axis position
                                 * - Splits each child into left/right (or top/bottom) halves for precise insertion
                                 */
                                let insertAt = 0.5; // Start in middle of first element
                                const indexOfTemporary = object.content.findIndex((obj) => obj.temporary);
                                const posX = event.clientX;
                                const posY = event.clientY;

                                // Iterate through visible children to find insertion point
                                for (let i = 0; i < hoverElement!.children.length; i++) {
                                    // Skip the temporary element itself
                                    if (i === indexOfTemporary) continue;

                                    const child = hoverElement!.children[i];
                                    const bounds = child.getBoundingClientRect();

                                    if (direction === "row") {
                                        // Horizontal list - use X position
                                        if (posX > bounds.x && posX < bounds.x + bounds.width) {
                                            // Cursor is within this child's bounds
                                            if (posX > bounds.x + (bounds.width / 2)) {
                                                insertAt += 0.5; // Right half - insert after
                                            } else {
                                                insertAt -= 0.5; // Left half - insert before
                                            }
                                        } else if (posX < bounds.x) {
                                            // Cursor is before this child
                                            insertAt -= 0.5;
                                            break;
                                        } else {
                                            // Cursor is after this child
                                            insertAt += 1;
                                        }
                                    } else {
                                        // Vertical list - use Y position
                                        if (posY > bounds.y && posY < bounds.y + bounds.height) {
                                            // Cursor is within this child's bounds
                                            if (posY > bounds.y + (bounds.height / 2)) {
                                                insertAt += 0.5; // Bottom half - insert after
                                            } else {
                                                insertAt -= 0.5; // Top half - insert before
                                            }
                                        } else if (posY < bounds.y) {
                                            // Cursor is before this child
                                            insertAt -= 0.5;
                                            break;
                                        } else {
                                            // Cursor is after this child
                                            insertAt += 1;
                                        }
                                    }
                                }

                                // Convert to integer index
                                insertAt = Math.floor(insertAt);

                                // Only update if position changed
                                if (indexOfTemporary !== insertAt) {
                                    if (indexOfTemporary !== -1) {
                                        // Remove temporary from old position
                                        await removeLastElement();
                                    }
                                    instruction.arrayInsertAtIndex(insertAt, deepCopy(newObject));
                                    shouldAdd = true;
                                }
                            }
                        }

                        // Send insertion instruction to server and track it
                        if (shouldAdd) {
                            const output: ActionContext | undefined = await updateHtmlRef.current!(instruction.instruction, {
                                targetedIdentifier: object.identifier
                            });
                            lastTemporaryElement = {
                                object: object,
                                instruction: instruction.instruction
                            };
                        }
                    }
                }
            } else if (lastTemporaryElement) {
                // Cursor left all valid drop targets - remove temporary element
                await removeLastElement();
            }

            // Allow next mouse move to process
            moveWorking = false;
        };


        /**
         * Mouse up/leave handler - finalizes the drop operation
         * Cleans up event listeners, removes overlay, and converts temporary element to permanent
         */
        const mouseOut = async (evt: MouseEvent) => {
            // Clean up visual overlay
            overlayContainer.remove();

            // Remove event listeners
            window.removeEventListener("mouseleave", mouseOut);
            window.removeEventListener("mouseup", mouseOut);
            window.removeEventListener("mousemove", mouseMove);

            // Stop animation
            cancelAnimationFrame(animationId);

            // Re-enable text selection
            enableTextSelection();

            // Finalize the drop by removing the temporary flag
            if (lastTemporaryElement) {
                const instruction = new InstructionBuilder();
                instruction.instruction = deepCopy(lastTemporaryElement.instruction);
                instruction.instruction.v = undefined;

                // Navigate to the temporary property and remove it
                if (instruction.instruction.o === OpType.ARR_INS) {
                    // For array insertions, navigate by index then remove temporary property
                    instruction.index(lastTemporaryElement.instruction.i!).key("temporary").remove();
                } else {
                    // For direct content assignment, remove temporary property
                    instruction.key("temporary").remove();
                }

                // Send final instruction to make the element permanent
                const output: ActionContext | undefined = await updateHtmlRef.current!(instruction.instruction);
            }

            // Invoke optional pickup callback if drag didn't actually move
            if (!haveMoved) {
                if (!(onPickup?.(component) ?? true)) {
                    return;
                }
            }
        };

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