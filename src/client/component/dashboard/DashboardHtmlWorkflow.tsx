import {memo, useCallback, useContext, useRef, useState} from "react";
import {HtmlClass} from "../../../utils/html/htmlType";
import {Graph} from "../../../utils/graph/graphType";
import {ProjectContext} from "../../hooks/contexts/ProjectContext";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../hooks/useDynamicClass";
import {Input} from "../form/Input";
import {Search, FileCode, Plus, Edit3, Trash2, Tag, FolderPlus, X, Filter} from "lucide-react";
import {Collapse} from "../animate/Collapse";

interface DashboardHtmlWorkflowProps {
    htmlClasses: HtmlClassWithGraph[];
    selectedCategory: string | null;
    categories: string[];
    onRefresh: () => Promise<void>;
    onCategoryChange: (category: string | null) => void;
}

interface HtmlClassWithGraph {
    html: HtmlClass;
    graph: Graph;
}

export const DashboardHtmlWorkflow = memo(({
    htmlClasses,
    selectedCategory,
    categories,
    onRefresh,
    onCategoryChange
}: DashboardHtmlWorkflowProps) => {
    const Project = useContext(ProjectContext);
    const Theme = useContext(ThemeContext);

    const [searchHtml, setSearchHtml] = useState<string>("");
    const [showCategoryManager, setShowCategoryManager] = useState<boolean>(false);
    const [showCategoryFilter, setShowCategoryFilter] = useState<boolean>(false);

    // Abort controllers
    const abortControllers = useRef<{
        deleteHtml?: AbortController;
        createHtml?: AbortController;
        createCategory?: AbortController;
        deleteCategory?: AbortController;
    }>({});

    // Filtered data
    const filteredHtmlClasses = htmlClasses.filter(item =>
        item.html.name.toLowerCase().includes(searchHtml.toLowerCase()) &&
        (selectedCategory === null || item.html.category === selectedCategory)
    );

    // Category statistics
    const categoryStats = categories.map(cat => ({
        name: cat,
        count: htmlClasses.filter(h => h.html.category === cat).length
    }));

    // Dynamic classes
    const sectionHeaderClass = useDynamicClass(`
        & {
            display: flex;
            flex-direction: row;
            gap: 12px;
            align-items: center;
            border-bottom: 2px solid var(--nodius-primary-main);
            padding-bottom: 12px;
            margin-bottom: 16px;
        }

        & .icon-container {
            background: var(--nodius-primary-main);
            border-radius: 8px;
            padding: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        & .header-content {
            display: flex;
            flex-direction: column;
            flex: 1;
        }

        & .header-content h5 {
            font-size: 18px;
            font-weight: 600;
            margin: 0;
        }

        & .header-content p {
            font-size: 12px;
            opacity: 0.7;
            margin: 0;
        }

        & .header-actions {
            display: flex;
            gap: 8px;
        }
    `);

    const cardGridClass = useDynamicClass(`
        & {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 16px;
        }
    `);

    const itemCardClass = useDynamicClass(`
        & {
            padding: 20px;
            border: 1px solid var(--nodius-grey-700);
            border-radius: 10px;
            background-color: var(--nodius-background-paper);
            display: flex;
            flex-direction: column;
            gap: 12px;
            transition: var(--nodius-transition-default);
        }

        &:hover {
            border-color: var(--nodius-primary-main);
            box-shadow: var(--nodius-shadow-2);
        }

        & .card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }

        & .card-title {
            font-size: 16px;
            font-weight: 600;
            margin: 0;
            color: var(--nodius-text-primary);
            word-break: break-word;
        }

        & .card-category {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
            margin-top: 4px;
            cursor: pointer;
            transition: var(--nodius-transition-default);
        }

        & .card-category:hover {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.15)};
        }

        & .card-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }

        & .card-actions button {
            flex: 1;
            padding: 8px 12px;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: var(--nodius-transition-default);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        & .btn-edit {
            background-color: var(--nodius-primary-main);
            color: white;
        }

        & .btn-edit:hover {
            background-color: ${Theme.state.changeBrightness(Theme.state.primary[Theme.state.theme].main, 0.15, "positive")};
        }

        & .btn-delete {
            background-color: var(--nodius-error-main);
            color: white;
        }

        & .btn-delete:hover {
            background-color: ${Theme.state.changeBrightness(Theme.state.error[Theme.state.theme].main, 0.15, "positive")};
        }
    `);

    const emptyStateClass = useDynamicClass(`
        & {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.03)};
            border: 2px dashed ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.15)};
            border-radius: 12px;
            padding: 48px 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            text-align: center;
            margin-top: 16px;
        }

        & .empty-icon {
            color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.3)};
        }

        & .empty-title {
            font-size: 16px;
            font-weight: 600;
            color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.7)};
        }

        & .empty-description {
            font-size: 13px;
            line-height: 1.6;
            color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.5)};
            max-width: 400px;
        }

        & button {
            margin-top: 8px;
            background-color: var(--nodius-primary-main);
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            border: none;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: var(--nodius-transition-default);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        & button:hover {
            background-color: ${Theme.state.changeBrightness(Theme.state.primary[Theme.state.theme].main, 0.15, "positive")};
            box-shadow: var(--nodius-shadow-2);
        }
    `);

    const categoryManagerClass = useDynamicClass(`
        & {
            background-color: var(--nodius-background-paper);
            padding: 16px;
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

        & .delete-category-btn {
            background: none;
            border: none;
            cursor: pointer;
            color: var(--nodius-error-main);
            padding: 4px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            transition: var(--nodius-transition-default);
        }

        & .delete-category-btn:hover {
            background-color: ${Theme.state.reverseHexColor(Theme.state.error[Theme.state.theme].main, 0.1)};
        }

        & .add-category-btn {
            background-color: var(--nodius-success-main);
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: var(--nodius-transition-default);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        & .add-category-btn:hover {
            background-color: ${Theme.state.changeBrightness(Theme.state.success[Theme.state.theme].main, 0.15, "positive")};
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

    // Category management handlers
    const handleCreateCategory = useCallback(async () => {
        const categoryName = prompt("Enter category name:");
        if (!categoryName || categoryName.trim() === "") return;

        if (abortControllers.current.createCategory) {
            abortControllers.current.createCategory.abort();
        }
        abortControllers.current.createCategory = new AbortController();

        try {
            const response = await fetch('http://localhost:8426/api/category/create', {
                method: "POST",
                signal: abortControllers.current.createCategory.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspace: "root",
                    category: categoryName.trim()
                })
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
    }, [onRefresh]);

    const handleDeleteCategory = useCallback(async (categoryName: string, categoryKey: string) => {
        const itemsInCategory = htmlClasses.filter(h => h.html.category === categoryName).length;

        if (itemsInCategory > 0) {
            if (!confirm(`This category contains ${itemsInCategory} HTML workflow(s). Are you sure you want to delete it? The workflows will remain but will need to be recategorized.`)) {
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
            const response = await fetch('http://localhost:8426/api/category/delete', {
                method: "POST",
                signal: abortControllers.current.deleteCategory.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspace: "root",
                    _key: categoryKey
                })
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
    }, [htmlClasses, selectedCategory, onRefresh, onCategoryChange]);

    // HTML Class handlers
    const handleCreateHtmlClass = useCallback(async () => {
        const name = prompt("Enter HTML Class name:");
        if (!name) return;

        if (abortControllers.current.createHtml) {
            abortControllers.current.createHtml.abort();
        }
        abortControllers.current.createHtml = new AbortController();

        try {
            const response = await fetch('http://localhost:8426/api/graph/create', {
                method: "POST",
                signal: abortControllers.current.createHtml.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    htmlClass: {
                        workspace: "root",
                        category: selectedCategory || "default",
                        name: name,
                        permission: 0,
                        object: {
                            type: "block",
                            name: "Container",
                            delimiter: true,
                            tag: "div",
                            css: [
                                {
                                    selector: "&",
                                    rules: [
                                        ["height", "100%"],
                                        ["width", "100%"]
                                    ]
                                }
                            ],
                            identifier: "root"
                        }
                    },
                })
            });

            if (response.status === 200) {
                await onRefresh();
            }
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error("Error creating HTML class:", error);
            }
        }
    }, [selectedCategory, onRefresh]);

    const handleOpenHtmlClass = useCallback(async (html: HtmlClass, graph: Graph) => {
        if (!Project.state.openHtmlClass) return;
        const action = await Project.state.openHtmlClass(html, graph);
        if (!action.status) {
            console.error("Failed to open HTML class:", action.reason);
        }
    }, [Project.state.openHtmlClass]);

    const handleDeleteHtmlClass = useCallback(async (htmlKey: string) => {
        if (!confirm("Are you sure you want to delete this HTML class?")) return;

        if (abortControllers.current.deleteHtml) {
            abortControllers.current.deleteHtml.abort();
        }
        abortControllers.current.deleteHtml = new AbortController();

        try {
            const response = await fetch('http://localhost:8426/api/graph/delete', {
                method: "POST",
                signal: abortControllers.current.deleteHtml.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    htmlToken: htmlKey
                }),
            });

            if (response.status === 200) {
                await onRefresh();
            }
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error("Error deleting HTML class:", error);
            }
        }
    }, [onRefresh]);

    return (
        <div>
            <div className={sectionHeaderClass}>
                <div className="icon-container">
                    <FileCode height={24} width={24} color="white"/>
                </div>
                <div className="header-content">
                    <h5>HTML Workflows</h5>
                    <p>Manage your HTML component workflows</p>
                </div>
                <div className="header-actions">
                    <button
                        onClick={() => setShowCategoryManager(!showCategoryManager)}
                        style={{
                            background: "var(--nodius-info-main)",
                            color: "white",
                            padding: "8px 16px",
                            borderRadius: "6px",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: "500",
                            transition: "var(--nodius-transition-default)",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px"
                        }}
                    >
                        <FolderPlus height={16} width={16}/>
                        Categories
                    </button>
                    <button
                        onClick={handleCreateHtmlClass}
                        style={{
                            background: "var(--nodius-primary-main)",
                            color: "white",
                            padding: "8px 16px",
                            borderRadius: "6px",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: "500",
                            transition: "var(--nodius-transition-default)",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px"
                        }}
                    >
                        <Plus height={16} width={16}/>
                        Create
                    </button>
                </div>
            </div>

            {/* Category Manager Panel */}
            <Collapse in={showCategoryManager}>
                <div className={categoryManagerClass}>
                    <div className="manager-header">
                        <div className="manager-title">
                            <Tag height={16} width={16}/>
                            Category Management
                        </div>
                        <button onClick={handleCreateCategory} className="add-category-btn">
                            <Plus height={14} width={14}/>
                            Add Category
                        </button>
                    </div>
                    {categories.length > 0 ? (
                        <div className="category-list">
                            {categoryStats.map((cat) => (
                                <div key={cat.name} className="category-item">
                                    <div className="category-name">
                                        <Tag height={12} width={12}/>
                                        {cat.name}
                                    </div>
                                    <div className="category-count">
                                        {cat.count} item{cat.count !== 1 ? 's' : ''}
                                    </div>
                                    <button
                                        className="delete-category-btn"
                                        onClick={() => handleDeleteCategory(cat.name, cat.name)}
                                        title="Delete category"
                                    >
                                        <X height={14} width={14}/>
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{textAlign: "center", padding: "20px", opacity: 0.6, fontSize: "13px"}}>
                            No categories yet. Create your first category to organize workflows.
                        </div>
                    )}
                </div>
            </Collapse>

            {/* Category Filter */}
            {categories.length > 0 && (
                <div className={filterPanelClass}>
                    <div
                        className="filter-header"
                        onClick={() => setShowCategoryFilter(!showCategoryFilter)}
                    >
                        <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                            <Filter height={16} width={16}/>
                            <span style={{fontSize: "13px", fontWeight: "500"}}>
                                {selectedCategory ? `Filtered by: ${selectedCategory}` : "Filter by Category"}
                            </span>
                        </div>
                        <span style={{fontSize: "18px"}}>{showCategoryFilter ? "−" : "+"}</span>
                    </div>
                    <Collapse in={showCategoryFilter}>
                        <div className="filter-pills">
                            <div
                                className={`filter-pill ${selectedCategory === null ? "active" : "inactive"}`}
                                onClick={() => onCategoryChange(null)}
                            >
                                All
                                <span className="pill-count">({htmlClasses.length})</span>
                            </div>
                            {categoryStats.map((cat) => (
                                <div
                                    key={cat.name}
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

            <Input
                type="text"
                placeholder="Search HTML workflows..."
                value={searchHtml}
                onChange={(value) => setSearchHtml(value)}
                startIcon={<Search height={18} width={18}/>}
            />

            {filteredHtmlClasses.length > 0 ? (
                <div className={cardGridClass} style={{marginTop: "16px"}}>
                    {filteredHtmlClasses.map((item, index) => (
                        <div key={index} className={itemCardClass}>
                            <div className="card-header">
                                <div>
                                    <h6 className="card-title">{item.html.name}</h6>
                                    <div
                                        className="card-category"
                                        onClick={() => onCategoryChange(item.html.category)}
                                        title={`Filter by ${item.html.category}`}
                                    >
                                        <Tag height={10} width={10}/>
                                        {item.html.category}
                                    </div>
                                </div>
                            </div>
                            <div className="card-actions">
                                <button
                                    className="btn-edit"
                                    onClick={() => handleOpenHtmlClass(item.html, item.graph)}
                                >
                                    <Edit3 height={14} width={14}/>
                                    Edit
                                </button>
                                <button
                                    className="btn-delete"
                                    onClick={() => handleDeleteHtmlClass(item.html._key)}
                                >
                                    <Trash2 height={14} width={14}/>
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className={emptyStateClass}>
                    <FileCode className="empty-icon" height={48} width={48}/>
                    <div className="empty-title">No HTML Workflows Found</div>
                    <div className="empty-description">
                        {searchHtml || selectedCategory
                            ? "No HTML workflows match your current filters. Try adjusting your search or category filter."
                            : "Create your first HTML workflow to get started building interactive components."}
                    </div>
                    <button onClick={handleCreateHtmlClass}>
                        <Plus height={16} width={16}/>
                        Create HTML Workflow
                    </button>
                </div>
            )}
        </div>
    );
});

DashboardHtmlWorkflow.displayName = "DashboardHtmlWorkflow";
