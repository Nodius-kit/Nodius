/**
 * ActionConverter — Transforms ProposedAction (HITL) into Nodius mutation commands.
 *
 * The AI NEVER executes mutations itself. Instead, proposed actions are converted
 * into GraphInstructions[], node/edge create lists, and delete key lists.
 * The client or WsAIController applies these via the standard sync pipeline.
 */

import { InstructionBuilder } from "@nodius/utils";
import type { GraphInstructions } from "@nodius/utils";
import type { Node, Edge } from "@nodius/utils";
import type { ProposedAction } from "./types.js";

// ─── Result type ────────────────────────────────────────────────────

export interface ActionConversionResult {
    /** Instructions de modification de champs (move_node, update_node) */
    instructions: GraphInstructions[];
    /** Nodes complets a creer */
    nodesToCreate: Node<unknown>[];
    /** Edges complets a creer */
    edgesToCreate: Edge[];
    /** Cles de nodes a supprimer */
    nodeKeysToDelete: string[];
    /** Cles d'edges a supprimer */
    edgeKeysToDelete: string[];
    /** SheetId concerne (pour WSBatch*) */
    sheetId: string;
}

// ─── Key generation ─────────────────────────────────────────────────

function generateKey(): string {
    return `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Empty result factory ───────────────────────────────────────────

function emptyResult(sheetId: string): ActionConversionResult {
    return {
        instructions: [],
        nodesToCreate: [],
        edgesToCreate: [],
        nodeKeysToDelete: [],
        edgeKeysToDelete: [],
        sheetId,
    };
}

// ─── Main converter ─────────────────────────────────────────────────

/**
 * Convert a ProposedAction into mutation commands for the Nodius sync pipeline.
 *
 * Pure/synchronous — no side effects, no network calls.
 *
 * @param action - The proposed action from the AI agent
 * @param graphKey - The graph key (used for node/edge creation)
 * @param defaultSheetId - Default sheet ID when the action doesn't specify one
 */
export function convertAction(
    action: ProposedAction,
    graphKey: string,
    defaultSheetId: string = "0",
): ActionConversionResult {
    switch (action.type) {
        case "move_node":
            return convertMoveNode(action.payload, defaultSheetId);
        case "update_node":
            return convertUpdateNode(action.payload, defaultSheetId);
        case "create_node":
            return convertCreateNode(action.payload, graphKey);
        case "delete_node":
            return convertDeleteNode(action.payload, defaultSheetId);
        case "create_edge":
            return convertCreateEdge(action.payload, graphKey);
        case "delete_edge":
            return convertDeleteEdge(action.payload, defaultSheetId);
        case "batch":
            return convertBatch(action.payload.actions, graphKey, defaultSheetId);
    }
}

// ─── Per-type converters ────────────────────────────────────────────

function convertMoveNode(
    payload: { nodeKey: string; posX: number; posY: number },
    sheetId: string,
): ActionConversionResult {
    const result = emptyResult(sheetId);

    const posXInstruction = new InstructionBuilder().key("posX").set(payload.posX);
    const posYInstruction = new InstructionBuilder().key("posY").set(payload.posY);

    result.instructions.push(
        { i: posXInstruction, sheetId, nodeId: payload.nodeKey, animatePos: true },
        { i: posYInstruction, sheetId, nodeId: payload.nodeKey, animatePos: true },
    );

    return result;
}

function convertUpdateNode(
    payload: { nodeKey: string; changes: Record<string, unknown> },
    sheetId: string,
): ActionConversionResult {
    const result = emptyResult(sheetId);

    for (const [key, value] of Object.entries(payload.changes)) {
        let instruction;

        if (key.startsWith("data.")) {
            // Nested data path: "data.foo.bar" → .key("data").key("foo").key("bar").set(value)
            const parts = key.split(".");
            let builder = new InstructionBuilder();
            for (const part of parts) {
                builder = builder.key(part);
            }
            instruction = builder.set(value);
        } else {
            instruction = new InstructionBuilder().key(key).set(value);
        }

        result.instructions.push({
            i: instruction,
            sheetId,
            nodeId: payload.nodeKey,
            triggerHtmlRender: true,
        });
    }

    return result;
}

function convertCreateNode(
    payload: { typeKey: string; sheet: string; posX: number; posY: number; data?: unknown },
    graphKey: string,
): ActionConversionResult {
    const sheetId = payload.sheet;
    const result = emptyResult(sheetId);

    const node: Node<unknown> = {
        _key: generateKey(),
        graphKey,
        sheet: payload.sheet,
        type: payload.typeKey,
        typeVersion: 1,
        posX: payload.posX,
        posY: payload.posY,
        size: { width: 200, height: 100 },
        process: "",
        handles: {},
        data: payload.data ?? {},
    };

    result.nodesToCreate.push(node);
    return result;
}

function convertDeleteNode(
    payload: { nodeKey: string },
    sheetId: string,
): ActionConversionResult {
    const result = emptyResult(sheetId);
    result.nodeKeysToDelete.push(payload.nodeKey);
    return result;
}

function convertCreateEdge(
    payload: {
        sourceKey: string;
        sourceHandle: string;
        targetKey: string;
        targetHandle: string;
        sheet: string;
        label?: string;
    },
    graphKey: string,
): ActionConversionResult {
    const sheetId = payload.sheet;
    const result = emptyResult(sheetId);

    const edge: Edge = {
        _key: generateKey(),
        graphKey,
        sheet: payload.sheet,
        source: payload.sourceKey,
        sourceHandle: payload.sourceHandle,
        target: payload.targetKey,
        targetHandle: payload.targetHandle,
        label: payload.label,
    };

    result.edgesToCreate.push(edge);
    return result;
}

function convertDeleteEdge(
    payload: { edgeKey: string },
    sheetId: string,
): ActionConversionResult {
    const result = emptyResult(sheetId);
    result.edgeKeysToDelete.push(payload.edgeKey);
    return result;
}

function convertBatch(
    actions: ProposedAction[],
    graphKey: string,
    defaultSheetId: string,
): ActionConversionResult {
    const merged = emptyResult(defaultSheetId);

    for (const action of actions) {
        const sub = convertAction(action, graphKey, defaultSheetId);

        merged.instructions.push(...sub.instructions);
        merged.nodesToCreate.push(...sub.nodesToCreate);
        merged.edgesToCreate.push(...sub.edgesToCreate);
        merged.nodeKeysToDelete.push(...sub.nodeKeysToDelete);
        merged.edgeKeysToDelete.push(...sub.edgeKeysToDelete);

        // Use the last sub-action's sheetId if it differs
        if (sub.sheetId !== defaultSheetId) {
            merged.sheetId = sub.sheetId;
        }
    }

    return merged;
}
