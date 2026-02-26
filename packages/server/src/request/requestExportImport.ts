/**
 * @file requestExportImport.ts
 * @description REST API endpoints for individual entity export/import (.ndex binary format)
 * @module server/request
 *
 * Endpoints:
 * - POST /api/export/graph: Export a graph with its nodes and edges
 * - POST /api/export/htmlgraph: Export an HtmlClass with its linked graph
 * - POST /api/export/nodeconfig: Export a node type configuration
 * - POST /api/import: Import a .ndex file (unified, routes by type)
 *
 * Features:
 * - Binary .ndex format with AES-256-CBC encryption and zlib compression
 * - Workspace isolation: exports filter by workspace, imports assign target workspace
 * - Full key regeneration on import (new graphKey, localKeys, htmlKey, nodeConfigKey)
 * - Edge source/target remapping to new node keys
 * - Dedicated rate limit (10 req/min)
 * - Max upload size 5MB, max 10 000 nodes, max 50 000 edges
 */

import { HttpServer, Request, Response, rateLimit } from "../http/HttpServer";
import { DocumentCollection } from "arangojs/collections";
import { createUniqueToken, ensureCollection } from "../utils/arangoUtils";
import { encodeNodiusFile, decodeNodiusFile, ExportType } from "../utils/nodiusFileCodec";
import { aql } from "arangojs";
import { db } from "../server";
import escapeHTML from "escape-html";
import multer from "multer";
import { randomBytes } from "crypto";

function generateLocalKey(): string {
    return randomBytes(8).toString("hex");
}

// ── Payload validation ──────────────────────────────────────────────

function validateGraphPayload(p: any): boolean {
    return (
        p &&
        typeof p.graph === "object" &&
        typeof p.graph.name === "string" &&
        typeof p.graph.sheetsList === "object" &&
        Array.isArray(p.nodes) &&
        Array.isArray(p.edges)
    );
}

function validateHtmlGraphPayload(p: any): boolean {
    return (
        validateGraphPayload(p) &&
        p.htmlClass &&
        typeof p.htmlClass === "object" &&
        typeof p.htmlClass.name === "string" &&
        p.htmlClass.object != null
    );
}

function validateNodeConfigPayload(p: any): boolean {
    return (
        p &&
        typeof p.displayName === "string" &&
        typeof p.category === "string" &&
        p.node &&
        typeof p.node === "object" &&
        p.border &&
        typeof p.border === "object"
    );
}

// ── Filename sanitisation ───────────────────────────────────────────

function safeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9_\-. ]/g, "_").slice(0, 100);
}

// ── Handler ─────────────────────────────────────────────────────────

export class RequestExportImport {
    public static init = async (app: HttpServer) => {
        const graph_collection: DocumentCollection = await ensureCollection("nodius_graphs");
        const node_collection: DocumentCollection = await ensureCollection("nodius_nodes");
        const edge_collection = db.collection("nodius_edges");
        const class_collection: DocumentCollection = await ensureCollection("nodius_html_class");
        const nodeConfig_collection: DocumentCollection = await ensureCollection("nodius_node_config");

        const exportImportLimit = rateLimit({ windowMs: 60000, max: 10 });

        const upload = multer({
            storage: multer.memoryStorage(),
            limits: { fileSize: 5 * 1024 * 1024, files: 1 },
        });

        // ════════════════════════════════════════════════════════════
        //  EXPORT GRAPH
        // ════════════════════════════════════════════════════════════

        app.post("/api/export/graph", exportImportLimit, async (req: Request, res: Response) => {
            try {
                const { graphKey, workspace } = req.body as { graphKey: string; workspace: string };
                if (!graphKey || !workspace) {
                    return res.status(400).json({ error: "Missing graphKey or workspace" });
                }

                // Fetch graph
                const gCursor = await db.query(aql`
                    FOR g IN nodius_graphs
                    FILTER g._key == ${escapeHTML(graphKey)} AND g.workspace == ${escapeHTML(workspace)}
                    LIMIT 1
                    RETURN g
                `);
                const graph = await gCursor.next();
                if (!graph) return res.status(404).json({ error: "Graph not found" });

                // Fetch nodes & edges
                const nCursor = await db.query(aql`
                    FOR n IN nodius_nodes FILTER n.graphKey == ${escapeHTML(graphKey)} RETURN n
                `);
                const rawNodes = await nCursor.all();

                const eCursor = await db.query(aql`
                    FOR e IN nodius_edges FILTER e.graphKey == ${escapeHTML(graphKey)} RETURN e
                `);
                const rawEdges = await eCursor.all();

                const payload = buildGraphExportPayload(graph, rawNodes, rawEdges);
                const buffer = encodeNodiusFile(payload, { exportType: ExportType.GRAPH });

                res.setHeader("Content-Type", "application/octet-stream");
                res.setHeader("Content-Disposition", `attachment; filename="${safeFilename(graph.name)}.ndex"`);
                res.send(buffer);
            } catch (err) {
                console.error("Error exporting graph:", err);
                return res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // ════════════════════════════════════════════════════════════
        //  EXPORT HTML GRAPH
        // ════════════════════════════════════════════════════════════

        app.post("/api/export/htmlgraph", exportImportLimit, async (req: Request, res: Response) => {
            try {
                const { htmlKey, workspace } = req.body as { htmlKey: string; workspace: string };
                if (!htmlKey || !workspace) {
                    return res.status(400).json({ error: "Missing htmlKey or workspace" });
                }

                // Fetch HtmlClass
                const hCursor = await db.query(aql`
                    FOR h IN nodius_html_class
                    FILTER h._key == ${escapeHTML(htmlKey)} AND h.workspace == ${escapeHTML(workspace)}
                    LIMIT 1
                    RETURN h
                `);
                const htmlClass = await hCursor.next();
                if (!htmlClass) return res.status(404).json({ error: "HtmlClass not found" });

                const graphKey = htmlClass.graphKeyLinked;
                if (!graphKey) return res.status(400).json({ error: "HtmlClass has no linked graph" });

                // Fetch graph
                const gCursor = await db.query(aql`
                    FOR g IN nodius_graphs FILTER g._key == ${escapeHTML(graphKey)} LIMIT 1 RETURN g
                `);
                const graph = await gCursor.next();
                if (!graph) return res.status(404).json({ error: "Linked graph not found" });

                // Fetch nodes & edges
                const nCursor = await db.query(aql`
                    FOR n IN nodius_nodes FILTER n.graphKey == ${escapeHTML(graphKey)} RETURN n
                `);
                const rawNodes = await nCursor.all();

                const eCursor = await db.query(aql`
                    FOR e IN nodius_edges FILTER e.graphKey == ${escapeHTML(graphKey)} RETURN e
                `);
                const rawEdges = await eCursor.all();

                const payload = {
                    ...buildGraphExportPayload(graph, rawNodes, rawEdges),
                    htmlClass: {
                        name: htmlClass.name,
                        category: htmlClass.category,
                        permission: htmlClass.permission,
                        version: htmlClass.version,
                        description: htmlClass.description,
                        object: htmlClass.object,
                    },
                };

                const buffer = encodeNodiusFile(payload, { exportType: ExportType.HTML_GRAPH });

                res.setHeader("Content-Type", "application/octet-stream");
                res.setHeader("Content-Disposition", `attachment; filename="${safeFilename(htmlClass.name)}.ndex"`);
                res.send(buffer);
            } catch (err) {
                console.error("Error exporting htmlgraph:", err);
                return res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // ════════════════════════════════════════════════════════════
        //  EXPORT NODE CONFIG
        // ════════════════════════════════════════════════════════════

        app.post("/api/export/nodeconfig", exportImportLimit, async (req: Request, res: Response) => {
            try {
                const { nodeConfigKey, workspace } = req.body as { nodeConfigKey: string; workspace: string };
                if (!nodeConfigKey || !workspace) {
                    return res.status(400).json({ error: "Missing nodeConfigKey or workspace" });
                }

                const cursor = await db.query(aql`
                    FOR doc IN nodius_node_config
                    FILTER doc._key == ${escapeHTML(nodeConfigKey)} AND doc.workspace == ${escapeHTML(workspace)}
                    LIMIT 1
                    RETURN doc
                `);
                const nodeConfig = await cursor.next();
                if (!nodeConfig) return res.status(404).json({ error: "NodeConfig not found" });

                // Build payload — exclude _key, workspace, timestamps, node.type
                const nodeWithoutType = { ...nodeConfig.node };
                delete nodeWithoutType.type;

                const payload = {
                    displayName: nodeConfig.displayName,
                    description: nodeConfig.description,
                    category: nodeConfig.category,
                    version: nodeConfig.version,
                    content: nodeConfig.content,
                    node: nodeWithoutType,
                    border: nodeConfig.border,
                    alwaysRendered: nodeConfig.alwaysRendered,
                    icon: nodeConfig.icon,
                };

                const buffer = encodeNodiusFile(payload, { exportType: ExportType.NODE_CONFIG });

                res.setHeader("Content-Type", "application/octet-stream");
                res.setHeader("Content-Disposition", `attachment; filename="${safeFilename(nodeConfig.displayName)}.ndex"`);
                res.send(buffer);
            } catch (err) {
                console.error("Error exporting nodeconfig:", err);
                return res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // ════════════════════════════════════════════════════════════
        //  IMPORT (unified endpoint)
        // ════════════════════════════════════════════════════════════

        app.post("/api/import", exportImportLimit, async (req: Request, res: Response) => {
            try {
                // Parse multipart form-data
                await new Promise<void>((resolve, reject) => {
                    upload.single("file")(req as any, res as any, (err: any) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                const file = (req as any).file as Express.Multer.File | undefined;
                if (!file) return res.status(400).json({ error: "Missing file" });

                const workspace = req.body?.workspace as string;
                if (!workspace) return res.status(400).json({ error: "Missing workspace field" });

                // Decode .ndex
                let decoded;
                try {
                    decoded = decodeNodiusFile(file.buffer);
                } catch (err: any) {
                    return res.status(400).json({ error: err.message });
                }

                const { exportType, payload } = decoded;

                switch (exportType) {
                    case ExportType.GRAPH:
                        return await handleImportGraph(payload, workspace, res);
                    case ExportType.HTML_GRAPH:
                        return await handleImportHtmlGraph(payload, workspace, res);
                    case ExportType.NODE_CONFIG:
                        return await handleImportNodeConfig(payload, workspace, res);
                    default:
                        return res.status(400).json({ error: "Unknown export type" });
                }
            } catch (err: any) {
                if (err.message?.includes("File too large")) {
                    return res.status(413).json({ error: "File too large (max 5MB)" });
                }
                console.error("Error importing:", err);
                return res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // ── Export payload builder ──────────────────────────────────

        function buildGraphExportPayload(graph: any, rawNodes: any[], rawEdges: any[]) {
            const nodes = rawNodes.map((n: any) => {
                const parts = n._key.split("-");
                const localKey = parts.length > 1 ? parts.slice(1).join("-") : parts[0];
                return {
                    localKey,
                    type: n.type,
                    typeVersion: n.typeVersion,
                    sheet: n.sheet,
                    size: n.size,
                    posX: n.posX,
                    posY: n.posY,
                    process: n.process,
                    handles: n.handles,
                    data: n.data,
                };
            });

            const edges = rawEdges.map((e: any) => {
                const parts = e._key.split("-");
                const localKey = parts.length > 1 ? parts.slice(1).join("-") : parts[0];
                return {
                    localKey,
                    sheet: e.sheet,
                    source: e.source,
                    sourceHandle: e.sourceHandle,
                    target: e.target,
                    targetHandle: e.targetHandle,
                    label: e.label,
                };
            });

            return {
                graph: {
                    name: graph.name,
                    category: graph.category,
                    description: graph.description,
                    permission: graph.permission,
                    version: graph.version,
                    sheetsList: graph.sheetsList,
                    metadata: graph.metadata,
                },
                nodes,
                edges,
            };
        }

        // ── Import: shared graph+nodes+edges insertion ──────────────

        async function importGraphCore(
            payload: any,
            workspace: string,
        ): Promise<{ graphKey: string; keyMap: Record<string, string> }> {
            if (!validateGraphPayload(payload)) {
                throw new Error("Invalid graph payload structure");
            }
            if (payload.nodes.length > 10_000) throw new Error("Too many nodes (max 10 000)");
            if (payload.edges.length > 50_000) throw new Error("Too many edges (max 50 000)");

            const graphKey = await createUniqueToken(graph_collection);
            const now = Date.now();

            // oldLocalKey → newLocalKey
            const keyMap: Record<string, string> = {};
            for (const n of payload.nodes) {
                keyMap[n.localKey] = generateLocalKey();
            }

            // Insert graph document
            await graph_collection.save({
                _key: graphKey,
                name: escapeHTML(payload.graph.name),
                category: escapeHTML(payload.graph.category || "default"),
                description: payload.graph.description ? escapeHTML(payload.graph.description) : undefined,
                permission: payload.graph.permission ?? 0,
                version: payload.graph.version ?? 0,
                workspace: escapeHTML(workspace),
                sheetsList: payload.graph.sheetsList || { "0": "main" },
                metadata: payload.graph.metadata,
                createdTime: now,
                lastUpdatedTime: now,
            });

            // Insert nodes
            for (const n of payload.nodes) {
                const newLocal = keyMap[n.localKey];
                await node_collection.save({
                    _key: `${graphKey}-${newLocal}`,
                    graphKey,
                    type: n.type,
                    typeVersion: n.typeVersion ?? 0,
                    sheet: n.sheet,
                    size: n.size,
                    posX: n.posX,
                    posY: n.posY,
                    process: n.process,
                    handles: n.handles,
                    data: n.data,
                });
            }

            // Insert edges
            for (const e of payload.edges) {
                const newEdgeKey = generateLocalKey();
                const newSource = keyMap[e.source];
                const newTarget = keyMap[e.target];
                if (!newSource || !newTarget) continue; // skip orphan edges

                await edge_collection.save({
                    _key: `${graphKey}-${newEdgeKey}`,
                    graphKey,
                    sheet: e.sheet,
                    source: newSource,
                    sourceHandle: e.sourceHandle,
                    target: newTarget,
                    targetHandle: e.targetHandle,
                    label: e.label,
                    _from: `nodius_nodes/${graphKey}-${newSource}`,
                    _to: `nodius_nodes/${graphKey}-${newTarget}`,
                });
            }

            return { graphKey, keyMap };
        }

        // ── Import handlers ─────────────────────────────────────────

        async function handleImportGraph(payload: any, workspace: string, res: Response) {
            try {
                const { graphKey } = await importGraphCore(payload, workspace);
                return res.status(200).json({ success: true, graphKey });
            } catch (err: any) {
                return res.status(400).json({ error: err.message });
            }
        }

        async function handleImportHtmlGraph(payload: any, workspace: string, res: Response) {
            try {
                if (!validateHtmlGraphPayload(payload)) {
                    return res.status(400).json({ error: "Invalid htmlgraph payload structure" });
                }

                // Import graph + nodes + edges
                const { graphKey, keyMap } = await importGraphCore(payload, workspace);

                const htmlKey = await createUniqueToken(class_collection);
                const now = Date.now();

                // The root node's new composite key becomes htmlNodeKey
                const htmlNodeKey = keyMap["root"]
                    ? `${graphKey}-${keyMap["root"]}`
                    : "";

                // Link graph → htmlClass
                await graph_collection.update(graphKey, { htmlKeyLinked: htmlKey });

                // Insert HtmlClass document
                await class_collection.save({
                    _key: htmlKey,
                    htmlNodeKey,
                    graphKeyLinked: graphKey,
                    name: escapeHTML(payload.htmlClass.name),
                    category: escapeHTML(payload.htmlClass.category || "default"),
                    permission: payload.htmlClass.permission ?? 0,
                    version: payload.htmlClass.version ?? 0,
                    description: payload.htmlClass.description
                        ? escapeHTML(payload.htmlClass.description)
                        : undefined,
                    workspace: escapeHTML(workspace),
                    object: payload.htmlClass.object,
                    createdTime: now,
                    lastUpdatedTime: now,
                });

                return res.status(200).json({ success: true, graphKey, htmlKey, keyMap });
            } catch (err: any) {
                return res.status(400).json({ error: err.message });
            }
        }

        async function handleImportNodeConfig(payload: any, workspace: string, res: Response) {
            try {
                if (!validateNodeConfigPayload(payload)) {
                    return res.status(400).json({ error: "Invalid nodeconfig payload structure" });
                }

                const newKey = await createUniqueToken(nodeConfig_collection);
                const now = Date.now();

                // Uniqueness check on displayName within workspace
                let displayName = escapeHTML(payload.displayName);
                const cursor = await db.query(aql`
                    FOR doc IN nodius_node_config
                    FILTER doc.workspace == ${escapeHTML(workspace)}
                       AND doc.displayName == ${displayName}
                    LIMIT 1
                    RETURN doc
                `);
                if ((await cursor.all()).length > 0) {
                    displayName = `${displayName} (imported)`;
                }

                // node.type MUST match the new _key
                const node = { ...payload.node, type: newKey };

                await nodeConfig_collection.save({
                    _key: newKey,
                    workspace: escapeHTML(workspace),
                    displayName,
                    description: payload.description ? escapeHTML(payload.description) : "",
                    category: escapeHTML(payload.category || "default"),
                    version: payload.version ?? 0,
                    content: payload.content,
                    node,
                    border: payload.border,
                    alwaysRendered: payload.alwaysRendered ?? false,
                    icon: payload.icon,
                    createdTime: now,
                    lastUpdatedTime: now,
                });

                return res.status(200).json({ success: true, _key: newKey, displayName });
            } catch (err: any) {
                return res.status(400).json({ error: err.message });
            }
        }
    };
}
