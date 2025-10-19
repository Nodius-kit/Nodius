import {memo, useCallback, useContext, useRef, useState} from "react";
import {NodeTypeConfig} from "../../../utils/graph/graphType";
import {ProjectContext} from "../../hooks/contexts/ProjectContext";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../hooks/useDynamicClass";
import {Input} from "../form/Input";
import {Search, Layers, Plus, Edit3, Trash2, Tag, FolderPlus, X, Filter} from "lucide-react";
import {Collapse} from "../animate/Collapse";

interface DashboardNodeConfigurationsProps {
    nodeConfigs: NodeTypeConfig[];
    selectedCategory: string | null;
    categories: string[];
    onRefresh: () => Promise<void>;
    onCategoryChange: (category: string | null) => void;
}

export const DashboardNodeConfigurations = memo(({
    nodeConfigs,
    selectedCategory,
    categories,
    onRefresh,
    onCategoryChange
}: DashboardNodeConfigurationsProps) => {
    const Project = useContext(ProjectContext);
    const Theme = useContext(ThemeContext);

    const [searchNodeConfig, setSearchNodeConfig] = useState<string>("");
    const [showCategoryManager, setShowCategoryManager] = useState<boolean>(false);
    const [showCategoryFilter, setShowCategoryFilter] = useState<boolean>(false);

    // Abort controllers
    const abortControllers = useRef<{
        deleteNodeConfig?: AbortController;
        createNodeConfig?: AbortController;
        createCategory?: AbortController;
        deleteCategory?: AbortController;
    }>({});

    // Filtered data
    const filteredNodeConfigs = nodeConfigs.filter(item =>
        item.displayName.toLowerCase().includes(searchNodeConfig.toLowerCase()) &&
        (selectedCategory === null || item.category === selectedCategory)
    );

    // Category statistics
    const categoryStats = categories.map(cat => ({
        name: cat,
        count: nodeConfigs.filter(n => n.category === cat).length
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
            const response = await fetch('http://localhost:8426/api/nodeconfig/category/create', {
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
        const itemsInCategory = nodeConfigs.filter(n => n.category === categoryName).length;

        if (itemsInCategory > 0) {
            if (!confirm(`This category contains ${itemsInCategory} node configuration(s). Are you sure you want to delete it? The configurations will remain but will need to be recategorized.`)) {
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
            const response = await fetch('http://localhost:8426/api/nodeconfig/category/delete', {
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
    }, [nodeConfigs, selectedCategory, onRefresh, onCategoryChange]);

    // Node Config handlers
    const handleCreateNodeConfig = useCallback(async () => {
        const displayName = prompt("Enter Node Configuration display name:");
        if (!displayName) return;

        if (abortControllers.current.createNodeConfig) {
            abortControllers.current.createNodeConfig.abort();
        }
        abortControllers.current.createNodeConfig = new AbortController();

        const nodeConfig: Omit<NodeTypeConfig, "_key"> = {
            description: "",
            lastUpdatedTime: Date.now(),
            createdTime: Date.now(),
            workspace: "root",
            displayName: displayName,
            category: selectedCategory || "default",
            alwaysRendered: false,
            domEvents: [],
            content: {
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
            },
            border: {
                radius: 8,
                width: 1,
                type: "solid",
                normal: {
                    color: "var(--nodius-primary-dark)",
                },
                hover: {
                    color: "var(--nodius-primary-light)",
                }
            },
            node: {
                type: "",
                handles: {},
                size: {
                    width: 300,
                    height: 300,
                },
                data: undefined
            }
        };

        try {
            const response = await fetch('http://localhost:8426/api/nodeconfig/create', {
                method: "POST",
                signal: abortControllers.current.createNodeConfig.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    nodeConfig: nodeConfig
                }),
            });

            if (response.status === 200) {
                await onRefresh();
            } else {
                const errorData = await response.json();
                console.error("Error creating node config:", errorData);
                alert(`Failed to create node configuration: ${errorData.error || "Unknown error"}`);
            }
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error("Error creating node config:", error);
                alert("Failed to create node configuration. Please try again.");
            }
        }
    }, [selectedCategory, onRefresh]);

    const handleOpenNodeConfig = useCallback(async (nodeConfig: NodeTypeConfig) => {
        if (!Project.state.openNodeConfig) return;
        const action = await Project.state.openNodeConfig(nodeConfig);
        if (!action.status) {
            console.error("Failed to open node config:", action.reason);
        }
    }, [Project.state.openNodeConfig]);

    const handleDeleteNodeConfig = useCallback(async (nodeConfigKey: string) => {
        if (!confirm("Are you sure you want to delete this node config?")) return;

        if (abortControllers.current.deleteNodeConfig) {
            abortControllers.current.deleteNodeConfig.abort();
        }
        abortControllers.current.deleteNodeConfig = new AbortController();

        try {
            const response = await fetch('http://localhost:8426/api/nodeconfig/delete', {
                method: "POST",
                signal: abortControllers.current.deleteNodeConfig.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspace: "root",
                    _key: nodeConfigKey
                }),
            });

            if (response.status === 200) {
                await onRefresh();
            }
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error("Error deleting node config:", error);
            }
        }
    }, [onRefresh]);

    return (
        <div style={{marginTop: "40px"}}>
            <div className={sectionHeaderClass}>
                <div className="icon-container">
                    <Layers height={24} width={24} color="white"/>
                </div>
                <div className="header-content">
                    <h5>Node Configurations</h5>
                    <p>Manage your custom node types</p>
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
                        onClick={handleCreateNodeConfig}
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
                            No categories yet. Create your first category to organize node configurations.
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
                                <span className="pill-count">({nodeConfigs.length})</span>
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
                placeholder="Search node configurations..."
                value={searchNodeConfig}
                onChange={(value) => setSearchNodeConfig(value)}
                startIcon={<Search height={18} width={18}/>}
            />

            {filteredNodeConfigs.length > 0 ? (
                <div className={cardGridClass} style={{marginTop: "16px"}}>
                    {filteredNodeConfigs.map((nodeConfig, index) => (
                        <div key={index} className={itemCardClass}>
                            <div className="card-header">
                                <div>
                                    <h6 className="card-title">{nodeConfig.displayName}</h6>
                                    <div
                                        className="card-category"
                                        onClick={() => onCategoryChange(nodeConfig.category)}
                                        title={`Filter by ${nodeConfig.category}`}
                                    >
                                        <Tag height={10} width={10}/>
                                        {nodeConfig.category}
                                    </div>
                                </div>
                            </div>
                            {nodeConfig.description && nodeConfig.description !== "" && (
                                <p style={{
                                    fontSize: "12px",
                                    margin: "0",
                                    opacity: "0.7",
                                    lineHeight: "1.4"
                                }}>
                                    {nodeConfig.description}
                                </p>
                            )}
                            <div className="card-actions">
                                <button
                                    className="btn-edit"
                                    onClick={() => handleOpenNodeConfig(nodeConfig)}
                                >
                                    <Edit3 height={14} width={14}/>
                                    Edit
                                </button>
                                <button
                                    className="btn-delete"
                                    onClick={() => handleDeleteNodeConfig(nodeConfig._key)}
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
                    <Layers className="empty-icon" height={48} width={48}/>
                    <div className="empty-title">No Node Configurations Found</div>
                    <div className="empty-description">
                        {searchNodeConfig || selectedCategory
                            ? "No node configurations match your current filters. Try adjusting your search or category filter."
                            : "Create your first node configuration to define custom node types for your workflows."}
                    </div>
                    <button onClick={handleCreateNodeConfig}>
                        <Plus height={16} width={16}/>
                        Create Node Configuration
                    </button>
                </div>
            )}
        </div>
    );
});

DashboardNodeConfigurations.displayName = "DashboardNodeConfigurations";
