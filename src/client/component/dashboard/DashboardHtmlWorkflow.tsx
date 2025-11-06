/**
 * @file DashboardHtmlWorkflow.tsx
 * @description HTML workflow dashboard with category filtering and management
 * @module dashboard
 *
 * Main dashboard component for managing HTML component workflows:
 * - DashboardHtmlWorkflow: Display and manage HTML class workflows
 * - Search functionality: Filter workflows by name
 * - Category integration: Filter by category with CategoryManager component
 * - CRUD operations: Create, edit (open), and delete HTML workflows
 *
 * Key features:
 * - Grid layout with responsive cards
 * - Empty state with call-to-action
 * - Abort controller management for concurrent requests
 * - Integration with ProjectContext for opening workflows
 * - Category-based filtering and organization
 */

import {memo, useCallback, useContext, useRef, useState} from "react";
import {HtmlClass} from "../../../utils/html/htmlType";
import {Graph} from "../../../utils/graph/graphType";
import {ProjectContext} from "../../hooks/contexts/ProjectContext";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../hooks/useDynamicClass";
import {Input} from "../form/Input";
import {Search, FileCode, Plus, Edit3, Trash2, Tag, FolderPlus} from "lucide-react";
import {CategoryManager, CategoryData} from "./CategoryManager";
import {api_graph_create} from "../../../utils/requests/type/api_workflow.type";

interface DashboardHtmlWorkflowProps {
    htmlClasses: HtmlClassWithGraph[];
    selectedCategory: string | null;
    categories: CategoryData[];
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

    // Abort controllers for cancelling in-flight requests
    const abortControllers = useRef<{
        deleteHtml?: AbortController;
        createHtml?: AbortController;
    }>({});

    // Filter workflows by search term and selected category
    const filteredHtmlClasses = htmlClasses.filter(item =>
        item.html.name.toLowerCase().includes(searchHtml.toLowerCase()) &&
        (selectedCategory === null || item.html.category === selectedCategory)
    );

    // Category item counts
    const itemCounts = categories.reduce((acc, cat) => {
        acc[cat.category] = htmlClasses.filter(h => h.html.category === cat.category).length;
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
     * Creates a new HTML workflow with default structure
     * Creates a basic container div with full width/height as starting point
     */
    const handleCreateHtmlClass = useCallback(async () => {
        const name = prompt("Enter HTML Class name:");
        if (!name) return;

        if (abortControllers.current.createHtml) {
            abortControllers.current.createHtml.abort();
        }
        abortControllers.current.createHtml = new AbortController();

        try {
            const response = await fetch('/api/graph/create', {
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
                            domEvents: [],
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
                } as api_graph_create)
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

    /**
     * Opens an HTML workflow in the editor
     * Delegates to ProjectContext.openHtmlClass for actual opening logic
     */
    const handleOpenHtmlClass = useCallback(async (html: HtmlClass, graph: Graph) => {
        if (!Project.state.openHtmlClass) return;
        const action = await Project.state.openHtmlClass(html, graph);
        if (!action.status) {
            console.error("Failed to open HTML class:", action.reason);
        }
    }, [Project.state.openHtmlClass]);

    /**
     * Deletes an HTML workflow with confirmation
     * Refreshes the workflow list after successful deletion
     */
    const handleDeleteHtmlClass = useCallback(async (htmlKey: string) => {
        if (!confirm("Are you sure you want to delete this HTML class?")) return;

        if (abortControllers.current.deleteHtml) {
            abortControllers.current.deleteHtml.abort();
        }
        abortControllers.current.deleteHtml = new AbortController();

        try {
            const response = await fetch('/api/graph/delete', {
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

            {/* Category Manager Component */}
            <CategoryManager
                type="workflow"
                categories={categories}
                selectedCategory={selectedCategory}
                itemCounts={itemCounts}
                totalItems={htmlClasses.length}
                showManager={showCategoryManager}
                showFilter={showCategoryFilter}
                onToggleManager={() => setShowCategoryManager(!showCategoryManager)}
                onToggleFilter={() => setShowCategoryFilter(!showCategoryFilter)}
                onCategoryChange={onCategoryChange}
                onRefresh={onRefresh}
            />

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
