/**
 * @file ResponsiveTable.tsx
 * @description Advanced table component with virtualization and drag-and-drop row reordering
 * @module component/form
 *
 * A high-performance table component that uses absolute positioning for rows to enable:
 * - **Virtualization-Ready**: Rows are absolutely positioned for efficient rendering
 * - **Drag-and-Drop Reordering**: Drag rows by the grip handle to reorder
 * - **Fixed Row Heights**: Consistent row heights for predictable scrolling
 * - **Responsive Layout**: Adapts to container size with scroll support
 * - **Column Width Syncing**: Automatically syncs tbody column widths with thead
 * - **Smooth Animations**: Transitions for row position changes
 * - **Theme Support**: Full dark/light theme integration
 *
 * Technical Implementation:
 * - Modifies children React elements to inject positioning and drag functionality
 * - Uses ResizeObserver via useElementSize to track column widths
 * - Clones dragged row during drag operation for smooth visual feedback
 * - Prevents text selection during drag
 * - Calculates row positions based on fixed rowHeight
 * - tbody height is set dynamically based on number of rows
 *
 * Drag Behavior:
 * - GripVertical icon appears in first cell when draggable=true
 * - Mouse down on grip clones row and enters drag mode
 * - Dragged row follows mouse with z-index layering
 * - Calls draggeableMoveIndex callback when row crosses index boundaries
 * - Smooth transition back to final position on mouse up
 *
 * Common Use Cases:
 * - Data tables with reorderable rows
 * - Task lists
 * - Priority queues
 * - Large datasets (combine with virtual scrolling)
 */

import React, { memo, PropsWithChildren, ReactElement, ReactNode, useContext, useRef, useState, useEffect } from "react";
import { GripVertical } from "lucide-react";
import { useDynamicClass } from "../../hooks/useDynamicClass";
import { ThemeContext } from "../../hooks/contexts/ThemeContext";
import {useElementSize} from "../../hooks/useElementSize";
import {disableTextSelection, enableTextSelection} from "../../../utils/objectUtils";

interface ResponsiveTableProps {
    maxWidth?: number;
    maxHeight?: number;
    rowHeight?: number;
    draggeable?: boolean;
    draggeableMoveIndex?: (from:number, to:number) => void;
}

export const ResponsiveTable = memo(({
    children,
    maxWidth,
    maxHeight,
    rowHeight = 50,
    draggeable = false,
    draggeableMoveIndex
}: PropsWithChildren<ResponsiveTableProps>) => {

    const Theme = useContext(ThemeContext);
    const theadRef = useRef<HTMLTableSectionElement>(null);
    const [columnWidths, setColumnWidths] = useState<number[]>([]);

    const container = useElementSize();


    useEffect(() => {
        if (theadRef.current) {
            const ths = Array.from(theadRef.current.querySelectorAll('th'));
            const widths = ths.map(th => th.offsetWidth);
            setColumnWidths(widths);
        }
    }, [container.bounds]);

    const containerClass = useDynamicClass(`
        & {
            width: 100%;
            ${maxWidth != undefined ? `max-width:${maxWidth}px;`: ""}
            ${maxHeight != undefined ? `max-height:${maxHeight}px;`: ""}
            overflow-x:auto;
            overflow-y:auto;
        }
        
        & table {
            width:100%;
            border-spacing: 0;
            border-collapse: collapse;
            table-layout: fixed;
        }
        
        & table thead {
            text-align:left;
        }
        
        & table thead tr th {
            border-bottom:1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.2)};
            color: var(--nodius-text-secondary);
            font-size:16px;
            font-weight:400;
            padding: 6px 12px;
            box-sizing: border-box;
        }
        
        & table tbody {
            position:relative;
        }
        
        & table tbody tr {
            position:absolute;
            width: 100%;
            height:${rowHeight}px;
            display: table-row;
            transition: var(--nodius-transition-default);
            background-color: var(--nodius-background-default);
        }
        
        & table tbody tr td {
            border-bottom:1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.15)};
            color: var(--nodius-text-primary);
            font-size:16px;
            font-weight:400;
            padding: 6px 12px;
            box-sizing: border-box;
            height:${rowHeight}px;
        }

        & .drag-handle {
            display: inline-flex;
            align-items: center;
            margin-right: 8px;
            cursor: grab;
            color: var(--nodius-text-secondary);
            opacity: 0.6;
            transition: opacity 0.2s;
        }

        & .drag-handle:hover {
            opacity: 1;
        }
    `);

    const onMouseDown = (evt:React.MouseEvent) => {

        const element = (evt.target as HTMLElement).closest("tr") as HTMLElement | null;
        if(!element) return;

        const tableElement = element.closest("table");
        if(!tableElement) return;

        let thead:HTMLElement|undefined;
        for(let i = 0; i < tableElement.children.length; i++) {
            if(tableElement.children[i].tagName.toLowerCase() == "thead") {
                thead = tableElement.children[i] as HTMLElement;
            }
        }
        if(!thead) return;

        let lastY = evt.clientY;
        let currentTop = parseInt(element!.style.top.replaceAll("px", ""));
        const baseTop = currentTop;

        const newNode = element.cloneNode(true) as HTMLElement;

        element.parentElement!.appendChild(newNode);

        newNode!.style.zIndex = "2";
        newNode!.style.transition = "none";

        disableTextSelection();

        let currentIndex = Math.round(currentTop / rowHeight);

        const onMouseMove = (evt: MouseEvent) => {
            const deltaY = evt.clientY - lastY;
            lastY = evt.clientY;
            currentTop += deltaY;
            currentTop = Math.min(Math.max(0, currentTop), (container.bounds?.height ?? Infinity) - rowHeight - thead!.getBoundingClientRect().height);
            newNode.style.top = `${currentTop}px`;

            const newIndex = Math.round(currentTop / rowHeight);
            if(newIndex !== currentIndex) {
                draggeableMoveIndex?.(currentIndex, newIndex);
                currentIndex = newIndex;
            }
        };

        const onMouseUp = (evt:MouseEvent) => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            enableTextSelection();
            newNode!.style.transition = "var(--nodius-transition-default)";
            newNode.style.top = `${currentIndex * rowHeight}px`;
            setTimeout(() => {
                element.parentElement!.removeChild(newNode);
            }, 500);
        }

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);

    }

    const modifyChildren = (children: ReactNode, rowIndex = 0): ReactNode => {
        let currentRowIndex = 0;
        return React.Children.map(children, (child) => {
            if (!React.isValidElement(child)) {
                return child;
            }

            const element = child as ReactElement<any>;

            // Handle thead element
            if (element.type === 'thead') {
                return React.cloneElement(element, {
                    ...element.props,
                    ref: theadRef,
                    children: modifyChildren(element.props.children, rowIndex)
                });
            }

            // Handle tbody element
            if (element.type === 'tbody') {
                const modifiedTbodyChildren = React.Children.map(element.props.children, (tbodyChild: ReactElement<any>) => {
                    if (!React.isValidElement(tbodyChild)) {
                        return tbodyChild;
                    }

                    // Handle tr element
                    if (tbodyChild.type === 'tr') {
                        const thisRowIndex = currentRowIndex++;
                        let currentCellIndex = 0;

                        const modifiedTrChildren = React.Children.map((tbodyChild as any).props.children, (trChild: ReactElement<any>) => {
                            if (!React.isValidElement(trChild)) {
                                return trChild;
                            }

                            // Handle td element
                            if (trChild.type === 'td') {
                                const thisCellIndex = currentCellIndex++;
                                const tdWidth = columnWidths.length > thisCellIndex ? columnWidths[thisCellIndex] : undefined;
                                const isFirstCell = thisCellIndex === 0;

                                // Add drag icon to first cell if draggeable is true
                                const cellContent = isFirstCell && draggeable ? (
                                    <div style={{display:"flex", flexDirection:"row"}}>
                                        <span
                                            className="drag-handle"
                                            onMouseDown={onMouseDown}
                                        >
                                            <GripVertical size={18} />
                                        </span>
                                        {(trChild as any).props.children}
                                    </div>
                                ) : (trChild as any).props.children;

                                return React.cloneElement(trChild, {
                                    ...(trChild as any).props,
                                    style: {
                                        ...(trChild as any).props.style,
                                        ...(tdWidth ? { width: `${tdWidth}px` } : {}),
                                    },
                                    children: cellContent
                                });
                            }

                            return trChild;
                        });

                        return React.cloneElement(tbodyChild, {
                            ...(tbodyChild as any).props,
                            style: {
                                ...(tbodyChild as any).props.style,
                                ...{
                                    left: 0,
                                    top: `${thisRowIndex * rowHeight}px`,
                                }
                            },
                            children: modifiedTrChildren
                        });
                    }
                    return tbodyChild;
                });

                return React.cloneElement(element, {
                    ...element.props,
                    style: {
                        ...(element as any).props.style,
                        ...{
                            height: `${currentRowIndex * rowHeight}px`
                        }
                    },
                    children: modifiedTbodyChildren
                });
            }

            // Recursively process other children
            if (element.props.children) {
                return React.cloneElement(element, {
                    ...element.props,
                    children: modifyChildren(element.props.children, rowIndex)
                });
            }
            return element;
        });
    };

    return (
        <div className={containerClass} ref={container.refCallBack}>
            {modifyChildren(children)}
        </div>
    );
});
ResponsiveTable.displayName = "ResponsiveTable";