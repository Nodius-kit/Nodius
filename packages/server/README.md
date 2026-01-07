# @nodius/server

[![npm version](https://img.shields.io/npm/v/@nodius/server)](https://www.npmjs.com/package/@nodius/server)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Backend API and WebSocket server for Nodius. This package provides the complete cloud infrastructure for executing graphical workflows with real-time multi-user support.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Main Components](#main-components)
  - [HttpServer](#httpserver)
  - [WebSocket Manager](#websocket-manager)
  - [Cluster Manager](#cluster-manager)
  - [Auth Manager](#auth-manager)
- [API Endpoints](#api-endpoints)
- [Configuration](#configuration)
- [CLI Tools](#cli-tools)
- [Development](#development)
- [Deployment](#deployment)

## Installation

### In the Monorepo

```bash
npm install
```

### As Standalone Package

```bash
npm install @nodius/server
```

### Prerequisites

- **Node.js**: Version 18+
- **ArangoDB**: Version 3.11+ (see installation in root README)
- **Operating System**: Windows, macOS, or Linux

## Quick Start

### Minimal Configuration

```bash
# Start ArangoDB (if not already running)
arangod

# From packages/server folder
npm run dev
```

The server starts on:
- **HTTP/HTTPS**: `https://localhost:8426` (default port)
- **WebSocket**: `wss://localhost:8426/ws` (same port as HTTP/HTTPS)
- **Cluster Manager**: Port `9426` (internal, for ZeroMQ)

### Custom Configuration

```bash
# With CLI arguments
npm run dev -- port=3000 host=0.0.0.0 https=true

# With custom certificates
npm run dev -- https=true cert=./path/to/cert.pem key=./path/to/key.pem

# With custom database
npm run dev -- arangodb=http://db-server:8529 arangodb_name=my_nodius_db arangodb_user=admin arangodb_pass=secret
```

### Verify Server is Running

```bash
# Check server health
curl https://localhost:8426/api/health

# Should return:
# {"status":"ok","timestamp":1234567890}
```

## Architecture

Nodius server is built on several key components:

```
┌─────────────────────────────────────────────────────┐
│                  Nodius Server                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────────┐      ┌──────────────────┐   │
│  │   HttpServer     │      │  WebSocket       │   │
│  │   (REST API)     │      │  Manager         │   │
│  │                  │      │  (Real-time)     │   │
│  └────────┬─────────┘      └─────────┬────────┘   │
│           │                          │            │
│           │                          │            │
│  ┌────────▼──────────────────────────▼────────┐   │
│  │         Request Handlers                   │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐     │   │
│  │  │Workflow│ │Category│ │Sync │ │Auth│     │   │
│  │  └──────┘ └──────┘ └──────┘ └──────┘     │   │
│  └────────────────────┬────────────────────── │   │
│                       │                           │
│  ┌────────────────────▼──────────────────────┐   │
│  │         Auth Manager                      │   │
│  │  - JWT Tokens                             │   │
│  │  - Pluggable Providers                    │   │
│  │  - bcrypt Hashing                         │   │
│  └────────────────────┬──────────────────────┘   │
│                       │                           │
│  ┌────────────────────▼──────────────────────┐   │
│  │         ArangoDB Connection               │   │
│  │  - Graph database                         │   │
│  │  - Collections: nodes, edges, workflows   │   │
│  └────────────────────┬──────────────────────┘   │
│                       │                           │
│  ┌────────────────────▼──────────────────────┐   │
│  │       Cluster Manager (ZeroMQ)            │   │
│  │  - Pub/Sub for broadcasts                 │   │
│  │  - Router/Dealer for coordination         │   │
│  └───────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Data Flow

1. **HTTP Client** → HttpServer → Request Handler → ArangoDB
2. **WebSocket Client** → WebSocket Manager → Validation → Broadcast to all clients
3. **Sync Instructions** → Validation → Application → Save (auto-save)
4. **Cluster Events** → ZeroMQ Pub/Sub → All cluster servers

## Main Components

### HttpServer

Custom HTTP server with Express-like support for routing and middlewares.

#### Features

- **Express-like API**: Routes with `get()`, `post()`, `put()`, `delete()`
- **Middlewares**: CORS, logging, rate limiting, error handling
- **Body Parsing**: Automatic JSON and text parsing
- **File Upload**: Multipart/form-data support with Sharp for images
- **Static Files**: Serve static files
- **HTTPS**: SSL support with automatic self-signed certificate generation
- **Route Parameters**: Parameter extraction (`/api/workflow/:id`)
- **Query Strings**: Automatic parsing

### WebSocket Manager

WebSocket connection manager for real-time collaboration.

#### Features

- **Real-time Synchronization**: Broadcast instructions to all connected clients
- **Sessions per Workflow**: Manage user sessions per workflow
- **Auto-Save**: Automatic save every 30 seconds with diff computation
- **Instruction Validation**: Consistency checking before application
- **Reconnection**: Automatic reconnection support
- **Broadcasting**: Selective broadcast per workflow

#### Architecture

```typescript
import { WebSocketManager } from '@nodius/server';
import { Database } from 'arangojs';

const db = new Database(/* config */);
const wsManager = new WebSocketManager(db, httpServer);
```

#### WebSocket Protocol

##### Connection Message

```json
{
  "type": "connect",
  "workflowKey": "workflow_123",
  "token": "jwt_token_here"
}
```

##### Instructions Message

```json
{
  "type": "instructions",
  "workflowKey": "workflow_123",
  "instructions": [
    {
      "o": 1,
      "p": ["nodes", "node_1", "posX"],
      "v": 100
    }
  ],
  "clientId": "client_abc",
  "timestamp": 1234567890
}
```

##### Broadcast Message (server → clients)

```json
{
  "type": "update",
  "workflowKey": "workflow_123",
  "instructions": [...],
  "sourceClientId": "client_abc"
}
```

#### Auto-Save Operation

The WebSocket Manager:
1. Receives instructions from client
2. Validates and applies instructions in memory
3. Broadcasts to other connected clients
4. **Every 30 seconds**:
   - Compares in-memory state with ArangoDB
   - Calculates diff (missing instructions)
   - Saves only changes

```typescript
// Auto-save configuration
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

// System automatically handles:
// - Change detection
// - Diff calculation
// - Batch saving
// - Error handling
```

### Cluster Manager

Distributed cluster manager using ZeroMQ for server coordination.

#### Features

- **Pub/Sub Pattern**: Event broadcasting between servers
- **Router/Dealer Pattern**: Point-to-point communication
- **Discovery**: Automatic peer discovery
- **Health Checks**: Node health monitoring
- **Message Routing**: Intelligent message routing

#### Architecture

```
Server 1 (Port 9426)          Server 2 (Port 9427)
     │                              │
     │  ┌─────────────────────┐    │
     └──┤  ZeroMQ Pub/Sub     ├────┘
        └─────────────────────┘
              │       │
              ▼       ▼
         Broadcast  Subscribe
```

#### Usage

```typescript
import { ClusterManager } from '@nodius/server';

const clusterManager = new ClusterManager({
  pubPort: 9426,
  subPort: 9427,
  routerPort: 9428,
  dealerPort: 9429
});

// Publish message
clusterManager.publish('workflow.update', {
  workflowKey: 'workflow_123',
  data: { ... }
});

// Subscribe to topic
clusterManager.subscribe('workflow.update', (message) => {
  console.log('Received update:', message);
});
```

### Auth Manager

JWT authentication system with pluggable providers.

#### Features

- **JWT Tokens**: Token generation and validation
- **bcrypt Hashing**: Secure password hashing
- **Pluggable Providers**: Customizable provider system
- **Default Provider**: Default provider with database users
- **Middleware**: Automatic route protection
- **Refresh Tokens**: Token refresh support

#### Usage

##### Initialization

```typescript
import { AuthManager } from '@nodius/server';
import { Database } from 'arangojs';

const db = new Database(/* config */);
const authManager = AuthManager.getInstance();

await authManager.initialize(db, 'your-jwt-secret');
```

##### Create Admin

```bash
# Via CLI
npm run create-admin

# Or programmatically
import { createAdmin } from '@nodius/server';
await createAdmin(db, 'admin', 'secure_password');
```

##### Protect Routes

```typescript
// All /api/* routes are automatically protected
// except /api/auth/*

app.use(authManager.authMiddleware());

// Protected route
app.get('/api/protected', (req, res) => {
  const userId = req.user?.id;  // Injected by middleware
  res.json({ userId });
});
```

##### Custom Auth Provider

```typescript
import { AuthProvider, AuthManager } from '@nodius/server';

class MyCustomAuthProvider implements AuthProvider {
  async authenticate(username: string, password: string): Promise<{ id: string; username: string } | null> {
    // Your authentication logic
    // Ex: LDAP, OAuth, etc.
    return { id: 'user_123', username };
  }

  async getUserById(id: string): Promise<{ id: string; username: string } | null> {
    // Get user by ID
    return { id, username: 'user' };
  }
}

// Use custom provider
const authManager = AuthManager.getInstance();
authManager.setProvider(new MyCustomAuthProvider());
```

## API Endpoints

### Authentication

#### POST /api/auth/login

Authenticate a user and obtain a JWT token.

**Request:**
```json
{
  "username": "admin",
  "password": "secure_password"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user_123",
    "username": "admin"
  }
}
```

#### POST /api/auth/refresh

Refresh an expired token.

**Request:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Workflows

#### GET /api/workflow

List all workflows.

**Query params:**
- `category` (optional): Filter by category
- `limit` (optional): Number of results
- `offset` (optional): Pagination

**Response:**
```json
{
  "workflows": [
    {
      "_key": "workflow_123",
      "name": "My Workflow",
      "category": "automation",
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ],
  "total": 1
}
```

#### GET /api/workflow/:key

Get a specific workflow with all its nodes and edges.

**Response:**
```json
{
  "workflow": {
    "_key": "workflow_123",
    "name": "My Workflow",
    "nodes": [...],
    "edges": [...]
  }
}
```

#### POST /api/workflow

Create a new workflow.

**Request:**
```json
{
  "name": "New Workflow",
  "category": "automation"
}
```

**Response:**
```json
{
  "workflowKey": "workflow_456"
}
```

#### PUT /api/workflow/:key

Update a workflow.

**Request:**
```json
{
  "name": "Updated Name",
  "category": "new_category"
}
```

#### DELETE /api/workflow/:key

Delete a workflow.

### Categories

#### GET /api/category

List all categories.

#### POST /api/category

Create a new category.

**Request:**
```json
{
  "name": "automation",
  "description": "Automation workflows"
}
```

### Node Configurations

#### GET /api/nodeconfig

List all node configurations.

#### POST /api/nodeconfig

Create a new node configuration.

**Request:**
```json
{
  "type": "textNode",
  "name": "Text Node",
  "process": "await next('0', incoming?.data);",
  "version": 1
}
```

### Data Types

#### GET /api/datatype

List all data types.

#### POST /api/datatype

Create a new data type.

### Images

#### POST /api/image/upload

Upload an image.

**Request:** multipart/form-data
- `file`: Image file
- `name` (optional): Image name

**Response:**
```json
{
  "imageKey": "image_123",
  "url": "/api/image/image_123"
}
```

#### GET /api/image/:key

Get an image (public endpoint, no auth required).

#### GET /api/image

List all images.

#### DELETE /api/image/:key

Delete an image.

#### PUT /api/image/:key/rename

Rename an image.

**Request:**
```json
{
  "name": "new_name.png"
}
```

### History

#### GET /api/history/:workflowKey

Get modification history for a workflow.

**Response:**
```json
{
  "history": [
    {
      "timestamp": 1234567890,
      "instructions": [...],
      "userId": "user_123"
    }
  ]
}
```

## Configuration

### Environment Variables

The server can be configured via CLI arguments or environment variables:

| CLI Argument | Env Variable | Default | Description |
|-------------|--------------|---------|-------------|
| `port` | `PORT` | `8426` | HTTP/HTTPS port |
| `host` | `HOST` | `localhost` | Server host |
| `https` | `HTTPS` | `false` | Enable HTTPS |
| `cert` | `SSL_CERT` | - | SSL certificate path |
| `key` | `SSL_KEY` | - | SSL key path |
| `arangodb` | `ARANGO_URL` | `http://127.0.0.1:8529` | ArangoDB URL |
| `arangodb_user` | `ARANGO_USER` | `root` | ArangoDB user |
| `arangodb_pass` | `ARANGO_PASS` | `azerty` | ArangoDB password |
| `arangodb_name` | `ARANGO_DB` | `nodius` | Database name |
| `jwt_secret` | `JWT_SECRET` | (generated) | Secret for JWT tokens |

### Startup Example

```bash
# Local development
node dist/server.js

# Production with HTTPS and custom DB
node dist/server.js \
  port=443 \
  host=0.0.0.0 \
  https=true \
  cert=/etc/ssl/cert.pem \
  key=/etc/ssl/key.pem \
  arangodb=https://db.example.com:8529 \
  arangodb_user=nodius \
  arangodb_pass=secure_pass \
  jwt_secret=my_super_secret_key
```

## CLI Tools

The server package includes several CLI tools for database management:

### Create Admin

Create an administrator user with secure password hashing:

```bash
# From packages/server directory
npm run create-admin

# With custom credentials
npm run create-admin username=admin password=yourSecurePassword

# With all options
npm run create-admin \
  username=admin \
  password=yourSecurePassword \
  email=admin@example.com \
  arangodb=http://127.0.0.1:8529 \
  arangodb_user=root \
  arangodb_pass=azerty \
  arangodb_name=nodius

# Or using tsx directly
npx tsx src/cli/createAdmin.ts username=admin password=yourPassword
```

**Required Arguments:**
- `username`: Admin username
- `password`: Admin password (will be hashed with bcrypt)

**Optional Arguments:**
- `email`: Admin email address
- `arangodb`: ArangoDB URL (default: `http://127.0.0.1:8529`)
- `arangodb_user`: Database username (default: `root`)
- `arangodb_pass`: Database password (default: `azerty`)
- `arangodb_name`: Database name (default: `nodius`)

**Features:**
- Secure bcrypt password hashing
- Duplicate username prevention
- Automatic admin role assignment
- User and admin roles by default

### Export Database

Export all collections and documents to a JSON backup file:

```bash
# Export with default settings (./backup/nodius-export.json)
npx tsx src/cli/export.ts

# Export to custom location
npx tsx src/cli/export.ts output=./my-backup.json

# Export with custom database connection
npx tsx src/cli/export.ts \
  arangodb=http://127.0.0.1:8529 \
  arangodb_user=root \
  arangodb_pass=azerty \
  arangodb_name=nodius \
  output=./backups/backup-$(date +%Y%m%d).json
```

**Options:**
- `arangodb`: ArangoDB URL (default: `http://127.0.0.1:8529`)
- `arangodb_user`: Database username (default: `root`)
- `arangodb_pass`: Database password (default: `azerty`)
- `arangodb_name`: Database name (default: `nodius`)
- `output`: Output file path (default: `./backup/nodius-export.json`)

**Export includes:**
- All user collections (workflows, nodes, edges, configurations, users, etc.)
- All documents with complete metadata (`_key`, `_id`, `_rev`)
- Collection types (document or edge collection)
- Export metadata (timestamp, database name, version)

### Import Database

Import data from a JSON backup file:

```bash
# Import with default settings (./backup/nodius-export.json)
npx tsx src/cli/import.ts

# Import from custom file
npx tsx src/cli/import.ts input=./my-backup.json

# Import to different database
npx tsx src/cli/import.ts \
  arangodb=http://127.0.0.1:8529 \
  arangodb_user=root \
  arangodb_pass=azerty \
  arangodb_name=nodius_staging \
  input=./backups/production-backup.json
```

**Options:**
- `arangodb`: ArangoDB URL (default: `http://127.0.0.1:8529`)
- `arangodb_user`: Database username (default: `root`)
- `arangodb_pass`: Database password (default: `azerty`)
- `arangodb_name`: Database name (default: `nodius`)
- `input`: Input file path (default: `./backup/nodius-export.json`)

**Import behavior:**
- Creates target database if it doesn't exist
- Creates collections if they don't exist (preserving type: document/edge)
- **Replaces** existing documents (matched by `_key`)
- **Inserts** new documents that don't exist
- **Does NOT delete** existing documents not in the import file
- Reports statistics: replaced, inserted, errors

**Use Cases:**

1. **Regular Backups:**
```bash
# Create daily backup
npx tsx src/cli/export.ts output=./backups/backup-$(date +%Y%m%d).json
```

2. **Environment Migration:**
```bash
# Export from production
npx tsx src/cli/export.ts output=./prod-export.json

# Import to staging
npx tsx src/cli/import.ts \
  input=./prod-export.json \
  arangodb_name=nodius_staging
```

3. **Disaster Recovery:**
```bash
# Restore from backup
npx tsx src/cli/import.ts input=./backups/backup-20260107.json
```

4. **Database Cloning:**
```bash
# Export source database
npx tsx src/cli/export.ts \
  arangodb_name=nodius_source \
  output=./clone.json

# Import to new database
npx tsx src/cli/import.ts \
  arangodb_name=nodius_clone \
  input=./clone.json
```

## Development

### Package Structure

```
packages/server/
├── src/
│   ├── auth/                    # Authentication system
│   │   ├── AuthManager.ts       # Main manager
│   │   ├── AuthProvider.ts      # Provider interface
│   │   └── DefaultAuthProvider.ts
│   ├── cli/                     # CLI tools
│   │   ├── createAdmin.ts
│   │   ├── export.ts
│   │   └── import.ts
│   ├── cluster/                 # Distributed cluster
│   │   ├── clusterManager.ts    # ZeroMQ cluster
│   │   └── webSocketManager.ts  # WebSocket server
│   ├── http/                    # HTTP server
│   │   └── HttpServer.ts        # Custom implementation
│   ├── request/                 # Request handlers
│   │   ├── requestAuth.ts
│   │   ├── requestWorkFlow.ts
│   │   ├── requestCategory.ts
│   │   ├── requestDataType.ts
│   │   ├── requestNodeConfig.ts
│   │   ├── requestSync.ts
│   │   ├── requestHistory.ts
│   │   └── requestImage.ts
│   ├── utils/                   # Utilities
│   │   ├── arangoUtils.ts
│   │   ├── env.ts
│   │   ├── generateCert.ts
│   │   └── image/
│   │       ├── imageCompression.ts
│   │       └── imageValidation.ts
│   ├── server.ts                # Main entry point
│   └── index.ts                 # Exports
├── certs/                       # Generated SSL certificates
├── package.json
├── tsconfig.json
└── README.md
```

### Development Scripts

```bash
# Start in development mode
npm run dev

# Build package
npm run build

# Generate barrel files
npm run barrelize

# Create admin
npm run create-admin
```

### Adding a New Endpoint

1. Create a file in `src/request/`:

```typescript
// src/request/requestMyFeature.ts
import { HttpServer } from '../http/HttpServer';
import { db } from '../server';

export class RequestMyFeature {
  static init(app: HttpServer) {
    app.get('/api/myfeature', async (req, res) => {
      // Your logic
      res.json({ data: 'Hello' });
    });

    app.post('/api/myfeature', async (req, res) => {
      const data = req.body;
      // Process data
      res.json({ success: true });
    });
  }
}
```

2. Register in `server.ts`:

```typescript
import { RequestMyFeature } from './request/requestMyFeature';

// After app initialization
RequestMyFeature.init(app);
```

3. Export in `index.ts`:

```typescript
export * from './request/requestMyFeature';
```

## Deployment

### Deployment with PM2

```bash
# Install PM2
npm install -g pm2

# Start server
pm2 start dist/server.js --name nodius-server -- port=8426 https=true

# View logs
pm2 logs nodius-server

# Restart
pm2 restart nodius-server

# Stop
pm2 stop nodius-server
```

### Deployment with Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy files
COPY package*.json ./
COPY packages/server ./packages/server
COPY packages/utils ./packages/utils
COPY packages/process ./packages/process

# Install and build
RUN npm install
RUN npm run build

# Expose ports
EXPOSE 8426 9426 10426

# Environment variables
ENV PORT=8426
ENV HTTPS=true
ENV ARANGO_URL=http://arangodb:8529

# Start
CMD ["node", "packages/server/dist/server.js"]
```

### Deployment with Systemd

```ini
# /etc/systemd/system/nodius-server.service
[Unit]
Description=Nodius Server
After=network.target arangodb.service

[Service]
Type=simple
User=nodius
WorkingDirectory=/opt/nodius
ExecStart=/usr/bin/node /opt/nodius/packages/server/dist/server.js port=8426 https=true
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=nodius-server

Environment=NODE_ENV=production
Environment=ARANGO_URL=http://localhost:8529
Environment=ARANGO_USER=nodius
Environment=ARANGO_PASS=secure_password

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl enable nodius-server
sudo systemctl start nodius-server

# View logs
sudo journalctl -u nodius-server -f
```

### Cluster Deployment

To deploy multiple instances in cluster:

1. **Configure ZeroMQ** on each server
2. **Share the same ArangoDB database**
3. **Load Balancer** in front of instances (nginx, HAProxy)

```nginx
# nginx configuration for load balancing
upstream nodius_backend {
    server server1.example.com:8426;
    server server2.example.com:8426;
    server server3.example.com:8426;
}

server {
    listen 443 ssl http2;
    server_name nodius.example.com;

    ssl_certificate /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;

    location /api {
        proxy_pass https://nodius_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass https://nodius_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

## Security

### Best Practices

1. **JWT Secret**: Use a strong and unique secret
2. **HTTPS**: Always enable HTTPS in production
3. **Rate Limiting**: Configure appropriate limits
4. **CORS**: Restrict allowed origins
5. **Validation**: Validate all user inputs
6. **ArangoDB**: Use strong credentials
7. **Updates**: Keep dependencies up to date

### Secure Configuration Example

```typescript
// Strict rate limiting
app.use(rateLimit({
  windowMs: 60000,  // 1 minute
  max: 30          // 30 requests max
}));

// Restricted CORS
app.use(cors({
  origin: 'https://your-domain.com',
  methods: 'GET,POST,PUT,DELETE',
  allowedHeaders: 'Content-Type,Authorization'
}));

// Strong JWT secret
const jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
```

## Contributing

Contributions are welcome! To contribute:

1. Respect the modular architecture
2. Add tests if applicable
3. Document new endpoints
4. Maintain compatibility with existing clients

## Support

- **Issues**: https://github.com/Nodius-kit/Nodius/issues
- **API Documentation**: See types in `@nodius/utils`

## License

ISC - See [LICENSE](../../LICENSE)

---

## Creator

**Hugo MATHIEU**
- Email: hugo.mathieu771@gmail.com
- LinkedIn: https://www.linkedin.com/in/hugo-mathieu-fullstack/

---

**Note**: This server is designed to be deployed in a secure cloud environment. Make sure to follow security best practices in production.
