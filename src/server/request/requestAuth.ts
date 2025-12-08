/**
 * @file requestAuth.ts
 * @description REST API endpoints for authentication
 * @module server/request
 *
 * Provides authentication endpoints for login, logout, token refresh, and user info.
 * These endpoints are NOT protected by the auth middleware (they're under /api/auth/*).
 *
 * Endpoints:
 * - POST /api/auth/login: Authenticate user and receive JWT token
 * - POST /api/auth/logout: Logout user (invalidate token if supported)
 * - POST /api/auth/refresh: Refresh an expired or soon-to-expire token
 * - GET /api/auth/me: Get current user information from token
 *
 * Features:
 * - **Public Endpoints**: Not protected by auth middleware
 * - **JWT-based Auth**: Stateless token authentication
 * - **User Info**: Returns user details after authentication
 * - **Token Refresh**: Extends token validity without re-authentication
 *
 * Request/Response formats:
 * - Login: POST { username: string, password: string } → { success: boolean, token?: string, user?: UserInfo }
 * - Logout: POST with Authorization header → { success: boolean }
 * - Refresh: POST with Authorization header → { success: boolean, token?: string, user?: UserInfo }
 * - Me: GET with Authorization header → { success: boolean, user?: UserInfo }
 */

import { HttpServer, Request, Response } from "../http/HttpServer";
import { AuthManager } from "../auth/AuthManager";

export class RequestAuth {
    public static init = async (app: HttpServer) => {
        const authManager = AuthManager.getInstance();

        // POST /api/auth/login - Authenticate user
        app.post("/api/auth/login", authManager.loginHandler());

        // POST /api/auth/logout - Logout user
        app.post("/api/auth/logout", authManager.logoutHandler());

        // POST /api/auth/refresh - Refresh token
        app.post("/api/auth/refresh", authManager.refreshHandler());

        // GET /api/auth/me - Get current user info
        app.get("/api/auth/me", authManager.meHandler());

        console.log('✅ Auth endpoints registered: /api/auth/login, /api/auth/logout, /api/auth/refresh, /api/auth/me');
    };
}
