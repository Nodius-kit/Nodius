# Nodius

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- Docker and Docker Compose (for ArangoDB)

### 1. Setup ArangoDB Database

Nodius uses ArangoDB as its database. Follow these steps to set up the database:

#### Start ArangoDB with Docker

```bash
# Navigate to the arrango directory
cd arrango

# Start ArangoDB container
docker compose up --build -d

# Check if the container is running
docker ps
```

The ArangoDB server will be available at `http://localhost:8529`.

**Default credentials:**
- Username: `root`
- Password: `azerty`

#### Access ArangoDB Web Panel (Optional)

1. Open your browser and navigate to `http://localhost:8529`
2. Log in with the default credentials (root/azerty)
3. You'll see the ArangoDB web interface

**Note:** The database "nodius" will be created automatically when you run the import script or start the application, so you don't need to create it manually.

### 2. Import Initial Data (Optional)

If you have a backup file, you can import data into your database:

```bash
# Make sure you're in the project root directory
npm run db:import

# Or with custom options
npm run db:import -- input=./backup/your-backup.json
```

The import script will automatically:
- Create the database if it doesn't exist
- Create collections if they don't exist
- Insert new documents
- Update existing documents
- Preserve documents not in the backup file

For more details, see the [Import/Export Scripts Documentation](./scripts/README.md).

### 3. Install Dependencies and Start the Application

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

## 🔐 Authentication

Nodius includes a complete, modular authentication system that protects all API routes.

### Quick Start: Create an Admin User

Before you can use the application, you need to create at least one admin user:

```bash
# Create an admin user with username and password
npm run auth:create-admin username=admin password=mySecurePassword

# Optionally include an email
npm run auth:create-admin username=admin password=mySecurePassword email=admin@example.com
```

Once created, you can login at `http://localhost:8426/` with your credentials.

### Default Authentication System

By default, Nodius uses:
- **ArangoDB** for user storage (collection: `nodius_users`)
- **bcrypt** for password hashing
- **JWT tokens** for stateless authentication (24-hour expiration)
- **Automatic route protection** for all `/api/*` endpoints

**Protected Routes:** All `/api/*` routes require a valid JWT token in the `Authorization` header.

**Public Routes:** `/api/auth/*` endpoints (login, logout, refresh, me) are not protected.

### Custom Authentication Provider

Nodius's authentication system is **completely replaceable**. You can integrate your own authentication method (OAuth, LDAP, SSO, etc.) by creating a custom `AuthProvider`.

#### Step 1: Create Your Custom Provider

Create a new file (e.g., `src/server/auth/MyCustomAuthProvider.ts`):

```typescript
import { AuthProvider, AuthResult, TokenValidationResult } from './AuthProvider';

export class MyCustomAuthProvider extends AuthProvider {
    async login(username: string, password: string): Promise<AuthResult> {
        // Your custom authentication logic
        // Example: OAuth, LDAP, external API, etc.

        return {
            success: true,
            token: 'your-jwt-or-session-token',
            user: {
                username: username,
                email: 'user@example.com',
                roles: ['user']
            }
        };
    }

    async validateToken(token: string): Promise<TokenValidationResult> {
        // Your custom token validation logic

        return {
            valid: true,
            user: {
                username: 'user',
                roles: ['user']
            }
        };
    }

    getLoginPageUrl(): string {
        // Return your custom login page URL
        return '/my-custom-login';
    }

    // Optional: implement refreshToken(), logout(), handleLoginPage()
}
```

#### Step 2: Inject Your Provider

In `src/server/server.ts`, **before** calling `authManager.initialize()`:

```typescript
import { AuthManager } from './auth/AuthManager';
import { MyCustomAuthProvider } from './auth/MyCustomAuthProvider';

// Create your custom provider
const customProvider = new MyCustomAuthProvider();

// Inject it into the AuthManager
const authManager = AuthManager.getInstance();
authManager.setProvider(customProvider);

// Initialize (will use your custom provider)
await authManager.initialize(args.get("jwt_secret"));
```

#### Step 3: Replace the Login Page (Optional)

If you want to use a custom login UI:

1. Create your login component in `src/client/pages/MyCustomLogin.tsx`
2. Update your provider's `getLoginPageUrl()` to return your page's route
3. Optionally implement `handleLoginPage()` for server-side rendering

### Learn More

For complete authentication documentation, including:
- API endpoints
- Security best practices
- Advanced configuration
- Troubleshooting

See **[AUTH.md](./AUTH.md)**.

## 📦 Database Backup and Restore

### Export Database

```bash
# Export all data to a JSON file
npm run db:export

# Export to a custom location
npm run db:export -- output=./backup/my-backup.json
```

### Import Database

```bash
# Import from default location
npm run db:import

# Import from custom location
npm run db:import -- input=./backup/my-backup.json
```

For detailed documentation on import/export scripts, see [scripts/README.md](./scripts/README.md).

## 🛠️ Development

### ArangoDB Management

```bash
# Stop ArangoDB
cd arrango && docker-compose down

# Restart ArangoDB
cd arrango && docker-compose restart

# View ArangoDB logs
docker logs arangodb

# Remove ArangoDB container and data (⚠️ destroys all data)
cd arrango && docker-compose down -v
```

### Database Connection Configuration

The default database configuration is:
- URL: `http://127.0.0.1:8529`
- Database: `nodius`
- Username: `root`
- Password: `azerty`

You can override these settings in your application configuration or when running import/export scripts.