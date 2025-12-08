# Authentication System Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Default Authentication](#default-authentication)
5. [Custom Authentication Provider](#custom-authentication-provider)
6. [API Endpoints](#api-endpoints)
7. [Client-Side Integration](#client-side-integration)
8. [Security Considerations](#security-considerations)
9. [Troubleshooting](#troubleshooting)

---

## Overview

Nodius includes a complete, modular authentication system that:

- **Protects all `/api/*` routes** with JWT token authentication
- **Provides a default implementation** using ArangoDB and bcrypt
- **Is completely replaceable** when imported into other projects
- **Handles token management** automatically via fetch middleware
- **Includes a default login page** (also replaceable)

---

## Architecture

### Three-Layer Design

1. **AuthProvider Interface** (`src/server/auth/AuthProvider.ts`)
   - Abstract interface that all auth providers must implement
   - Defines required methods: `login()`, `validateToken()`, `getLoginPageUrl()`
   - Optional methods: `refreshToken()`, `logout()`, `handleLoginPage()`

2. **Default Implementation** (`src/server/auth/DefaultAuthProvider.ts`)
   - Uses ArangoDB collection `nodius_users`
   - Passwords hashed with bcrypt (10 rounds)
   - JWT tokens with configurable expiration (default: 24 hours)

3. **AuthManager** (`src/server/auth/AuthManager.ts`)
   - Singleton that manages the current auth provider
   - Provides middleware for route protection
   - Handles authentication endpoints

### Request Flow

```
Client Request
    ↓
fetchMiddleware (adds Authorization header with token)
    ↓
HTTP Server
    ↓
authMiddleware (validates token)
    ↓
Route Handler
```

---

## Quick Start

### 1. Start ArangoDB

```bash
cd arrango && docker compose up -d
```

### 2. Create an Admin User

```bash
npm run auth:create-admin username=admin password=mySecurePassword email=admin@example.com
```

Or with custom database connection:

```bash
npm run auth:create-admin username=admin password=mySecurePassword arangodb=http://localhost:8529 arangodb_name=nodius
```

### 3. Start the Server

```bash
npm run dev
```

### 4. Login

Navigate to `http://localhost:8426/` and login with the credentials you created.

---

## Default Authentication

### Database Schema

Collection: `nodius_users`

```typescript
{
    _key: string;           // Unique user ID
    username: string;       // Unique username
    password: string;       // bcrypt hash
    email?: string;         // Optional email
    roles: string[];        // User roles (e.g., ['admin', 'user'])
    createdAt: number;      // Timestamp
    lastLogin?: number;     // Last login timestamp
}
```

### JWT Token Payload

```typescript
{
    username: string;
    userId: string;
    roles: string[];
    iat: number;           // Issued at
    exp: number;           // Expiration
}
```

### Default Configuration

- **JWT Secret**: Auto-generated (or set via `jwt_secret` argument)
- **Token Expiration**: 24 hours
- **Password Hash Rounds**: 10 (bcrypt)
- **Login Page URL**: `/login`

---

## Custom Authentication Provider

### Step 1: Create Your Custom Provider

```typescript
// myCustomAuth.ts
import { AuthProvider, AuthResult, TokenValidationResult } from './server/auth/AuthProvider';

export class MyCustomAuthProvider extends AuthProvider {
    async login(username: string, password: string): Promise<AuthResult> {
        // Your authentication logic (OAuth, LDAP, etc.)
        // ...
        return {
            success: true,
            token: 'your-jwt-token',
            user: { username, roles: ['user'] }
        };
    }

    async validateToken(token: string): Promise<TokenValidationResult> {
        // Your token validation logic
        // ...
        return {
            valid: true,
            user: { username: 'user', roles: ['user'] }
        };
    }

    getLoginPageUrl(): string {
        return '/my-custom-login';
    }
}
```

### Step 2: Inject Your Provider

In `server.ts`, before calling `authManager.initialize()`:

```typescript
import { AuthManager } from './auth/AuthManager';
import { MyCustomAuthProvider } from './myCustomAuth';

const customProvider = new MyCustomAuthProvider();
const authManager = AuthManager.getInstance();
authManager.setProvider(customProvider);
await authManager.initialize(db);  // Will use your custom provider
```

### Step 3: Replace the Login Page (Optional)

Create your own login component/page and update your provider's `getLoginPageUrl()` to point to it.

---

## API Endpoints

### Authentication Endpoints (Not Protected)

#### POST `/api/auth/login`

Authenticate user and receive JWT token.

**Request:**
```json
{
    "username": "admin",
    "password": "mySecurePassword"
}
```

**Response:**
```json
{
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
        "username": "admin",
        "email": "admin@example.com",
        "roles": ["admin", "user"]
    }
}
```

#### POST `/api/auth/logout`

Logout user (JWT is stateless, so this is mainly for client-side cleanup).

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "message": "Logged out successfully"
}
```

#### POST `/api/auth/refresh`

Refresh an expired or soon-to-expire token.

**Headers:**
```
Authorization: Bearer <old-token>
```

**Response:**
```json
{
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { ... }
}
```

#### GET `/api/auth/me`

Get current user information from token.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "user": {
        "username": "admin",
        "email": "admin@example.com",
        "roles": ["admin", "user"]
    }
}
```

### Protected Endpoints

All other `/api/*` routes require a valid JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

**Protected Routes:**
- `/api/graph/*` - Workflow/graph management
- `/api/category/*` - Category management
- `/api/builder/*` - Builder components
- `/api/nodeconfig/*` - Node configuration
- `/api/type/*` - Data type management
- `/api/enum/*` - Enum management
- `/api/sync` - WebSocket synchronization

**401 Response (Unauthorized):**
```json
{
    "error": "Unauthorized",
    "message": "Missing Authorization header",
    "loginUrl": "/login"
}
```

---

## Client-Side Integration

### Automatic Token Management

The `fetchMiddleware` automatically:
1. Adds the `Authorization: Bearer <token>` header to all API requests
2. Redirects to `/login` on 401 responses
3. Stores token in `localStorage` as `authToken`

### Login Flow

1. User enters credentials on login page
2. Login page calls `POST /api/auth/login`
3. On success, token is stored in `localStorage`
4. User is redirected to home page
5. `AuthWrapper` validates token on mount
6. If valid, main app is rendered

### Logout Flow

```typescript
// Clear token from localStorage
localStorage.removeItem('authToken');

// Redirect to login
window.location.href = '/login';
```

### Custom Login Page

To replace the default login page:

1. Create your custom login component
2. Update your `AuthProvider.getLoginPageUrl()` to return your page's URL
3. Optionally implement `AuthProvider.handleLoginPage()` for server-side rendering

---

## Security Considerations

### Production Deployment

1. **Set a Strong JWT Secret:**
   ```bash
   tsx ./src/server/server.ts jwt_secret=your-very-strong-secret-key-here
   ```

2. **Use HTTPS:**
   ```bash
   tsx ./src/server/server.ts https=true
   ```

3. **Configure Token Expiration:**
   In `DefaultAuthProvider`:
   ```typescript
   new DefaultAuthProvider({
       db,
       jwtSecret: process.env.JWT_SECRET,
       jwtExpiresIn: '1h'  // Shorter expiration for production
   })
   ```

4. **Implement Token Blacklist (Optional):**
   Extend `DefaultAuthProvider.logout()` to maintain a blacklist of invalidated tokens.

5. **Rate Limiting:**
   Already configured in `server.ts`:
   ```typescript
   app.use(rateLimit({ windowMs: 60000, max: 100 }));
   ```

### Password Requirements

The default implementation doesn't enforce password complexity. To add validation:

```typescript
// In DefaultAuthProvider.createUser()
if (password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' };
}
// Add more validation as needed
```

### Token Storage

**Current:** localStorage (vulnerable to XSS)

**Alternatives:**
- **httpOnly cookies** (more secure, but requires CSRF protection)
- **sessionStorage** (cleared on tab close)
- **Memory only** (lost on page refresh)

---

## Troubleshooting

### "User already exists"

When creating an admin user, if you get this error:

```bash
# Delete existing user from database, or create with different username
npm run auth:create-admin username=newadmin password=myPassword
```

### "Unauthorized" on Every Request

**Possible causes:**
1. Token expired - refresh or re-login
2. JWT secret changed - re-login to get new token
3. Token not stored correctly - check browser localStorage

**Fix:**
```javascript
// In browser console
localStorage.removeItem('authToken');
// Then login again
```

### "Failed to initialize database"

Ensure ArangoDB is running:

```bash
cd arrango && docker compose up -d
docker logs arangodb  # Check logs
```

### Login Page Doesn't Appear

**Check:**
1. `AuthWrapper` is properly wrapping the app in `main.tsx`
2. No token in localStorage (clear it if needed)
3. Browser console for errors

### 401 Redirect Loop

If you're stuck in a redirect loop:

```javascript
// Clear localStorage
localStorage.clear();
// Manually navigate to login
window.location.href = '/login';
```

---

## Advanced Configuration

### Custom JWT Expiration

In `server.ts`:

```typescript
await authManager.initialize(db, 'your-secret', {
    jwtExpiresIn: '7d'  // 7 days
});
```

### Disable Authentication (Development Only)

**Not recommended**, but if you need to disable auth temporarily:

In `server.ts`, comment out:
```typescript
// app.use(authManager.authMiddleware());
```

### Multiple User Roles

The default provider supports roles. To add role-based access control:

```typescript
// In your route handler
app.post("/api/admin/only", async (req: Request, res: Response) => {
    const user = (req as any).user;  // Attached by authMiddleware

    if (!user.roles.includes('admin')) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }

    // Admin-only logic here
});
```

---

## Summary

- ✅ All `/api/*` routes are protected by JWT authentication
- ✅ Default implementation uses ArangoDB + bcrypt + JWT
- ✅ Completely replaceable with custom auth providers
- ✅ Automatic token management via fetch middleware
- ✅ CLI tool for creating admin users
- ✅ Default login page (replaceable)
- ✅ Secure by default with production-ready configuration options

For questions or issues, see the main [README](./README.md) or open an issue on GitHub.
