import React, {forwardRef, memo, useCallback, useContext, useEffect, useImperativeHandle, useRef} from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, drawSelection, keymap } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { autocompletion, Completion, CompletionContext } from '@codemirror/autocomplete';
import {Fade} from "../animate/Fade";
import {ProjectContext} from "../../hooks/contexts/ProjectContext";
import {useDynamicClass} from "../../hooks/useDynamicClass";
import {applyTextChanges, TextChangeInfo} from "../../../utils/objectUtils";
import {InstructionBuilder} from "../../../utils/sync/InstructionBuilder";



export const CodeEditorModal = memo(() => {

    const Project = useContext(ProjectContext);

    const classModal = useDynamicClass(`
        & {
            pointer-events: none;
            position: fixed;
            inset: 0px;
        }
    `);

    const classContainer = useDynamicClass(`
        & {
            position: absolute;
            background: var(--nodius-background-paper);
            box-shadow: var(--nodius-shadow-2);
        }
    `);

    const applyChange = useCallback((changes:TextChangeInfo|TextChangeInfo[]) => {
        if(!Project.state.editedCode?.baseText) return;

        Project.dispatch({
            field: "editedCode",
            value: {
                ...Project.state.editedCode,
                baseText: applyTextChanges(Project.state.editedCode.baseText, Array.isArray(changes) ? changes : [changes])
            }
        })

    }, [Project.state.editedCode?.baseText]);
    useEffect(() => {
        if(Project.state.editedCode && Project.state.editedCode.applyChange != applyChange) {
            Project.dispatch({
                field: "editedCode",
                value: {
                    ...Project.state.editedCode,
                   applyChange: applyChange,
                }
            })
        }
    }, [applyChange, Project.state.editedCode]);

    // if promise return false, should cancel last change
    const sendChange = useCallback(async (change:TextChangeInfo) : Promise<boolean> => {
        if(!Project.state.editedCode || !Project.state.updateGraph) return false;

        const instruction = new InstructionBuilder();
        for(const path of Project.state.editedCode.path) {
            instruction.key(path);
        }

        instruction.insertString()

    }, [Project.state.editedCode, Project.state.updateGraph]);

    return (<Fade in={Project.state.editedCode!=undefined} unmountOnExit>

        <div className={classModal}>
            <div className={classContainer} style={{width:"500px", height:"500px", top:"50px", left:"50px"}}>
                {Project.state.editedCode?.baseText}
            </div>
        </div>

    </Fade>)
});

/*
type Change = { from: number; length: number; insert: string };

type Props = {
    isOpen: boolean;
    onClose: () => void;
    initialCode: string;
    onLocalChange: (changes: Change[]) => void;
    customCompletions?: Completion[];
};

type RefType = {
    applyRemoteChanges: (changes: { from: number; to?: number; insert?: string }) => void;
};

const CodeEditorModal = forwardRef<RefType, Props>(
    ({ isOpen, onClose, initialCode, onLocalChange, customCompletions = [] }, ref) => {
        const editorRef = useRef<HTMLDivElement>(null);
        const viewRef = useRef<EditorView | null>(null);

        const customSource = (ctx: CompletionContext) => {
            */
      //      const word = ctx.matchBefore(/\w*/);
 /*
            if (!word || (word.from === word.to && !ctx.explicit)) return null;
            return {
                from: word.from,
                options: customCompletions,
            };
        };

        useEffect(() => {
            if (!isOpen || !editorRef.current) return;

            const startState = EditorState.create({
                doc: initialCode,
                extensions: [
                    keymap.of(defaultKeymap),
                    drawSelection(),
                    javascript({typescript:true}),
                    autocompletion({ override: [customSource] }),
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) {
                            const changes: Change[] = [];
                            update.transactions.forEach((tr) => {
                                tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
                                    changes.push({
                                        from: fromA,
                                        length: toA - fromA,
                                        insert: inserted.toString(),
                                    });
                                });
                            });
                            onLocalChange(changes);
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
        }, [isOpen, initialCode, onLocalChange, customCompletions]);

        useImperativeHandle(ref, () => ({
            applyRemoteChanges(changes) {
                if (viewRef.current) {
                    viewRef.current.dispatch({ changes });
                }
            },
        }));


        return (
            <Fade in={isOpen} unmountOnExit>
                <div
                    style={{
                        position: 'absolute',
                        zIndex: 1000,
                        top: 0,
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <div
                        style={{
                            backgroundColor: 'white',
                            padding: '20px',
                            width: '80%',
                            height: '80%',
                            position: 'relative',
                        }}
                    >
                        <button
                            onClick={onClose}
                            style={{ position: 'absolute', top: '10px', right: '10px' }}
                        >
                            Close
                        </button>
                        <div ref={editorRef} style={{ height: 'calc(100% - 40px)' }} />
                    </div>
                </div>
            </Fade>
        );
    }
);*/

export default CodeEditorModal;