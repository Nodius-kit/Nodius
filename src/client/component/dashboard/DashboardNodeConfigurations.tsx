/**
 * @file DashboardNodeConfigurations.tsx
 * @description Node configurations dashboard for managing custom node types
 * @module dashboard
 *
 * Dashboard component for managing node type configurations:
 * - DashboardNodeConfigurations: Display and manage custom node type definitions
 * - Search functionality: Filter node configs by display name
 * - Category integration: Organize node configs with CategoryManager
 * - CRUD operations: Create, edit (open), and delete node configurations
 *
 * Key features:
 * - Card-based grid layout with responsive design
 * - Default node config template with basic styling
 * - Integration with ProjectContext for opening node configs
 * - Category-based filtering and organization
 * - Empty state with helpful messaging
 */

import {memo, useCallback, useContext, useRef, useState} from "react";
import {NodeTypeConfig} from "../../../utils/graph/graphType";
import {ProjectContext} from "../../hooks/contexts/ProjectContext";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../hooks/useDynamicClass";
import {Input} from "../form/Input";
import {Search, Layers, Plus, Edit3, Trash2, Tag, FolderPlus} from "lucide-react";
import {CategoryManager, CategoryData} from "./CategoryManager";

interface DashboardNodeConfigurationsProps {
    nodeConfigs: NodeTypeConfig[];
    selectedCategory: string | null;
    categories: CategoryData[];
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

    // Abort controllers for cancelling in-flight requests
    const abortControllers = useRef<{
        deleteNodeConfig?: AbortController;
        createNodeConfig?: AbortController;
    }>({});

    // Filter node configs by search term and selected category
    const filteredNodeConfigs = nodeConfigs.filter(item =>
        item.displayName.toLowerCase().includes(searchNodeConfig.toLowerCase()) &&
        (selectedCategory === null || item.category === selectedCategory)
    );

    // Category item counts
    const itemCounts = categories.reduce((acc, cat) => {
        acc[cat.category] = nodeConfigs.filter(n => n.category === cat.category).length;
        return acc;
    }, {} as { [key: string]: number });

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

    /**
     * Creates a new node configuration with default template
     * Includes default container, border styling, and node metadata
     */
    const handleCreateNodeConfig = useCallback(async () => {
        const displayName = prompt("Enter Node Configuration display name:");
        if (!displayName) return;

        if (abortControllers.current.createNodeConfig) {
            abortControllers.current.createNodeConfig.abort();
        }
        abortControllers.current.createNodeConfig = new AbortController();

        // Create default node configuration with basic structure
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
                domEvents: [],
                //workflowEvents: [],
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
                data: undefined,
                process: ""
            }
        };

        try {
            const response = await fetch('/api/nodeconfig/create', {
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

    /**
     * Opens a node configuration in the editor
     * Delegates to ProjectContext.openNodeConfig for actual opening logic
     */
    const handleOpenNodeConfig = useCallback(async (nodeConfig: NodeTypeConfig) => {
        if (!Project.state.openNodeConfig) return;
        const action = await Project.state.openNodeConfig(nodeConfig);
        if (!action.status) {
            console.error("Failed to open node config:", action.reason);
        }
    }, [Project.state.openNodeConfig]);

    /**
     * Deletes a node configuration with confirmation
     * Refreshes the node config list after successful deletion
     */
    const handleDeleteNodeConfig = useCallback(async (nodeConfigKey: string) => {
        if (!confirm("Are you sure you want to delete this node config?")) return;

        if (abortControllers.current.deleteNodeConfig) {
            abortControllers.current.deleteNodeConfig.abort();
        }
        abortControllers.current.deleteNodeConfig = new AbortController();

        try {
            const response = await fetch('/api/nodeconfig/delete', {
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

            {/* Category Manager Component */}
            <CategoryManager
                type="nodeconfig"
                categories={categories}
                selectedCategory={selectedCategory}
                itemCounts={itemCounts}
                totalItems={nodeConfigs.length}
                showManager={showCategoryManager}
                showFilter={showCategoryFilter}
                onToggleManager={() => setShowCategoryManager(!showCategoryManager)}
                onToggleFilter={() => setShowCategoryFilter(!showCategoryFilter)}
                onCategoryChange={onCategoryChange}
                onRefresh={onRefresh}
            />

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
