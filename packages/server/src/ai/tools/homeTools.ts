/**
 * Home tools — tools available when the AI operates in "home" context (no graph open).
 *
 * Read tools: list workspace graphs, HTML classes, and node configs.
 * Write tools: propose creating new graphs or HTML classes (Human-in-the-Loop).
 */

import { z } from "zod";
import type OpenAI from "openai";
import { encode } from "@toon-format/toon";
import type { GraphDataSource, ProposedAction, CreateGraphPayload } from "../types.js";

// ─── Zod Schemas ────────────────────────────────────────────────────

export const ProposeCreateGraphSchema = z.object({
    name: z.string().describe("Nom du workflow graph a creer"),
    description: z.string().optional().describe("Description du graph"),
    reason: z.string().describe("Explication"),
}).strict();

export const ProposeCreateHtmlClassSchema = z.object({
    name: z.string().describe("Nom de la HTML class a creer"),
    description: z.string().optional().describe("Description"),
    reason: z.string().describe("Explication"),
}).strict();

// ─── Tool definitions ───────────────────────────────────────────────

export function getHomeReadToolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return [
        {
            type: "function",
            function: {
                name: "list_user_graphs",
                description: "Lister tous les graphs (workflows) de l'utilisateur. Retourne: nom, cle, nombre de nodes, date de modification.",
                parameters: {
                    type: "object",
                    properties: {
                        category: { type: "string", description: "Filtrer par categorie (optionnel)" },
                    },
                },
            },
        },
        {
            type: "function",
            function: {
                name: "list_user_html_classes",
                description: "Lister toutes les HTML classes (pages/composants) de l'utilisateur. Retourne: nom, cle, graph lie, date.",
                parameters: {
                    type: "object",
                    properties: {
                        category: { type: "string", description: "Filtrer par categorie (optionnel)" },
                    },
                },
            },
        },
        {
            type: "function",
            function: {
                name: "list_node_configs",
                description: "Lister tous les types de nodes disponibles (built-in + custom). Retourne: nom, cle, description, categorie.",
                parameters: {
                    type: "object",
                    properties: {},
                },
            },
        },
    ];
}

export function getHomeWriteToolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return [
        {
            type: "function",
            function: {
                name: "propose_create_graph",
                description: "Proposer la creation d'un nouveau workflow graph. Cree automatiquement un node Starter et un node Return. Soumis a approbation.",
                parameters: {
                    type: "object",
                    properties: {
                        name: { type: "string", description: "Nom du graph" },
                        description: { type: "string", description: "Description (optionnel)" },
                        reason: { type: "string", description: "Explication" },
                    },
                    required: ["name", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_create_html_class",
                description: "Proposer la creation d'une nouvelle HTML class (page/composant). Cree automatiquement un graph lie avec un node HTML root. Soumis a approbation.",
                parameters: {
                    type: "object",
                    properties: {
                        name: { type: "string", description: "Nom de la HTML class" },
                        description: { type: "string", description: "Description (optionnel)" },
                        reason: { type: "string", description: "Explication" },
                    },
                    required: ["name", "reason"],
                },
            },
        },
    ];
}

// ─── Tool executor ──────────────────────────────────────────────────

export function createHomeReadToolExecutor(dataSource: GraphDataSource, workspace: string) {
    return async function executeHomeReadTool(toolName: string, args: Record<string, unknown>): Promise<string> {
        switch (toolName) {
            case "list_user_graphs": {
                if (!dataSource.listGraphs) return encode({ error: "listGraphs not implemented" });
                const graphs = await dataSource.listGraphs(workspace);
                const category = args.category as string | undefined;
                const filtered = category ? graphs.filter(g => g.category === category) : graphs;

                // Separate workflow graphs (no htmlKeyLinked) from html-linked graphs
                const workflowGraphs = filtered.filter(g => !g.htmlKeyLinked);
                return encode(workflowGraphs.map(g => ({
                    _key: g._key,
                    name: g.name,
                    category: g.category,
                    nodeCount: g.nodeCount,
                    sheetCount: g.sheetCount,
                    lastUpdated: g.lastUpdatedTime ? new Date(g.lastUpdatedTime).toISOString().slice(0, 10) : undefined,
                })));
            }

            case "list_user_html_classes": {
                if (!dataSource.listHtmlClasses) return encode({ error: "listHtmlClasses not implemented" });
                const classes = await dataSource.listHtmlClasses(workspace);
                const category = args.category as string | undefined;
                const filtered = category ? classes.filter(c => c.category === category) : classes;

                return encode(filtered.map(c => ({
                    _key: c._key,
                    name: c.name,
                    description: c.description,
                    category: c.category,
                    graphKeyLinked: c.graphKeyLinked,
                    lastUpdated: c.lastUpdatedTime ? new Date(c.lastUpdatedTime).toISOString().slice(0, 10) : undefined,
                })));
            }

            case "list_node_configs": {
                // Use any graphKey — configs are workspace-scoped, not graph-scoped
                const configs = await dataSource.getNodeConfigs("");
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

            default:
                return encode({ error: `Unknown home tool: ${toolName}` });
        }
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Check if a tool name is a home write tool. */
export function isHomeWriteTool(toolName: string): boolean {
    return toolName === "propose_create_graph" || toolName === "propose_create_html_class";
}

/** Parse a home write tool call into a ProposedAction. */
export function parseHomeProposedAction(toolName: string, args: Record<string, unknown>): ProposedAction {
    switch (toolName) {
        case "propose_create_graph": {
            const parsed = ProposeCreateGraphSchema.parse(args);
            return {
                type: "create_graph",
                payload: {
                    name: parsed.name,
                    type: "graph",
                    description: parsed.description,
                } satisfies CreateGraphPayload,
            };
        }
        case "propose_create_html_class": {
            const parsed = ProposeCreateHtmlClassSchema.parse(args);
            return {
                type: "create_graph",
                payload: {
                    name: parsed.name,
                    type: "htmlClass",
                    description: parsed.description,
                } satisfies CreateGraphPayload,
            };
        }
        default:
            throw new Error(`Unknown home write tool: ${toolName}`);
    }
}
