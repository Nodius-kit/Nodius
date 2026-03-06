/**
 * Write tools — propose graph mutations (Human-in-the-Loop).
 *
 * These tools do NOT execute directly. When the LLM calls a propose_* tool,
 * the AIAgent interrupts execution and returns the proposed action to the client
 * for human approval before any mutation happens.
 */

import { z } from "zod";
import type OpenAI from "openai";
import type { ProposedAction, CreateNodePayload, CreateEdgePayload, CreateNodeWithEdgesPayload, ConfigureNodeTypePayload, ReorganizeLayoutPayload, EdgeConnectionPayload } from "../types.js";

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

export const ProposeConfigureNodeTypeSchema = z.object({
    mode: z.enum(["create", "update"]).describe("'create' pour un nouveau type, 'update' pour modifier un existant"),
    typeKey: z.string().optional().describe("_key du type a modifier (requis pour update)"),
    displayName: z.string().describe("Nom d'affichage du type"),
    description: z.string().optional().describe("Description du type"),
    category: z.string().optional().describe("Categorie (ex: 'custom', 'data', 'control')"),
    icon: z.string().optional().describe("Icone lucide (ex: 'zap', 'filter', 'code')"),
    process: z.string().optional().describe("Code JavaScript d'execution du node. Variables disponibles: node, nodeMap, edgeMap, incoming, global, next(), branch(), log(). Pour HTML: initHtml(), getHtmlRenderWithId(), HtmlRender."),
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
                description: "Proposer la creation d'un nouveau node dans le graph. L'action sera soumise a l'approbation de l'utilisateur avant execution.",
                parameters: {
                    type: "object",
                    properties: {
                        typeKey: { type: "string", description: "Type du node (ex: 'api-call', 'filter', 'starter')" },
                        sheet: { type: "string", description: "ID du sheet (defaut: '0')" },
                        posX: { type: "number", description: "Position X dans le canvas (optionnel, defaut depuis config)" },
                        posY: { type: "number", description: "Position Y dans le canvas (optionnel, defaut depuis config)" },
                        data: { type: "object", description: "Donnees specifiques au type (optionnel)" },
                        reason: { type: "string", description: "Explication de la raison de cette creation" },
                    },
                    required: ["typeKey", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_create_edge",
                description: "Proposer la creation d'une connexion (edge) entre deux nodes. L'action sera soumise a l'approbation de l'utilisateur.",
                parameters: {
                    type: "object",
                    properties: {
                        sourceKey: { type: "string", description: "localKey du node source" },
                        sourceHandle: { type: "string", description: "ID du handle de sortie (ex: '0')" },
                        targetKey: { type: "string", description: "localKey du node cible" },
                        targetHandle: { type: "string", description: "ID du handle d'entree (ex: '0')" },
                        sheet: { type: "string", description: "ID du sheet" },
                        label: { type: "string", description: "Label optionnel (ex: 'success', 'error')" },
                        reason: { type: "string", description: "Explication de la raison de cette connexion" },
                    },
                    required: ["sourceKey", "sourceHandle", "targetKey", "targetHandle", "sheet", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_delete_node",
                description: "Proposer la suppression d'un node existant. Les edges connectees seront aussi supprimees. L'action sera soumise a l'approbation de l'utilisateur.",
                parameters: {
                    type: "object",
                    properties: {
                        nodeKey: { type: "string", description: "localKey du node a supprimer" },
                        reason: { type: "string", description: "Explication de la raison de cette suppression" },
                    },
                    required: ["nodeKey", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_update_node",
                description: "Proposer la modification de proprietes d'un node existant (nom, data, description). Pour les nodes HTML, fournir le HTML brut dans updates.html (sera converti en HtmlObject automatiquement). L'action sera soumise a l'approbation de l'utilisateur.",
                parameters: {
                    type: "object",
                    properties: {
                        nodeKey: { type: "string", description: "localKey du node a modifier" },
                        updates: {
                            type: "object",
                            description: "Champs a modifier (au moins un)",
                            properties: {
                                name: { type: "string", description: "Nouveau nom du node" },
                                data: { type: "object", description: "Nouvelles donnees du node (NE PAS utiliser pour les nodes HTML — utiliser 'html' a la place)" },
                                html: { type: "string", description: "HTML brut pour les nodes de type 'html'. Sera converti en HtmlObject automatiquement. Inclure <style> pour le CSS, onclick/onchange pour les events." },
                                description: { type: "string", description: "Nouvelle description du node" },
                            },
                        },
                        reason: { type: "string", description: "Explication de la raison de cette modification" },
                    },
                    required: ["nodeKey", "updates", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_move_node",
                description: "Proposer le deplacement d'un node a de nouvelles coordonnees. L'action sera soumise a l'approbation de l'utilisateur.",
                parameters: {
                    type: "object",
                    properties: {
                        nodeKey: { type: "string", description: "localKey du node a deplacer" },
                        posX: { type: "number", description: "Nouvelle position X" },
                        posY: { type: "number", description: "Nouvelle position Y" },
                        reason: { type: "string", description: "Explication de la raison de ce deplacement" },
                    },
                    required: ["nodeKey", "posX", "posY", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_delete_edge",
                description: "Proposer la suppression d'une connexion (edge) entre deux nodes. L'action sera soumise a l'approbation de l'utilisateur.",
                parameters: {
                    type: "object",
                    properties: {
                        edgeKey: { type: "string", description: "_key de l'edge a supprimer" },
                        reason: { type: "string", description: "Explication de la raison de cette suppression" },
                    },
                    required: ["edgeKey", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_batch",
                description: "Proposer plusieurs modifications en une seule action (ex: reorganiser le layout, creer nodes+edges). Soumis a approbation.",
                parameters: {
                    type: "object",
                    properties: {
                        actions: {
                            type: "array",
                            description: "Array of actions",
                            items: {
                                type: "object",
                                properties: {
                                    type: { type: "string", enum: ["move_node", "update_node", "delete_node", "delete_edge", "create_node", "create_edge"], description: "Type of action" },
                                    nodeKey: { type: "string", description: "Node key (for move_node, update_node, delete_node)" },
                                    posX: { type: "number", description: "Position X (for move_node, create_node)" },
                                    posY: { type: "number", description: "Position Y (for move_node, create_node)" },
                                    updates: { type: "object", description: "Fields to update (for update_node)" },
                                    edgeKey: { type: "string", description: "Edge key (for delete_edge)" },
                                    typeKey: { type: "string", description: "Type key (for create_node)" },
                                    sheet: { type: "string", description: "Sheet ID (for create_node, create_edge)" },
                                    data: { type: "object", description: "Node data (for create_node)" },
                                    sourceKey: { type: "string", description: "Source node key (for create_edge)" },
                                    sourceHandle: { type: "string", description: "Source handle ID (for create_edge)" },
                                    targetKey: { type: "string", description: "Target node key (for create_edge)" },
                                    targetHandle: { type: "string", description: "Target handle ID (for create_edge)" },
                                    label: { type: "string", description: "Edge label (for create_edge)" },
                                },
                                required: ["type"],
                            },
                        },
                        reason: { type: "string", description: "Explication de la raison de ces modifications" },
                    },
                    required: ["actions", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_create_node_with_edges",
                description: "Creer un node ET ses connexions (edges) en un seul appel. Plus efficace que propose_create_node + propose_create_edge separes.",
                parameters: {
                    type: "object",
                    properties: {
                        typeKey: { type: "string", description: "Type du node (ex: 'api-call', 'filter')" },
                        sheet: { type: "string", description: "Sheet ID (defaut: '0')" },
                        posX: { type: "number", description: "Position X" },
                        posY: { type: "number", description: "Position Y" },
                        data: { type: "object", description: "Donnees specifiques au type" },
                        edges: {
                            type: "array",
                            description: "Connexions a creer",
                            items: {
                                type: "object",
                                properties: {
                                    direction: { type: "string", enum: ["in", "out"], description: "'out' = nouveau node est source, 'in' = nouveau node est target" },
                                    handleId: { type: "string", description: "Handle ID sur le nouveau node" },
                                    targetNodeKey: { type: "string", description: "localKey du node existant" },
                                    targetHandleId: { type: "string", description: "Handle ID sur le node existant" },
                                    label: { type: "string", description: "Label optionnel de l'edge" },
                                },
                                required: ["direction", "handleId", "targetNodeKey", "targetHandleId"],
                            },
                        },
                        reason: { type: "string", description: "Explication" },
                    },
                    required: ["typeKey", "edges", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_configure_node_type",
                description: "Creer un nouveau type de node (NodeTypeConfig) ou modifier un type existant. Definit: description, bordure, handles, code process, taille, apparence HTML. Soumis a approbation.",
                parameters: {
                    type: "object",
                    properties: {
                        mode: { type: "string", enum: ["create", "update"], description: "'create' ou 'update'" },
                        typeKey: { type: "string", description: "_key du type (requis pour update)" },
                        displayName: { type: "string", description: "Nom d'affichage" },
                        description: { type: "string", description: "Description du type" },
                        category: { type: "string", description: "Categorie (ex: 'custom', 'data')" },
                        icon: { type: "string", description: "Icone lucide (ex: 'zap', 'filter')" },
                        process: { type: "string", description: "Code JS d'execution. Variables: node, nodeMap, edgeMap, incoming, global, next(), branch(), log(). HTML: initHtml(), HtmlRender." },
                        border: {
                            type: "object",
                            properties: {
                                radius: { type: "number", description: "Border radius px" },
                                width: { type: "number", description: "Border width px" },
                                type: { type: "string", description: "Border type CSS" },
                                normalColor: { type: "string", description: "Couleur normale" },
                                hoverColor: { type: "string", description: "Couleur hover" },
                            },
                        },
                        handles: {
                            type: "object",
                            description: "Handles (connexions). Cles: T/D/R/L/0. Ex: { \"L\": { \"position\": \"separate\", \"point\": [{ \"id\": \"1\", \"type\": \"in\", \"accept\": \"any\" }] }, \"R\": { \"position\": \"separate\", \"point\": [{ \"id\": \"2\", \"type\": \"out\", \"accept\": \"any\" }] } }",
                            additionalProperties: {
                                type: "object",
                                properties: {
                                    position: { type: "string", enum: ["separate", "fix"], description: "'separate' = handles espaces, 'fix' = position fixe" },
                                    point: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                id: { type: "string", description: "Identifiant unique du handle (ex: '1', '2')" },
                                                type: { type: "string", enum: ["in", "out"] },
                                                accept: { type: "string", description: "Type accepte (ex: 'any', 'string', 'number')" },
                                                display: { type: "string", description: "Texte affiche (optionnel)" },
                                            },
                                            required: ["id", "type", "accept"],
                                        },
                                        description: "Liste des points de connexion sur ce cote",
                                    },
                                },
                                required: ["position", "point"],
                            },
                        },
                        size: {
                            type: "object",
                            properties: {
                                width: { type: "number" },
                                height: { type: "number" },
                                dynamic: { type: "boolean" },
                            },
                        },
                        content: {
                            type: "object",
                            description: "HtmlObject pour le rendu visuel (structure recursive: type='block'|'text'|'list'|'html'|'icon'|'image'|'link'|'array', css, content, etc.)",
                        },
                        reason: { type: "string", description: "Explication" },
                    },
                    required: ["mode", "displayName", "reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "propose_reorganize_layout",
                description: "Reorganiser automatiquement le positionnement de plusieurs nodes. L'algorithme de layout est applique automatiquement.",
                parameters: {
                    type: "object",
                    properties: {
                        nodeKeys: {
                            type: "array",
                            items: { type: "string" },
                            description: "localKeys des nodes a reorganiser",
                        },
                        strategy: { type: "string", description: "Strategie: 'horizontal' (defaut), 'vertical', 'tree'" },
                        reason: { type: "string", description: "Explication" },
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
