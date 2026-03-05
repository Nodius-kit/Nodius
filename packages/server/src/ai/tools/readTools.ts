import { z } from "zod";
import type OpenAI from "openai";
import { encode } from "@toon-format/toon";
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

export const ReadSubgraphSchema = z.object({
    nodeKeys: z.array(z.string()).describe("Array of node _key values to read"),
    fields: z.array(z.string()).optional().describe("Fields to include per node. Default: [\"_key\", \"type\", \"sheet\", \"posX\", \"posY\"]. Optional extras: \"handles\", \"data\", \"size\""),
    includeConfigs: z.boolean().default(true).describe("Also include nodeConfig for each node (default: true)"),
    includeEdges: z.boolean().default(true).describe("Also include edges connected to these nodes (default: true)"),
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
                description: "Obtenir tous les details d'un node specifique : type, data, handles, position",
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
                description: "Obtenir la definition d'un type de node : code process (JS), handles, taille par defaut, description",
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
        {
            type: "function",
            function: {
                name: "read_subgraph",
                description: "Read info for multiple nodes at once. Default fields: _key, type, sheet, posX, posY (compact). Add \"handles\", \"data\", \"size\" only when needed.",
                parameters: {
                    type: "object",
                    properties: {
                        nodeKeys: {
                            type: "array",
                            items: { type: "string" },
                            description: "Array of node _key values to read",
                        },
                        fields: {
                            type: "array",
                            items: { type: "string" },
                            description: "Fields per node. Default: [\"_key\",\"type\",\"sheet\",\"posX\",\"posY\"]. Extras: \"handles\",\"data\",\"size\"",
                        },
                        includeConfigs: {
                            type: "boolean",
                            description: "Also include nodeConfig for each node (default: true)",
                        },
                        includeEdges: {
                            type: "boolean",
                            description: "Also include edges connected to these nodes (default: true)",
                        },
                    },
                    required: ["nodeKeys"],
                },
            },
        },
    ];
}

// ─── Type/Sheet resolvers ────────────────────────────────────────────

type NodeTypeConfig = Awaited<ReturnType<GraphDataSource["getNodeConfigs"]>>[number];
type GraphInfo = NonNullable<Awaited<ReturnType<GraphDataSource["getGraph"]>>>;

interface ResolverCache {
    configs: NodeTypeConfig[] | null;
    graph: GraphInfo | null;
}

function resolveType(typeKey: string, configs: NodeTypeConfig[]): string {
    const config = configs.find(c => c._key === typeKey);
    return config?.displayName ? `${typeKey} (${config.displayName})` : typeKey;
}

function resolveSheet(sheetId: string, graph: GraphInfo): string {
    const name = graph.sheets[sheetId];
    return name ? `${sheetId} (${name})` : sheetId;
}

const DEFAULT_SUBGRAPH_FIELDS = ["_key", "type", "sheet", "posX", "posY"];

// ─── Tool executor ──────────────────────────────────────────────────

export function createReadToolExecutor(dataSource: GraphDataSource, graphKey: string) {
    // Cache for type/sheet resolution — loaded lazily on first use
    const cache: ResolverCache = { configs: null, graph: null };

    async function ensureCache(): Promise<{ configs: NodeTypeConfig[]; graph: GraphInfo }> {
        if (!cache.configs) cache.configs = await dataSource.getNodeConfigs(graphKey);
        if (!cache.graph) cache.graph = await dataSource.getGraph(graphKey) ?? undefined as unknown as GraphInfo;
        return { configs: cache.configs, graph: cache.graph };
    }

    return async function executeReadTool(toolName: string, args: Record<string, unknown>): Promise<string> {
        switch (toolName) {
            case "read_graph_overview": {
                const graph = await dataSource.getGraph(graphKey);
                if (!graph) return encode({ error: "Graph not found" });

                const nodes = await dataSource.getNodes(graphKey);
                const edges = await dataSource.getEdges(graphKey);

                const sheetStats: Record<string, { nodeCount: number; edgeCount: number }> = {};
                for (const [id, name] of Object.entries(graph.sheets)) {
                    sheetStats[id] = {
                        nodeCount: nodes.filter(n => n.sheet === id).length,
                        edgeCount: edges.filter(e => e.sheet === id).length,
                    };
                }

                return encode({
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
                const { configs, graph } = await ensureCache();
                const results = await dataSource.searchNodes(graphKey, parsed.query, parsed.maxResults);

                const filtered = parsed.sheetId
                    ? results.filter(n => n.sheet === parsed.sheetId)
                    : results;

                return encode(filtered.map(n => ({
                    _key: n._key,
                    type: resolveType(n.type, configs),
                    sheet: graph ? resolveSheet(n.sheet, graph) : n.sheet,
                    dataSummary: n.data ? truncate(JSON.stringify(n.data), 200) : undefined,
                })));
            }

            case "explore_neighborhood": {
                const parsed = ExploreNeighborhoodSchema.parse(args);
                const { configs, graph } = await ensureCache();
                const result = await dataSource.getNeighborhood(
                    graphKey,
                    parsed.nodeKey,
                    parsed.maxDepth,
                    parsed.direction,
                );

                return encode({
                    nodes: result.nodes.map(n => ({
                        _key: n._key,
                        type: resolveType(n.type, configs),
                        sheet: graph ? resolveSheet(n.sheet, graph) : n.sheet,
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
                const { configs, graph } = await ensureCache();
                const node = await dataSource.getNodeByKey(graphKey, parsed.nodeKey);
                if (!node) return encode({ error: "Node not found" });

                return encode({
                    _key: node._key,
                    type: resolveType(node.type, configs),
                    sheet: graph ? resolveSheet(node.sheet, graph) : node.sheet,
                    posX: node.posX,
                    posY: node.posY,
                    size: node.size,
                    handles: summarizeHandles(node.handles),
                    data: node.data ? truncate(JSON.stringify(node.data), 500) : undefined,
                });
            }

            case "read_node_config": {
                const parsed = ReadNodeConfigSchema.parse(args);
                const configs = await dataSource.getNodeConfigs(graphKey);
                const config = configs.find(c => c._key === parsed.typeKey);
                if (!config) return encode({ error: "NodeTypeConfig not found" });

                return encode({
                    _key: config._key,
                    displayName: config.displayName,
                    description: config.description,
                    category: config.category,
                    icon: config.icon,
                    handles: config.node?.handles ? summarizeHandles(config.node.handles) : [],
                    process: config.node?.process ? truncate(config.node.process, 2000) : undefined,
                    defaultSize: config.node?.size,
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

                return encode([
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

                return encode(filtered.map(e => ({
                    _key: e._key,
                    source: e.source,
                    sourceHandle: e.sourceHandle,
                    target: e.target,
                    targetHandle: e.targetHandle,
                    label: e.label,
                })));
            }

            case "read_subgraph": {
                const parsed = ReadSubgraphSchema.parse(args);
                const { configs, graph } = await ensureCache();
                const includeConfigs = parsed.includeConfigs ?? true;
                const includeEdges = parsed.includeEdges ?? true;
                const fields = new Set(parsed.fields ?? DEFAULT_SUBGRAPH_FIELDS);

                // Fetch all nodes in parallel
                const nodeResults = await Promise.all(
                    parsed.nodeKeys.map(key => dataSource.getNodeByKey(graphKey, key)),
                );

                const nodes = nodeResults
                    .filter((n): n is NonNullable<typeof n> => n !== null)
                    .map(n => {
                        const entry: Record<string, unknown> = {};
                        if (fields.has("_key")) entry._key = n._key;
                        if (fields.has("type")) entry.type = resolveType(n.type, configs);
                        if (fields.has("sheet")) entry.sheet = graph ? resolveSheet(n.sheet, graph) : n.sheet;
                        if (fields.has("posX")) entry.posX = n.posX;
                        if (fields.has("posY")) entry.posY = n.posY;
                        if (fields.has("size")) entry.size = n.size;
                        if (fields.has("handles")) entry.handles = summarizeHandles(n.handles);
                        if (fields.has("data")) entry.data = n.data ? truncate(JSON.stringify(n.data), 500) : undefined;
                        return entry;
                    });

                const result: Record<string, unknown> = { nodes };

                // Optionally include configs
                if (includeConfigs) {
                    const allConfigs = await dataSource.getNodeConfigs(graphKey);
                    const nodeTypes = new Set(nodeResults.filter(Boolean).map(n => n!.type));
                    const configs = allConfigs
                        .filter(c => nodeTypes.has(c._key))
                        .map(c => ({
                            _key: c._key,
                            displayName: c.displayName,
                            description: c.description,
                            handles: c.node?.handles ? summarizeHandles(c.node.handles) : [],
                        }));
                    result.configs = configs;
                }

                // Optionally include edges
                if (includeEdges) {
                    const allEdges = await dataSource.getEdges(graphKey);
                    const keySet = new Set(parsed.nodeKeys);
                    const edges = allEdges
                        .filter(e => keySet.has(e.source) || keySet.has(e.target))
                        .map(e => ({
                            _key: e._key,
                            source: e.source,
                            sourceHandle: e.sourceHandle,
                            target: e.target,
                            targetHandle: e.targetHandle,
                            label: e.label,
                        }));
                    result.edges = edges;
                }

                return encode(result);
            }

            default:
                return encode({ error: `Unknown tool: ${toolName}` });
        }
    };
}

