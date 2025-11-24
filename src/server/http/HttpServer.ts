/**
 * @file HttpServer.ts
 * @description Lightweight HTTP server with Express-like middleware support
 * @module server/http
 *
 * Custom HTTP server implementation with middleware and routing:
 * - HttpServer: Main server class with route management
 * - Middleware: CORS, logging, rate limiting, static file serving
 * - Routing: Path matching with parameter extraction
 * - File upload: Multipart form data parsing
 * - JSON/text body parsing
 *
 * Key features:
 * - Express-like API (use, get, post, put, delete, etc.)
 * - Built-in middleware (cors, logger, rateLimit, staticFiles)
 * - Parameter extraction from routes (/api/:id)
 * - Query string parsing
 * - File uploads with size limits
 * - Error handling middleware
 * - HTTPS support
 */

import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import { parse } from 'querystring';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);

// Type definitions
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface Request extends http.IncomingMessage {
    body?: any;
    params?: Record<string, string>;
    query?: Record<string, any>;
    files?: UploadedFile[];
}

export interface Response extends http.ServerResponse {
    json: (data: any) => void;
    send: (data: string | Buffer) => void;
    sendFile: (filePath: string) => Promise<void>;
    status: (code: number) => Response;
    redirect: (url: string) => void;
}

interface UploadedFile {
    fieldname: string;
    filename: string;
    data: Buffer;
    mimetype: string;
    size: number;
}

export type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;
export type RouteHandler = (req: Request, res: Response) => void | Promise<void>;
export type NextFunction = (error?: Error) => void;
export type ErrorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => void;

interface Route {
    method: HttpMethod;
    path: string;
    handler: RouteHandler;
    middlewares: Middleware[];
}

interface ServerOptions {
    port?: number;
    host?: string;
    https?: {
        key: string;
        cert: string;
    };
}

// MIME types for common file extensions
const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
};

/**
 * Main HTTP Server class with Express-like API
 */
export class HttpServer {
    private routes: Route[] = [];
    private middlewares: Middleware[] = [];
    private errorHandlers: ErrorHandler[] = [];
    private publicDir: string | null = null;
    private server: http.Server | https.Server | null = null;

    constructor() {}

    /**
     * Get the underlying HTTP/HTTPS server instance
     * Useful for attaching WebSocket servers
     */
    getServer(): http.Server | https.Server | null {
        return this.server;
    }

    /**
     * Add global middleware
     */
    use(middleware: Middleware | ErrorHandler): void {
        if (middleware.length === 4) {
            // Error handler has 4 parameters
            this.errorHandlers.push(middleware as ErrorHandler);
        } else {
            this.middlewares.push(middleware as Middleware);
        }
    }

    /**
     * Register GET route
     */
    get(path: string, ...handlers: Array<Middleware | RouteHandler>): void {
        this.addRoute('GET', path, handlers);
    }

    /**
     * Register POST route
     */
    post(path: string, ...handlers: Array<Middleware | RouteHandler>): void {
        this.addRoute('POST', path, handlers);
    }

    /**
     * Register PUT route
     */
    put(path: string, ...handlers: Array<Middleware | RouteHandler>): void {
        this.addRoute('PUT', path, handlers);
    }

    /**
     * Register DELETE route
     */
    delete(path: string, ...handlers: Array<Middleware | RouteHandler>): void {
        this.addRoute('DELETE', path, handlers);
    }

    /**
     * Register PATCH route
     */
    patch(path: string, ...handlers: Array<Middleware | RouteHandler>): void {
        this.addRoute('PATCH', path, handlers);
    }

    /**
     * Set public directory for static files
     */
    static(directory: string): void {
        this.publicDir = path.resolve(directory);
    }

    /**
     * Add route to the routing table
     */
    private addRoute(method: HttpMethod, path: string, handlers: Array<Middleware | RouteHandler>): void {
        const middlewares = handlers.slice(0, -1) as Middleware[];
        const handler = handlers[handlers.length - 1] as RouteHandler;

        this.routes.push({
            method,
            path,
            handler,
            middlewares
        });
    }

    /**
     * Parse route parameters from URL
     */
    private matchRoute(method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
        for (const route of this.routes) {
            if (route.method !== method) continue;

            const routeParts = route.path.split('/');
            const pathParts = pathname.split('/');

            if (routeParts.length !== pathParts.length) continue;

            const params: Record<string, string> = {};
            let match = true;

            for (let i = 0; i < routeParts.length; i++) {
                if (routeParts[i].startsWith(':')) {
                    // Parameter
                    params[routeParts[i].slice(1)] = pathParts[i];
                } else if (routeParts[i] !== pathParts[i]) {
                    match = false;
                    break;
                }
            }

            if (match) {
                return { route, params };
            }
        }

        return null;
    }

    /**
     * Parse multipart form data (simplified version)
     */
    private async parseMultipartData(req: Request, boundary: string): Promise<{ fields: Record<string, any>; files: UploadedFile[] }> {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        const parts = buffer.toString('binary').split(`--${boundary}`);

        const fields: Record<string, any> = {};
        const files: UploadedFile[] = [];

        for (const part of parts) {
            if (part.includes('Content-Disposition')) {
                const headerEnd = part.indexOf('\r\n\r\n');
                if (headerEnd === -1) continue;

                const header = part.substring(0, headerEnd);
                const content = part.substring(headerEnd + 4, part.lastIndexOf('\r\n'));

                const nameMatch = header.match(/name="([^"]+)"/);
                const filenameMatch = header.match(/filename="([^"]+)"/);

                if (nameMatch) {
                    const fieldName = nameMatch[1];

                    if (filenameMatch) {
                        // File upload
                        const filename = filenameMatch[1];
                        const mimeMatch = header.match(/Content-Type: ([^\r\n]+)/);
                        const mimetype = mimeMatch ? mimeMatch[1] : 'application/octet-stream';

                        files.push({
                            fieldname: fieldName,
                            filename,
                            data: Buffer.from(content, 'binary'),
                            mimetype,
                            size: content.length
                        });
                    } else {
                        // Regular field
                        fields[fieldName] = content;
                    }
                }
            }
        }

        return { fields, files };
    }

    /**
     * Parse request body based on content type
     */
    private async parseBody(req: Request): Promise<void> {
        const contentType = req.headers['content-type'] || '';

        if (contentType.includes('application/json')) {
            // Parse JSON body
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
                chunks.push(chunk);
            }
            const body = Buffer.concat(chunks).toString();
            try {
                req.body = JSON.parse(body);
            } catch (error) {
                req.body = {};
            }
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
            // Parse URL-encoded form data
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
                chunks.push(chunk);
            }
            const body = Buffer.concat(chunks).toString();
            req.body = parse(body);
        } else if (contentType.includes('multipart/form-data')) {
            // Parse multipart form data
            const boundaryMatch = contentType.match(/boundary=([^;]+)/);
            if (boundaryMatch) {
                const boundary = boundaryMatch[1];
                const { fields, files } = await this.parseMultipartData(req, boundary);
                req.body = fields;
                req.files = files;
            }
        } else {
            // Raw body
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
                chunks.push(chunk);
            }
            req.body = Buffer.concat(chunks);
        }
    }

    /**
     * Enhance response object with helper methods
     */
    private enhanceResponse(res: Response): void {
        // JSON response helper
        res.json = function(data: any): void {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
        };

        // Send response helper
        res.send = function(data: string | Buffer): void {
            if (typeof data === 'string') {
                res.setHeader('Content-Type', 'text/html');
            }
            res.end(data);
        };

        // Send file helper
        res.sendFile = async function(filePath: string): Promise<void> {
            try {
                const content = await readFile(filePath);
                const ext = path.extname(filePath);
                const mimeType = mimeTypes[ext] || 'application/octet-stream';
                res.setHeader('Content-Type', mimeType);
                res.end(content);
            } catch (error) {
                res.statusCode = 404;
                res.end('File not found');
            }
        };

        // Status code helper
        res.status = function(code: number): Response {
            res.statusCode = code;
            return res;
        };

        // Redirect helper
        res.redirect = function(url: string): void {
            res.statusCode = 302;
            res.setHeader('Location', url);
            res.end();
        };
    }

    /**
     * Serve static files with directory traversal protection
     */
    private async serveStatic(req: Request, res: Response, pathname: string): Promise<boolean> {
        if (!this.publicDir) return false;
        // Remove query string
        pathname = pathname.split('?')[0];

        // Decode URL
        pathname = decodeURIComponent(pathname);

        // Security: Prevent directory traversal
        const normalizedPath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
        const filePath = path.join(this.publicDir, normalizedPath);

        // Ensure the file path is within the public directory
        console.log(filePath);
        if (!filePath.startsWith(this.publicDir)) {
            return false;
        }

        try {
            const stats = await stat(filePath);

            if (stats.isDirectory()) {
                // Try to serve index.html from directory
                const indexPath = path.join(filePath, 'index.html');
                try {
                    await stat(indexPath);
                    const content = await readFile(indexPath);
                    res.setHeader('Content-Type', 'text/html');
                    res.end(content);
                    return true;
                } catch {
                    return false;
                }
            } else {
                // Serve file
                const content = await readFile(filePath);
                const ext = path.extname(filePath);
                const mimeType = mimeTypes[ext] || 'application/octet-stream';

                // Set cache headers for static assets
                if (['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', 'webp'].includes(ext)) {
                    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
                }

                res.setHeader('Content-Type', mimeType);
                res.end(content);
                return true;
            }
        } catch (error) {
            return false;
        }
    }

    /**
     * Execute middleware chain
     */
    private async executeMiddlewares(middlewares: Middleware[], req: Request, res: Response): Promise<boolean> {
        for (const middleware of middlewares) {
            let nextCalled = false;
            let errorOccurred: Error | undefined;

            const next = (error?: Error) => {
                nextCalled = true;
                errorOccurred = error;
            };

            try {
                await middleware(req, res, next);
            } catch (error) {
                errorOccurred = error as Error;
            }

            if (errorOccurred) {
                // Handle error
                await this.handleError(errorOccurred, req, res);
                return false;
            }

            if (!nextCalled || res.headersSent) {
                return false;
            }
        }

        return true;
    }

    /**
     * Handle errors with error middleware
     */
    private async handleError(error: Error, req: Request, res: Response): Promise<void> {
        for (const handler of this.errorHandlers) {
            let nextCalled = false;
            const next = () => { nextCalled = true; };

            try {
                await handler(error, req, res, next);
                if (!nextCalled) return;
            } catch (err) {
                console.error('Error in error handler:', err);
            }
        }

        // Default error response
        if (!res.headersSent) {
            res.statusCode = 500;
            res.json({ error: 'Internal Server Error' });
        }
    }

    /**
     * Main request handler
     */
    private async handleRequest(req: Request, res: Response): Promise<void> {
        this.enhanceResponse(res);

        // Parse URL
        const parsedUrl = url.parse(req.url || '', true);
        const pathname = parsedUrl.pathname || '/';
        req.query = parsedUrl.query;

        // CORS headers (you can customize these)
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        // Handle OPTIONS requests
        if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
        }

        try {
            // Execute global middlewares
            const continueProcessing = await this.executeMiddlewares(this.middlewares, req, res);
            if (!continueProcessing) return;

            // Try to match a route
            const routeMatch = this.matchRoute(req.method || 'GET', pathname);

            if (routeMatch) {
                req.params = routeMatch.params;

                // Parse body for POST/PUT/PATCH requests
                if (['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
                    await this.parseBody(req);
                }

                // Execute route-specific middlewares
                const continueToHandler = await this.executeMiddlewares(routeMatch.route.middlewares, req, res);
                if (!continueToHandler) return;

                // Execute route handler
                await routeMatch.route.handler(req, res);
            } else {
                // Try to serve static file
                const served = await this.serveStatic(req, res, pathname);
                if (!served) {
                    res.statusCode = 404;
                    res.json({ error: 'Not Found' });
                }
            }
        } catch (error) {
            await this.handleError(error as Error, req, res);
        }
    }

    /**
     * Start the server
     */
    listen(options: ServerOptions | number = 3000): Promise<void> {
        return new Promise((resolve) => {
            const config: ServerOptions = typeof options === 'number'
                ? { port: options }
                : options;

            const port = config.port || 3000;
            const host = config.host || 'localhost';

            if (config.https) {
                // HTTPS server
                this.server = https.createServer({
                    key: config.https.key,
                    cert: config.https.cert
                }, (req, res) => this.handleRequest(req as Request, res as Response));
            } else {
                // HTTP server
                this.server = http.createServer((req, res) =>
                    this.handleRequest(req as Request, res as Response)
                );
            }

            this.server.listen(port, host, () => {
                console.log(`Server running at ${config.https ? 'https' : 'http'}://${host}:${port}/`);
                resolve();
            });
        });
    }

    /**
     * Stop the server
     */
    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.server) {
                this.server.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

// Middleware utilities

/**
 * JSON body parser middleware
 */
export const jsonParser = (): Middleware => {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (req.headers['content-type']?.includes('application/json')) {
            const chunks: Buffer[] = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const body = Buffer.concat(chunks).toString();
                try {
                    req.body = JSON.parse(body);
                } catch (error) {
                    req.body = {};
                }
                next();
            });
        } else {
            next();
        }
    };
};

/**
 * URL-encoded body parser middleware
 */
export const urlEncodedParser = (): Middleware => {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
            const chunks: Buffer[] = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const body = Buffer.concat(chunks).toString();
                req.body = parse(body);
                next();
            });
        } else {
            next();
        }
    };
};

/**
 * Logger middleware
 */
export const logger = (): Middleware => {
    return (req: Request, res: Response, next: NextFunction) => {
        const start = Date.now();
        const { method, url } = req;

        res.on('finish', () => {
            const duration = Date.now() - start;
            console.log(`${method} ${url} ${res.statusCode} - ${duration}ms`);
        });

        next();
    };
};

/**
 * Rate limiting middleware
 */
export const rateLimit = (options: { windowMs: number; max: number }): Middleware => {
    const requests = new Map<string, { count: number; resetTime: number }>();

    return (req: Request, res: Response, next: NextFunction) => {
        const ip = req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const windowMs = options.windowMs;
        const max = options.max;

        const requestData = requests.get(ip);

        if (!requestData || now > requestData.resetTime) {
            requests.set(ip, { count: 1, resetTime: now + windowMs });
            next();
        } else if (requestData.count < max) {
            requestData.count++;
            next();
        } else {
            res.status(429).json({ error: 'Too many requests' });
        }
    };
};

/**
 * CORS middleware
 */
export const cors = (options?: { origin?: string; methods?: string[]; headers?: string[] }): Middleware => {
    return (req: Request, res: Response, next: NextFunction) => {
        const origin = options?.origin || '*';
        const methods = options?.methods?.join(', ') || 'GET, POST, PUT, DELETE, OPTIONS';
        const headers = options?.headers?.join(', ') || 'Content-Type, Authorization';

        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', methods);
        res.setHeader('Access-Control-Allow-Headers', headers);

        if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
        } else {
            next();
        }
    };
};
/*
// Example usage
if (require.main === module) {
    const app = new HttpServer();

    // Use global middleware
    app.use(logger());
    app.use(cors());
    app.use(rateLimit({ windowMs: 60000, max: 100 })); // 100 requests per minute

    // Serve static files from 'public' directory
    app.static('./public');

    // Routes
    app.get('/', (req, res) => {
        res.send('<h1>Welcome to the HTTP Server!</h1>');
    });

    app.get('/api/users', (req, res) => {
        res.json([
            { id: 1, name: 'John Doe' },
            { id: 2, name: 'Jane Smith' }
        ]);
    });

    app.get('/api/users/:id', (req, res) => {
        const userId = req.params?.id;
        res.json({ id: userId, name: `User ${userId}` });
    });

    app.post('/api/users', async (req, res) => {
        console.log('Body:', req.body);
        res.status(201).json({ message: 'User created', data: req.body });
    });

    app.post('/api/upload', async (req, res) => {
        if (req.files && req.files.length > 0) {
            const file = req.files[0];
            console.log('Uploaded file:', file.filename, 'Size:', file.size);
            res.json({
                message: 'File uploaded successfully',
                filename: file.filename,
                size: file.size
            });
        } else {
            res.status(400).json({ error: 'No file uploaded' });
        }
    });

    // Error handling middleware
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        console.error('Error:', err.message);
        res.status(500).json({ error: err.message });
    });

    // Start server
    app.listen(3000).then(() => {
        console.log('Server is ready!');
    });
}*/