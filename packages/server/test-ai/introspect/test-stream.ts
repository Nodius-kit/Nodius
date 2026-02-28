/**
 * Interactive introspection script for AI WebSocket streaming.
 *
 * Usage:
 *   npx tsx test-ai/introspect/test-stream.ts --graph=<graphKey> --message="Describe this graph"
 *
 * Options:
 *   --graph   Graph key to query (required)
 *   --message Message to send (default: "Decris ce graph")
 *   --host    Server host (default: localhost)
 *   --port    Server port (default: 8426)
 */

import WebSocket from "ws";

// ─── Parse CLI args ─────────────────────────────────────────────────

function parseArgs(): { graph: string; message: string; host: string; port: number } {
    const args: Record<string, string> = {};
    for (const arg of process.argv.slice(2)) {
        const match = arg.match(/^--(\w+)=(.+)$/);
        if (match) args[match[1]] = match[2];
    }

    if (!args.graph) {
        console.error("Usage: npx tsx test-ai/introspect/test-stream.ts --graph=<graphKey> [--message=\"...\"]");
        process.exit(1);
    }

    return {
        graph: args.graph,
        message: args.message ?? "Decris ce graph",
        host: args.host ?? "localhost",
        port: parseInt(args.port ?? "8426", 10),
    };
}

const config = parseArgs();

// ─── WebSocket connection ───────────────────────────────────────────

const url = `wss://${config.host}:${config.port}/ws`;
console.log(`Connecting to ${url}...`);

const ws = new WebSocket(url, { rejectUnauthorized: false });
const requestId = Date.now();

ws.on("open", () => {
    console.log("Connected. Sending ai:chat message...\n");

    const payload = {
        type: "ai:chat",
        _id: requestId,
        graphKey: config.graph,
        message: config.message,
    };

    ws.send(JSON.stringify(payload));
    console.log(`> ${config.message}\n`);
});

ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());

    switch (msg.type) {
        case "ai:token":
            process.stdout.write(msg.token);
            break;
        case "ai:tool_start":
            console.log(`\n[TOOL START] ${msg.toolName} (${msg.toolCallId})`);
            break;
        case "ai:tool_result":
            console.log(`[TOOL RESULT] ${msg.toolCallId}: ${msg.result.slice(0, 200)}...`);
            break;
        case "ai:complete":
            console.log(`\n\n[COMPLETE] threadId=${msg.threadId}`);
            ws.close();
            break;
        case "ai:error":
            console.error(`\n[ERROR] ${msg.error}`);
            ws.close();
            break;
        default:
            // Other WS messages (pong, etc.)
            break;
    }
});

ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
    process.exit(1);
});

ws.on("close", () => {
    console.log("\nConnection closed.");
    process.exit(0);
});
