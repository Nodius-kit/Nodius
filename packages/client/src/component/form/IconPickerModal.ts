import * as Icons from "lucide-static";
import {modalManager} from "@nodius/process";

// Get all Lucide icons
const IconDict = Object.fromEntries(Object.entries(Icons));

// Pre-render all icons as static markup and cache them
const LucideIconCache: Record<string, string> = (() => {
    const output: Record<string, string> = {};
    const excluded = new Set(["Icon", "createLucideIcon", "icons"]);

    for (const key in IconDict) {
        if (!excluded.has(key) && !key.endsWith("Icon")) {
            output[key] = IconDict[key] as any;
        }
    }

    return output;
})();

// Pre-compute icon names list (avoid Object.keys() on every search)
const ICON_NAMES = Object.keys(LucideIconCache);

// CSS class definitions outside component to avoid recreation
const MODAL_STYLES = {
    container: `
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px 0;
    `,
    searchContainer: `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
        border: 1px solid var(--nodius-background-paper);
        border-radius: 8px;
        background-color: var(--nodius-background-default);
    `,
    searchIcon: `
        color: var(--nodius-text-secondary);
        display: flex;
        align-items: center;
    `,
    searchInput: `
        flex: 1;
        border: none;
        background: transparent;
        color: var(--nodius-text-primary);
        font-size: 14px;
        outline: none;
    `,
    iconGrid: `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
        gap: 12px;
        max-height: 440px;
        overflow-y: auto;
        padding: 8px;
    `,
    iconContainer: `
        color: var(--nodius-primary-main);
        display: flex;
        align-items: center;
        justify-content: center;
    `,
    iconName: `
        font-size: 10px;
        text-align: center;
        color: var(--nodius-text-secondary);
        word-break: break-word;
        line-height: 1.2;
    `,
    emptyState: `
        grid-column: 1 / -1;
        padding: 32px;
        text-align: center;
        color: var(--nodius-text-secondary);
    `
};

const SEARCH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
const EMPTY_SEARCH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 16px; opacity: 0.5; display: block;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;

// Virtualization helper: only render visible icons
const ICONS_PER_PAGE = 100;


const selectedBg = "rgb(from var(--nodius-primary-main) calc(255 - r) calc(255 - g) calc(255 - b) / 0.1);"
const defaultBg = "rgb(from var(--nodius-background-default) calc(255 - r) calc(255 - g) calc(255 - b) / 0.02);"

const createIconCard = (iconName: string, isSelected: boolean, onSelectIcon: (name: string) => void) => {
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
            background-color: ${isSelected ? selectedBg : defaultBg};
        `;
    iconCard.title = iconName;

    if (!isSelected) {
        iconCard.onmouseenter = () => {
            iconCard.style.borderColor = 'var(--nodius-primary-main)';
            iconCard.style.backgroundColor = 'var(--nodius-background-paper)';
            iconCard.style.transform = 'translateY(-2px)';
            iconCard.style.boxShadow = 'var(--nodius-shadow-2)';
        };

        iconCard.onmouseleave = () => {
            iconCard.style.borderColor = 'var(--nodius-background-paper)';
            iconCard.style.backgroundColor = defaultBg;
            iconCard.style.transform = '';
            iconCard.style.boxShadow = '';
        };
    }

    iconCard.onclick = () => onSelectIcon(iconName);

    // Create icon SVG
    const iconContainer = document.createElement("div");
    iconContainer.style.cssText = MODAL_STYLES.iconContainer;
    const Icon = LucideIconCache[iconName];
    if (Icon) {
        iconContainer.innerHTML = Icon;
    }

    // Create icon name
    const iconNameSpan = document.createElement("span");
    iconNameSpan.textContent = iconName;
    iconNameSpan.style.cssText = MODAL_STYLES.iconName;

    iconCard.appendChild(iconContainer);
    iconCard.appendChild(iconNameSpan);

    return iconCard;
}


export interface openIconParam {
    onSelectIcon: (iconName: string) => Promise<void>,
    getCurrentSelectedIcon: () => string | undefined,
    modalNodeId?: string,
    closeOnSelect?: boolean
}
export const openIconPickerModal = async (params:openIconParam) => {

    let searchTerm = "";
    let visibleCount = ICONS_PER_PAGE;
    const modalId = "icon-picker-modal";

    const updateModalContent = (updateParams?:Partial<{resetScroll:boolean, forceIcon:string}>) => {
        // Filter icons based on search term
        const searchLower = searchTerm.toLowerCase();
        const filteredIcons = searchLower
            ? ICON_NAMES.filter(name => name.toLowerCase().includes(searchLower))
            : ICON_NAMES;

        // Limit rendered icons for performance
        const iconsToShow = filteredIcons.slice(0, visibleCount);

        // Create modal content container
        const container = document.createElement("div");
        container.style.cssText = MODAL_STYLES.container;

        // Create search input
        const searchContainer = document.createElement("div");
        searchContainer.style.cssText = MODAL_STYLES.searchContainer;

        const searchIcon = document.createElement("div");
        searchIcon.innerHTML = SEARCH_SVG;
        searchIcon.style.cssText = MODAL_STYLES.searchIcon;

        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "Search icons...";
        searchInput.value = searchTerm;
        searchInput.style.cssText = MODAL_STYLES.searchInput;

        // Debounced search
        let searchTimeout: NodeJS.Timeout;
        searchInput.oninput = async () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
                searchTerm = searchInput.value;
                visibleCount = ICONS_PER_PAGE; // Reset visible count on search
                const newContent = updateModalContent({resetScroll: true});
                await modalManager.updateContent(modalId, newContent);
                // Re-focus the search input after update
                const newSearchInput = newContent.querySelector('input');
                if (newSearchInput) {
                    (newSearchInput as HTMLInputElement).focus();
                }
            }, 150); // 150ms debounce
        };

        searchContainer.appendChild(searchIcon);
        searchContainer.appendChild(searchInput);

        // Create icons grid
        const iconGrid = document.createElement("div");
        iconGrid.style.cssText = MODAL_STYLES.iconGrid;

        if (iconsToShow.length > 0) {
            // Use DocumentFragment for better performance
            const fragment = document.createDocumentFragment();

            iconsToShow.forEach((iconName) => {
                const isSelected = (updateParams?.forceIcon ?? params.getCurrentSelectedIcon()) === iconName;

                const iconCard = createIconCard(iconName, isSelected, async (icon:string) => {
                    await params.onSelectIcon(icon);
                    if(params.closeOnSelect) {
                        modalManager.close(modalId);
                    } else {
                        const newContent = updateModalContent({forceIcon: icon});
                        await modalManager.updateContent(modalId, newContent);
                    }
                });
                fragment.appendChild(iconCard);
            });

            iconGrid.appendChild(fragment);

            // Add "Load More" button if there are more icons
            if (visibleCount < filteredIcons.length) {
                const loadMoreBtn = document.createElement("div");
                loadMoreBtn.style.cssText = `
                        grid-column: 1 / -1;
                        padding: 12px;
                        text-align: center;
                        cursor: pointer;
                        color: var(--nodius-primary-main);
                        font-weight: 600;
                        border: 2px solid var(--nodius-primary-main);
                        border-radius: 8px;
                        transition: var(--nodius-transition-default);
                    `;
                loadMoreBtn.textContent = `Load More (${filteredIcons.length - visibleCount} remaining)`;
                loadMoreBtn.onmouseenter = () => {
                    loadMoreBtn.style.backgroundColor = 'var(--nodius-primary-main)';
                    loadMoreBtn.style.color = 'white';
                };
                loadMoreBtn.onmouseleave = () => {
                    loadMoreBtn.style.backgroundColor = 'transparent';
                    loadMoreBtn.style.color = 'var(--nodius-primary-main)';
                };
                loadMoreBtn.onclick = async () => {
                    visibleCount += ICONS_PER_PAGE;
                    const newContent = updateModalContent();
                    await modalManager.updateContent(modalId, newContent);
                };
                iconGrid.appendChild(loadMoreBtn);
            }
        } else {
            const emptyState = document.createElement("div");
            emptyState.style.cssText = MODAL_STYLES.emptyState;
            emptyState.innerHTML = `
                    ${EMPTY_SEARCH_SVG}
                    <p>No icons found matching "${searchTerm}"</p>
                `;
            iconGrid.appendChild(emptyState);
        }

        // Reset scroll position if needed
        if (updateParams?.resetScroll) {
            setTimeout(() => {
                iconGrid.scrollTop = 0;
            }, 0);
        }

        container.appendChild(searchContainer);
        container.appendChild(iconGrid);

        return container;
    };

    const initialContent = updateModalContent();

    await modalManager.open({
        id: modalId,
        nodeId: params.modalNodeId??"",
        title: "Select Icon",
        content: initialContent,
        width: "700px",
        height: "600px",
        closeIfExists: true
    });
};