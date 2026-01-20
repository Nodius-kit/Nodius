/**
 * @file server.ts
 * @description Main server entry point with HTTP, WebSocket, and cluster setup
 * @module server
 *
 * Initializes and configures the complete server stack:
 * - HTTP server: Express-like API with middleware
 * - ArangoDB: Database connection and configuration
 * - WebSocket: Real-time collaboration server
 * - ClusterManager: Distributed node coordination
 * - Request handlers: Workflow, category, builder, data type, sync, node config
 *
 * Key features:
 * - Command line argument parsing for configuration
 * - CORS and rate limiting middleware
 * - Error handling middleware
 * - Development mode with Vite integration
 * - Cluster communication via ZeroMQ
 * - Global database instance export
 */

import {cors, HttpServer, logger, NextFunction, rateLimit, Response, Request} from "./http/HttpServer";
import {parseArgs} from "./utils/env";
import {Database} from "arangojs";
import {ClusterManager} from "./cluster/clusterManager";
import {WebSocketManager} from "./cluster/webSocketManager";
import {RequestWorkFlow} from "./request/requestWorkFlow";
import {RequestCategory} from "./request/requestCategory";
import {RequestBuilder} from "./request/requestBuilder";
import {RequestDataType} from "./request/requestDataType";
import {RequestSync} from "./request/requestSync";
import {RequestNodeConfig} from "./request/requestNodeConfig";
import {RequestAuth} from "./request/requestAuth";
import {RequestHistory} from "./request/requestHistory";
import {RequestImage} from "./request/requestImage";
import {AuthManager} from "./auth/AuthManager";
import {readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadOrGenerateCert } from './utils/generateCert';
import { getLocalIP } from './utils/getLocalIP';

const args =  parseArgs();

// Auto-generate .env file for Vite
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Auto-detect local IP if not specified via CLI args
const detectedIP = getLocalIP();
const host = args.get('host', detectedIP);
const port = parseInt(args.get('port', '8426'));

console.log(`🌐 Using host: ${host}${args.get('host') ? ' (from CLI)' : ' (auto-detected)'}`);


// HTTPS configuration
const useHttps = args.get('https', 'false') === 'true';
const certPath = args.get('cert', '');
const keyPath = args.get('key', '');

// Load or generate SSL certificates if HTTPS is enabled
let httpsConfig: { key: string; cert: string } | undefined;
if (useHttps) {
    if (certPath && keyPath) {
        // Use provided certificate files
        if (!existsSync(certPath) || !existsSync(keyPath)) {
            console.error(`Certificate files not found: cert=${certPath}, key=${keyPath}`);
            process.exit(1);
        }
        httpsConfig = {
            key: readFileSync(keyPath, 'utf-8'),
            cert: readFileSync(certPath, 'utf-8')
        };
        console.log(`Using provided SSL certificate from ${certPath}`);
    } else {
        // Generate self-signed certificate (async)
        // Include auto-detected IP in certificate SANs for network access
        console.log(`Generating self-signed SSL certificate...`);
        httpsConfig = await loadOrGenerateCert({
            commonName: host,
            outputDir: [join(__dirname, '..', 'certs'), join(__dirname, '..', '..', 'client', 'certs')],
            altIPs: host !== 'localhost' && host !== '127.0.0.1' ? [host] : []
        });
    }
}



// Database configuration
const dbUrl = args.get("arangodb", "http://127.0.0.1:8529");
const dbUser = args.get("arangodb_user", "root");
const dbPass = args.get("arangodb_pass", "azerty");
const dbName = args.get("arangodb_name", "nodius");

// Initialize database (create if doesn't exist)
async function initializeDatabase() {
    // First connect to _system database to check/create target database
    const systemDb = new Database({
        url: dbUrl,
        auth: { username: dbUser, password: dbPass },
        databaseName: '_system'
    });

    try {
        const databases = await systemDb.listDatabases();

        if (!databases.includes(dbName)) {
            console.log(`📝 Database "${dbName}" does not exist, creating...`);
            await systemDb.createDatabase(dbName);
            console.log(`✅ Database "${dbName}" created successfully`);
        } else {
            console.log(`✅ Database "${dbName}" exists`);
        }
    } catch (error) {
        console.error(`❌ Failed to initialize database: ${error}`);
        throw error;
    }
}

// Initialize database before creating connection
await initializeDatabase();

export const db = new Database({
    url: dbUrl,
    auth: { username: dbUser, password: dbPass },
    databaseName: dbName
});

const app = new HttpServer();
app.use(logger());
app.use(cors());
app.use(rateLimit({ windowMs: 60000, max: 100 }));

// Initialize authentication system
const authManager = AuthManager.getInstance();
await authManager.initialize(db, args.get("jwt_secret"));

// Add authentication middleware (protects /api/* routes except /api/auth/*)
app.use(authManager.authMiddleware());

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Error:', err.message);
    console.trace(err);
    res.status(500).json({ error: err.message });
});

// Export configuration early (needed by other modules)
export const peerHost = host;
export const peerPort = port;
export { useHttps };
export const clusterManagerPort = peerPort + 1000;
export const webSocketPort = peerPort + 2000;

// Initialize routes before starting server
RequestAuth.init(app);  // Auth routes must be registered first (not protected)
RequestWorkFlow.init(app);
RequestCategory.init(app);
RequestBuilder.init(app);
RequestDataType.init(app);
RequestSync.init(app);
RequestNodeConfig.init(app);
RequestHistory.init(app);
RequestImage.init(app);

// Start server with proper options
const serverOptions: { port: number; host: string; https?: { key: string; cert: string } } = {
    port,
    host,
};

if (httpsConfig) {
    serverOptions.https = httpsConfig;
}

// Initialize cluster manager
export const clusterManager = new ClusterManager(clusterManagerPort, peerHost);

// WebSocketManager will be initialized after server starts
export let webSocketManager: WebSocketManager;

// Start the server and then initialize WebSocket
await app.listen(serverOptions);
console.log(`Server is ready! (${useHttps ? 'HTTPS' : 'HTTP'})`);

// Now create WebSocketManager - server is guaranteed to be running
if (useHttps) {
    // Get the underlying HTTPS server and attach WebSocket to it
    const server = app.getServer();
    if (server) {
        webSocketManager = new WebSocketManager({
            server: server,
            path: '/ws'
        });
        console.log(`WebSocket server attached to HTTPS server at wss://${peerHost}:${peerPort}/ws`);
    } else {
        // This should not happen now
        console.error('HTTPS server not available after listen(), this is a bug');
        process.exit(1);
    }
} else {
    // HTTP mode: standalone WebSocket server on separate port
    webSocketManager = new WebSocketManager(webSocketPort, peerHost);
}

// Initialize cluster
clusterManager.initialize();


clusterManager.on("broadcast", (payload:any, sender:string) => {
    console.log("received broadcast from sender", sender, "with payload", payload);
});

clusterManager.on("directMessage", (payload:any, sender:string) => {
    console.log("received message from sender", sender, "with payload", payload);
});

process.on('SIGINT', async () => {
    console.log('Caught SIGINT, shutting down...');
    await clusterManager.shutdown();
    webSocketManager.closeServer();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Caught SIGTERM, shutting down...');
    await clusterManager.shutdown();
    webSocketManager.closeServer();
    process.exit(0);
});

process.on('beforeExit', async () => {
    console.log('Process beforeExit, cleaning up...');
    await clusterManager.shutdown();
    webSocketManager.closeServer();
});