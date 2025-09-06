import {cors, HttpServer, logger, NextFunction, rateLimit, Response, Request} from "./http/HttpServer";
import { spawn } from "child_process";
import {parseArgs} from "./utils/env";
import {requestHtmlBuild} from "./request/requestHtmlBuild";
import {Database} from "arangojs";

const args =  parseArgs();


export const db = new Database({
    url:  args.get("arangodb", "http://localhost:8529"),
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
requestHtmlBuild.init(app);
