import React, { memo, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, crosshairCursor, drawSelection, highlightActiveLine,
    highlightActiveLineGutter, keymap, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { autocompletion,  completionKeymap, closeBrackets, closeBracketsKeymap, Completion, CompletionContext } from '@codemirror/autocomplete';
import { Fade } from "../animate/Fade";
import {
    searchKeymap, highlightSelectionMatches
} from "@codemirror/search"
import {lintKeymap} from "@codemirror/lint"
import { ProjectContext } from "../../hooks/contexts/ProjectContext";
import { useDynamicClass } from "../../hooks/useDynamicClass";
import { applyTextChanges, TextChangeInfo } from "../../../utils/objectUtils";
import { InstructionBuilder } from "../../../utils/sync/InstructionBuilder";
import {GraphInstructions} from "../../../utils/sync/wsObject";
import {
    dropCursor,
    highlightSpecialChars,
    lineNumbers,
    oneDark,
    oneDarkHighlightStyle,
    oneDarkTheme
} from "@uiw/react-codemirror";
import {bracketMatching, defaultHighlightStyle, foldGutter, indentOnInput, syntaxHighlighting, foldKeymap} from "@codemirror/language";
import { Minimize2, Maximize2, X, Code2 } from 'lucide-react';

const CodeEditorModal = memo(() => {
    const Project = useContext(ProjectContext);
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [minimized, setMinimized] = useState(false);
    const [activeTabIndex, setActiveTabIndex] = useState(0);

    // Calculate centered position based on default size
    const defaultSize = { width: 500, height: 500 };
    const getCenteredPosition = () => ({
        top: Math.max(0, (window.innerHeight - defaultSize.height) / 2),
        left: Math.max(0, (window.innerWidth - defaultSize.width) / 2),
    });

    const [position, setPosition] = useState(getCenteredPosition);
    const [size, setSize] = useState(defaultSize);
    const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 });
    const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
    const customCompletions: Completion[] = []; // Add custom completions here based on context

    // Track baseText for each tab to avoid recreating the editor on every change
    const baseTextRef = useRef<Map<number, string>>(new Map());
    // Track the initial editedCode identity to detect when a new code session starts
    const editedCodeIdRef = useRef<string | null>(null);

    const classModal = useDynamicClass(`
    & {
      pointer-events: none;
      position: fixed;
      z-index:2;
      inset: 0px;
    }
  `);

    const classContainer = useDynamicClass(`
    & {
      pointer-events: all;
      position: absolute;
      background: var(--nodius-background-paper);
      box-shadow: var(--nodius-shadow-4);
      border-radius: 12px;
      border: 1px solid rgba(66, 165, 245, 0.2);
      overflow: hidden;
      backdrop-filter: blur(10px);
    }
  `);

    const classHeader = useDynamicClass(`
    & {
      height: 48px;
      background: transparent;
      display: flex;
      align-items: center;
      padding: 0 16px;
      cursor: grab;
      user-select: none;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      gap: 12px;
      position: relative;
    }
    &:active {
      cursor: grabbing;
    }

  `);

    const classTitle = useDynamicClass(`
    & {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--nodius-text-primary);
      font-weight: 500;
      font-size: 13px;
      letter-spacing: 0.3px;
      flex: 1;
      opacity: 0.9;
    }
    & > svg {
      color: var(--nodius-primary-main);
      opacity: 0.8;
    }
    & > h4 {
        padding-top:2px;
    }
  `);

    const classButtonGroup = useDynamicClass(`
    & {
      display: flex;
      gap: 8px;
      align-items: center;
    }
  `);

    const classIconButton = useDynamicClass(`
    & {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--nodius-text-secondary);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      padding: 0;
    }
    &:hover {
      background: rgba(66, 165, 245, 0.1);
      color: var(--nodius-primary-light);
      transform: translateY(-1px);
    }
    &:active {
      transform: translateY(0);
    }
  `);

    const classCloseButton = useDynamicClass(`
    & {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--nodius-text-secondary);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      padding: 0;
    }
    &:hover {
      background: rgba(244, 67, 54, 0.15);
      color: var(--nodius-error-light);
      transform: translateY(-1px);
    }
    &:active {
      transform: translateY(0);
    }
  `);

    const classResizer = useDynamicClass(`
    & {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 20px;
      height: 20px;
      cursor: nwse-resize;
      transition: var(--nodius-transition-default);
    }
    &::after {
      content: '';
      position: absolute;
      right: 2px;
      bottom: 2px;
      width: 12px;
      height: 12px;
      background:
        linear-gradient(135deg, transparent 0%, transparent 50%, rgba(66, 165, 245, 0.3) 50%);
      border-bottom-right-radius: 12px;
      transition: var(--nodius-transition-default);
    }
    &:hover::after {
      background:
        linear-gradient(135deg, transparent 0%, transparent 50%, var(--nodius-primary-main) 50%);
    }
  `);

    const classTabBar = useDynamicClass(`
    & {
      display: flex;
      gap: 4px;
      padding: 8px 16px;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      overflow-x: auto;
      overflow-y: hidden;
    }
    &::-webkit-scrollbar {
      height: 4px;
    }
    &::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(66, 165, 245, 0.3);
      border-radius: 2px;
    }
    &::-webkit-scrollbar-thumb:hover {
      background: rgba(66, 165, 245, 0.5);
    }
  `);

    const classTab = useDynamicClass(`
    & {
      padding: 6px 12px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--nodius-text-secondary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    &:hover {
      background: rgba(66, 165, 245, 0.1);
      color: var(--nodius-text-primary);
    }
    &.active {
      background: rgba(66, 165, 245, 0.2);
      color: var(--nodius-primary-light);
    }
  `);

    const classTabCloseButton = useDynamicClass(`
    & {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--nodius-text-secondary);
      cursor: pointer;
      padding: 0;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      flex-shrink: 0;
    }
    &:hover {
      background: rgba(244, 67, 54, 0.2);
      color: var(--nodius-error-light);
    }
  `);



    const customSource = (ctx: CompletionContext) => {
        const word = ctx.matchBefore(/\w*/);
        if (!word || (word.from === word.to && !ctx.explicit)) return null;
        return {
            from: word.from,
            options: customCompletions,
        };
    };

    // Stable applyChange function factory - creates a closure for each tab
    const createApplyChangeForTab = useCallback((tabIndex: number) => {
        return (changes: TextChangeInfo | TextChangeInfo[]) => {
            const normalizedChanges = Array.isArray(changes) ? changes : [changes];
            const cmChanges = normalizedChanges.map(c => ({
                from: c.from,
                to: c.to !== undefined ? c.to : c.from,
                insert: c.insert || '',
            }));

            // Update local ref without triggering state update
            const currentBaseText = baseTextRef.current.get(tabIndex) || "";
            const newBaseText = applyTextChanges(currentBaseText, normalizedChanges);
            baseTextRef.current.set(tabIndex, newBaseText);

            // Only apply changes if this is the currently active tab
            if (tabIndex === activeTabIndex && viewRef.current) {
                viewRef.current.dispatch({ changes: cmChanges });
            }
        };
    }, [activeTabIndex]);

    // Register applyChange callback for each tab that doesn't have one
    useEffect(() => {
        if (Project.state.editedCode.length > 0) {
            const updatedTabs = Project.state.editedCode.map((tab, index) => {
                if (!tab.applyChange) {
                    return {
                        ...tab,
                        applyChange: createApplyChangeForTab(index),
                    };
                }
                return tab;
            });

            // Only update if there were changes
            if (updatedTabs.some((tab, index) => tab !== Project.state.editedCode[index])) {
                Project.dispatch({
                    field: "editedCode",
                    value: updatedTabs,
                });
            }
        }
    }, [Project.state.editedCode, createApplyChangeForTab]);

    const avoidNextUpdate = useRef<boolean>(false);

    // Batching refs for debounced sending
    const pendingChangesRef = useRef<TextChangeInfo[]>([]);
    const sendTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Debounced batch send function
    const batchSendChangesRef = useRef<((changes: TextChangeInfo[]) => void) | null>(null);

    batchSendChangesRef.current = (changes: TextChangeInfo[]) => {
        // Add changes to pending queue
        pendingChangesRef.current.push(...changes);

        // Clear existing timeout
        if (sendTimeoutRef.current) {
            clearTimeout(sendTimeoutRef.current);
        }

        // Set new timeout to send after 300ms
        sendTimeoutRef.current = setTimeout(() => {
            if (pendingChangesRef.current.length > 0) {
                const changesToSend = [...pendingChangesRef.current];
                pendingChangesRef.current = [];
                sendChangesRef.current?.(changesToSend);
            }
            sendTimeoutRef.current = null;
        }, 300);
    };

    const mergeChanges = (changes: TextChangeInfo[]): TextChangeInfo[] => {
        if (changes.length <= 1) return changes;
        const merged: TextChangeInfo[] = [];
        let current = { ...changes[0] };
        for (let i = 1; i < changes.length; i++) {
            const next = { ...changes[i] };
            if (
                current.to === current.from &&
                next.to === next.from &&
                next.from === current.from + (current.insert?.length ?? 0)
            ) {
                current.insert = (current.insert ?? '') + (next.insert ?? '');
            } else {
                merged.push(current);
                current = { ...next };
            }
        }
        merged.push(current);
        return merged;
    };

    // Use ref for sendChanges to keep it stable and avoid recreating editor extensions
    const sendChangesRef = useRef<((changes: TextChangeInfo[]) => Promise<boolean>) | null>(null);

    sendChangesRef.current = async (changes: TextChangeInfo[]) : Promise<boolean> => {
        if (Project.state.editedCode.length === 0 || !Project.state.updateGraph || !Project.state.graph || !Project.state.selectedSheetId) return false;
        if (changes.length === 0) return false;

        const activeTab = Project.state.editedCode[activeTabIndex];
        if (!activeTab) return false;

        const node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(activeTab.nodeId);
        if(!node) return false;

        const oldBaseText = baseTextRef.current.get(activeTabIndex) ?? "";
        const newBaseText = applyTextChanges(oldBaseText, changes.map(c => ({ from: c.from, to: c.to, insert: c.insert })));
        const mergedChanges = mergeChanges(changes);

        // Update ref instead of state to avoid editor recreation
        baseTextRef.current.set(activeTabIndex, newBaseText);

        let instructions: GraphInstructions[];
        if (node.process) {
            instructions = mergedChanges.map(change => {
                const instruction = new InstructionBuilder();
                for (const path of activeTab.path) {
                    instruction.key(path);
                }
                instruction.insertString(change.from, change.insert, change.to);
                return {
                    nodeId: activeTab.nodeId,
                    i: instruction.instruction,
                    dontApplyToMySelf: true,
                };
            });
        } else {
            const instruction = new InstructionBuilder();
            for (const path of activeTab.path) {
                instruction.key(path);
            }
            instruction.set(newBaseText);
            instructions = [{
                nodeId: activeTab.nodeId,
                i: instruction.instruction,
                dontApplyToMySelf: true,
            }];
        }
        node.process = newBaseText;

        const output = await Project.state.updateGraph(instructions);

        if (!output.status) {
            // Rollback to old baseText, may lose concurrent remote changes in race conditions
            baseTextRef.current.set(activeTabIndex, oldBaseText);
            if (viewRef.current) {
                avoidNextUpdate.current = true;
                viewRef.current.dispatch({
                    changes: { from: 0, to: viewRef.current.state.doc.length, insert: oldBaseText },
                });
            }
        }

        return output.status;
    };

    // Editor initialization effect - recreate when switching tabs or opening new session
    useEffect(() => {
        if (Project.state.editedCode.length === 0 || !editorRef.current) return;

        const activeTab = Project.state.editedCode[activeTabIndex];
        if (!activeTab) return;

        // Check if this is a new code editing session or tab switch
        const currentId = `${activeTab.nodeId}-${activeTab.path.join('.')}`;
        const isNewSession = editedCodeIdRef.current !== currentId;

        if (!isNewSession && viewRef.current) {
            // Same tab, don't recreate editor
            return;
        }

        // New tab or session - update tracking refs
        editedCodeIdRef.current = currentId;
        const baseText = activeTab.baseText || "";
        baseTextRef.current.set(activeTabIndex, baseText);

        // Only recenter modal if it's a brand new session (not just a tab switch)
        if (!viewRef.current) {
            setPosition(getCenteredPosition());
            setSize(defaultSize);
            setMinimized(false);
        }

        const startState = EditorState.create({
            doc: baseText,
            extensions: [
                // A line number gutter
                lineNumbers(),
                // A gutter with code folding markers
                foldGutter(),
                // Replace non-printable characters with placeholders
                highlightSpecialChars(),
                // The undo history
                history(),
                // Replace native cursor/selection with our own
                drawSelection(),
                // Show a drop cursor when dragging over the editor
                dropCursor(),
                // Allow multiple cursors/selections
                EditorState.allowMultipleSelections.of(true),
                // Re-indent lines when typing specific input
                indentOnInput(),
                // Highlight syntax with a default style
                syntaxHighlighting(/*defaultHighlightStyle*/oneDarkHighlightStyle),
                // Highlight matching brackets near cursor
                bracketMatching(),
                // Automatically close brackets
                closeBrackets(),
                // Load the autocompletion system
                autocompletion(),
                // Allow alt-drag to select rectangular regions
                rectangularSelection(),
                // Change the cursor to a crosshair when holding alt
                crosshairCursor(),
                // Style the current line specially
                highlightActiveLine(),
                // Style the gutter for current line specially
                highlightActiveLineGutter(),
                // Highlight text that matches the selected text
                highlightSelectionMatches(),
                oneDark,
                oneDarkTheme,
                keymap.of([
                    // Closed-brackets aware backspace
                    ...closeBracketsKeymap,
                    // A large set of basic bindings
                    ...defaultKeymap,
                    // Search-related keys
                    ...searchKeymap,
                    // Redo/undo keys
                    ...historyKeymap,
                    // Code folding bindings
                    ...foldKeymap,
                    // Autocompletion keys
                    ...completionKeymap,
                    // Keys related to the linter system
                    ...lintKeymap,
                ]),
                javascript(),
                autocompletion({ override: [customSource] }),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        const changes: TextChangeInfo[] = [];
                        update.transactions.forEach(tr => {
                            tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                                changes.push({ from: fromA, to: toA, insert: inserted.toString() });
                            });
                        });
                        if (changes.length > 0) {
                            if(avoidNextUpdate.current) {
                                avoidNextUpdate.current = false;
                                return;
                            }
                            // Use batch send instead of immediate send
                            batchSendChangesRef.current?.(changes);
                        }
                    }
                }),
            ],
        });

        const view = new EditorView({
            state: startState,
            parent: editorRef.current,

        });

        viewRef.current = view;

        return () => {
            // Clear pending timer when switching tabs
            if (sendTimeoutRef.current) {
                clearTimeout(sendTimeoutRef.current);
                sendTimeoutRef.current = null;
            }
            // Send any pending changes immediately before destroying
            if (pendingChangesRef.current.length > 0) {
                const changesToSend = [...pendingChangesRef.current];
                pendingChangesRef.current = [];
                sendChangesRef.current?.(changesToSend);
            }
            view.destroy();
            viewRef.current = null;
        };
    }, [activeTabIndex, Project.state.editedCode]);

    // Cleanup when modal is closed
    useEffect(() => {
        if (Project.state.editedCode.length === 0) {
            // Clear pending timer
            if (sendTimeoutRef.current) {
                clearTimeout(sendTimeoutRef.current);
                sendTimeoutRef.current = null;
            }
            // Send any pending changes immediately before closing
            if (pendingChangesRef.current.length > 0) {
                const changesToSend = [...pendingChangesRef.current];
                pendingChangesRef.current = [];
                sendChangesRef.current?.(changesToSend);
            }
            editedCodeIdRef.current = null;
            baseTextRef.current.clear();
            setActiveTabIndex(0);
        }
    }, [Project.state.editedCode]);

    // Reset active tab if it goes out of bounds
    useEffect(() => {
        if (activeTabIndex >= Project.state.editedCode.length && Project.state.editedCode.length > 0) {
            setActiveTabIndex(Project.state.editedCode.length - 1);
        }
    }, [activeTabIndex, Project.state.editedCode.length]);

    // Drag handling
    const handleDragStart = (e: React.MouseEvent) => {
        e.preventDefault();
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            left: position.left,
            top: position.top,
        };
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
    };

    const handleDragMove = (e: MouseEvent) => {
        let newLeft = dragStartRef.current.left + e.clientX - dragStartRef.current.x;
        let newTop = dragStartRef.current.top + e.clientY - dragStartRef.current.y;
        newLeft = Math.max(0, Math.min(window.innerWidth - size.width, newLeft));
        newTop = Math.max(0, Math.min(window.innerHeight - size.height, newTop));
        setPosition({ top: newTop, left: newLeft });
    };

    const handleDragEnd = () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
    };

    // Resize handling
    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        resizeStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            width: size.width,
            height: size.height,
        };
        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
    };

    const handleResizeMove = (e: MouseEvent) => {
        let newWidth = resizeStartRef.current.width + e.clientX - resizeStartRef.current.x;
        let newHeight = resizeStartRef.current.height + e.clientY - resizeStartRef.current.y;
        newWidth = Math.max(200, Math.min(window.innerWidth - position.left, newWidth)); // Min width 200
        newHeight = Math.max(200, Math.min(window.innerHeight - position.top, newHeight)); // Min height 200
        setSize({ width: newWidth, height: newHeight });
    };

    const handleResizeEnd = () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
    };

    // Handle window resize to clamp modal
    useEffect(() => {
        const handleWindowResize = () => {
            let newLeft = Math.min(position.left, window.innerWidth - size.width);
            let newTop = Math.min(position.top, window.innerHeight - size.height);
            newLeft = Math.max(0, newLeft);
            newTop = Math.max(0, newTop);
            setPosition({ top: newTop, left: newLeft });
        };

        window.addEventListener('resize', handleWindowResize);
        return () => window.removeEventListener('resize', handleWindowResize);
    }, [position, size]);

    const handleTabClose = (e: React.MouseEvent, tabIndex: number) => {
        e.stopPropagation();
        const newTabs = Project.state.editedCode.filter((_, index) => index !== tabIndex);
        Project.dispatch({ field: "editedCode", value: newTabs });

        // Adjust active tab if needed
        if (tabIndex === activeTabIndex && newTabs.length > 0) {
            setActiveTabIndex(Math.min(activeTabIndex, newTabs.length - 1));
        } else if (tabIndex < activeTabIndex) {
            setActiveTabIndex(activeTabIndex - 1);
        }
    };

    const onClose = () => {
        Project.dispatch({ field: "editedCode", value: [] });
    };

    if (Project.state.editedCode.length === 0) return null;

    const activeTab = Project.state.editedCode[activeTabIndex];

    const containerStyle = {
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${size.width}px`,
        height: minimized ? '48px' : `${size.height}px`,
        overflow: minimized ? 'hidden' : 'visible',
    };

    const editorStyle = {
        height: Project.state.editedCode.length > 1 ? 'calc(100% - 48px - 40px)' : 'calc(100% - 48px)',
        display: minimized ? 'none' : 'block',
        borderRadius: "12px"
    };

    return (
        <Fade in={Project.state.editedCode.length > 0} unmountOnExit>
            <div className={classModal}>
                <div ref={containerRef} className={classContainer} style={containerStyle}>
                    <div className={classHeader} onMouseDown={handleDragStart}>
                        <div className={classTitle}>
                            <Code2 size={18} />
                            <h4>{activeTab?.title || 'Code Editor'}</h4>
                        </div>
                        <div className={classButtonGroup}>
                            <button
                                className={classIconButton}
                                onClick={() => setMinimized(!minimized)}
                                title={minimized ? 'Maximize' : 'Minimize'}
                            >
                                {minimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                            </button>
                            <button
                                className={classCloseButton}
                                onClick={onClose}
                                title="Close"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                    {Project.state.editedCode.length > 1 && (
                        <div className={classTabBar}>
                            {Project.state.editedCode.map((tab, index) => (
                                <button
                                    key={`${tab.nodeId}-${tab.path.join('.')}`}
                                    className={`${classTab} ${index === activeTabIndex ? 'active' : ''}`}
                                    onClick={() => setActiveTabIndex(index)}
                                >
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {tab.title}
                                    </span>
                                    <button
                                        className={classTabCloseButton}
                                        onClick={(e) => handleTabClose(e, index)}
                                        title="Close tab"
                                    >
                                        <X size={12} />
                                    </button>
                                </button>
                            ))}
                        </div>
                    )}
                    <div ref={editorRef} style={editorStyle} className={"ͼo"} />
                    {!minimized && <div className={classResizer} onMouseDown={handleResizeStart} />}
                </div>
            </div>
        </Fade>
    );
});

CodeEditorModal.displayName = 'CodeEditorModal';

export { CodeEditorModal };
