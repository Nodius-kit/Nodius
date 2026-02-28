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

// ─── Zod Schemas ────────────────────────────────────────────────────

/**
 * Handle structure matches Nodius Node.handles:
 *   Record<handleSide, { position: "separate"|"fix", point: NodePoint[] }>
 * Validated loosely here since the LLM rarely needs to specify handles
 * (they come from NodeTypeConfig defaults).
 */
const HandlePointSchema = z.object({
    id: z.string(),
    type: z.enum(["in", "out"]),
    accept: z.string(),
    display: z.string().optional(),
});

const HandleSideSchema = z.object({
    position: z.enum(["separate", "fix"]),
    point: z.array(HandlePointSchema),
});

export const ProposeCreateNodeSchema = z.object({
    typeKey: z.string().describe("Type du node a creer (ex: 'api-call', 'filter', 'starter', 'html')"),
    sheet: z.string().describe("ID du sheet ou placer le node (ex: '0')"),
    posX: z.number().describe("Position X dans le canvas"),
    posY: z.number().describe("Position Y dans le canvas"),
    process: z.string().default("").describe("Code JavaScript du node (optionnel)"),
    handles: z.record(z.string(), HandleSideSchema).optional()
        .describe("Handles du node. Cles: T, D, R, L, 0. Optionnel si le type a des handles par defaut."),
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
                        sheet: { type: "string", description: "ID du sheet (ex: '0')" },
                        posX: { type: "number", description: "Position X dans le canvas" },
                        posY: { type: "number", description: "Position Y dans le canvas" },
                        process: { type: "string", description: "Code JavaScript du node (optionnel)" },
                        handles: {
                            type: "object",
                            description: "Handles du node (optionnel si le type a des handles par defaut)",
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
                            },
                        },
                        data: { type: "object", description: "Donnees specifiques au type (optionnel)" },
                        reason: { type: "string", description: "Explication de la raison de cette creation" },
                    },
                    required: ["typeKey", "sheet", "posX", "posY", "reason"],
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
        default:
            throw new Error(`Unknown write tool: ${toolName}`);
    }
}
