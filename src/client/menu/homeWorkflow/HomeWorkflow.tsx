import {memo, useCallback, useContext, useEffect, useRef, useState} from "react";
import {AppMenuProps} from "../../hooks/contexts/ProjectContext";
import {ThemeContext} from "../../hooks/contexts/ThemeContext";
import {CategoryData} from "./CategoryManager";
import {Graph, NodeTypeConfig} from "../../../utils/graph/graphType";
import {HtmlClass} from "../../../utils/html/htmlType";
import {useDynamicClass} from "../../hooks/useDynamicClass";
import {api_category_list} from "../../../utils/requests/type/api_workflow.type";
import toast from "react-hot-toast";
import {HomeHtmlWorkflow} from "./HomeHtmlWorkflow";
import {DashboardNodeConfigurations} from "./DashboardNodeConfigurations";

export interface HtmlClassWithGraph {
    html: HtmlClass;
    graph: Graph;
}


export const HomeWorkflow = memo(({}:AppMenuProps) => {

    const Theme = useContext(ThemeContext);

    // Separate category state for HTML workflows and node configurations
    const [categoriesHtml, setCategoriesHtml] = useState<CategoryData[]>([]);
    const [categoriesNodeConfig, setCategoriesNodeConfig] = useState<CategoryData[]>([]);
    const [selectedCategoryHtml, setSelectedCategoryHtml] = useState<string | null>(null);
    const [selectedCategoryNodeConfig, setSelectedCategoryNodeConfig] = useState<string | null>(null);

    const [htmlClasses, setHtmlClasses] = useState<HtmlClassWithGraph[]>([]);
    const [nodeConfigs, setNodeConfigs] = useState<NodeTypeConfig[]>([]);

    const [loading, setLoading] = useState<boolean>(true);

    // Abort controllers for cancelling in-flight requests on unmount
    const abortControllers = useRef<{
        categoriesHtml?: AbortController;
        categoriesNodeConfig?: AbortController;
        htmlClasses?: AbortController;
        nodeConfigs?: AbortController;
    }>({});

    // Dynamic classes
    const containerClass = useDynamicClass(`
        & {
            background-color: var(--nodius-background-default);
            display: flex;
            justify-content: center;
            width: 100%;
            height: 100%;
            overflow: hidden;
        }
    `);

    const mainColumnClass = useDynamicClass(`
        & {
            flex: 1;
            display: flex;
            max-width: 1400px;
            flex-direction: column;
            gap: 20px;
            padding: 20px;
            overflow-y: auto;
        }
    `);

    /**
     * Fetches categories for HTML workflows from the API
     */
    const fetchCategoriesHtml = useCallback(async () => {
        if (abortControllers.current.categoriesHtml) {
            abortControllers.current.categoriesHtml.abort();
        }
        abortControllers.current.categoriesHtml = new AbortController();

        try {
            const response = await fetch('/api/category/list', {
                method: "POST",
                signal: abortControllers.current.categoriesHtml.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspace: "root",
                    type: "workflow"
                } as api_category_list)
            });

            if (response.status === 200) {
                const json = await response.json() as CategoryData[];
                setCategoriesHtml(json);
            }
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error("Error fetching HTML categories:", error);
                toast.error("Error fetching HTML categories");
            }
        }
    }, []);

    /**
     * Fetches categories for node configurations from the API
     */
    const fetchCategoriesNodeConfig = useCallback(async () => {
        if (abortControllers.current.categoriesNodeConfig) {
            abortControllers.current.categoriesNodeConfig.abort();
        }
        abortControllers.current.categoriesNodeConfig = new AbortController();

        try {
            const response = await fetch('/api/category/list', {
                method: "POST",
                signal: abortControllers.current.categoriesNodeConfig.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspace: "root",
                    type: "nodeconfig"
                } as api_category_list)
            });

            if (response.status === 200) {
                const json = await response.json() as CategoryData[];

                setCategoriesNodeConfig(json);
            }
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error("Error fetching NodeConfig categories:", error);
                toast.error("Error fetching NodeConfig categories");
            }
        }
    }, []);

    /**
     * Fetches all HTML class workflows from the API
     */
    const fetchHtmlClasses = useCallback(async () => {
        if (abortControllers.current.htmlClasses) {
            abortControllers.current.htmlClasses.abort();
        }
        abortControllers.current.htmlClasses = new AbortController();

        try {
            const response = await fetch('/api/graph/get', {
                method: "POST",
                signal: abortControllers.current.htmlClasses.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspace: "root",
                    retrieveHtml: {
                        buildGraph: false,
                        length: 100,
                        offset: 0
                    }
                }),
            });

            if (response.status === 200) {
                const json = await response.json() as HtmlClassWithGraph[];
                setHtmlClasses(json);
            }
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error("Error fetching HTML classes:", error);
                toast.error("Error fetching HTML classes");
            }
        }
    }, []);

    /**
     * Fetches all node configurations from the API
     */
    const fetchNodeConfigs = useCallback(async () => {
        if (abortControllers.current.nodeConfigs) {
            abortControllers.current.nodeConfigs.abort();
        }
        abortControllers.current.nodeConfigs = new AbortController();

        try {
            const response = await fetch('/api/nodeconfig/list', {
                method: "POST",
                signal: abortControllers.current.nodeConfigs.signal,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspace: "root"
                }),
            });

            if (response.status === 200) {
                const json = await response.json() as NodeTypeConfig[];
                setNodeConfigs(json);
            }
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error("Error fetching node configs:", error);
                toast.error("Error fetching node configs");
            }
        }
    }, []);

    /**
     * Loads all data in parallel on component mount
     */
    const loadData = useCallback(async () => {
        setLoading(true);
        await Promise.all([
            fetchCategoriesHtml(),
            fetchCategoriesNodeConfig(),
            fetchHtmlClasses(),
            fetchNodeConfigs()
        ]);
        setLoading(false);
    }, [fetchCategoriesHtml, fetchCategoriesNodeConfig, fetchHtmlClasses, fetchNodeConfigs]);

    /**
     * Refreshes HTML workflows and their categories
     * Called after create/delete operations
     */
    const refreshHtmlClasses = useCallback(async () => {
        await fetchHtmlClasses();
        await fetchCategoriesHtml();
    }, [fetchHtmlClasses, fetchCategoriesHtml]);

    /**
     * Refreshes node configurations and their categories
     * Called after create/delete operations
     */
    const refreshNodeConfigs = useCallback(async () => {
        await fetchNodeConfigs();
        await fetchCategoriesNodeConfig();
    }, [fetchNodeConfigs, fetchCategoriesNodeConfig]);


    useEffect(() => {
        loadData();

        return () => {
            // Cleanup abort controllers
            Object.values(abortControllers.current).forEach(controller => {
                controller?.abort();
            });
        };
    }, [loadData]);

    if (loading) {
        return (
            <div className={containerClass}>
                <div className={mainColumnClass}>
                    <div style={{textAlign: "center", padding: "40px"}}>
                        <p>Loading...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={containerClass}>
            <div className={mainColumnClass}>
                {/* HTML Workflows Section */}
                <HomeHtmlWorkflow
                    htmlClasses={htmlClasses}
                    selectedCategory={selectedCategoryHtml}
                    categories={categoriesHtml}
                    onRefresh={refreshHtmlClasses}
                    onCategoryChange={setSelectedCategoryHtml}
                />

                {/* Node Configurations Section */}
                <DashboardNodeConfigurations
                    nodeConfigs={nodeConfigs}
                    selectedCategory={selectedCategoryNodeConfig}
                    categories={categoriesNodeConfig}
                    onRefresh={refreshNodeConfigs}
                    onCategoryChange={setSelectedCategoryNodeConfig}
                />
            </div>
        </div>
    )
});
HomeWorkflow.displayName = "HomeWorkflow";