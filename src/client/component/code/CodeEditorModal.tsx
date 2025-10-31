import React, { memo, useContext, useEffect, useRef, useState } from 'react';
import { Fade } from "../animate/Fade";
import { ProjectContext } from "../../hooks/contexts/ProjectContext";
import { useDynamicClass } from "../../hooks/useDynamicClass";
import { Minimize2, Maximize2, X, Code2 } from 'lucide-react';
import { CodeEditorModal as EditorBlock } from './EditorBlock';

const CodeEditorModal = memo(() => {
    const Project = useContext(ProjectContext);
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




    // Reset active tab if it goes out of bounds
    useEffect(() => {
        if (activeTabIndex >= Project.state.editedCode.length && Project.state.editedCode.length > 0) {
            setActiveTabIndex(Project.state.editedCode.length - 1);
        }
    }, [activeTabIndex, Project.state.editedCode.length]);

    // Initialize modal position and state when first opened
    useEffect(() => {
        if (Project.state.editedCode.length > 0) {
            setPosition(getCenteredPosition());
            setSize(defaultSize);
            setMinimized(false);
            setActiveTabIndex(0);
        }
    }, [Project.state.editedCode.length === 0]);

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
        overflow: 'hidden'
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
                    <div style={editorStyle}>
                        {Project.state.editedCode.map((editor, index) => (
                            <div
                                key={index+"-"+editor.title}
                                style={{
                                    display: index === activeTabIndex ? 'block' : 'none',
                                    height: '100%'
                                }}
                            >
                                <EditorBlock index={index} />
                            </div>
                        ))}
                    </div>
                    {!minimized && <div className={classResizer} onMouseDown={handleResizeStart} />}
                </div>
            </div>
        </Fade>
    );
});

CodeEditorModal.displayName = 'CodeEditorModal';

export { CodeEditorModal };
