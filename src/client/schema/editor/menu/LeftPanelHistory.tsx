/**
 * @file LeftPanelHistory.tsx
 * @description History viewer panel for browsing graph modification history
 * @module dashboard/Editor
 *
 * Provides a paginated view of graph history with:
 * - Modification summaries (Created X nodes, Updated Y edges, etc.)
 * - User attribution (who made the changes)
 * - Timestamp display
 * - Load more pagination
 * - Automatic filtering based on current workflow or node config
 *
 * Features:
 * - Infinite scroll pagination with "Load More" button
 * - Human-readable modification descriptions
 * - User information display
 * - Theme-aware styling
 * - Empty state handling
 * - Loading states
 */

import {memo, useContext, useEffect, useState, useCallback, useRef} from "react";
import {Clock, User, FileText, Loader2, AlertCircle} from "lucide-react";
import {useDynamicClass} from "../../../hooks/useDynamicClass";
import {ProjectContext} from "../../../hooks/contexts/ProjectContext";
import {ThemeContext} from "../../../hooks/contexts/ThemeContext";
import {api_history_list_request, api_history_list_response, api_history_list_item} from "../../../../utils/requests/type/api_history.type";

interface LeftPanelHistoryProps {

}

export const LeftPanelHistory = memo((
    {

    }:LeftPanelHistoryProps
) => {
    const Project = useContext(ProjectContext);
    const Theme = useContext(ThemeContext);

    const [historyItems, setHistoryItems] = useState<api_history_list_item[]>([]);
    const [total, setTotal] = useState<number>(0);
    const [offset, setOffset] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const limit = 20;
    const abortControllerRef = useRef<AbortController | null>(null);

    // Determine which graph/node config we're viewing
    const graphKey = Project.state.editedNodeConfig || Project.state.graph?._key;
    const historyType: "WF" | "node" = Project.state.editedNodeConfig ? "node" : "WF";

    // Fetch history entries
    const fetchHistory = useCallback(async (appendMode: boolean = false) => {
        if (!graphKey) {
            setError("No graph or node config selected");
            return;
        }

        // Cancel any pending request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        abortControllerRef.current = new AbortController();
        setLoading(true);
        setError(null);

        try {
            const currentOffset = appendMode ? offset : 0;

            const requestBody: api_history_list_request = {
                graphKey,
                type: historyType,
                offset: currentOffset,
                limit
            };

            const response = await fetch('/api/history/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
                signal: abortControllerRef.current.signal
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch history: ${response.statusText}`);
            }

            const data: api_history_list_response = await response.json();

            if (appendMode) {
                setHistoryItems(prev => [...prev, ...data.items]);
            } else {
                setHistoryItems(data.items);
            }

            setTotal(data.total);
            setOffset(currentOffset + data.items.length);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                // Request was cancelled, ignore
                return;
            }
            console.error('Error fetching history:', err);
            setError(err instanceof Error ? err.message : 'Failed to load history');
        } finally {
            setLoading(false);
        }
    }, [graphKey, historyType, offset, limit]);

    // Reset and fetch when graph/nodeConfig changes
    useEffect(() => {
        setHistoryItems([]);
        setOffset(0);
        setTotal(0);
        setError(null);

        console.log(graphKey);

        if (graphKey) {
            fetchHistory(false);
        }

        // Cleanup on unmount
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [graphKey, historyType]);

    const handleLoadMore = () => {
        fetchHistory(true);
    };

    // Styles
    const classContainer = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100%;
            gap: 12px;
            overflow: hidden;
        }
    `);

    const classHeader = useDynamicClass(`
        & {
            font-size: 14px;
            font-weight: 600;
            color: var(--nodius-text-primary);
            padding-bottom: 8px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
    `);

    const classScrollContainer = useDynamicClass(`
        & {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 4px;
        }
    `);

    const classHistoryCard = useDynamicClass(`
        & {
            padding: 12px;
            background: var(--nodius-background-paper);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            transition: var(--nodius-transition-default);
            cursor: pointer;
        }
        &:hover {
            border-color: var(--nodius-primary-main);
            background: rgba(66, 165, 245, 0.05);
            box-shadow: var(--nodius-shadow-2);
        }
    `);

    const classDescription = useDynamicClass(`
        & {
            font-size: 13px;
            color: var(--nodius-text-primary);
            margin-bottom: 8px;
            line-height: 1.5;
        }
    `);

    const classMetadata = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-size: 11px;
            color: var(--nodius-text-secondary);
        }
    `);

    const classMetadataRow = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 6px;
        }
    `);

    const classLoadMoreButton = useDynamicClass(`
        & {
            padding: 10px 16px;
            background: var(--nodius-background-paper);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: var(--nodius-text-primary);
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: var(--nodius-transition-default);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        &:hover:not(:disabled) {
            border-color: var(--nodius-primary-main);
            background: rgba(66, 165, 245, 0.1);
        }
        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
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

    // Format timestamp
    const formatTimestamp = (timestamp: number): string => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    };

    // Render content based on state
    if (!graphKey) {
        return (
            <div className={classContainer}>
                <div className={classEmptyState}>
                    <AlertCircle size={48} style={{marginBottom: "16px", opacity: 0.5}} />
                    <p>No workflow or node config selected</p>
                    <p style={{fontSize: "12px", marginTop: "8px"}}>
                        Open a workflow or node config to view its history
                    </p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={classContainer}>
                <div className={classEmptyState}>
                    <AlertCircle size={48} style={{marginBottom: "16px", opacity: 0.5, color: "var(--nodius-error-main)"}} />
                    <p>Error loading history</p>
                    <p style={{fontSize: "12px", marginTop: "8px"}}>
                        {error}
                    </p>
                    <button
                        className={classLoadMoreButton}
                        onClick={() => fetchHistory(false)}
                        style={{marginTop: "16px"}}
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    const hasMore = offset < total;

    return (
        <div className={classContainer}>
            <div className={classHeader}>
                History ({total} {total === 1 ? 'entry' : 'entries'})
            </div>

            <div className={classScrollContainer}>
                {historyItems.length === 0 && !loading ? (
                    <div className={classEmptyState}>
                        <FileText size={48} style={{marginBottom: "16px", opacity: 0.5}} />
                        <p>No history yet</p>
                        <p style={{fontSize: "12px", marginTop: "8px"}}>
                            Changes will appear here as they are made
                        </p>
                    </div>
                ) : (
                    <>
                        {historyItems.map((item) => (
                            <div key={item._key} className={classHistoryCard}>
                                <div className={classDescription}>
                                    {item.description}
                                </div>
                                <div className={classMetadata}>
                                    <div className={classMetadataRow}>
                                        <Clock size={12} />
                                        <span>{formatTimestamp(item.timestamp)}</span>
                                    </div>
                                    {item.users.length > 0 && (
                                        <div className={classMetadataRow}>
                                            <User size={12} />
                                            <span>
                                                {item.users.map(u => u.username).join(', ')}
                                            </span>
                                        </div>
                                    )}
                                    <div className={classMetadataRow}>
                                        <FileText size={12} />
                                        <span>{item.historyCount} {item.historyCount === 1 ? 'change' : 'changes'}</span>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {hasMore && (
                            <button
                                className={classLoadMoreButton}
                                onClick={handleLoadMore}
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        <span>Loading...</span>
                                    </>
                                ) : (
                                    <span>Load More ({total - offset} remaining)</span>
                                )}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
});
LeftPanelHistory.displayName = "LeftPanelHistory";