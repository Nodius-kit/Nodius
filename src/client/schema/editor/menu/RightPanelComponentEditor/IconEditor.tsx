import {memo, useContext, useMemo} from "react";
import {ThemeContext} from "../../../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../../../hooks/useDynamicClass";
import * as Icons from "lucide-react";
import {Sparkles, Search, CloudAlert} from "lucide-react";
import {CurrentEditObject} from "../RightPanelComponentEditor";
import {Instruction, InstructionBuilder} from "../../../../../utils/sync/InstructionBuilder";
import {modalManager} from "../../../../../process/modal/ModalManager";
import {ProjectContext} from "../../../../hooks/contexts/ProjectContext";
import {renderToStaticMarkup} from "react-dom/server";

export interface IconEditorProps {
    object: CurrentEditObject;
    onUpdate: (instr: Instruction | Instruction[]) => Promise<boolean>;
}
// Get all Lucide icons
const IconDict = Object.fromEntries(Object.entries(Icons));
const LucideIconCache: Record<string, string> = (() => {
    const output: Record<string, string> = {};
    const excluded = new Set(["Icon", "createLucideIcon", "icons"]);

    for (const key in IconDict) {
        if (!excluded.has(key)) {
            const Icon = IconDict[key] as any;
            output[key] = renderToStaticMarkup(<Icon />);
        }
    }

    return output;
})();

export const IconEditor = memo(({ object, onUpdate }: IconEditorProps) => {
    const Theme = useContext(ThemeContext);
    const Project = useContext(ProjectContext);




    const iconEditorContainerClass = useDynamicClass(`
        & {
            border-radius: 10px;
            border: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.02)};
            box-shadow: var(--nodius-shadow-1);
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            transition: var(--nodius-transition-default);
        }
        &:hover {
            box-shadow: var(--nodius-shadow-2);
        }
    `);

    const labelClass = useDynamicClass(`
        & {
            font-weight: 600;
            font-size: 14px;
            color: var(--nodius-text-primary);
            display: flex;
            align-items: center;
            gap: 8px;
        }
    `);

    const iconPreviewClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            border: 2px solid var(--nodius-background-paper);
            border-radius: 12px;
            background-color: var(--nodius-background-default);
            cursor: pointer;
            transition: var(--nodius-transition-default);
            min-height: 80px;
        }
        &:hover {
            border-color: var(--nodius-primary-main);
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.04)};
            transform: translateY(-2px);
            box-shadow: var(--nodius-shadow-2);
        }
    `);

    const iconNameClass = useDynamicClass(`
        & {
            font-family: 'Fira Code', monospace;
            font-size: 14px;
            color: var(--nodius-text-secondary);
            text-align: center;
            margin-top: 8px;
        }
    `);

    const openIconPicker = async () => {
        if (!Project.state.editedHtml) return;

        let searchTerm = "";
        const modalId = "icon-picker-modal";

        const updateModalContent = () => {
            const filteredIcons = Object.keys(LucideIconCache).filter(name =>
                name.toLowerCase().includes(searchTerm.toLowerCase())
            );

            // Create modal content container
            const container = document.createElement("div");
            container.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 16px;
                padding: 16px 0;
            `;

            // Create search input
            const searchContainer = document.createElement("div");
            searchContainer.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px;
                border: 1px solid var(--nodius-background-paper);
                border-radius: 8px;
                background-color: var(--nodius-background-default);
            `;

            const searchIcon = document.createElement("div");
            searchIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
            searchIcon.style.cssText = `
                color: var(--nodius-text-secondary);
                display: flex;
                align-items: center;
            `;

            const searchInput = document.createElement("input");
            searchInput.type = "text";
            searchInput.placeholder = "Search icons...";
            searchInput.value = searchTerm;
            searchInput.style.cssText = `
                flex: 1;
                border: none;
                background: transparent;
                color: var(--nodius-text-primary);
                font-size: 14px;
                outline: none;
            `;
            searchInput.oninput = async () => {
                searchTerm = searchInput.value;
                console.log(searchTerm);
                const newContent = updateModalContent();
                await modalManager.updateContent(modalId, newContent);
                // Re-focus the search input after update
                const newSearchInput = newContent.querySelector('input');
                if (newSearchInput) {
                    (newSearchInput as HTMLInputElement).focus();
                }
            };

            searchContainer.appendChild(searchIcon);
            searchContainer.appendChild(searchInput);

            // Create icons grid
            const iconGrid = document.createElement("div");
            iconGrid.style.cssText = `
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
                gap: 12px;
                max-height: 60vh;
                overflow-y: auto;
                padding: 8px;
            `;

            if (filteredIcons.length > 0) {
                filteredIcons.forEach((iconName) => {
                    const Icon = LucideIconCache[iconName] as any;
                    const isSelected = object.object.content === iconName;

                    const iconCard = document.createElement("div");
                    iconCard.style.cssText = `
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        padding: 12px;
                        border: 2px solid ${isSelected ? 'var(--nodius-primary-main)' : 'var(--nodius-background-paper)'};
                        border-radius: 10px;
                        cursor: pointer;
                        transition: var(--nodius-transition-default);
                        background-color: ${isSelected ? Theme.state.reverseHexColor(Theme.state.primary[Theme.state.theme].main, 0.1) : Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.02)};
                    `;
                    iconCard.title = iconName;

                    iconCard.onmouseenter = () => {
                        if (!isSelected) {
                            iconCard.style.borderColor = 'var(--nodius-primary-main)';
                            iconCard.style.backgroundColor = 'var(--nodius-background-paper)';
                            iconCard.style.transform = 'translateY(-2px)';
                            iconCard.style.boxShadow = 'var(--nodius-shadow-2)';
                        }
                    };

                    iconCard.onmouseleave = () => {
                        if (!isSelected) {
                            iconCard.style.borderColor = 'var(--nodius-background-paper)';
                            iconCard.style.backgroundColor = Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.02);
                            iconCard.style.transform = '';
                            iconCard.style.boxShadow = '';
                        }
                    };

                    iconCard.onclick = async () => {
                        const newInstruction = new InstructionBuilder(object.instruction);
                        newInstruction.key("content").set(iconName);
                        await onUpdate(newInstruction.instruction);
                        modalManager.close(modalId);
                    };

                    // Create icon SVG
                    const iconContainer = document.createElement("div");
                    iconContainer.style.cssText = `
                        color: var(--nodius-primary-main);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    `;
                    if (Icon) {
                        const tempDiv = document.createElement("div");
                        tempDiv.innerHTML = Icon;
                        iconContainer.appendChild(tempDiv.firstChild as Node);
                    }

                    // Create icon name
                    const iconNameSpan = document.createElement("span");
                    iconNameSpan.textContent = iconName;
                    iconNameSpan.style.cssText = `
                        font-size: 10px;
                        text-align: center;
                        color: var(--nodius-text-secondary);
                        word-break: break-word;
                        line-height: 1.2;
                    `;

                    iconCard.appendChild(iconContainer);
                    iconCard.appendChild(iconNameSpan);
                    iconGrid.appendChild(iconCard);
                });
            } else {
                const emptyState = document.createElement("div");
                emptyState.style.cssText = `
                    grid-column: 1 / -1;
                    padding: 32px;
                    text-align: center;
                    color: var(--nodius-text-secondary);
                `;
                emptyState.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 16px; opacity: 0.5; display: block;">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="m21 21-4.3-4.3"/>
                    </svg>
                    <p>No icons found matching "${searchTerm}"</p>
                `;
                iconGrid.appendChild(emptyState);
            }

            container.appendChild(searchContainer);
            container.appendChild(iconGrid);

            return container;
        };

        const initialContent = updateModalContent();

        await modalManager.open({
            id: modalId,
            nodeId: Project.state.editedHtml.htmlRenderContext.nodeId,
            title: "Select Icon",
            content: initialContent,
            width: "700px",
            height: "600px",
            closeIfExists: true
        });
    };

    const CurrentIcon = IconDict[object.object.content as string] as any;

    if(object.object.type !== "icon") return null;

    return (
        <div className={iconEditorContainerClass}>
            <label className={labelClass}>
                <Sparkles height={16} width={16} />
                Icon Selection
            </label>
            <div
                className={iconPreviewClass}
                onClick={openIconPicker}
                title="Click to change icon"
            >
                {CurrentIcon ? (
                    <CurrentIcon height={48} width={48} strokeWidth={1.5} color="var(--nodius-primary-main)" />
                ) : (
                    <CloudAlert height={48} width={48} strokeWidth={1.5} color="var(--nodius-text-secondary)" />
                )}
            </div>
            <div className={iconNameClass}>
                {(object.object.content as string) || "No icon selected"}
            </div>
        </div>
    );
});
IconEditor.displayName = 'IconEditor';
