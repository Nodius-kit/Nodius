import React, { memo, useContext, useEffect, useRef, useState } from 'react';
import { Fade } from "../animate/Fade";
import { ProjectContext } from "../../hooks/contexts/ProjectContext";
import { useDynamicClass } from "../../hooks/useDynamicClass";
import { Minimize2, Maximize2, X, Code2, Braces, Box } from 'lucide-react'; // J'ai ajouté Braces et Box pour l'UI
import { EditorBlock } from "./EditorBlock";

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

    // --- STYLES EXISTANTS (Inchangés pour la plupart) ---
    const classModal = useDynamicClass(`
    & {
      pointer-events: none;
      position: fixed;
      z-index: 2;
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
      backdrop-filter: blur(10px);
      display: flex;
      flex-direction: column;
    }
  `);

    // --- NOUVEAU STYLE POUR LE PANNEAU LATÉRAL ---
    const classContextPanel = useDynamicClass(`
    & {
        position: absolute;
        left: 100%; /* Colle le panneau à droite du modal principal */
        top: 0;
        bottom: 0; /* Prend toute la hauteur */
        width: 280px; /* Largeur fixe pour les types */
        margin-left: 12px; /* Espace entre les deux */
        
        background: rgba(15, 23, 42, 0.85); /* Un peu plus sombre pour le contraste */
        backdrop-filter: blur(10px);
        border-radius: 12px;
        border: 1px solid rgba(66, 165, 245, 0.15);
        box-shadow: var(--nodius-shadow-4);
        
        display: flex;
        flex-direction: column;
        overflow: hidden;
        pointer-events: all; 
        opacity: 0;
        animation: fadeIn 0.3s forwards;
    }
    @keyframes fadeIn {
        to { opacity: 1; }
    }

    & .ctx-header {
        height: 48px;
        display: flex;
        align-items: center;
        padding: 0 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        color: var(--nodius-text-secondary);
        font-size: 13px;
        font-weight: 500;
        gap: 8px;
    }

    & .ctx-content {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    & .var-item {
        padding: 10px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.02);
        transition: all 0.2s ease;
    }
    & .var-item:hover {
        background: rgba(66, 165, 245, 0.05);
        border-color: rgba(66, 165, 245, 0.1);
    }

    & .var-name {
        color: var(--nodius-primary-light);
        font-family: monospace;
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    
    & .var-type {
        color: var(--nodius-text-secondary);
        font-size: 11px;
        margin-top: 4px;
        font-family: monospace;
        opacity: 0.8;
    }
    
    & .var-desc {
        color: var(--nodius-text-secondary);
        font-size: 11px;
        margin-top: 4px;
        line-height: 1.4;
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
      flex-shrink: 0; /* Empêche le header de s'écraser */
    }
    &:active {
      cursor: grabbing;
    }
  `);

    // ... (Vos classes classTitle, classButtonGroup, classIconButton, classCloseButton restent identiques)
    const classTitle = useDynamicClass(`
    & {
      display: flex; align-items: center; gap: 10px;
      color: var(--nodius-text-primary); font-weight: 500; font-size: 13px;
      letter-spacing: 0.3px; flex: 1; opacity: 0.9;
    }
    & > svg { color: var(--nodius-primary-main); opacity: 0.8; }
    & > h4 { padding-top:2px; }
    `);

    const classButtonGroup = useDynamicClass(`& { display: flex; gap: 8px; align-items: center; }`);

    const classIconButton = useDynamicClass(`
        & { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; border-radius: 8px; background: transparent; color: var(--nodius-text-secondary); cursor: pointer; transition: all 0.2s; padding: 0; }
        &:hover { background: rgba(66, 165, 245, 0.1); color: var(--nodius-primary-light); transform: translateY(-1px); }
    `);

    const classCloseButton = useDynamicClass(`
        & { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; border-radius: 8px; background: transparent; color: var(--nodius-text-secondary); cursor: pointer; transition: all 0.2s; padding: 0; }
        &:hover { background: rgba(244, 67, 54, 0.15); color: var(--nodius-error-light); transform: translateY(-1px); }
    `);

    const classResizer = useDynamicClass(`
    & {
      position: absolute; right: 0; bottom: 0; width: 20px; height: 20px;
      cursor: nwse-resize; transition: var(--nodius-transition-default); z-index: 10;
    }
    &::after {
      content: ''; position: absolute; right: 2px; bottom: 2px; width: 12px; height: 12px;
      background: linear-gradient(135deg, transparent 0%, transparent 50%, rgba(66, 165, 245, 0.3) 50%);
      border-bottom-right-radius: 12px; transition: var(--nodius-transition-default);
    }
    &:hover::after {
      background: linear-gradient(135deg, transparent 0%, transparent 50%, var(--nodius-primary-main) 50%);
    }
  `);

    const classTabBar = useDynamicClass(`
    & {
      display: flex; gap: 4px; padding: 8px 16px; background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05); overflow-x: auto; overflow-y: hidden; flex-shrink: 0;
    }
    /* Scrollbar styles omitted for brevity but kept */
  `);

    const classTab = useDynamicClass(`
    & {
      padding: 6px 12px; border: none; border-radius: 6px; background: transparent;
      color: var(--nodius-text-secondary); font-size: 12px; font-weight: 500; cursor: pointer;
      transition: all 0.2s; white-space: nowrap; display: flex; align-items: center; gap: 8px; min-width: 0;
    }
    &:hover { background: rgba(66, 165, 245, 0.1); color: var(--nodius-text-primary); }
    &.active { background: rgba(66, 165, 245, 0.2); color: var(--nodius-primary-light); }
  `);

    const classTabCloseButton = useDynamicClass(`
     & { display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; border: none; border-radius: 4px; background: transparent; color: var(--nodius-text-secondary); cursor: pointer; padding: 0; transition: all 0.2s; flex-shrink: 0; }
     &:hover { background: rgba(244, 67, 54, 0.2); color: var(--nodius-error-light); }
    `);

    // --- LOGIQUE REACT (Hooks useEffects inchangés pour Drag/Resize/Tab) ---

    useEffect(() => {
        if (activeTabIndex >= Project.state.editedCode.length && Project.state.editedCode.length > 0) {
            setActiveTabIndex(Project.state.editedCode.length - 1);
        }
    }, [activeTabIndex, Project.state.editedCode.length]);

    useEffect(() => {
        if (Project.state.editedCode.length > 0) {
            setPosition(getCenteredPosition());
            setSize(defaultSize);
            setMinimized(false);
            setActiveTabIndex(0);
        }
    }, [Project.state.editedCode.length === 0]);

    const handleDragStart = (e: React.MouseEvent) => {
        e.preventDefault();
        dragStartRef.current = { x: e.clientX, y: e.clientY, left: position.left, top: position.top };
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
    };

    const handleDragMove = (e: MouseEvent) => {
        let newLeft = dragStartRef.current.left + e.clientX - dragStartRef.current.x;
        let newTop = dragStartRef.current.top + e.clientY - dragStartRef.current.y;

        // Limitation aux bords de l'écran pour le modal principal
        newLeft = Math.max(0, Math.min(window.innerWidth - size.width, newLeft));
        newTop = Math.max(0, Math.min(window.innerHeight - size.height, newTop));

        setPosition({ top: newTop, left: newLeft });
    };

    const handleDragEnd = () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
    };

    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation(); // Important pour ne pas déclencher d'autres events
        resizeStartRef.current = { x: e.clientX, y: e.clientY, width: size.width, height: size.height };
        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
    };

    const handleResizeMove = (e: MouseEvent) => {
        let newWidth = resizeStartRef.current.width + e.clientX - resizeStartRef.current.x;
        let newHeight = resizeStartRef.current.height + e.clientY - resizeStartRef.current.y;
        newWidth = Math.max(300, Math.min(window.innerWidth - position.left, newWidth));
        newHeight = Math.max(200, Math.min(window.innerHeight - position.top, newHeight));
        setSize({ width: newWidth, height: newHeight });
    };

    const handleResizeEnd = () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
    };

    // Handle window resize
    useEffect(() => {
        const handleWindowResize = () => {
            let newLeft = Math.min(position.left, window.innerWidth - size.width);
            let newTop = Math.min(position.top, window.innerHeight - size.height);
            setPosition({ top: Math.max(0, newTop), left: Math.max(0, newLeft) });
        };
        window.addEventListener('resize', handleWindowResize);
        return () => window.removeEventListener('resize', handleWindowResize);
    }, [position, size]);

    const handleTabClose = (e: React.MouseEvent, tabIndex: number) => {
        e.stopPropagation();
        const newTabs = Project.state.editedCode.filter((_, index) => index !== tabIndex);
        Project.dispatch({ field: "editedCode", value: newTabs });
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
    const hasContext = activeTab?.variableDefinitions && activeTab.variableDefinitions.length > 0;

    // Styles dynamiques inline
    const containerStyle = {
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${size.width}px`,
        height: minimized ? '48px' : `${size.height}px`,
        // On garde 'visible' si non minimisé pour que le panneau latéral (qui dépasse) soit visible
        // On met 'hidden' si minimisé pour couper le contenu
        overflow: 'visible',
    };

    // Style spécifique pour le contenu de l'éditeur pour gérer le scroll interne
    // sans affecter le débordement du panneau latéral
    const editorContainerStyle = {
        display: minimized ? 'none' : 'flex',
        flexDirection: 'column' as const,
        height: '100%', // Prend la place restante
        overflow: 'hidden', // Le scroll se fait dans l'EditorBlock
        borderBottomLeftRadius: '12px',
        borderBottomRightRadius: '12px',
    }

    return (
        <Fade in={Project.state.editedCode.length > 0} unmountOnExit>
            <div className={classModal}>
                {/* Le conteneur principal déplaçable */}
                <div ref={containerRef} className={classContainer} style={containerStyle}>

                    {/* --- PANNEAU LATÉRAL (Type Context) --- */}
                    {/* Il est rendu DANS le conteneur qui bouge, mais positionné à droite via CSS */}
                    {!minimized && hasContext && (
                        <div className={classContextPanel}>
                            <div className="ctx-header">
                                <Braces size={16} />
                                <span>Context Variables</span>
                            </div>
                            <div className="ctx-content">
                                {activeTab.variableDefinitions!.map((v, i) => (
                                    <div key={i} className="var-item">
                                        <div className="var-name">
                                            <Box size={12} />
                                            {v.name}
                                        </div>
                                        <div className="var-type">{v.type}</div>
                                        {v.description && (
                                            <div className="var-desc">{v.description}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* --- HEADER PRINCIPAL --- */}
                    <div className={classHeader} onMouseDown={handleDragStart}>
                        <div className={classTitle}>
                            <Code2 size={18} />
                            <h4>{activeTab?.title || 'Code Editor'}</h4>
                        </div>
                        <div className={classButtonGroup}>
                            <button className={classIconButton} onClick={() => setMinimized(!minimized)}>
                                {minimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                            </button>
                            <button className={classCloseButton} onClick={onClose}>
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* --- BARRE D'ONGLETS --- */}
                    {Project.state.editedCode.length > 1 && !minimized && (
                        <div className={classTabBar}>
                            {Project.state.editedCode.map((tab, index) => (
                                <button
                                    key={`${tab.nodeId}-${tab.title}`}
                                    className={`${classTab} ${index === activeTabIndex ? 'active' : ''}`}
                                    onClick={() => setActiveTabIndex(index)}
                                >
                                    <span>{tab.title}</span>
                                    <button className={classTabCloseButton} onClick={(e) => handleTabClose(e, index)}>
                                        <X size={12} />
                                    </button>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* --- ZONE ÉDITEUR --- */}
                    <div style={editorContainerStyle}>
                        {/* Un wrapper flex-1 pour que l'éditeur prenne toute la hauteur restante */}
                        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                            {Project.state.editedCode.map((editor, index) => (
                                <div
                                    key={index + "-" + editor.title}
                                    style={{
                                        display: index === activeTabIndex ? 'block' : 'none',
                                        height: '100%',
                                        width: '100%',
                                    }}
                                >
                                    <EditorBlock index={index} />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Resizer (affiché uniquement si non minimisé) */}
                    {!minimized && <div className={classResizer} onMouseDown={handleResizeStart} />}
                </div>
            </div>
        </Fade>
    );
});

CodeEditorModal.displayName = 'CodeEditorModal';

export { CodeEditorModal };