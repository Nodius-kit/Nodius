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

const CodeEditorModal = memo(() => {
    const Project = useContext(ProjectContext);
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [minimized, setMinimized] = useState(false);
    const [position, setPosition] = useState({ top: 50, left: 50 });
    const [size, setSize] = useState({ width: 500, height: 500 });
    const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 });
    const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
    const customCompletions: Completion[] = []; // Add custom completions here based on context

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
      box-shadow: var(--nodius-shadow-2);
      border-radius: 4px;
    }
  `);

    const classHeader = useDynamicClass(`
    & {
      height: 40px;
      background: var(--nodius-header-background);
      display: flex;
      align-items: center;
      padding: 0 10px;
      cursor: grab;
      user-select: none;
      border-bottom: 1px solid var(--nodius-border);
      border-top-left-radius: 4px;
      border-top-right-radius: 4px;
    }
  `);

    const classResizer = useDynamicClass(`
    & {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 10px;
      height: 10px;
      cursor: nwse-resize;
      background: transparent;
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

    const applyChange = (changes: TextChangeInfo | TextChangeInfo[]) => {
        if(!Project.state.editedCode) return;
        const normalizedChanges = Array.isArray(changes) ? changes : [changes];
        const cmChanges = normalizedChanges.map(c => ({
            from: c.from,
            to: c.to !== undefined ? c.to : c.from,
            insert: c.insert || '',
        }));

        Project.dispatch({
            field: "editedCode",
            value: {
                ...Project.state.editedCode,
                baseText: applyTextChanges(Project.state.editedCode.baseText, normalizedChanges),
            },
        });

        if (viewRef.current) {
            viewRef.current.dispatch({ changes: cmChanges });
        }
    };

    useEffect(() => {
        if (Project.state.editedCode && Project.state.editedCode.applyChange !== applyChange) {
            Project.dispatch({
                field: "editedCode",
                value: {
                    ...Project.state.editedCode,
                    applyChange,
                },
            });
        }
    }, []);

    const avoidNextUpdate = useRef<boolean>(false);

    const sendChanges = useCallback(async (changes: TextChangeInfo[]) : Promise<boolean> => {
        if (!Project.state.editedCode || !Project.state.updateGraph || !Project.state.graph || !Project.state.selectedSheetId) return false;

        const node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(Project.state.editedCode.nodeId);
        if(!node) return false;

        const oldBaseText = Project.state.editedCode.baseText;
        const newBaseText = applyTextChanges(oldBaseText, changes.map(c => ({ from: c.from, to: c.to, insert: c.insert })));

        Project.dispatch({
            field: "editedCode",
            value: {
                ...Project.state.editedCode,
                baseText: newBaseText,
            },
        });

        const instructions:GraphInstructions[] = changes.map(change => {
            const instruction = new InstructionBuilder();
            for (const path of Project.state.editedCode!.path) {
                instruction.key(path);
            }
            if(node.process) {
                instruction.insertString(change.from, change.insert, change.to);
                node.process = newBaseText
            } else {
                instruction.set(change.insert);
                node.process = change.insert;
            }
            return {
                nodeId: Project.state.editedCode!.nodeId,
                i: instruction.instruction,
                dontApplyToMySelf: true,
            };
        });

        const output = await Project.state.updateGraph(instructions);

        if (!output.status) {
            // Rollback to old baseText, may lose concurrent remote changes in race conditions
            Project.dispatch({
                field: "editedCode",
                value: {
                    ...Project.state.editedCode,
                    baseText: oldBaseText,
                },
            });
            if (viewRef.current) {
                avoidNextUpdate.current = true;
                viewRef.current.dispatch({
                    changes: { from: 0, to: viewRef.current.state.doc.length, insert: oldBaseText },
                });
            }
        }

        return output.status;
    }, [Project.state.updateGraph, Project.state.editedCode, Project.state.graph, Project.state.selectedSheetId]);

    useEffect(() => {
        if (!Project.state.editedCode || !editorRef.current) return;

        const startState = EditorState.create({
            doc: Project.state.editedCode.baseText,
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
                EditorView.updateListener.of(async (update) => {
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
                            await sendChanges(changes);
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
            view.destroy();
            viewRef.current = null;
        };
    }, [Project.state.editedCode, sendChanges]);

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

    const onClose = () => {
        Project.dispatch({ field: "editedCode", value: undefined });
    };

    if (!Project.state.editedCode) return null;

    const containerStyle = {
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${size.width}px`,
        height: minimized ? '40px' : `${size.height}px`,
        overflow: minimized ? 'hidden' : 'visible',
    };

    const editorStyle = {
        height: 'calc(100% - 40px)',
        display: minimized ? 'none' : 'block',
    };

    return (
        <Fade in={!!Project.state.editedCode} unmountOnExit>
            <div className={classModal}>
                <div ref={containerRef} className={classContainer} style={containerStyle}>
                    <div className={classHeader} onMouseDown={handleDragStart}>
                        <span>Code Editor</span>
                        <button onClick={() => setMinimized(!minimized)} style={{ marginLeft: 'auto' }}>
                            {minimized ? 'Maximize' : 'Minimize'}
                        </button>
                        <button onClick={onClose} style={{ marginLeft: '10px' }}>
                            Close
                        </button>
                    </div>
                    <div ref={editorRef} style={editorStyle} />
                    {!minimized && <div className={classResizer} onMouseDown={handleResizeStart} />}
                </div>
            </div>
        </Fade>
    );
});

CodeEditorModal.displayName = 'CodeEditorModal';

export { CodeEditorModal };
