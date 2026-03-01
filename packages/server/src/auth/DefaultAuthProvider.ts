/**
 * @file DefaultAuthProvider.ts
 * @description Default authentication provider using ArangoDB and JWT
 * @module server/auth
 *
 * Default implementation of the AuthProvider interface that uses:
 * - ArangoDB collection 'nodius_users' for storing user credentials
 * - bcrypt for password hashing
 * - JWT (JSON Web Tokens) for authentication tokens
 *
 * Key features:
 * - **Secure Password Storage**: Passwords are hashed with bcrypt (10 rounds)
 * - **JWT Tokens**: Stateless authentication with configurable expiration
 * - **User Management**: Create, authenticate, and validate users
 * - **Default Login Page**: Built-in login page at /login
 *
 * Database Schema (nodius_users collection):
 * - _key: Unique user identifier
 * - username: Unique username
 * - password: bcrypt hashed password
 * - email: Optional email address
 * - roles: Array of user roles (e.g., ['admin', 'user'])
 * - createdAt: Timestamp of user creation
 * - lastLogin: Timestamp of last successful login
 *
 * JWT Payload:
 * - username: User's username
 * - userId: User's _key
 * - roles: User's roles
 * - iat: Issued at timestamp
 * - exp: Expiration timestamp
 *
 * Security Considerations:
 * - Passwords are never stored in plain text
 * - Tokens expire after configured duration (default: 72 hours)
 * - JWT secret is auto-generated and persisted in .jwt_secret file (git-ignored)
 * - JWT secret should be strong and kept secure
 * - Rate limiting should be applied to login endpoint
 */

import { AuthProvider, AuthResult, TokenValidationResult, UserInfo } from "./AuthProvider";
import { Database } from "arangojs";
import { DocumentCollection } from "arangojs/collections";
import * as bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type {StringValue} from "ms";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

/**
 * User document structure in ArangoDB
 */
interface UserDocument {
    _key: string;
    username: string;
    password: string; // bcrypt hash
    email?: string;
    roles: string[];
    workspaces: string[];
    token?: string; // stored JWT for server-side revocation
    createdAt: number;
    lastLogin?: number;
}

/**
 * JWT token payload
 */
interface JWTPayload {
    username: string;
    userId: string;
    roles: string[];
    workspaces: string[];
    iat?: number;
    exp?: number;
}

/**
 * Configuration for DefaultAuthProvider
 */
export interface DefaultAuthProviderConfig {
    db: Database;
    jwtSecret?: string;
    jwtExpiresIn?: number | StringValue; // e.g., '24h', '7d', 86400
    loginPageUrl?: string;
    saltRounds?: number;
}

export class DefaultAuthProvider extends AuthProvider {
    private db: Database;
    private userCollection!: DocumentCollection;
    private jwtSecret: string;
    private jwtExpiresIn: number | StringValue;
    private loginPageUrl: string;
    private saltRounds: number;

    constructor(config: DefaultAuthProviderConfig) {
        super();
        this.db = config.db;
        this.jwtSecret = config.jwtSecret || this.generateDefaultSecret();
        this.jwtExpiresIn = config.jwtExpiresIn || '72h';
        this.loginPageUrl = config.loginPageUrl || '/login';
        this.saltRounds = config.saltRounds || 10;
    }

    /**
     * Initialize the auth provider (ensure users collection exists)
     * Must be called before using the provider
     */
    async initialize(): Promise<void> {
        const collection = this.db.collection("nodius_users");

        const exists = await collection.exists();
        if (!exists) {
            await collection.create();
        }
        this.userCollection = collection as DocumentCollection;
    }

    /**
     * Generate or retrieve JWT secret from file
     * - Checks if .jwt_secret file exists
     * - If exists, reads and returns the stored secret
     * - If not, generates a new secure secret, saves it to the file, and returns it
     * - File is git-ignored for security
     */
    private generateDefaultSecret(): string {
        const secretFilePath = path.join(process.cwd(), '.jwt_secret');

        try {
            // Check if secret file exists
            if (fs.existsSync(secretFilePath)) {
                // Read existing secret
                const secret = fs.readFileSync(secretFilePath, 'utf-8').trim();

                if (secret && secret.length > 0) {
                    console.log('✅ Loaded JWT secret from .jwt_secret file');
                    return secret;
                }
            }

            // Generate new cryptographically secure secret (64 bytes = 128 hex chars)
            const newSecret = crypto.randomBytes(64).toString('hex');

            // Save to file
            fs.writeFileSync(secretFilePath, newSecret, 'utf-8');
            console.log('✅ Generated new JWT secret and saved to .jwt_secret file');
            console.log('⚠️  IMPORTANT: Keep this file secure and never commit it to version control');

            return newSecret;
        } catch (error) {
            console.error('❌ Failed to read/write JWT secret file:', error);
            console.warn('⚠️  Falling back to random secret (will change on restart)');
            return 'nodius-fallback-secret-' + crypto.randomBytes(32).toString('hex');
        }
    }

    /**
     * Create a new user (for CLI and admin creation)
     * @param username - Username
     * @param password - Plain text password (will be hashed)
     * @param options - Additional user options (email, roles)
     */
    async createUser(
        username: string,
        password: string,
        options?: { email?: string; roles?: string[] }
    ): Promise<{ success: boolean; error?: string; userId?: string }> {
        try {
            // Check if user already exists
            const cursor = await this.db.query({
                query: `
                    FOR user IN nodius_users
                    FILTER user.username == @username
                    LIMIT 1
                    RETURN user
                `,
                bindVars: { username }
            });

            const existingUser = await cursor.next();
            if (existingUser) {
                return { success: false, error: 'User already exists' };
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, this.saltRounds);

            // Create user document
            const userDoc: Omit<UserDocument, '_key'> = {
                username,
                password: hashedPassword,
                email: options?.email,
                roles: options?.roles || ['user'],
                workspaces: [], // will be populated with [_key] after save
                createdAt: Date.now()
            };

            const result = await this.userCollection.save(userDoc);

            // Default workspace is the user's own key
            await this.userCollection.update(result._key, { workspaces: [result._key] });

            return { success: true, userId: result._key };
        } catch (error) {
            console.error('Error creating user:', error);
            return { success: false, error: 'Failed to create user' };
        }
    }

    /**
     * Authenticate user with username and password
     */
    async login(username: string, password: string): Promise<AuthResult> {
        try {
            // Find user by username
            const cursor = await this.db.query({
                query: `
                    FOR user IN nodius_users
                    FILTER user.username == @username
                    LIMIT 1
                    RETURN user
                `,
                bindVars: { username }
            });

            const user = await cursor.next() as UserDocument | null;

            if (!user) {
                return { success: false, error: 'Invalid username or password' };
            }

            // Verify password
            const passwordMatch = await bcrypt.compare(password, user.password);

            if (!passwordMatch) {
                return { success: false, error: 'Invalid username or password' };
            }

            // Migration: if existing user doc lacks workspaces, default to [_key]
            const workspaces = user.workspaces?.length ? user.workspaces : [user._key];

            // Generate JWT token
            const payload: JWTPayload = {
                username: user.username,
                userId: user._key,
                roles: user.roles,
                workspaces
            };

            const token = jwt.sign(payload, this.jwtSecret, {
                expiresIn: this.jwtExpiresIn
            });

            // Update last login timestamp and store token for server-side revocation
            await this.userCollection.update(user._key, {
                lastLogin: Date.now(),
                token,
                // Migrate workspaces if missing
                ...(!user.workspaces?.length ? { workspaces } : {})
            });

            const userInfo: UserInfo = {
                userId: user._key,
                username: user.username,
                email: user.email,
                roles: user.roles,
                workspaces
            };

            return {
                success: true,
                token,
                user: userInfo
            };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Authentication failed' };
        }
    }

    /**
     * Validate JWT token and return user information
     */
    async validateToken(token: string): Promise<TokenValidationResult> {
        try {
            // Verify JWT token
            const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;

            // Verify user still exists in database and token matches stored token
            const cursor = await this.db.query({
                query: `
                    FOR user IN nodius_users
                    FILTER user._key == @userId
                    LIMIT 1
                    RETURN user
                `,
                bindVars: { userId: decoded.userId }
            });

            const user = await cursor.next() as UserDocument | null;

            if (!user) {
                return { valid: false, error: 'User not found' };
            }

            // Server-side revocation: token is only valid if it matches the stored token
            if (!user.token || user.token !== token) {
                return { valid: false, error: 'Token has been revoked' };
            }

            // Migration: if existing user doc lacks workspaces, fallback to [_key]
            const workspaces = user.workspaces?.length ? user.workspaces : [user._key];

            const userInfo: UserInfo = {
                userId: user._key,
                username: user.username,
                email: user.email,
                roles: user.roles,
                workspaces
            };

            return {
                valid: true,
                user: userInfo
            };
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                return { valid: false, error: 'Token expired' };
            } else if (error instanceof jwt.JsonWebTokenError) {
                return { valid: false, error: 'Invalid token' };
            }
            console.error('Token validation error:', error);
            return { valid: false, error: 'Token validation failed' };
        }
    }

    /**
     * Get the login page URL
     */
    getLoginPageUrl(): string {
        return this.loginPageUrl;
    }

    /**
     * Refresh an expired or soon-to-expire token
     */
    async refreshToken(token: string): Promise<AuthResult> {
        try {
            // Verify token (ignore expiration)
            const decoded = jwt.verify(token, this.jwtSecret, {
                ignoreExpiration: true
            }) as JWTPayload;

            // Refuse refresh if token was issued more than 7 days ago
            if (decoded.iat) {
                const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
                const tokenAgeMs = Date.now() - decoded.iat * 1000;
                if (tokenAgeMs > maxAgeMs) {
                    return { success: false, error: 'Token too old for refresh. Please login again.' };
                }
            }

            // Verify user still exists
            const cursor = await this.db.query({
                query: `
                    FOR user IN nodius_users
                    FILTER user._key == @userId
                    LIMIT 1
                    RETURN user
                `,
                bindVars: { userId: decoded.userId }
            });

            const user = await cursor.next() as UserDocument | null;

            if (!user) {
                return { success: false, error: 'User not found' };
            }

            // Migration: if existing user doc lacks workspaces, fallback to [_key]
            const workspaces = user.workspaces?.length ? user.workspaces : [user._key];

            // Generate new token
            const payload: JWTPayload = {
                username: user.username,
                userId: user._key,
                roles: user.roles,
                workspaces
            };

            const newToken = jwt.sign(payload, this.jwtSecret, {
                expiresIn: this.jwtExpiresIn
            });

            // Store new token for server-side revocation
            await this.userCollection.update(user._key, { token: newToken });

            const userInfo: UserInfo = {
                username: user.username,
                email: user.email,
                roles: user.roles,
                workspaces
            };

            return {
                success: true,
                token: newToken,
                user: userInfo
            };
        } catch (error) {
            console.error('Token refresh error:', error);
            return { success: false, error: 'Failed to refresh token' };
        }
    }

    /**
     * Logout (optional, JWT is stateless so this is a no-op)
     * Could be extended to maintain a blacklist of invalidated tokens
     */
    async logout(token: string): Promise<void> {
        try {
            // Decode token to find user (ignore expiration for logout)
            const decoded = jwt.verify(token, this.jwtSecret, {
                ignoreExpiration: true
            }) as JWTPayload;

            // Clear stored token for server-side revocation
            await this.userCollection.update(decoded.userId, { token: null });
        } catch (error) {
            // Ignore errors during logout (token may already be invalid)
        }
    }
}
