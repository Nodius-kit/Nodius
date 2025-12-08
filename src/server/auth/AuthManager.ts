/**
 * @file AuthManager.ts
 * @description Centralized authentication manager with pluggable provider support
 * @module server/auth
 *
 * This module provides a singleton AuthManager that:
 * - Manages the current authentication provider (default or custom)
 * - Provides middleware for protecting API routes
 * - Handles provider initialization and injection
 *
 * Key features:
 * - **Singleton Pattern**: Single source of truth for authentication
 * - **Pluggable Providers**: Easy replacement with custom auth providers
 * - **Automatic Detection**: Detects and uses custom provider if injected
 * - **Middleware Integration**: Express-like middleware for route protection
 * - **Login Endpoint**: Built-in /api/auth/login endpoint
 *
 * Usage:
 * ```typescript
 * // Using default provider
 * const authManager = AuthManager.getInstance();
 * await authManager.initialize(db);
 * app.use(authManager.authMiddleware());
 *
 * // Using custom provider
 * const customProvider = new MyCustomAuthProvider();
 * const authManager = AuthManager.getInstance();
 * authManager.setProvider(customProvider);
 * app.use(authManager.authMiddleware());
 * ```
 */

import { AuthProvider } from "./AuthProvider";
import { Database } from "arangojs";
import { Middleware, Request, Response, NextFunction } from "../http/HttpServer";

export class AuthManager {
    private static instance: AuthManager;
    private provider: AuthProvider | null = null;
    private initialized: boolean = false;

    private constructor() {}

    /**
     * Get singleton instance of AuthManager
     */
    static getInstance(): AuthManager {
        if (!AuthManager.instance) {
            AuthManager.instance = new AuthManager();
        }
        return AuthManager.instance;
    }

    /**
     * Initialize with default provider
     * @param db - ArangoDB database instance
     * @param jwtSecret - Optional JWT secret (auto-generated if not provided)
     */
    async initialize(db: Database, jwtSecret?: string): Promise<void> {
        if (this.initialized) {
            console.warn('AuthManager already initialized');
            return;
        }

        if (!this.provider) {
            // Use default provider if none set - dynamic import to avoid circular dependency
            const { DefaultAuthProvider } = await import('./DefaultAuthProvider.js');
            const defaultProvider = new DefaultAuthProvider({
                db,
                jwtSecret: jwtSecret,
                jwtExpiresIn: '24h'
            });
            await defaultProvider.initialize();
            this.provider = defaultProvider;
        }

        this.initialized = true;
        console.log('✅ AuthManager initialized with provider:', this.provider.constructor.name);
    }

    /**
     * Set a custom authentication provider
     * This should be called before initialize() to replace the default provider
     * @param provider - Custom AuthProvider implementation
     */
    setProvider(provider: AuthProvider): void {
        if (this.initialized) {
            console.warn('⚠️  WARNING: Replacing provider after initialization may cause issues');
        }
        this.provider = provider;
        console.log('✅ Custom auth provider set:', provider.constructor.name);
    }

    /**
     * Get the current authentication provider
     */
    getProvider(): AuthProvider {
        if (!this.provider) {
            throw new Error('AuthManager not initialized. Call initialize() first.');
        }
        return this.provider;
    }

    /**
     * Check if AuthManager is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Authentication middleware for protecting API routes
     * Automatically protects all routes starting with /api/
     * Excludes /api/auth/* routes (login, etc.)
     *
     * @returns Express-like middleware function
     */
    authMiddleware(): Middleware {
        return async (req: Request, res: Response, next: NextFunction) => {
            const pathname = new URL(req.url || '', `http://${req.headers.host}`).pathname;

            // Only protect /api/* routes (except /api/auth/*)
            if (!pathname.startsWith('/api/')) {
                next();
                return;
            }

            // Allow /api/auth/* routes (login, register, etc.)
            if (pathname.startsWith('/api/auth/')) {
                next();
                return;
            }

            // Check for Authorization header
            const authHeader = req.headers.authorization;

            if (!authHeader) {
                res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Missing Authorization header',
                    loginUrl: this.getProvider().getLoginPageUrl()
                });
                return;
            }

            // Extract token (format: "Bearer <token>")
            const token = authHeader.startsWith('Bearer ')
                ? authHeader.substring(7)
                : authHeader;

            // Validate token
            const validation = await this.getProvider().validateToken(token);

            if (!validation.valid) {
                res.status(401).json({
                    error: 'Unauthorized',
                    message: validation.error || 'Invalid token',
                    loginUrl: this.getProvider().getLoginPageUrl()
                });
                return;
            }

            // Attach user info to request for downstream handlers
            (req as any).user = validation.user;

            next();
        };
    }

    /**
     * Create login endpoint handler
     * POST /api/auth/login with body: { username, password }
     */
    loginHandler() {
        return async (req: Request, res: Response) => {
            const { username, password } = req.body || {};

            if (!username || !password) {
                res.status(400).json({
                    success: false,
                    error: 'Username and password required'
                });
                return;
            }

            const result = await this.getProvider().login(username, password);

            if (result.success) {
                res.status(200).json({
                    success: true,
                    token: result.token,
                    user: result.user
                });
            } else {
                res.status(401).json({
                    success: false,
                    error: result.error || 'Authentication failed'
                });
            }
        };
    }

    /**
     * Create logout endpoint handler
     * POST /api/auth/logout with Authorization header
     */
    logoutHandler() {
        return async (req: Request, res: Response) => {
            const authHeader = req.headers.authorization;
            const token = authHeader?.startsWith('Bearer ')
                ? authHeader.substring(7)
                : authHeader;

            if (token && this.getProvider().logout) {
                await this.getProvider().logout!(token);
            }

            res.status(200).json({
                success: true,
                message: 'Logged out successfully'
            });
        };
    }

    /**
     * Create token refresh endpoint handler
     * POST /api/auth/refresh with Authorization header
     */
    refreshHandler() {
        return async (req: Request, res: Response) => {
            const authHeader = req.headers.authorization;
            const token = authHeader?.startsWith('Bearer ')
                ? authHeader.substring(7)
                : authHeader;

            if (!token) {
                res.status(400).json({
                    success: false,
                    error: 'Token required'
                });
                return;
            }

            if (!this.getProvider().refreshToken) {
                res.status(501).json({
                    success: false,
                    error: 'Token refresh not supported by this provider'
                });
                return;
            }

            const result = await this.getProvider().refreshToken!(token);

            if (result.success) {
                res.status(200).json({
                    success: true,
                    token: result.token,
                    user: result.user
                });
            } else {
                res.status(401).json({
                    success: false,
                    error: result.error || 'Token refresh failed'
                });
            }
        };
    }

    /**
     * Get current user info from token
     * GET /api/auth/me with Authorization header
     */
    meHandler() {
        return async (req: Request, res: Response) => {
            const authHeader = req.headers.authorization;
            const token = authHeader?.startsWith('Bearer ')
                ? authHeader.substring(7)
                : authHeader;

            if (!token) {
                res.status(401).json({
                    success: false,
                    error: 'Token required'
                });
                return;
            }

            const validation = await this.getProvider().validateToken(token);

            if (validation.valid) {
                res.status(200).json({
                    success: true,
                    user: validation.user
                });
            } else {
                res.status(401).json({
                    success: false,
                    error: validation.error || 'Invalid token'
                });
            }
        };
    }
}
