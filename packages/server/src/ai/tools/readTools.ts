import { z } from "zod";
import type OpenAI from "openai";
import type { GraphDataSource } from "../types.js";
import { truncate, summarizeHandles } from "../utils.js";

// ─── Zod Schemas ────────────────────────────────────────────────────

export const ReadGraphOverviewSchema = z.object({
    graphKey: z.string().describe("Cle du graph"),
});

export const SearchNodesSchema = z.object({
    query: z.string().describe("Texte de recherche"),
    sheetId: z.string().optional().describe("Filtrer par sheet (optionnel)"),
    maxResults: z.number().default(10).describe("Nombre max de resultats"),
});

export const ExploreNeighborhoodSchema = z.object({
    nodeKey: z.string().describe("localKey du node de depart"),
    maxDepth: z.number().min(1).max(3).default(2).describe("Profondeur max de traversal"),
    direction: z.enum(["outbound", "inbound", "any"]).default("any"),
});

export const ReadNodeDetailSchema = z.object({
    nodeKey: z.string().describe("localKey du node"),
});

export const ReadNodeConfigSchema = z.object({
    typeKey: z.string().describe("_key du NodeTypeConfig"),
});

export const ListNodeTypesSchema = z.object({});

export const ListNodeEdgesSchema = z.object({
    nodeKey: z.string().describe("localKey du node"),
    direction: z.enum(["inbound", "outbound", "any"]).default("any"),
});

// ─── Tool definitions (OpenAI function calling format) ──────────────

export function getReadToolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return [
        {
            type: "function",
            function: {
                name: "read_graph_overview",
                description: "Obtenir les metadonnees du graph courant : nom, sheets, nombre de nodes/edges par sheet",
                parameters: {
                    type: "object",
                    properties: {
                        graphKey: { type: "string", description: "Cle du graph" },
                    },
                    required: ["graphKey"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "search_nodes",
                description: "Chercher des nodes dans le graph par leur nom, type, description ou contenu",
                parameters: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "Texte de recherche" },
                        sheetId: { type: "string", description: "Filtrer par sheet (optionnel)" },
                        maxResults: { type: "number", description: "Nombre max de resultats (defaut: 10)" },
                    },
                    required: ["query"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "explore_neighborhood",
                description: "Explorer les nodes connectes autour d'un node (voisins directs et indirects)",
                parameters: {
                    type: "object",
                    properties: {
                        nodeKey: { type: "string", description: "localKey du node de depart" },
                        maxDepth: { type: "number", description: "Profondeur max (1-3, defaut: 2)" },
                        direction: { type: "string", enum: ["outbound", "inbound", "any"], description: "Direction (defaut: any)" },
                    },
                    required: ["nodeKey"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "read_node_detail",
                description: "Obtenir tous les details d'un node specifique : type, code process, data, handles, position",
                parameters: {
                    type: "object",
                    properties: {
                        nodeKey: { type: "string", description: "localKey du node" },
                    },
                    required: ["nodeKey"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "read_node_config",
                description: "Obtenir la definition d'un type de node custom : template HTML, handles, process",
                parameters: {
                    type: "object",
                    properties: {
                        typeKey: { type: "string", description: "_key du NodeTypeConfig" },
                    },
                    required: ["typeKey"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "list_available_node_types",
                description: "Lister tous les types de nodes disponibles (built-in + custom)",
                parameters: {
                    type: "object",
                    properties: {},
                },
            },
        },
        {
            type: "function",
            function: {
                name: "list_node_edges",
                description: "Lister toutes les connexions (edges) d'un node : entrantes et sortantes",
                parameters: {
                    type: "object",
                    properties: {
                        nodeKey: { type: "string", description: "localKey du node" },
                        direction: { type: "string", enum: ["inbound", "outbound", "any"], description: "Direction (defaut: any)" },
                    },
                    required: ["nodeKey"],
                },
            },
        },
    ];
}

// ─── Tool executor ──────────────────────────────────────────────────

export function createReadToolExecutor(dataSource: GraphDataSource, graphKey: string) {
    return async function executeReadTool(toolName: string, args: Record<string, unknown>): Promise<string> {
        switch (toolName) {
            case "read_graph_overview": {
                const graph = await dataSource.getGraph(graphKey);
                if (!graph) return JSON.stringify({ error: "Graph not found" });

                const nodes = await dataSource.getNodes(graphKey);
                const edges = await dataSource.getEdges(graphKey);

                const sheetStats: Record<string, { nodeCount: number; edgeCount: number }> = {};
                for (const [id, name] of Object.entries(graph.sheets)) {
                    sheetStats[id] = {
                        nodeCount: nodes.filter(n => n.sheet === id).length,
                        edgeCount: edges.filter(e => e.sheet === id).length,
                    };
                }

                return JSON.stringify({
                    name: graph.name,
                    description: graph.description,
                    sheets: Object.entries(graph.sheets).map(([id, name]) => ({
                        id,
                        name,
                        ...sheetStats[id],
                    })),
                    metadata: graph.metadata,
                });
            }

            case "search_nodes": {
                const parsed = SearchNodesSchema.parse(args);
                const results = await dataSource.searchNodes(graphKey, parsed.query, parsed.maxResults);

                const filtered = parsed.sheetId
                    ? results.filter(n => n.sheet === parsed.sheetId)
                    : results;

                return JSON.stringify(filtered.map(n => ({
                    _key: n._key,
                    type: n.type,
                    sheet: n.sheet,
                    process: truncate(n.process, 200),
                    dataSummary: n.data ? truncate(JSON.stringify(n.data), 200) : undefined,
                })));
            }

            case "explore_neighborhood": {
                const parsed = ExploreNeighborhoodSchema.parse(args);
                const result = await dataSource.getNeighborhood(
                    graphKey,
                    parsed.nodeKey,
                    parsed.maxDepth,
                    parsed.direction,
                );

                return JSON.stringify({
                    nodes: result.nodes.map(n => ({
                        _key: n._key,
                        type: n.type,
                        sheet: n.sheet,
                        process: truncate(n.process, 300),
                    })),
                    edges: result.edges.map(e => ({
                        source: e.source,
                        sourceHandle: e.sourceHandle,
                        target: e.target,
                        targetHandle: e.targetHandle,
                        label: e.label,
                    })),
                });
            }

            case "read_node_detail": {
                const parsed = ReadNodeDetailSchema.parse(args);
                const node = await dataSource.getNodeByKey(graphKey, parsed.nodeKey);
                if (!node) return JSON.stringify({ error: "Node not found" });

                return JSON.stringify({
                    _key: node._key,
                    type: node.type,
                    sheet: node.sheet,
                    posX: node.posX,
                    posY: node.posY,
                    size: node.size,
                    process: node.process,
                    handles: summarizeHandles(node.handles),
                    data: node.data ? truncate(JSON.stringify(node.data), 500) : undefined,
                });
            }

            case "read_node_config": {
                const parsed = ReadNodeConfigSchema.parse(args);
                const configs = await dataSource.getNodeConfigs(graphKey);
                const config = configs.find(c => c._key === parsed.typeKey);
                if (!config) return JSON.stringify({ error: "NodeTypeConfig not found" });

                return JSON.stringify({
                    _key: config._key,
                    displayName: config.displayName,
                    description: config.description,
                    category: config.category,
                    icon: config.icon,
                    handles: config.node?.handles ? summarizeHandles(config.node.handles) : [],
                });
            }

            case "list_available_node_types": {
                const configs = await dataSource.getNodeConfigs(graphKey);
                const builtIn = [
                    { _key: "starter", displayName: "Starter", description: "Point d'entree du workflow", category: "built-in" },
                    { _key: "return", displayName: "Return", description: "Point de sortie du workflow", category: "built-in" },
                    { _key: "html", displayName: "Html Editor", description: "Editeur HTML WYSIWYG", category: "built-in" },
                    { _key: "entryType", displayName: "Entry Data Type", description: "Formulaire de saisie de donnees", category: "built-in" },
                ];

                return JSON.stringify([
                    ...builtIn,
                    ...configs.map(c => ({
                        _key: c._key,
                        displayName: c.displayName,
                        description: c.description,
                        category: c.category,
                        icon: c.icon,
                    })),
                ]);
            }

            case "list_node_edges": {
                const parsed = ListNodeEdgesSchema.parse(args);
                const edges = await dataSource.getEdges(graphKey);

                const filtered = edges.filter(e => {
                    if (parsed.direction === "outbound") return e.source === parsed.nodeKey;
                    if (parsed.direction === "inbound") return e.target === parsed.nodeKey;
                    return e.source === parsed.nodeKey || e.target === parsed.nodeKey;
                });

                return JSON.stringify(filtered.map(e => ({
                    _key: e._key,
                    source: e.source,
                    sourceHandle: e.sourceHandle,
                    target: e.target,
                    targetHandle: e.targetHandle,
                    label: e.label,
                })));
            }

            default:
                return JSON.stringify({ error: `Unknown tool: ${toolName}` });
        }
    };
}

