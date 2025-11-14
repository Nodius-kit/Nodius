import React, { memo, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, crosshairCursor, drawSelection, highlightActiveLine,
    highlightActiveLineGutter, keymap, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import {html} from "@codemirror/lang-html"
import { autocompletion,  completionKeymap, closeBrackets, closeBracketsKeymap, Completion, CompletionContext } from '@codemirror/autocomplete';
import { Fade } from "../animate/Fade";
import {
    searchKeymap, highlightSelectionMatches
} from "@codemirror/search"
import {lintKeymap} from "@codemirror/lint"
import { ProjectContext } from "../../hooks/contexts/ProjectContext";
import { useDynamicClass } from "../../hooks/useDynamicClass";
import {applyTextChanges, deepCopy, TextChangeInfo} from "../../../utils/objectUtils";
import {Instruction, InstructionBuilder} from "../../../utils/sync/InstructionBuilder";
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
import {useStableProjectRef} from "../../hooks/useStableProjectRef";

export interface EditorBlockProps {
    index:number,
}

export const EditorBlock = memo(({index}:EditorBlockProps) => {
    const Project = useContext(ProjectContext);
    const projectRef = useStableProjectRef();

    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const customCompletions: Completion[] = []; // Add custom completions here based on context

    const cumulateChange = useRef<TextChangeInfo[]>([]);

    const initialContent = useRef<string>("");

    const timeoutSendChange = useRef<NodeJS.Timeout>(undefined);


    const optimizeChanges = (changes: TextChangeInfo[]): TextChangeInfo[]  => {
        if (changes.length === 0) {
            return [];
        }
        const optimized: TextChangeInfo[] = [];
        let current: TextChangeInfo = { ...changes[0] };
        for (let i = 1; i < changes.length; i++) {
            const next: TextChangeInfo = { ...changes[i] };
            let merged = false;
            if (current.from === current.to && current.insert !== '') {
                // Current is an insert
                if (next.from === next.to && next.insert !== '') {
                    // Merge consecutive inserts
                    if (next.from === current.from + current.insert.length) {
                        current.insert += next.insert;
                        merged = true;
                    }
                } else if (next.insert === '' && next.from < next.to!) {
                    // Apply delete within the insert range
                    const relFrom = next.from - current.from;
                    const relTo = next.to! - current.from;
                    if (relFrom >= 0 && relTo <= current.insert.length && relFrom < relTo) {
                        current.insert = current.insert.slice(0, relFrom) + next.insert + current.insert.slice(relTo);
                        merged = true;
                    }
                }
            } else if (current.insert === '' && current.from < current.to!) {
                // Current is a delete
                if (next.insert === '' && next.from < next.to!) {
                    // Merge adjacent deletes
                    if (next.to === current.from) {
                        // Backward adjacent
                        current.from = next.from;
                        merged = true;
                    } else if (next.from === current.to) {
                        // Forward adjacent
                        current.to = next.to;
                        merged = true;
                    }
                } else if (next.from === next.to && next.insert !== '') {
                    // Merge insert at delete start into a replace
                    if (next.from === current.from) {
                        current.insert = next.insert;
                        merged = true;
                    }
                }
            }
            if (!merged) {
                // Skip no-op (empty insert at point)
                if (!(current.from === current.to && current.insert === '')) {
                    optimized.push(current);
                }
                current = { ...next };
            }
        }
        // Add the last one if not no-op
        if (!(current.from === current.to && current.insert === '')) {
            optimized.push(current);
        }
        return optimized;
    }
    const customSource = (ctx: CompletionContext) => {
        const word = ctx.matchBefore(/\w*/);
        if (!word || (word.from === word.to && !ctx.explicit)) return null;
        return {
            from: word.from,
            options: customCompletions,
        };
    };


    const avoidNextUpdate = useRef<boolean>(false);
    const sendChange = async () => {
        const changes = deepCopy(cumulateChange.current);
        cumulateChange.current = [];
        timeoutSendChange.current = undefined;

        const editor = projectRef.current.state.editedCode[index];
        if(!editor) return;

        const oldBaseText = initialContent.current;
        const newBaseText = applyTextChanges(oldBaseText, changes.map(c => ({ from: c.from, to: c.to, insert: c.insert })));

        const instructions:Instruction[] = changes.map(change => {
            const instruction = new InstructionBuilder();
            instruction.insertString(change.from, change.insert, change.to);
            return instruction.instruction;
        });


        const result = await editor.onChange(instructions);
        if(!result) {
            initialContent.current = newBaseText;
            avoidNextUpdate.current = true;
            if (viewRef.current) {
                avoidNextUpdate.current = true;
                viewRef.current.dispatch({
                    changes: { from: 0, to: viewRef.current.state.doc.length, insert: oldBaseText },
                });
            }
        }
    }

    const onOutsideChange = () => {
        const currentEditor = Project.state.editedCode[index]
        if(!currentEditor) return;

        const node = projectRef.current.state.graph?.sheets[projectRef.current.state.selectedSheetId ?? ""].nodeMap.get(currentEditor.nodeId);
        if(!node)  return;


        initialContent.current = currentEditor.retrieveText(node);

        if (viewRef.current) {
            avoidNextUpdate.current = true;
            const currentSelection = viewRef.current.state.selection.main;
            const cursorPos = currentSelection.head;
            viewRef.current.dispatch({
                changes: {
                    from: 0,
                    to: viewRef.current.state.doc.length,
                    insert: initialContent.current
                },
                selection: {
                    anchor: Math.min(cursorPos, initialContent.current.length),
                    head: Math.min(cursorPos, initialContent.current.length)
                }
            });
        }
    }


    useEffect(() => {
        if (!Project.state.editedCode || !editorRef.current || viewRef.current) return;
        const currentEditor = Project.state.editedCode[index]
        if(!currentEditor) return;

        cumulateChange.current = [];

        const node = projectRef.current.state.graph?.sheets[projectRef.current.state.selectedSheetId ?? ""].nodeMap.get(currentEditor.nodeId);
        if(!node)  return;

        initialContent.current = currentEditor.retrieveText(node);

        currentEditor.onOutsideChange = onOutsideChange;
        Project.dispatch({
            field: "editedCode",
            value: [
                ...Project.state.editedCode,
            ]
        })

        const startState = EditorState.create({
            doc: initialContent.current,
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
                //oneDark,
                //oneDarkTheme,
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
                    indentWithTab
                ]),
                currentEditor.type === "HTML" ? html() : javascript(),
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
                            cumulateChange.current.push(...changes);
                            if(!timeoutSendChange.current) {
                                timeoutSendChange.current = setTimeout(sendChange, 200);
                            }
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

    }, [Project.state.editedCode, index]);

    const editorStyle = {
        height:"100%"
    };

    return (
        <div ref={editorRef} style={editorStyle} />
    );
});



EditorBlock.displayName = 'EditorBlock';
