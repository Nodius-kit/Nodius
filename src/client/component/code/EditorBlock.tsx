import React, { memo, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, crosshairCursor, drawSelection, highlightActiveLine,
    highlightActiveLineGutter, keymap, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
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

export interface EditorBlockProps {
    index:number,
}

const CodeEditorModal = memo(({index}:EditorBlockProps) => {
    const Project = useContext(ProjectContext);
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const customCompletions: Completion[] = []; // Add custom completions here based on context

    const customSource = (ctx: CompletionContext) => {
        const word = ctx.matchBefore(/\w*/);
        if (!word || (word.from === word.to && !ctx.explicit)) return null;
        return {
            from: word.from,
            options: customCompletions,
        };
    };

    const disableSendEvent = useRef<boolean>(false);

    const applyChange = (changes: TextChangeInfo | TextChangeInfo[]) => {
        if(!Project.state.editedCode) return;
        const normalizedChanges = Array.isArray(changes) ? changes : [changes];

        const currentEditor = Project.state.editedCode[index]
        if(!currentEditor) return false;

        const cmChanges = normalizedChanges.map(c => ({
            from: c.from,
            to: c.to !== undefined ? c.to : c.from,
            insert: c.insert || '',
        }));



        console.log(normalizedChanges);
        currentEditor.baseText = applyTextChanges(currentEditor.baseText, normalizedChanges)
        Project.dispatch({
            field: "editedCode",
            value: [...Project.state.editedCode],
        });

        if (viewRef.current) {
            disableSendEvent.current = true;
            viewRef.current.dispatch({ changes: cmChanges });
        }
    };

    useEffect(() => {
        if (Project.state.editedCode &&  Project.state.editedCode[index] && Project.state.editedCode[index].applyChange !== applyChange) {
            Project.state.editedCode[index].applyChange = applyChange;
            Project.dispatch({
                field: "editedCode",
                value: [
                    ...Project.state.editedCode
                ]
            });
        }
    }, [index]);

    const avoidNextUpdate = useRef<boolean>(false);

    const sendChanges = useCallback(async (changes: TextChangeInfo[]) : Promise<boolean> => {
        if (!Project.state.editedCode || !Project.state.updateHtml || !Project.state.graph || !Project.state.selectedSheetId ) return false;
        if(disableSendEvent.current) {
            disableSendEvent.current = false;
            return false;
        }

        const currentEditor = Project.state.editedCode[index]
        if(!currentEditor) return false;

        const node = Project.state.graph.sheets[Project.state.selectedSheetId].nodeMap.get(currentEditor.nodeId);
        if(!node) return false;


        const oldBaseText = currentEditor.baseText;
        const newBaseText = applyTextChanges(oldBaseText, changes.map(c => ({ from: c.from, to: c.to, insert: c.insert })));

        currentEditor.baseText = newBaseText;

        Project.dispatch({
            field: "editedCode",
            value: [...Project.state.editedCode],
        });

        /*const instructions:GraphInstructions[] = changes.map(change => {
            const instruction = new InstructionBuilder();
            for (const path of currentEditor.path) {
                instruction.key(path);
            }
            instruction.insertString(change.from, change.insert, change.to);
            return {
                nodeId: currentEditor.nodeId,
                i: instruction.instruction,
            };
        });*/

        const instructions:Instruction[] = changes.map(change => {
            const instruction = new InstructionBuilder();
            for (const path of currentEditor.path) {
                instruction.key(path);
            }
            instruction.insertString(change.from, change.insert, change.to);
            return instruction.instruction;
        });



        const output = await currentEditor.onUpdate(instructions);

        if (!output) {
            // Rollback to old baseText, may lose concurrent remote changes in race conditions
            currentEditor.baseText = oldBaseText;
            Project.dispatch({
                field: "editedCode",
                value: [...Project.state.editedCode],
            });
            if (viewRef.current) {
                avoidNextUpdate.current = true;
                viewRef.current.dispatch({
                    changes: { from: 0, to: viewRef.current.state.doc.length, insert: oldBaseText },
                });
            }
        }

        return output;
    }, [Project.state.updateGraph, Project.state.editedCode, Project.state.graph, Project.state.selectedSheetId, index]);

    useEffect(() => {
        if (!Project.state.editedCode || !editorRef.current || viewRef.current) return;

        const currentEditor = Project.state.editedCode[index]
        if(!currentEditor) return;

        const startState = EditorState.create({
            doc: currentEditor.baseText,
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
                    indentWithTab
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

    }, [Project.state.editedCode, sendChanges, index]);

    const editorStyle = {
        height:"100%"
    };

    return (
        <div ref={editorRef} style={editorStyle} />
    );
});



CodeEditorModal.displayName = 'CodeEditorModal';

export { CodeEditorModal };