/**
 * @file LeftPanelNodeLibrary.tsx
 * @description Node library panel for browsing and placing custom node types
 * @module dashboard/Editor
 *
 * Provides a searchable library of custom node configurations that can be:
 * - Filtered by name and category
 * - Placed onto the graph canvas
 * - Organized by category
 * - Collapsed/expanded by category
 *
 * Features:
 * - Live search filtering by node displayName
 * - Category-based organization and filtering
 * - Visual feedback for node types
 * - Theme-aware styling
 * - Click to place node on canvas
 */

import React, {memo, useContext, useMemo, useState} from "react";
import {Search, Box, ChevronDown, ChevronUp, CloudAlert} from "lucide-react";
import {Input} from "../../form/Input";
import {Card} from "../../form/Card";
import {Collapse} from "../../animate/Collapse";
import {useDynamicClass} from "../../../hooks/useDynamicClass";
import {ProjectContext} from "../../../hooks/contexts/ProjectContext";
import {ThemeContext} from "../../../hooks/contexts/ThemeContext";
import {NodeTypeConfig} from "../../../../utils/graph/graphType";

interface LeftPanelNodeLibraryProps {
    nodeConfigsList: NodeTypeConfig[] | undefined;
}

export const LeftPanelNodeLibrary = memo(({
    nodeConfigsList
}: LeftPanelNodeLibraryProps) => {

    const [nodeSearch, setNodeSearch] = useState<string>("");
    const [categoryFilter, setCategoryFilter] = useState<string>("");
    const [hideCategory, setHideCategory] = useState<string[]>([]);

    const Project = useContext(ProjectContext);
    const Theme = useContext(ThemeContext);

    // Group nodes by category
    const nodesByCategory = useMemo(() => {
        if (!nodeConfigsList) return {};

        const grouped: Record<string, NodeTypeConfig[]> = {};
        for (const config of nodeConfigsList) {
            if (!grouped[config.category]) {
                grouped[config.category] = [];
            }
            grouped[config.category].push(config);
        }
        return grouped;
    }, [nodeConfigsList]);

    // Get unique categories for filter dropdown
    const categories = useMemo(() => {
        return Object.keys(nodesByCategory).sort();
    }, [nodesByCategory]);

    // Filter nodes based on search and category
    const filteredNodes = useMemo(() => {
        const search = nodeSearch.trim().toLowerCase();
        const filtered: Record<string, NodeTypeConfig[]> = {};

        for (const [category, nodes] of Object.entries(nodesByCategory)) {
            // Skip if category doesn't match filter
            if (categoryFilter && category !== categoryFilter) {
                continue;
            }

            // Filter nodes by search term
            const matchingNodes = nodes.filter((node) =>
                node.displayName.toLowerCase().includes(search) ||
                node.description?.toLowerCase().includes(search)
            );

            if (matchingNodes.length > 0) {
                filtered[category] = matchingNodes;
            }
        }

        return filtered;
    }, [nodesByCategory, nodeSearch, categoryFilter]);

    const handleNodeClick = (nodeConfig: NodeTypeConfig) => {
        // TODO: Implement node placement on canvas
        // This will create a new node instance from the config
        console.log("Place node:", nodeConfig.displayName);
    };

    const classSearchContainer = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding-bottom: 8px;
        }
    `);

    const classFilterSelect = useDynamicClass(`
        & {
            padding: 8px 12px;
            background: var(--nodius-background-paper);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: var(--nodius-text-primary);
            font-size: 13px;
            cursor: pointer;
            transition: var(--nodius-transition-default);
        }
        &:hover {
            border-color: var(--nodius-primary-main);
            background: rgba(66, 165, 245, 0.05);
        }
        &:focus {
            outline: none;
            border-color: var(--nodius-primary-main);
        }
    `);

    const classCategoryHeader = useDynamicClass(`
        & {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: var(--nodius-background-paper);
            border-radius: 8px;
            cursor: pointer;
            transition: var(--nodius-transition-default);
            user-select: none;
        }
        &:hover {
            background: rgba(66, 165, 245, 0.1);
        }
    `);

    const classCategoryTitle = useDynamicClass(`
        & {
            font-size: 13px;
            font-weight: 600;
            color: var(--nodius-text-primary);
            display: flex;
            align-items: center;
            gap: 8px;
        }
    `);

    const classNodeGrid = useDynamicClass(`
        & {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 8px;
            padding: 8px 0;
        }
    `);

    const classNodeCard = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            padding: 12px;
            background: var(--nodius-background-paper);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            cursor: pointer;
            transition: var(--nodius-transition-default);
            min-height: 80px;
        }
        &:hover {
            border-color: var(--nodius-primary-main);
            background: rgba(66, 165, 245, 0.05);
            transform: translateY(-2px);
            box-shadow: var(--nodius-shadow-2);
        }
    `);

    const classNodeName = useDynamicClass(`
        & {
            font-size: 13px;
            font-weight: 500;
            color: var(--nodius-text-primary);
            margin-bottom: 4px;
            word-break: break-word;
        }
    `);

    const classNodeDescription = useDynamicClass(`
        & {
            font-size: 11px;
            color: var(--nodius-text-secondary);
            line-height: 1.4;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
        }
    `);

    const classEmptyState = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            color: var(--nodius-text-secondary);
            text-align: center;
        }
    `);

    if (!nodeConfigsList) {
        return (
            <div className={classEmptyState}>
                <CloudAlert size={48} style={{marginBottom: "16px", opacity: 0.5}} />
                <p>Loading node library...</p>
            </div>
        );
    }

    const hasNodes = Object.keys(filteredNodes).length > 0;

    return (
        <div style={{display: "flex", width: "100%", height: "100%", flexDirection: "column", padding: "8px", gap: "12px", overflow: "hidden"}}>
            <div className={classSearchContainer}>
                <Input
                    type="text"
                    icon={<Search size={16} />}
                    placeholder="Search nodes..."
                    value={nodeSearch}
                    onChange={(e) => setNodeSearch(e.target.value)}
                />
                <select
                    className={classFilterSelect}
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                >
                    <option value="">All Categories</option>
                    {categories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
            </div>

            <div style={{flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: "8px"}}>
                {!hasNodes ? (
                    <div className={classEmptyState}>
                        <Box size={48} style={{marginBottom: "16px", opacity: 0.5}} />
                        <p>No nodes found</p>
                        {nodeSearch || categoryFilter ? (
                            <p style={{fontSize: "12px", marginTop: "8px"}}>
                                Try adjusting your filters
                            </p>
                        ) : null}
                    </div>
                ) : (
                    Object.entries(filteredNodes).map(([category, nodes]) => {
                        const isHidden = hideCategory.includes(category);
                        return (
                            <Card key={category} style={{padding: "8px"}}>
                                <div
                                    className={classCategoryHeader}
                                    onClick={() => {
                                        if (isHidden) {
                                            setHideCategory(hideCategory.filter(c => c !== category));
                                        } else {
                                            setHideCategory([...hideCategory, category]);
                                        }
                                    }}
                                >
                                    <div className={classCategoryTitle}>
                                        <span>{category}</span>
                                        <span style={{fontSize: "11px", opacity: 0.7}}>({nodes.length})</span>
                                    </div>
                                    {isHidden ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                                </div>
                                <Collapse in={!isHidden}>
                                    <div className={classNodeGrid}>
                                        {nodes.map((nodeConfig) => (
                                            <div
                                                key={nodeConfig._key}
                                                className={classNodeCard}
                                                onClick={() => handleNodeClick(nodeConfig)}
                                                title={nodeConfig.description || nodeConfig.displayName}
                                            >
                                                <div className={classNodeName}>
                                                    {nodeConfig.displayName}
                                                </div>
                                                {nodeConfig.description && (
                                                    <div className={classNodeDescription}>
                                                        {nodeConfig.description}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </Collapse>
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    );
});

LeftPanelNodeLibrary.displayName = "LeftPanelNodeLibrary";
