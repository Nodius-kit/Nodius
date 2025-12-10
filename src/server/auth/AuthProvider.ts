/**
 * @file AuthProvider.ts
 * @description Abstract authentication provider interface for pluggable authentication
 * @module server/auth
 *
 * This module defines the contract that all authentication providers must implement.
 * It allows the authentication system to be completely replaceable when the library
 * is imported into other projects.
 *
 * Key features:
 * - **Abstract Interface**: Defines required methods for all auth providers
 * - **Pluggable Architecture**: Allows custom implementations to replace default
 * - **Token-based Auth**: Uses JWT or similar token mechanisms
 * - **Login Page Control**: Providers can specify their own login page URL
 *
 * Required Methods:
 * - login: Authenticate user and return a token
 * - validateToken: Verify token validity and return user info
 * - getLoginPageUrl: Return the URL/path for the login page
 * - refreshToken: Optional method to refresh an expired token
 *
 * Use Cases:
 * - Default ArangoDB authentication with username/password
 * - OAuth integration (Google, GitHub, etc.)
 * - LDAP/Active Directory authentication
 * - Custom SSO integration
 * - API key authentication
 */

import { Request, Response } from "../http/HttpServer";

/**
 * Authentication result returned by login method
 */
export interface AuthResult {
    success: boolean;
    token?: string;
    error?: string;
    user?: UserInfo;
}

/**
 * User information returned after successful authentication
 */
export interface UserInfo {
    userId?: string;
    username: string;
    email?: string;
    roles?: string[];
    [key: string]: any; // Allow custom fields
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
    valid: boolean;
    user?: UserInfo;
    error?: string;
}

/**
 * Abstract authentication provider interface
 * All authentication providers must implement this interface
 */
export abstract class AuthProvider {
    /**
     * Authenticate a user with credentials
     * @param username - User's username or email
     * @param password - User's password
     * @returns Authentication result with token if successful
     */
    abstract login(username: string, password: string): Promise<AuthResult>;

    /**
     * Validate a token and return user information
     * @param token - JWT or auth token to validate
     * @returns Validation result with user info if valid
     */
    abstract validateToken(token: string): Promise<TokenValidationResult>;

    /**
     * Get the URL/path for the login page
     * This allows providers to specify custom login pages
     * @returns URL or path to the login page (e.g., '/login', '/auth/signin')
     */
    abstract getLoginPageUrl(): string;

    /**
     * Refresh an expired or soon-to-expire token
     * Optional method - not all providers need to implement this
     * @param token - Current token to refresh
     * @returns New token if successful
     */
    async refreshToken?(token: string): Promise<AuthResult>;

    /**
     * Handle logout (optional)
     * Some providers may need to invalidate tokens on logout
     * @param token - Token to invalidate
     */
    async logout?(token: string): Promise<void>;

    /**
     * Optional: Render or handle the login page
     * For providers that want to control the login page rendering
     * @param req - HTTP request
     * @param res - HTTP response
     */
    async handleLoginPage?(req: Request, res: Response): Promise<void>;
}
