import {cors, HttpServer, logger, NextFunction, rateLimit, Response, Request} from "./http/HttpServer";
import { spawn } from "child_process";
import {parseArgs} from "./utils/env";
import {Database} from "arangojs";
import {ClusterManager, ClusterNode} from "./cluster/clusterManager";
import {WebSocketManager} from "./cluster/webSocketManager";
import {RequestWorkFlow} from "./request/requestWorkFlow";
import {RequestBuilder} from "./request/requestBuilder";
import {RequestDataType} from "./request/requestDataType";

const args =  parseArgs();


export const db = new Database({
    url:  args.get("arangodb", "http://127.0.0.1:8529"),
    auth: {
        username: args.get("arangodb_user", "root"),
        password: args.get("arangodb_pass", "azerty"),
    },
    databaseName: args.get("arangodb_name", "nodius")
});

const app = new HttpServer();
app.use(logger());
app.use(cors());
app.use(rateLimit({ windowMs: 60000, max: 100 }));

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Error:', err.message);
    console.trace(err);
    res.status(500).json({ error: err.message });
});

// Start server
app.listen(parseInt(args.get("port", "8426"))).then(() => {
    console.log('Server is ready!');
});

if(args.get("mode", "production") == "development") {
    const proc = spawn("npx", ["vite"], { stdio: "pipe", shell: true });
    proc.stdout.on("data", (data) => {
        process.stdout.write(data);
    });

    proc.stderr.on("data", (data) => {
        process.stderr.write(data);
    });
}
RequestWorkFlow.init(app);
RequestBuilder.init(app);
RequestDataType.init(app);

export const clusterManager = new ClusterManager(parseInt(args.get("port", "8426")) + 1000);
export const webSocketManager = new WebSocketManager(parseInt(args.get("port", "8426")) + 2000);
// Initialize
clusterManager.initialize();


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