/**
 * @file index.tsx
 * @description Main entry point for RightPanelStyleEditor
 * @module dashboard/Editor/RightPanelStyleEditor
 *
 * Provides a tabbed interface for editing:
 * - **CSS Styles**: Visual CSS editor with multiple blocks, selectors, and rules
 * - **DOM Events**: Event handlers for click, hover, input, etc.
 * - **Content**: Text content editing for HtmlText components
 *
 * Key Features:
 * - **Tabbed Interface**: Switch between CSS, Events, and Content editing
 * - **Instruction-Based Updates**: All changes go through InstructionBuilder for undo/redo support
 * - **Theme Integration**: Fully integrated with Nodius theme system
 */

import {memo, useContext, useState} from "react";
import {Code, MousePointer, Type} from "lucide-react";
import {ThemeContext} from "../../../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../../../hooks/useDynamicClass";
import {CssEditor} from "./CssEditor";
import {EventsEditor} from "./EventsEditor";
import {ContentEditor} from "./ContentEditor";
import {TagEditor} from "./TagEditor";
import {RightPanelStyleEditorProps} from "./types";

// Re-export types for external use
export type {
    RightPanelStyleEditorProps,
    EditableCss,
    EditableEvents,
    EditableContent,
    EditableTag
} from "./types";

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Main tabbed style editor with CSS, Events, and Content tabs
 */
export const RightPanelStyleEditor = memo(({
    css,
    events,
    content,
    tag,
    onUpdateCss,
    onUpdateEvents,
    onUpdateContent,
    onUpdateTag,
    getMotor,
    selectedIdentifier
}: RightPanelStyleEditorProps) => {
    const [activeTab, setActiveTab] = useState<'css' | 'events' | 'content'>(() => {
        // Default to content tab if it's a text component
        return content?.isTextType ? 'content' : 'css';
    });
    const Theme = useContext(ThemeContext);

    const tabsContainerClass = useDynamicClass(`
        & {
            display: flex;
            gap: 8px;
            border-bottom: 2px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
            padding: 8px 0;
            margin-bottom: 8px;
        }
    `);

    const tabClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            border-radius: 8px 8px 0 0;
            cursor: pointer;
            transition: var(--nodius-transition-default);
            font-weight: 500;
            font-size: 14px;
            background-color: transparent;
            color: var(--nodius-text-primary);
        }
        &:hover {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.04)};
            color: var(--nodius-text-primary);
        }
        &.active {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.06)};
            color: var(--nodius-primary-main);
            border-bottom: 2px solid var(--nodius-primary-main);
        }
    `);

    return (
        <div style={{width: "100%", height: "100%", display: "flex", flexDirection: "column"}}>
            {/* Tag Editor - Always visible at top */}
            <div style={{marginBottom: "16px"}}>
                <TagEditor tag={tag} onUpdate={onUpdateTag} />
            </div>

            {/* Tabs */}
            <div className={tabsContainerClass}>
                <div
                    className={`${tabClass} ${activeTab === 'css' ? 'active' : ''}`}
                    onClick={() => setActiveTab('css')}
                >
                    <Code height={18} width={18} />
                    <span>CSS</span>
                </div>
                <div
                    className={`${tabClass} ${activeTab === 'events' ? 'active' : ''}`}
                    onClick={() => setActiveTab('events')}
                >
                    <MousePointer height={18} width={18} />
                    <span>Events</span>
                </div>
                {content && (
                    <div
                        className={`${tabClass} ${activeTab === 'content' ? 'active' : ''}`}
                        onClick={() => setActiveTab('content')}
                    >
                        <Type height={18} width={18} />
                        <span>Content</span>
                    </div>
                )}
            </div>

            <div style={{flex: 1, overflowY: "auto", overflowX: "hidden"}}>
                {activeTab === 'css' && <CssEditor css={css} onUpdate={onUpdateCss} />}
                {activeTab === 'events' && <EventsEditor events={events} onUpdate={onUpdateEvents} getMotor={getMotor} selectedIdentifier={selectedIdentifier}/>}
                {activeTab === 'content' && content && onUpdateContent && <ContentEditor content={content} onUpdate={onUpdateContent} />}
            </div>
        </div>
    );
});
RightPanelStyleEditor.displayName = 'RightPanelStyleEditor';
