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
import {NodeTypeConfig, CategoryData} from "@nodius/utils";
import {ProjectContext} from "../../hooks/contexts/ProjectContext";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../hooks/useDynamicClass";
import {Search, Layers, Plus, Edit3, Trash2, Tag, FolderPlus, Edit2, Pencil} from "lucide-react";
import {CategoryManager} from "./CategoryManager";
import {Input} from "../../component/form/Input";
import {Button} from "../../component/form/Button";
import * as Icons from "lucide-static";
import {openIconParam, openIconPickerModal} from "../../component/form/IconPickerModal";

interface DashboardNodeConfigurationsProps {
    nodeConfigs: NodeTypeConfig[];
    selectedCategory: string | null;
    categories: CategoryData[];
    onRefresh: () => Promise<void>;
    onCategoryChange: (category: string | null) => void;
}

export const HomeNodeConfigurations = memo(({
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
            border: 1px solid var(--nodius-grey-500);
            border-radius: 10px;
            background-color: var(--nodius-background-paper);
            box-shadow: var(--nodius-shadow-1);
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

        & .card-actions > * {
            flex:1;
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
            version: 0,
            lastUpdatedTime: Date.now(),
            createdTime: Date.now(),
            workspace: "root",
            displayName: displayName,
            category: selectedCategory || "default",
            alwaysRendered: false,
            content: {
                type: "block",
                name: "Container",
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
                posX: 0,
                posY: 0,
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
     * Renames a node configuration
     * Prompts user for new display name and updates via API
     */
    const handleRenameNodeConfig = useCallback(async (nodeConfigKey: string, currentName: string) => {
        const newName = prompt("Enter new display name for node configuration:", currentName);
        if (!newName || newName === currentName) return;

        try {
            const response = await fetch('/api/nodeconfig/rename', {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspace: "root",
                    _key: nodeConfigKey,
                    newDisplayName: newName
                }),
            });

            if (response.status === 200) {
                await onRefresh();
            } else {
                const errorData = await response.json();
                alert(`Failed to rename node configuration: ${errorData.error || "Unknown error"}`);
            }
        } catch (error) {
            console.error("Error renaming node config:", error);
            alert("Failed to rename node configuration. Please try again.");
        }
    }, [onRefresh]);

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



    const iconClassParent = useDynamicClass(`
        & svg {
            height: 48px;
            width: 48px;
            stroke-width:1.5px;
            color: var(--nodius-primary-main)
        }
        & {
            position: relative;
        }
        
        & div {
            transition: var(--nodius-transition-default);
        }
        
        &:hover div:first-child {
            opacity: 0.3;
        }
        
        & div:last-child {
            position: absolute;
            inset: 0px;
            opacity: 0;
        }
        & div:last-child svg {
            color: var(--nodius-text-secondary)
        }
        &:hover div:last-child {
            opacity: 1;
            cursor: pointer;
        }
    `);

    const handleSelectIcon = (nodeConfig:NodeTypeConfig) => {
        const iconPickerModalParam:openIconParam = {
            modalNodeId: "",
            onSelectIcon: async (iconName: string) => {
                try {
                    const response = await fetch('/api/nodeconfig/icon', {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            workspace: "root",
                            _key: nodeConfig._key,
                            newIcon: iconName
                        }),
                    });

                    if (response.status === 200) {
                        await onRefresh();
                    } else {
                        const errorData = await response.json();
                        alert(`Failed to rename node configuration: ${errorData.error || "Unknown error"}`);
                    }
                } catch (error) {
                    console.error("Error renaming node config:", error);
                    alert("Failed to rename node configuration. Please try again.");
                }
            },
            getCurrentSelectedIcon: () => nodeConfig.icon,
            closeOnSelect: true,
        }
        openIconPickerModal(iconPickerModalParam);
    }

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
                    <Button
                        onClick={() => setShowCategoryManager(!showCategoryManager)}
                    >
                        <FolderPlus height={16} width={16}/>
                        Categories
                    </Button>
                    <Button
                        onClick={handleCreateNodeConfig}

                    >
                        <Plus height={16} width={16}/>
                        Create
                    </Button>
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
                    {filteredNodeConfigs.map((nodeConfig, index) => {
                        let Icon = Icons[(nodeConfig.icon ?? "CloudAlert") as keyof typeof Icons] as any;
                        if (!Icon) {
                            Icon = Icons["CloudAlert" as keyof typeof Icons] as any;
                        }
                        return (
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
                                    <div className={iconClassParent}>
                                        <div dangerouslySetInnerHTML={{__html: Icon}}/>
                                        <div onClick={() => handleSelectIcon(nodeConfig)}>
                                            <Pencil />
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
                                    <Button
                                        fullWidth
                                        size={"small"}
                                        onClick={() => handleOpenNodeConfig(nodeConfig)}
                                    >
                                        <Edit3 height={14} width={14}/>
                                        Edit
                                    </Button>
                                    <Button
                                        fullWidth
                                        size={"small"}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRenameNodeConfig(nodeConfig._key, nodeConfig.displayName);
                                        }}
                                    >
                                        <Edit2 height={14} width={14}/>
                                        Rename
                                    </Button>
                                    <Button
                                        fullWidth
                                        size={"small"}
                                        onClick={() => handleDeleteNodeConfig(nodeConfig._key)} color={"error"}
                                    >
                                        <Trash2 height={14} width={14}/>
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        )
                    })}
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
                    <Button onClick={handleCreateNodeConfig}>
                        <Plus height={16} width={16}/>
                        Create Node Configuration
                    </Button>
                </div>
            )}
        </div>
    );
});

HomeNodeConfigurations.displayName = "HomeNodeConfigurations";
