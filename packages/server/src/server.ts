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
import {RequestExportImport} from "./request/requestExportImport";
import {AuthManager} from "./auth/AuthManager";
import {readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadOrGenerateCert } from './utils/generateCert';
import { getLocalIP } from './utils/getLocalIP';

// Global exports for module access
export let db: Database;
export let peerHost: string;
export let peerPort: number;
export let useHttps: boolean;
export let clusterManagerPort: number;
export let webSocketPort: number;
export let clusterManager: ClusterManager;
export let webSocketManager: WebSocketManager;

/**
 * Server configuration options
 */
export interface StartServerOptions {
    /** Server port (default: 8426) */
    port?: number;
    /** Server host (default: auto-detected local IP) */
    host?: string;
    /** Enable HTTPS (default: false) */
    https?: boolean;
    /** Path to SSL certificate file */
    certPath?: string;
    /** Path to SSL key file */
    keyPath?: string;
    /** ArangoDB URL (default: http://127.0.0.1:8529) */
    arangodbUrl?: string;
    /** ArangoDB username (default: root) */
    arangodbUser?: string;
    /** ArangoDB password (default: azerty) */
    arangodbPass?: string;
    /** ArangoDB database name (default: nodius) */
    arangodbName?: string;
    /** JWT secret for authentication */
    jwtSecret?: string;
}

/**
 * Server instance returned by startServer
 */
export interface ServerInstance {
    app: HttpServer;
    db: Database;
    clusterManager: ClusterManager;
    webSocketManager: WebSocketManager;
    shutdown: () => Promise<void>;
}

/**
 * Start the Nodius server with the given options
 * @param options - Server configuration options
 * @returns Server instance with app, db, and shutdown function
 */
export async function startServer(options: StartServerOptions = {}): Promise<ServerInstance> {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Auto-detect local IP if not specified
    const detectedIP = getLocalIP();
    const host = options.host ?? detectedIP;
    const port = options.port ?? 8426;

    console.log(`🌐 Using host: ${host}${options.host ? ' (from options)' : ' (auto-detected)'}`);

    // HTTPS configuration
    const enableHttps = options.https ?? false;
    const certPath = options.certPath ?? '';
    const keyPath = options.keyPath ?? '';

    // Load or generate SSL certificates if HTTPS is enabled
    let httpsConfig: { key: string; cert: string } | undefined;
    if (enableHttps) {
        if (certPath && keyPath) {
            // Use provided certificate files
            if (!existsSync(certPath) || !existsSync(keyPath)) {
                throw new Error(`Certificate files not found: cert=${certPath}, key=${keyPath}`);
            }
            httpsConfig = {
                key: readFileSync(keyPath, 'utf-8'),
                cert: readFileSync(certPath, 'utf-8')
            };
            console.log(`Using provided SSL certificate from ${certPath}`);
        } else {
            // Generate self-signed certificate
            console.log(`Generating self-signed SSL certificate...`);
            httpsConfig = await loadOrGenerateCert({
                commonName: host,
                outputDir: [join(__dirname, '..', 'certs'), join(__dirname, '..', '..', 'client', 'certs')],
                altIPs: host !== 'localhost' && host !== '127.0.0.1' ? [host] : []
            });
        }
    }

    // Database configuration
    const dbUrl = options.arangodbUrl ?? "http://127.0.0.1:8529";
    const dbUser = options.arangodbUser ?? "root";
    const dbPass = options.arangodbPass ?? "azerty";
    const dbName = options.arangodbName ?? "nodius";

    // Initialize database (create if doesn't exist)
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

    // Create database connection
    const database = new Database({
        url: dbUrl,
        auth: { username: dbUser, password: dbPass },
        databaseName: dbName
    });

    // Set global exports
    db = database;
    peerHost = host;
    peerPort = port;
    useHttps = enableHttps;
    clusterManagerPort = port + 1000;
    webSocketPort = port + 2000;

    // Create HTTP server
    const app = new HttpServer();
    app.use(logger());
    app.use(cors());
    app.use(rateLimit({ windowMs: 60000, max: 100 }));

    // Initialize authentication system
    const authManager = AuthManager.getInstance();
    await authManager.initialize(database, options.jwtSecret);

    // Add authentication middleware (protects /api/* routes except /api/auth/*)
    app.use(authManager.authMiddleware());

    // Error handling middleware
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        console.error('Error:', err.message);
        console.trace(err);
        res.status(500).json({ error: err.message });
    });

    // Initialize routes
    RequestAuth.init(app);  // Auth routes must be registered first (not protected)
    RequestWorkFlow.init(app);
    RequestCategory.init(app);
    RequestBuilder.init(app);
    RequestDataType.init(app);
    RequestSync.init(app);
    RequestNodeConfig.init(app);
    RequestHistory.init(app);
    RequestImage.init(app);
    RequestExportImport.init(app);

    // Start server with proper options
    const serverOptions: { port: number; host: string; https?: { key: string; cert: string } } = {
        port,
        host,
    };

    if (httpsConfig) {
        serverOptions.https = httpsConfig;
    }

    // Initialize cluster manager
    const cluster = new ClusterManager(clusterManagerPort, host);
    clusterManager = cluster;

    // Start the server
    await app.listen(serverOptions);
    console.log(`Server is ready! (${enableHttps ? 'HTTPS' : 'HTTP'})`);

    // Create WebSocketManager
    let wsManager: WebSocketManager;
    if (enableHttps) {
        const server = app.getServer();
        if (server) {
            wsManager = new WebSocketManager({
                server: server,
                path: '/ws'
            });
            console.log(`WebSocket server attached to HTTPS server at wss://${host}:${port}/ws`);
        } else {
            throw new Error('HTTPS server not available after listen()');
        }
    } else {
        wsManager = new WebSocketManager(webSocketPort, host);
    }
    webSocketManager = wsManager;

    // Initialize cluster
    cluster.initialize();

    cluster.on("broadcast", (payload: any, sender: string) => {
        console.log("received broadcast from sender", sender, "with payload", payload);
    });

    cluster.on("directMessage", (payload: any, sender: string) => {
        console.log("received message from sender", sender, "with payload", payload);
    });

    // Shutdown function
    const shutdown = async () => {
        console.log('Shutting down server...');
        await cluster.shutdown();
        wsManager.closeServer();
    };

    // Return server instance
    return {
        app,
        db: database,
        clusterManager: cluster,
        webSocketManager: wsManager,
        shutdown
    };
}

// CLI execution: run server if this file is executed directly
const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('server.ts') ||
    process.argv[1]?.endsWith('server.js');

if (isMainModule) {
    const args = parseArgs();

    const options: StartServerOptions = {
        port: args.get('port') ? parseInt(args.get('port')!) : undefined,
        host: args.get('host') || undefined,
        https: args.get('https') === 'true',
        certPath: args.get('cert') || undefined,
        keyPath: args.get('key') || undefined,
        arangodbUrl: args.get('arangodb') || undefined,
        arangodbUser: args.get('arangodb_user') || undefined,
        arangodbPass: args.get('arangodb_pass') || undefined,
        arangodbName: args.get('arangodb_name') || undefined,
        jwtSecret: args.get('jwt_secret') || undefined,
    };

    startServer(options).then((server) => {
        // Setup signal handlers for CLI mode
        process.on('SIGINT', async () => {
            console.log('Caught SIGINT, shutting down...');
            await server.shutdown();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.log('Caught SIGTERM, shutting down...');
            await server.shutdown();
            process.exit(0);
        });

        process.on('beforeExit', async () => {
            console.log('Process beforeExit, cleaning up...');
            await server.shutdown();
        });
    }).catch((error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}
