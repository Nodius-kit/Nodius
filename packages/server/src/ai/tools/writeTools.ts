/**
 * Write tools — propose graph mutations (Human-in-the-Loop).
 *
 * These tools do NOT execute directly. When the LLM calls a propose_* tool,
 * the AIAgent interrupts execution and returns the proposed action to the client
 * for human approval before any mutation happens.
 */

import { z } from "zod";
import type OpenAI from "openai";
import type { ProposedAction, CreateNodePayload, CreateEdgePayload } from "../types.js";

// ─── New Zod Schemas ────────────────────────────────────────────────

export const ProposeUpdateNodeSchema = z.object({
    nodeKey: z.string().describe("localKey du node a modifier"),
    updates: z.object({
        name: z.string().optional().describe("Nouveau nom du node"),
        data: z.record(z.string(), z.unknown()).optional().describe("Nouvelles donnees du node"),
        description: z.string().optional().describe("Nouvelle description du node"),
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
                description: "Proposer la modification de proprietes d'un node existant (nom, data, description). L'action sera soumise a l'approbation de l'utilisateur.",
                parameters: {
                    type: "object",
                    properties: {
                        nodeKey: { type: "string", description: "localKey du node a modifier" },
                        updates: {
                            type: "object",
                            description: "Champs a modifier (au moins un)",
                            properties: {
                                name: { type: "string", description: "Nouveau nom du node" },
                                data: { type: "object", description: "Nouvelles donnees du node" },
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
                description: "Proposer plusieurs modifications en une seule action (ex: reorganiser le layout de plusieurs nodes). Soumis a approbation.",
                parameters: {
                    type: "object",
                    properties: {
                        actions: {
                            type: "array",
                            description: "Array of actions",
                            items: {
                                type: "object",
                                properties: {
                                    type: { type: "string", enum: ["move_node", "update_node", "delete_node", "delete_edge"], description: "Type of action" },
                                    nodeKey: { type: "string", description: "Node key (for move_node, update_node, delete_node)" },
                                    posX: { type: "number", description: "New X position (for move_node)" },
                                    posY: { type: "number", description: "New Y position (for move_node)" },
                                    updates: { type: "object", description: "Fields to update (for update_node)" },
                                    edgeKey: { type: "string", description: "Edge key (for delete_edge)" },
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
                        return { type: "move_node", payload: { nodeKey: a.nodeKey, posX: a.posX, posY: a.posY } };
                    case "update_node":
                        return { type: "update_node", payload: { nodeKey: a.nodeKey, changes: a.updates as Record<string, unknown> } };
                    case "delete_node":
                        return { type: "delete_node", payload: { nodeKey: a.nodeKey } };
                    case "delete_edge":
                        return { type: "delete_edge", payload: { edgeKey: a.edgeKey } };
                }
            });
            return { type: "batch", payload: { actions: subActions } };
        }
        default:
            throw new Error(`Unknown write tool: ${toolName}`);
    }
}
