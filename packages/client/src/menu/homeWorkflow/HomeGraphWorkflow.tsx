/**
 * @file HomeGraphWorkflow.tsx
 * @description Standard graph workflow dashboard with category filtering and management
 * @module dashboard
 *
 * Dashboard component for managing standard (non-HTML) graph workflows:
 * - HomeGraphWorkflow: Display and manage standalone graph workflows
 * - Search functionality: Filter workflows by name
 * - Category integration: Filter by category with CategoryManager component
 * - CRUD operations: Create, edit (open), rename, and delete graph workflows
 *
 * Key features:
 * - Grid layout with responsive cards
 * - Empty state with call-to-action
 * - Abort controller management for concurrent requests
 * - Integration with ProjectContext for opening graphs
 * - Category-based filtering and organization
 */

import {memo, useCallback, useContext, useRef, useState} from "react";
import {Graph} from "@nodius/utils";
import {ProjectContext} from "../../hooks/contexts/ProjectContext";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../hooks/useDynamicClass";
import {Search, GitBranch, Plus, Edit3, Trash2, Tag, FolderPlus, Edit2} from "lucide-react";
import {CategoryManager} from "./CategoryManager";
import {api_graph_create} from "@nodius/utils";
import {Input} from "../../component/form/Input";
import {Button} from "../../component/form/Button";
import {CategoryData} from "@nodius/utils";

interface HomeGraphWorkflowProps {
    graphs: Graph[];
    selectedCategory: string | null;
    categories: CategoryData[];
    onRefresh: () => Promise<void>;
    onCategoryChange: (category: string | null) => void;
}

export const HomeGraphWorkflow = memo(({
                                           graphs,
                                           selectedCategory,
                                           categories,
                                           onRefresh,
                                           onCategoryChange
                                       }: HomeGraphWorkflowProps) => {
    const Theme = useContext(ThemeContext);
    const Project = useContext(ProjectContext);

    const [searchGraph, setSearchGraph] = useState<string>("");
    const [showCategoryManager, setShowCategoryManager] = useState<boolean>(false);
    const [showCategoryFilter, setShowCategoryFilter] = useState<boolean>(false);

    // Abort controllers for cancelling in-flight requests
    const abortControllers = useRef<{
        deleteGraph?: AbortController;
        createGraph?: AbortController;
    }>({});

    // Filter workflows by search term and selected category
    const filteredGraphs = graphs.filter(item =>
        item.name.toLowerCase().includes(searchGraph.toLowerCase()) &&
        (selectedCategory === null || item.category === selectedCategory)
    );

    // Category item counts
    const itemCounts = categories.reduce((acc, cat) => {
        acc[cat.category] = graphs.filter(g => g.category === cat.category).length;
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

    `);

    /**
     * Creates a new standalone graph workflow
     * Uses /api/graph/create with body.graph (no HTML class)
     */
    const handleCreateGraph = useCallback(async () => {
        const name = prompt("Enter workflow name:");
        if (!name) return;

        if (abortControllers.current.createGraph) {
            abortControllers.current.createGraph.abort();
        }
        abortControllers.current.createGraph = new AbortController();

        try {
            const response = await fetch('/api/graph/create', {
                method: "POST",
                signal: abortControllers.current.createGraph.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    graph: {
                        name: name,
                        workspace: "root",
                    },
                } as api_graph_create)
            });

            if (response.status === 200) {
                await onRefresh();
            }
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error("Error creating graph workflow:", error);
            }
        }
    }, [onRefresh]);

    /**
     * Opens a graph workflow in the editor
     * Delegates to ProjectContext.openGraph for actual opening logic
     */
    const handleOpenGraph = useCallback(async (graph: Graph) => {
        if (!Project.state.openGraph) return;
        const action = await Project.state.openGraph(graph);
        if (!action.status) {
            console.error("Failed to open graph:", action.reason);
        }
    }, [Project.state.openGraph]);

    /**
     * Renames a graph workflow
     * Prompts user for new name and updates via API
     */
    const handleRenameGraph = useCallback(async (graphKey: string, currentName: string) => {
        const newName = prompt("Enter new name for workflow:", currentName);
        if (!newName || newName === currentName) return;

        try {
            const response = await fetch('/api/graph/rename', {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    graphToken: graphKey,
                    newName: newName
                }),
            });

            if (response.status === 200) {
                await onRefresh();
            } else {
                const errorData = await response.json();
                alert(`Failed to rename workflow: ${errorData.error || "Unknown error"}`);
            }
        } catch (error) {
            console.error("Error renaming graph:", error);
            alert("Failed to rename workflow. Please try again.");
        }
    }, [onRefresh]);

    /**
     * Deletes a graph workflow with confirmation
     * Refreshes the workflow list after successful deletion
     */
    const handleDeleteGraph = useCallback(async (graphKey: string) => {
        if (!confirm("Are you sure you want to delete this workflow?")) return;

        if (abortControllers.current.deleteGraph) {
            abortControllers.current.deleteGraph.abort();
        }
        abortControllers.current.deleteGraph = new AbortController();

        try {
            const response = await fetch('/api/graph/delete', {
                method: "POST",
                signal: abortControllers.current.deleteGraph.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    graphToken: graphKey
                }),
            });

            if (response.status === 200) {
                await onRefresh();
            }
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error("Error deleting graph:", error);
            }
        }
    }, [onRefresh]);

    return (
        <div>
            <div className={sectionHeaderClass}>
                <div className="icon-container">
                    <GitBranch height={24} width={24} color="white"/>
                </div>
                <div className="header-content">
                    <h5>Graph Workflows</h5>
                    <p>Manage your standard graph workflows</p>
                </div>
                <div className="header-actions">
                    <Button
                        onClick={() => setShowCategoryManager(!showCategoryManager)}
                    >
                        <FolderPlus height={16} width={16}/>
                        Categories
                    </Button>
                    <Button
                        onClick={handleCreateGraph}
                    >
                        <Plus height={16} width={16}/>
                        Create
                    </Button>
                </div>
            </div>

            {/* Category Manager Component */}
            <CategoryManager
                type="graph"
                categories={categories}
                selectedCategory={selectedCategory}
                itemCounts={itemCounts}
                totalItems={graphs.length}
                showManager={showCategoryManager}
                showFilter={showCategoryFilter}
                onToggleManager={() => setShowCategoryManager(!showCategoryManager)}
                onToggleFilter={() => setShowCategoryFilter(!showCategoryFilter)}
                onCategoryChange={onCategoryChange}
                onRefresh={onRefresh}
            />

            <Input
                type="text"
                placeholder="Search graph workflows..."
                value={searchGraph}
                onChange={(value) => setSearchGraph(value)}
                startIcon={<Search height={18} width={18}/>}
            />

            {filteredGraphs.length > 0 ? (
                <div className={cardGridClass} style={{marginTop: "16px"}}>
                    {filteredGraphs.map((graph, index) => (
                        <div key={index} className={itemCardClass}>
                            <div className="card-header">
                                <div>
                                    <h6 className="card-title">{graph.name}</h6>
                                    <div
                                        className="card-category"
                                        onClick={() => onCategoryChange(graph.category)}
                                        title={`Filter by ${graph.category}`}
                                    >
                                        <Tag height={10} width={10}/>
                                        {graph.category}
                                    </div>
                                </div>
                            </div>
                            <div className="card-actions">
                                <Button
                                    size={"small"}
                                    onClick={() => handleOpenGraph(graph)}
                                    fullWidth
                                >
                                    <Edit3 height={14} width={14}/>
                                    Edit
                                </Button>
                                <Button
                                    size={"small"}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRenameGraph(graph._key, graph.name);
                                    }}
                                    fullWidth
                                >
                                    <Edit2 height={14} width={14}/>
                                    Rename
                                </Button>
                                <Button
                                    size={"small"}
                                    onClick={() => handleDeleteGraph(graph._key)} color={"error"}
                                    fullWidth
                                >
                                    <Trash2 height={14} width={14}/>
                                    Delete
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className={emptyStateClass}>
                    <GitBranch className="empty-icon" height={48} width={48}/>
                    <div className="empty-title">No Graph Workflows Found</div>
                    <div className="empty-description">
                        {searchGraph || selectedCategory
                            ? "No graph workflows match your current filters. Try adjusting your search or category filter."
                            : "Create your first graph workflow to get started building automation workflows."}
                    </div>
                    <Button onClick={handleCreateGraph}>
                        <Plus height={16} width={16}/>
                        Create Graph Workflow
                    </Button>
                </div>
            )}
        </div>
    );
});

HomeGraphWorkflow.displayName = "HomeGraphWorkflow";
