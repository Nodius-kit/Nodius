/**
 * Write tools — propose graph mutations (Human-in-the-Loop).
 *
 * These tools do NOT execute directly. When the LLM calls a propose_* tool,
 * the AIAgent interrupts execution and returns the proposed action to the client
 * for human approval before any mutation happens.
 */

import { z } from "zod";
import type OpenAI from "openai";
import type { ProposedAction, CreateNodePayload, CreateEdgePayload, CreateNodeWithEdgesPayload, ConfigureNodeTypePayload, ReorganizeLayoutPayload, EdgeConnectionPayload, CodePatchEntry } from "../types.js";

// ─── New Zod Schemas ────────────────────────────────────────────────

export const ProposeUpdateNodeSchema = z.object({
    nodeKey: z.string().describe("localKey du node a modifier"),
    updates: z.object({
        name: z.string().optional().describe("Nouveau nom du node"),
        data: z.record(z.string(), z.unknown()).optional().describe("Nouvelles donnees du node"),
        html: z.string().optional().describe("HTML brut pour les nodes html (sera converti en HtmlObject)"),
        description: z.string().optional().describe("Nouvelle description du node"),
        size: z.object({ width: z.number(), height: z.number(), dynamic: z.boolean().optional() }).optional().describe("Nouvelle taille du node"),
    }).describe("Champs a modifier (au moins un)"),
    reason: z.string().describe("Explication de pourquoi cette modification est necessaire"),
}).strict();

export const ProposeMoveNodeSchema = z.object({
    nodeKey: z.string().describe("localKey du node a deplacer"),
    posX: z.number().describe("Nouvelle position X"),
    posY: z.number().describe("Nouvelle position Y"),
    reason: z.string().describe("Explication de pourquoi ce deplacement est necessaire"),
}).strict();

export const ProposeDeleteEdgeSchema = z.object({
    edgeKey: z.string().describe("_key de l'edge a supprimer"),
    reason: z.string().describe("Explication de pourquoi cette suppression est necessaire"),
}).strict();

export type ProposeUpdateNodeArgs = z.infer<typeof ProposeUpdateNodeSchema>;
export type ProposeMoveNodeArgs = z.infer<typeof ProposeMoveNodeSchema>;
export type ProposeDeleteEdgeArgs = z.infer<typeof ProposeDeleteEdgeSchema>;

// ─── Zod Schemas ────────────────────────────────────────────────────

export const ProposeCreateNodeSchema = z.object({
    typeKey: z.string().describe("Type du node a creer (ex: 'api-call', 'filter', 'starter', 'html')"),
    sheet: z.string().optional().default("0").describe("ID du sheet ou placer le node (defaut: '0')"),
    posX: z.number().optional().describe("Position X dans le canvas (defaut: depuis config)"),
    posY: z.number().optional().describe("Position Y dans le canvas (defaut: depuis config)"),
    data: z.record(z.string(), z.unknown()).optional().describe("Donnees specifiques au type de node (optionnel)"),
    reason: z.string().describe("Explication de pourquoi ce node est necessaire"),
}).strict();

export const ProposeCreateEdgeSchema = z.object({
    sourceKey: z.string().describe("localKey du node source"),
    sourceHandle: z.string().describe("ID du handle de sortie sur le node source"),
    targetKey: z.string().describe("localKey du node cible"),
    targetHandle: z.string().describe("ID du handle d'entree sur le node cible"),
    sheet: z.string().describe("ID du sheet contenant les deux nodes"),
    label: z.string().optional().describe("Label de l'edge (optionnel, ex: 'success', 'error')"),
    reason: z.string().describe("Explication de pourquoi cette connexion est necessaire"),
}).strict();

export const ProposeDeleteNodeSchema = z.object({
    nodeKey: z.string().describe("localKey du node a supprimer"),
    reason: z.string().describe("Explication de pourquoi ce node doit etre supprime"),
}).strict();

// ─── New Phase 3 Schemas ─────────────────────────────────────────────

const EdgeConnectionSchema = z.object({
    direction: z.enum(["in", "out"]).describe("'out' = this new node is source, 'in' = this new node is target"),
    handleId: z.string().describe("Handle ID on the new node (ex: '0')"),
    targetNodeKey: z.string().describe("localKey of the existing node to connect to"),
    targetHandleId: z.string().describe("Handle ID on the existing node"),
    label: z.string().optional().describe("Optional edge label"),
});

export const ProposeCreateNodeWithEdgesSchema = z.object({
    typeKey: z.string().describe("Type du node a creer (ex: 'api-call', 'filter')"),
    sheet: z.string().optional().default("0").describe("Sheet ID (defaut: '0')"),
    posX: z.number().optional().describe("Position X (defaut: depuis config)"),
    posY: z.number().optional().describe("Position Y (defaut: depuis config)"),
    data: z.record(z.string(), z.unknown()).optional().describe("Donnees specifiques au type"),
    edges: z.array(EdgeConnectionSchema).describe("Connexions (edges) a creer avec le nouveau node"),
    reason: z.string().describe("Explication"),
}).strict();

const CodePatchSchema = z.object({
    search: z.string().describe("Chaine exacte a rechercher dans le code existant"),
    replace: z.string().describe("Chaine de remplacement"),
});

export const ProposeConfigureNodeTypeSchema = z.object({
    mode: z.enum(["create", "update"]).describe("'create' pour un nouveau type, 'update' pour modifier un existant"),
    typeKey: z.string().optional().describe("_key du type a modifier (requis pour update)"),
    displayName: z.string().describe("Nom d'affichage du type"),
    description: z.string().optional().describe("Description du type"),
    category: z.string().optional().describe("Categorie (ex: 'custom', 'data', 'control')"),
    icon: z.string().optional().describe("Icone lucide (ex: 'zap', 'filter', 'code')"),
    process: z.string().optional().describe("Code JavaScript COMPLET du node (utiliser seulement pour mode='create' ou remplacement total). Pour les modifications partielles, utiliser processPatches a la place."),
    processPatches: z.array(CodePatchSchema).optional().describe("Modifications chirurgicales du code process existant. Chaque patch contient {search, replace}. PREFERE a 'process' pour mode='update' car plus economique en tokens. Le search doit etre une chaine EXACTE presente dans le code actuel."),
    border: z.object({
        radius: z.number().optional().describe("Border radius en px (defaut: 10)"),
        width: z.number().optional().describe("Border width en px (defaut: 1)"),
        type: z.string().optional().describe("Border type CSS (defaut: 'solid')"),
        normalColor: z.string().optional().describe("Couleur bordure normale (defaut: var(--nodius-primary-dark))"),
        hoverColor: z.string().optional().describe("Couleur bordure hover (defaut: var(--nodius-primary-light))"),
    }).optional().describe("Style de bordure du node"),
    handles: z.record(z.string(), z.object({
        position: z.enum(["separate", "fix"]),
        point: z.array(z.object({
            id: z.string(),
            type: z.enum(["in", "out"]),
            accept: z.string().describe("Type accepte (ex: 'any', 'string', 'number', 'event[]', 'entryType')"),
            display: z.string().optional().describe("Texte affiche sur le handle"),
        })),
    })).optional().describe("Handles (connexions) du node. Cles: T (top), D (down), R (right), L (left), 0 (middle)"),
    size: z.object({
        width: z.number(),
        height: z.number(),
        dynamic: z.boolean().optional(),
    }).optional().describe("Taille par defaut du node"),
    content: z.unknown().optional().describe("HtmlObject pour le rendu visuel du node (structure recursive avec type, css, content, etc.)"),
    reason: z.string().describe("Explication"),
}).strict();

export const ProposeReorganizeLayoutSchema = z.object({
    nodeKeys: z.array(z.string()).min(1).describe("Liste des localKeys des nodes a reorganiser"),
    strategy: z.string().optional().describe("Strategie de layout (ex: 'horizontal', 'vertical', 'tree')"),
    reason: z.string().describe("Explication"),
}).strict();

const BatchActionSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("move_node"),
        nodeKey: z.string(),
        posX: z.number(),
        posY: z.number(),
    }),
    z.object({
        type: z.literal("update_node"),
        nodeKey: z.string(),
        updates: z.record(z.string(), z.unknown()),
    }),
    z.object({
        type: z.literal("delete_node"),
        nodeKey: z.string(),
    }),
    z.object({
        type: z.literal("delete_edge"),
        edgeKey: z.string(),
    }),
    z.object({
        type: z.literal("create_node"),
        typeKey: z.string(),
        sheet: z.string().optional(),
        posX: z.number().optional(),
        posY: z.number().optional(),
        data: z.record(z.string(), z.unknown()).optional(),
    }),
    z.object({
        type: z.literal("create_edge"),
        sourceKey: z.string(),
        sourceHandle: z.string(),
        targetKey: z.string(),
        targetHandle: z.string(),
        sheet: z.string(),
        label: z.string().optional(),
    }),
]);

export const ProposeBatchSchema = z.object({
    actions: z.array(BatchActionSchema).min(1).describe("Array of actions to execute as a batch"),
    reason: z.string().describe("Explication de pourquoi ces modifications sont necessaires"),
}).strict();

// ─── Types for parsed proposals ──────────────────────────────────────

export type ProposeCreateNodeArgs = z.infer<typeof ProposeCreateNodeSchema>;
export type ProposeCreateEdgeArgs = z.infer<typeof ProposeCreateEdgeSchema>;
export type ProposeDeleteNodeArgs = z.infer<typeof ProposeDeleteNodeSchema>;

// ─── Tool definitions (OpenAI function calling format) ──────────────

export function getWriteToolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return [
        {
            type: "function",
            function: {
                name: "propose_create_node",
                description: "Creer un node. Soumis a approbation.",
                parameters: {
                    type: "object",
                    properties: {
                        typeKey: { type: "string", description: "Type du node" },
                        sheet: { type: "string", description: "Sheet ID (defaut: '0')" },
                        posX: { type: "number", description: "Position X" },
                        posY: { type: "number", description: "Position Y" },
                        data: { type: "object", description: "Donnees specifiques au type" },
                        reason: { type: "string", description: "Raison" },
                    },
                    required: ["typeKey", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_create_edge",
                description: "Creer une edge entre deux nodes. Soumis a approbation.",
                parameters: {
                    type: "object",
                    properties: {
                        sourceKey: { type: "string", description: "Node source (localKey)" },
                        sourceHandle: { type: "string", description: "Handle de sortie" },
                        targetKey: { type: "string", description: "Node cible (localKey)" },
                        targetHandle: { type: "string", description: "Handle d'entree" },
                        sheet: { type: "string", description: "Sheet ID" },
                        label: { type: "string", description: "Label optionnel" },
                        reason: { type: "string", description: "Raison" },
                    },
                    required: ["sourceKey", "sourceHandle", "targetKey", "targetHandle", "sheet", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_delete_node",
                description: "Supprimer un node (et ses edges). Soumis a approbation.",
                parameters: {
                    type: "object",
                    properties: {
                        nodeKey: { type: "string", description: "localKey" },
                        reason: { type: "string", description: "Raison" },
                    },
                    required: ["nodeKey", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_update_node",
                description: "Modifier un node (nom, data, description). Pour HTML: updates.html (HTML brut, converti auto).",
                parameters: {
                    type: "object",
                    properties: {
                        nodeKey: { type: "string", description: "localKey" },
                        updates: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                data: { type: "object", description: "Donnees (pas pour html)" },
                                html: { type: "string", description: "HTML brut (nodes html uniquement)" },
                                description: { type: "string" },
                            },
                        },
                        reason: { type: "string", description: "Raison" },
                    },
                    required: ["nodeKey", "updates", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_move_node",
                description: "Deplacer un node.",
                parameters: {
                    type: "object",
                    properties: {
                        nodeKey: { type: "string", description: "localKey" },
                        posX: { type: "number" },
                        posY: { type: "number" },
                        reason: { type: "string", description: "Raison" },
                    },
                    required: ["nodeKey", "posX", "posY", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_delete_edge",
                description: "Supprimer une edge.",
                parameters: {
                    type: "object",
                    properties: {
                        edgeKey: { type: "string", description: "_key de l'edge" },
                        reason: { type: "string", description: "Raison" },
                    },
                    required: ["edgeKey", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_batch",
                description: "Plusieurs modifications en un appel (move, update, delete, create).",
                parameters: {
                    type: "object",
                    properties: {
                        actions: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    type: { type: "string", enum: ["move_node", "update_node", "delete_node", "delete_edge", "create_node", "create_edge"] },
                                    nodeKey: { type: "string" },
                                    posX: { type: "number" },
                                    posY: { type: "number" },
                                    updates: { type: "object" },
                                    edgeKey: { type: "string" },
                                    typeKey: { type: "string" },
                                    sheet: { type: "string" },
                                    data: { type: "object" },
                                    sourceKey: { type: "string" },
                                    sourceHandle: { type: "string" },
                                    targetKey: { type: "string" },
                                    targetHandle: { type: "string" },
                                    label: { type: "string" },
                                },
                                required: ["type"],
                            },
                        },
                        reason: { type: "string", description: "Raison" },
                    },
                    required: ["actions", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_create_node_with_edges",
                description: "Creer un node + ses edges en un appel. Prefere a create_node + create_edge separes.",
                parameters: {
                    type: "object",
                    properties: {
                        typeKey: { type: "string", description: "Type du node" },
                        sheet: { type: "string", description: "Sheet ID (defaut: '0')" },
                        posX: { type: "number" },
                        posY: { type: "number" },
                        data: { type: "object" },
                        edges: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    direction: { type: "string", enum: ["in", "out"] },
                                    handleId: { type: "string" },
                                    targetNodeKey: { type: "string" },
                                    targetHandleId: { type: "string" },
                                    label: { type: "string" },
                                },
                                required: ["direction", "handleId", "targetNodeKey", "targetHandleId"],
                            },
                        },
                        reason: { type: "string", description: "Raison" },
                    },
                    required: ["typeKey", "edges", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_configure_node_type",
                description: "Creer ou modifier un NodeTypeConfig (type, process, handles, bordure, taille). Soumis a approbation.",
                parameters: {
                    type: "object",
                    properties: {
                        mode: { type: "string", enum: ["create", "update"] },
                        typeKey: { type: "string", description: "_key (requis pour update)" },
                        displayName: { type: "string" },
                        description: { type: "string" },
                        category: { type: "string" },
                        icon: { type: "string", description: "Icone lucide" },
                        process: { type: "string", description: "Code JS complet (mode=create ou remplacement total)" },
                        processPatches: {
                            type: "array",
                            description: "Edits chirurgicaux [{search,replace}] (prefere pour mode=update)",
                            items: {
                                type: "object",
                                properties: {
                                    search: { type: "string" },
                                    replace: { type: "string" },
                                },
                                required: ["search", "replace"],
                            },
                        },
                        border: {
                            type: "object",
                            properties: {
                                radius: { type: "number" },
                                width: { type: "number" },
                                type: { type: "string" },
                                normalColor: { type: "string" },
                                hoverColor: { type: "string" },
                            },
                        },
                        handles: {
                            type: "object",
                            description: "Cles: T/D/R/L/0. Ex: {\"L\":{\"position\":\"separate\",\"point\":[{\"id\":\"1\",\"type\":\"in\",\"accept\":\"any\"}]}}",
                            additionalProperties: {
                                type: "object",
                                properties: {
                                    position: { type: "string", enum: ["separate", "fix"] },
                                    point: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                id: { type: "string" },
                                                type: { type: "string", enum: ["in", "out"] },
                                                accept: { type: "string" },
                                                display: { type: "string" },
                                            },
                                            required: ["id", "type", "accept"],
                                        },
                                    },
                                },
                                required: ["position", "point"],
                            },
                        },
                        size: {
                            type: "object",
                            properties: { width: { type: "number" }, height: { type: "number" }, dynamic: { type: "boolean" } },
                        },
                        content: { type: "object", description: "HtmlObject pour le rendu visuel" },
                        reason: { type: "string", description: "Raison" },
                    },
                    required: ["mode", "displayName", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_reorganize_layout",
                description: "Reorganiser le positionnement de nodes (layout automatique).",
                parameters: {
                    type: "object",
                    properties: {
                        nodeKeys: { type: "array", items: { type: "string" }, description: "localKeys des nodes" },
                        strategy: { type: "string", description: "'horizontal' (defaut), 'vertical', 'tree'" },
                        reason: { type: "string", description: "Raison" },
                    },
                    required: ["nodeKeys", "reason"],
                },
            },
        },
    ];
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Check if a tool name is a propose_* write tool. */
export function isWriteTool(toolName: string): boolean {
    return toolName.startsWith("propose_");
}

/** Parse a propose_* tool call into a ProposedAction. */
export function parseProposedAction(toolName: string, args: Record<string, unknown>): ProposedAction {
    switch (toolName) {
        case "propose_create_node": {
            const parsed = ProposeCreateNodeSchema.parse(args);
            return {
                type: "create_node",
                payload: {
                    typeKey: parsed.typeKey,
                    sheet: parsed.sheet,
                    posX: parsed.posX,
                    posY: parsed.posY,
                    data: parsed.data,
                } satisfies CreateNodePayload,
            };
        }
        case "propose_create_edge": {
            const parsed = ProposeCreateEdgeSchema.parse(args);
            return {
                type: "create_edge",
                payload: {
                    sourceKey: parsed.sourceKey,
                    sourceHandle: parsed.sourceHandle,
                    targetKey: parsed.targetKey,
                    targetHandle: parsed.targetHandle,
                    sheet: parsed.sheet,
                    label: parsed.label,
                } satisfies CreateEdgePayload,
            };
        }
        case "propose_delete_node": {
            const parsed = ProposeDeleteNodeSchema.parse(args);
            return {
                type: "delete_node",
                payload: { nodeKey: parsed.nodeKey },
            };
        }
        case "propose_update_node": {
            const parsed = ProposeUpdateNodeSchema.parse(args);
            return {
                type: "update_node",
                payload: { nodeKey: parsed.nodeKey, changes: parsed.updates },
            };
        }
        case "propose_move_node": {
            const parsed = ProposeMoveNodeSchema.parse(args);
            return {
                type: "move_node",
                payload: { nodeKey: parsed.nodeKey, posX: parsed.posX, posY: parsed.posY },
            };
        }
        case "propose_delete_edge": {
            const parsed = ProposeDeleteEdgeSchema.parse(args);
            return {
                type: "delete_edge",
                payload: { edgeKey: parsed.edgeKey },
            };
        }
        case "propose_batch": {
            const parsed = ProposeBatchSchema.parse(args);
            const subActions: ProposedAction[] = parsed.actions.map(a => {
                switch (a.type) {
                    case "move_node":
                        return { type: "move_node" as const, payload: { nodeKey: a.nodeKey, posX: a.posX, posY: a.posY } };
                    case "update_node":
                        return { type: "update_node" as const, payload: { nodeKey: a.nodeKey, changes: a.updates as Record<string, unknown> } };
                    case "delete_node":
                        return { type: "delete_node" as const, payload: { nodeKey: a.nodeKey } };
                    case "delete_edge":
                        return { type: "delete_edge" as const, payload: { edgeKey: a.edgeKey } };
                    case "create_node":
                        return { type: "create_node" as const, payload: { typeKey: a.typeKey, sheet: a.sheet, posX: a.posX, posY: a.posY, data: a.data } satisfies CreateNodePayload };
                    case "create_edge":
                        return { type: "create_edge" as const, payload: { sourceKey: a.sourceKey, sourceHandle: a.sourceHandle, targetKey: a.targetKey, targetHandle: a.targetHandle, sheet: a.sheet ?? "0", label: a.label } satisfies CreateEdgePayload };
                }
            });
            return { type: "batch", payload: { actions: subActions } };
        }
        case "propose_create_node_with_edges": {
            const parsed = ProposeCreateNodeWithEdgesSchema.parse(args);
            return {
                type: "create_node_with_edges",
                payload: {
                    typeKey: parsed.typeKey,
                    sheet: parsed.sheet,
                    posX: parsed.posX,
                    posY: parsed.posY,
                    data: parsed.data,
                    edges: parsed.edges.map(e => ({
                        direction: e.direction,
                        handleId: e.handleId,
                        targetNodeKey: e.targetNodeKey,
                        targetHandleId: e.targetHandleId,
                        label: e.label,
                    })),
                } satisfies CreateNodeWithEdgesPayload,
            };
        }
        case "propose_configure_node_type": {
            const parsed = ProposeConfigureNodeTypeSchema.parse(args);
            return {
                type: "configure_node_type",
                payload: {
                    mode: parsed.mode,
                    typeKey: parsed.typeKey,
                    displayName: parsed.displayName,
                    description: parsed.description,
                    category: parsed.category,
                    icon: parsed.icon,
                    process: parsed.process,
                    processPatches: parsed.processPatches as CodePatchEntry[] | undefined,
                    border: parsed.border,
                    handles: parsed.handles as ConfigureNodeTypePayload["handles"],
                    size: parsed.size,
                    content: parsed.content,
                } satisfies ConfigureNodeTypePayload,
            };
        }
        case "propose_reorganize_layout": {
            const parsed = ProposeReorganizeLayoutSchema.parse(args);
            return {
                type: "reorganize_layout",
                payload: {
                    nodeKeys: parsed.nodeKeys,
                    strategy: parsed.strategy,
                } satisfies ReorganizeLayoutPayload,
            };
        }
        default:
            throw new Error(`Unknown write tool: ${toolName}`);
    }
}
