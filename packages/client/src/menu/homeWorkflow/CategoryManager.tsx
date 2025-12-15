/**
 * @file CategoryManager.tsx
 * @description Category management interface for organizing workflows and node configurations
 * @module dashboard
 *
 * Provides a reusable category management component with:
 * - CategoryManager: Component for creating, renaming, and deleting categories
 * - Category filtering: Filter items by category with pill-based UI
 * - Item count tracking: Shows number of items per category
 * - Collapsible panels: Manager and filter panels with smooth animations
 *
 * Key features:
 * - Supports both "workflow" and "nodeconfig" category types
 * - Real-time category operations via REST API
 * - Confirmation dialogs for destructive actions
 * - Abort controller management for request cancellation
 */

import {memo, useCallback, useRef} from "react";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../hooks/useDynamicClass";
import {Plus, Tag, X, Filter, Edit2} from "lucide-react";
import {useContext} from "react";
import {api_category_create, api_category_delete, api_category_rename} from "@nodius/utils";
import {Collapse} from "../../component/animate/Collapse";
import {Button} from "../../component/form/Button";
import {CategoryData} from "@nodius/utils";

interface CategoryManagerProps {
    type: "workflow" | "nodeconfig";
    categories: CategoryData[];
    selectedCategory: string | null;
    itemCounts: { [key: string]: number };
    totalItems: number;
    showManager: boolean;
    showFilter: boolean;
    onToggleManager: () => void;
    onToggleFilter: () => void;
    onCategoryChange: (category: string | null) => void;
    onRefresh: () => Promise<void>;
}

export const CategoryManager = memo(({
                                         type,
                                         categories,
                                         selectedCategory,
                                         itemCounts,
                                         totalItems,
                                         showManager,
                                         showFilter,
                                         onToggleManager,
                                         onToggleFilter,
                                         onCategoryChange,
                                         onRefresh
                                     }: CategoryManagerProps) => {
    const Theme = useContext(ThemeContext);

    // Abort controllers for cancelling in-flight requests when new ones are initiated
    const abortControllers = useRef<{
        createCategory?: AbortController;
        deleteCategory?: AbortController;
        renameCategory?: AbortController;
    }>({});

    // Transform category data to include item counts for display
    const categoryStats = categories.map(cat => ({
        _key: cat._key,
        name: cat.category,
        count: itemCounts[cat.category] || 0
    }));


    // Dynamic classes
    const categoryManagerClass = useDynamicClass(`
        & {
            background-color: var(--nodius-background-paper);
            padding: 16px;
            margin:2px;
            border-radius: 8px;
            box-shadow: var(--nodius-shadow-1);
            margin-bottom: 16px;
        }

        & .manager-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        & .manager-title {
            font-size: 15px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        & .category-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 12px;
        }

        & .category-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.05)};
            border-radius: 8px;
            border: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
            transition: var(--nodius-transition-default);
        }

        & .category-item:hover {
            border-color: var(--nodius-primary-main);
        }

        & .category-name {
            font-size: 13px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        & .category-count {
            font-size: 11px;
            opacity: 0.6;
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
            padding: 2px 6px;
            border-radius: 10px;
        }

      
    `);

    const filterPanelClass = useDynamicClass(`
        & {
            background-color: var(--nodius-background-paper);
            padding: 12px;
            border-radius: 8px;
            box-shadow: var(--nodius-shadow-1);
            margin-bottom: 16px;
        }

        & .filter-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            padding: 4px;
        }

        & .filter-pills {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 12px;
        }

        & .filter-pill {
            padding: 6px 12px;
            border-radius: 16px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: var(--nodius-transition-default);
            border: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.2)};
        }

        & .filter-pill.active {
            background-color: var(--nodius-primary-main);
            color: white;
            border-color: var(--nodius-primary-main);
        }

        & .filter-pill.inactive {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.05)};
        }

        & .filter-pill.inactive:hover {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
        }

        & .pill-count {
            margin-left: 6px;
            opacity: 0.7;
        }
    `);

    /**
     * Creates a new category via API call
     * Prompts user for category name and sends request to server
     */
    const handleCreateCategory = useCallback(async () => {
        const categoryName = prompt("Enter category name:");
        if (!categoryName || categoryName.trim() === "") return;

        if (abortControllers.current.createCategory) {
            abortControllers.current.createCategory.abort();
        }
        abortControllers.current.createCategory = new AbortController();

        try {
            const response = await fetch('/api/category/create', {
                method: "POST",
                signal: abortControllers.current.createCategory.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspace: "root",
                    category: categoryName.trim(),
                    type: type
                } as api_category_create)
            });

            if (response.status === 200) {
                await onRefresh();
            } else {
                const errorData = await response.json();
                alert(`Failed to create category: ${errorData.error || "Unknown error"}`);
            }
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error("Error creating category:", error);
                alert("Failed to create category. Please try again.");
            }
        }
    }, [type, onRefresh]);

    /**
     * Deletes a category with confirmation dialog
     * Warns user if category contains items and clears filter if deleted category was selected
     */
    const handleDeleteCategory = useCallback(async (categoryKey: string, categoryName: string) => {
        const itemCount = itemCounts[categoryName] || 0;

        // Show different confirmation message based on whether category has items
        if (itemCount > 0) {
            const itemType = type === "workflow" ? "HTML workflow(s)" : "node configuration(s)";
            if (!confirm(`This category contains ${itemCount} ${itemType}. Are you sure you want to delete it? The items will remain but will need to be recategorized.`)) {
                return;
            }
        } else {
            if (!confirm(`Are you sure you want to delete the category "${categoryName}"?`)) {
                return;
            }
        }

        if (abortControllers.current.deleteCategory) {
            abortControllers.current.deleteCategory.abort();
        }
        abortControllers.current.deleteCategory = new AbortController();

        try {
            const response = await fetch('/api/category/delete', {
                method: "POST",
                signal: abortControllers.current.deleteCategory.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspace: "root",
                    _key: categoryKey
                } as api_category_delete)
            });

            if (response.status === 200) {
                // If the deleted category was selected, clear the filter
                if (selectedCategory === categoryName) {
                    onCategoryChange(null);
                }
                await onRefresh();
            } else {
                const errorData = await response.json();
                alert(`Failed to delete category: ${errorData.error || "Unknown error"}`);
            }
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error("Error deleting category:", error);
                alert("Failed to delete category. Please try again.");
            }
        }
    }, [type, itemCounts, selectedCategory, onRefresh, onCategoryChange]);

    /**
     * Renames an existing category
     * Validates new name is different from current name before making API call
     */
    const handleRenameCategory = useCallback(async (categoryKey: string, currentName: string) => {
        const newName = prompt("Enter new category name:", currentName);
        if (!newName || newName.trim() === "" || newName.trim() === currentName) return;

        if (abortControllers.current.renameCategory) {
            abortControllers.current.renameCategory.abort();
        }
        abortControllers.current.renameCategory = new AbortController();

        try {
            const response = await fetch('/api/category/rename', {
                method: "POST",
                signal: abortControllers.current.renameCategory.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspace: "root",
                    _key: categoryKey,
                    newName: newName.trim()
                } as api_category_rename)
            });

            if (response.status === 200) {
                await onRefresh();
            } else {
                const errorData = await response.json();
                alert(`Failed to rename category: ${errorData.error || "Unknown error"}`);
            }
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error("Error renaming category:", error);
                alert("Failed to rename category. Please try again.");
            }
        }
    }, [onRefresh]);

    return (
        <>
            {/* Category Manager Panel */}
            <Collapse in={showManager}>
                <div className={categoryManagerClass}>
                    <div className="manager-header">
                        <div className="manager-title">
                            <Tag height={16} width={16}/>
                            Category Management
                        </div>
                        <Button onClick={handleCreateCategory} >
                            <Plus height={14} width={14}/>
                            Add Category
                        </Button>
                    </div>
                    {categories.length > 0 ? (
                        <div className="category-list">
                            {categoryStats.map((cat) => (
                                <div key={cat._key} className="category-item">
                                    <div className="category-name">
                                        <Tag height={12} width={12}/>
                                        {cat.name}
                                    </div>
                                    <div className="category-count">
                                        {cat.count} item{cat.count !== 1 ? 's' : ''}
                                    </div>
                                    <Button
                                        onClick={() => handleRenameCategory(cat._key, cat.name)}
                                        title="Rename category"
                                        size={"small"}
                                        style={{minWidth: "0px"}}
                                        color={"warning"}
                                    >
                                        <Edit2 height={14} width={14}/>
                                    </Button>
                                    <Button
                                        size={"small"}
                                        onClick={() => handleDeleteCategory(cat._key, cat.name)}
                                        title="Delete category"
                                        style={{minWidth: "0px"}}
                                        color={"error"}
                                    >
                                        <X height={14} width={14}/>
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{textAlign: "center", padding: "20px", opacity: 0.6, fontSize: "13px"}}>
                            No categories yet. Create your first category to organize {type === "workflow" ? "workflows" : "node configurations"}.
                        </div>
                    )}
                </div>
            </Collapse>

            {/* Category Filter */}
            {categories.length > 0 && (
                <div className={filterPanelClass}>
                    <div
                        className="filter-header"
                        onClick={onToggleFilter}
                    >
                        <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                            <Filter height={16} width={16}/>
                            <span style={{fontSize: "13px", fontWeight: "500"}}>
                                {selectedCategory ? `Filtered by: ${selectedCategory}` : "Filter by Category"}
                            </span>
                        </div>
                        <span style={{fontSize: "18px"}}>{showFilter ? "−" : "+"}</span>
                    </div>
                    <Collapse in={showFilter}>
                        <div className="filter-pills">
                            <div
                                className={`filter-pill ${selectedCategory === null ? "active" : "inactive"}`}
                                onClick={() => onCategoryChange(null)}
                            >
                                All
                                <span className="pill-count">({totalItems})</span>
                            </div>
                            {categoryStats.map((cat) => (
                                <div
                                    key={cat._key}
                                    className={`filter-pill ${selectedCategory === cat.name ? "active" : "inactive"}`}
                                    onClick={() => onCategoryChange(cat.name)}
                                >
                                    <Tag height={12} width={12} style={{display: "inline", marginRight: "4px"}}/>
                                    {cat.name}
                                    <span className="pill-count">({cat.count})</span>
                                </div>
                            ))}
                        </div>
                    </Collapse>
                </div>
            )}
        </>
    );
});

CategoryManager.displayName = "CategoryManager";
