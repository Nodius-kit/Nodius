# Nodius

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2-blue)](https://reactjs.org/)

**Nodius** is an innovative cloud platform for building and executing graphical and logical workflows. Designed as a complete monorepo solution, Nodius allows you to visually create complex workflows that can be deployed on a cloud server and used simultaneously by multiple clients.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development](#development)
- [Project Structure](#project-structure)
- [Technologies Used](#technologies-used)
- [Package Documentation](#package-documentation)
- [Available Scripts](#available-scripts)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## Overview

Nodius is a workflow creation platform that combines:

- **Graphical Interface**: A visual node-based editor for building workflows intuitively
- **Logical Execution**: An execution engine for logical workflows and sequential algorithms
- **Real-time Collaboration**: Multi-user collaborative editing via WebSocket
- **Cloud Architecture**: Deployable API backend on a server with multi-client support
- **High Performance**: WebGPU-powered graphical rendering for optimal performance

### Use Cases

- Data processing pipeline creation
- Business workflow automation
- Dynamic user interface construction
- Complex process orchestration
- Rapid application prototyping

## Features

### Advanced Graphical Editor

- **Visual Node Editor**: Drag-and-drop interface for creating workflows
- **WebGPU Rendering**: Optimal performance for large graphs
- **Connection System**: Links between nodes with type validation
- **Integrated Code Editor**: CodeMirror for editing code directly in nodes
- **Image Management**: Upload and manage images for workflows

### Real-time Collaboration

- **Multi-User Editing**: Multiple users can edit simultaneously
- **WebSocket Synchronization**: Real-time change propagation
- **Instruction System**: Synchronization based on atomic instructions
- **Auto-Save**: Automatic save every 30 seconds
- **Change History**: Complete tracking of modifications

### Distributed Architecture

- **Cluster Manager**: Horizontal scaling support with ZeroMQ
- **Graph Database**: ArangoDB for storing nodes and edges
- **JWT Authentication**: Secure auth system with pluggable providers
- **HTTPS/WSS**: SSL support with automatic certificate generation
- **RESTful API**: Complete API for all operations

## Architecture

Nodius is organized as a **monorepo** with 4 main packages:

```
┌─────────────────────────────────────────────────────┐
│                   Nodius Platform                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐         ┌──────────────┐        │
│  │   @nodius/   │         │   @nodius/   │        │
│  │    client    │◄────────│    utils     │        │
│  │   (React)    │         │   (Shared)   │        │
│  └──────┬───────┘         └───────▲──────┘        │
│         │                         │                │
│         │ WebSocket/HTTP          │                │
│         │                         │                │
│  ┌──────▼───────┐         ┌───────┴──────┐        │
│  │   @nodius/   │────────►│   @nodius/   │        │
│  │    server    │         │   process    │        │
│  │  (API/WS)    │         │   (Engine)   │        │
│  └──────┬───────┘         └──────────────┘        │
│         │                                          │
│         │                                          │
│  ┌──────▼───────┐         ┌──────────────┐        │
│  │   ArangoDB   │         │   ZeroMQ     │        │
│  │  (Database)  │         │  (Cluster)   │        │
│  └──────────────┘         └──────────────┘        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Data Flow

1. **Client**: React interface that sends instructions to the server
2. **Server**: Receives, validates, and applies instructions
3. **WebSocket**: Broadcasts changes to all connected clients
4. **Process**: Executes workflow logic
5. **Utils**: Provides shared types and utilities
6. **ArangoDB**: Persists graph state
7. **ZeroMQ**: Coordinates server instances in cluster

## Prerequisites

Before installing Nodius, ensure you have:

- **Node.js**: Version 18.x or higher
- **npm**: Version 9.x or higher
- **ArangoDB**: Version 3.11.x or higher (for server)
- **Operating System**: Windows, macOS, or Linux
- **Memory**: Minimum 4 GB RAM (8 GB recommended for development)

### Installing ArangoDB

#### Windows
```bash
# Download from https://www.arangodb.com/download/
# Or via chocolatey
choco install arangodb
```

#### macOS
```bash
brew install arangodb
```

#### Linux (Ubuntu/Debian)
```bash
curl -OL https://download.arangodb.com/arangodb311/DEBIAN/Release.key
sudo apt-key add - < Release.key
echo 'deb https://download.arangodb.com/arangodb311/DEBIAN/ /' | sudo tee /etc/apt/sources.list.d/arangodb.list
sudo apt-get update
sudo apt-get install arangodb3
```

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Nodius-kit/Nodius.git
cd Nodius
```

### 2. Install Dependencies

```bash
npm install
```

This command will install all dependencies for all packages in the monorepo.

### 3. ArangoDB Configuration

Create a database for Nodius:

```bash
# Connect to ArangoDB
arangosh

# Create database (optional, server will create it automatically)
db._createDatabase("nodius");
```

### 4. Create Admin Account

Before you can use Nodius, you need to create an admin account:

```bash
# From root directory
cd packages/server
npm run create-admin

# Or with custom database settings
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
```

**Available Options:**
- `username`: Admin username (required)
- `password`: Admin password (required)
- `email`: Admin email (optional)
- `arangodb`: ArangoDB URL (default: `http://127.0.0.1:8529`)
- `arangodb_user`: Database username (default: `root`)
- `arangodb_pass`: Database password (default: `azerty`)
- `arangodb_name`: Database name (default: `nodius`)

The password will be securely hashed using bcrypt before storage. You can use these credentials to log into the Nodius web interface.

### 5. Environment Variables Configuration

The project automatically generates necessary configuration files at startup. However, you can customize the configuration:

**For the server** (optional - environment variables or CLI arguments):
- `ARANGO_URL`: ArangoDB connection URL (default: `http://127.0.0.1:8529`)
- `ARANGO_DB`: Database name (default: `nodius`)
- `ARANGO_USER`: ArangoDB user (default: `root`)
- `ARANGO_PASS`: ArangoDB password (default: `azerty`)

## Development

### Quick Start

To start the complete development environment (server + client):

```bash
npm run dev
```

This command:
1. Starts the API server on `https://[auto-detected-ip]:8426`
2. Starts the React client on an available port (usually `https://[auto-detected-ip]:5173`)
3. Automatically configures HTTPS with self-signed certificates
4. Synchronizes server and client logs

### Network Configuration

By default, Nodius **automatically detects your local network IP** (the one that provides internet access), making the server accessible from other devices on the same network. This is useful for:
- Testing on mobile devices
- Collaborative development
- Multi-machine setups

#### Override the Host IP

You can override the auto-detected IP using the `host` argument:

```bash
# Use a specific IP
npm run dev host=192.168.1.100

# Use localhost only (not accessible from network)
npm run dev host=localhost

# Use all interfaces
npm run dev host=0.0.0.0
```

The same `host` parameter works for individual startup commands:

```bash
# Server with custom host
npm run server:dev host=192.168.1.100 https=true

# Client with custom host
npm run client:dev host=192.168.1.100 https=true
```

**Note**: When using HTTPS with auto-detected IP, the self-signed certificate automatically includes the detected IP in its Subject Alternative Names (SANs), allowing secure connections without certificate errors for that IP.

### Individual Startup

#### Server Only

```bash
npm run server:dev
```

Available options via arguments:
```bash
# Customize port, host and HTTPS
npm run server:dev port=3000 host=localhost https=false

# With custom certificates
npm run server:dev https=true cert=./path/to/cert.pem key=./path/to/key.pem
```

#### Client Only

```bash
npm run client:dev
```

Available options:
```bash
# Customize API port and host
npm run client:dev port=8426 host=localhost https=false
```

### Package-by-Package Development Mode

You can also develop package by package:

```bash
# Server development
cd packages/server
npm run dev

# Client development
cd packages/client
npm run dev

# Build a specific package
cd packages/utils
npm run build
```

## Project Structure

```
Nodius/
├── packages/                    # Monorepo packages
│   ├── client/                 # React application (Frontend)
│   │   ├── src/
│   │   │   ├── component/      # Reusable React components
│   │   │   ├── hooks/          # Custom hooks and contexts
│   │   │   ├── menu/           # Menu and navigation components
│   │   │   ├── pages/          # Application pages
│   │   │   ├── schema/         # Workflow editor
│   │   │   │   ├── editor/     # Editing logic
│   │   │   │   ├── hook/       # Schema hooks
│   │   │   │   ├── manager/    # State managers
│   │   │   │   └── motor/      # WebGPU rendering engine
│   │   │   ├── utils/          # Client utilities
│   │   │   └── main.tsx        # Entry point
│   │   └── package.json
│   │
│   ├── server/                 # Backend API (Node.js)
│   │   ├── src/
│   │   │   ├── auth/           # Authentication system
│   │   │   ├── cluster/        # Cluster and WebSocket management
│   │   │   ├── http/           # Custom HTTP server
│   │   │   ├── request/        # API request handlers
│   │   │   ├── utils/          # Server utilities
│   │   │   └── server.ts       # Entry point
│   │   └── package.json
│   │
│   ├── process/                # Workflow execution engine
│   │   ├── src/
│   │   │   ├── html/           # HTML rendering in nodes
│   │   │   ├── modal/          # Modal management
│   │   │   └── workflow/       # Execution logic
│   │   └── package.json
│   │
│   └── utils/                  # Shared utilities
│       ├── src/
│       │   ├── dataType/       # Data type system
│       │   ├── graph/          # Graph types and utils
│       │   ├── html/           # HTML types and utils
│       │   ├── image/          # Image processing
│       │   ├── requests/       # Shared API types
│       │   └── sync/           # Synchronization system
│       └── package.json
│
├── dev-cli.mjs                 # Orchestrated development script
├── dev-cli-monitor.mjs         # Development monitoring
├── package.json                # Workspace configuration
└── tsconfig.json               # TypeScript configuration
```

## Technologies Used

### Frontend

| Technology | Version | Usage |
|------------|---------|-------|
| **React** | 19.2.1 | UI Framework |
| **TypeScript** | 5.9.3 | Programming language |
| **Vite** | 7.2.7 | Build tool and dev server |
| **WebGPU** | 0.1.68 | High-performance graphical rendering |
| **CodeMirror** | 4.25.3 | Integrated code editor |
| **Lucide React** | 0.561.0 | Icons |
| **React Hot Toast** | 2.6.0 | Notifications |

### Backend

| Technology | Version | Usage |
|------------|---------|-------|
| **Node.js** | 18+ | JavaScript runtime |
| **TypeScript** | 5.9.3 | Programming language |
| **ArangoDB** | 10.1.2 | Graph database |
| **WebSocket (ws)** | 8.18.3 | Real-time communication |
| **ZeroMQ** | 6.5.0 | Inter-process messaging |
| **JWT** | 9.0.3 | Authentication |
| **bcrypt** | 6.0.0 | Password hashing |
| **Sharp** | 0.34.5 | Image processing |
| **Multer** | 2.0.2 | File upload |

### DevOps & Build

| Technology | Version | Usage |
|------------|---------|-------|
| **tsup** | 8.5.1 | TypeScript bundler |
| **barrelize** | 1.6.6 | Barrel file generation |
| **tsx** | 4.21.0 | TypeScript execution |

## Package Documentation

Each package has its own detailed documentation:

- **[@nodius/client](./packages/client/README.md)** - React frontend application
- **[@nodius/server](./packages/server/README.md)** - Backend API and WebSocket
- **[@nodius/process](./packages/process/README.md)** - Workflow execution engine
- **[@nodius/utils](./packages/utils/README.md)** - Shared utilities and types

## Available Scripts

### Root Scripts

```bash
# Development (server + client)
npm run dev

# Build all packages
npm run build

# Publish all packages (requires npm rights)
npm publish -ws --access public

# Server only in dev
npm run server:dev

# Client only in dev
npm run client:dev
```

### Per-Package Scripts

Each package supports:

```bash
# Build the package
npm run build --workspace=@nodius/[package-name]

# Generate barrel files
npm run barrelize --workspace=@nodius/[package-name]

# Dev (server and client only)
npm run dev --workspace=@nodius/[package-name]
```

## Deployment

### Deployment Overview

Nodius provides built-in HTTPS support with self-signed certificates for development. For production deployments with custom domains, SSL certificates, and advanced security configurations (Let's Encrypt, DNS management, CDN, etc.), please refer to standard web server deployment guides as these configurations are beyond the scope of this tool.

### Production Deployment

#### 1. Build All Packages

```bash
# Build all packages in correct order
npm run build
```

#### 2. Configure ArangoDB Connection

Set up environment variables or CLI arguments for database connection:

```bash
# Configure ArangoDB connection
export ARANGO_URL=http://127.0.0.1:8529
export ARANGO_DB=nodius
export ARANGO_USER=nodius_user
export ARANGO_PASS=your_secure_password
```

#### 3. Deployment Scenarios

##### Option A: Simple Deployment (Development/Testing)

Start the server with built-in HTTPS (self-signed certificates):

```bash
cd packages/server
node dist/server.js --port=8426 --host=0.0.0.0 --https=true
```

Access the application directly at `https://your-server:8426`

**Note**: Self-signed certificates will trigger browser warnings. This is suitable for development or internal testing only.

##### Option B: Production Deployment with Nginx (Recommended)

This setup uses nginx as a reverse proxy handling SSL termination, with the Nodius server running on HTTP internally.

**Step 1**: Build and deploy the client

```bash
cd packages/client
npm run build

# Copy built files to web server directory
cp -r dist /var/www/nodius
```

**Step 2**: Start the server without SSL (nginx handles it)

```bash
cd packages/server
node dist/server.js --port=8426 --host=127.0.0.1 --https=false
```

**Step 3**: Configure nginx

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL configuration (use your own certificates)
    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Serve static client files
    root /var/www/nodius;
    index index.html;

    # Client routing (SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api {
        proxy_pass http://127.0.0.1:8426;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Proxy WebSocket connections to backend
    location /ws {
        proxy_pass http://127.0.0.1:8426;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;

        # WebSocket specific settings
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

**Important Notes:**
- Server listens on `127.0.0.1:8426` (localhost only, not exposed externally)
- Nginx handles SSL termination and proxies to HTTP backend
- WebSocket connections are properly upgraded through nginx
- For Let's Encrypt certificates and DNS configuration, refer to nginx and certbot documentation

### Docker Deployment (Optional)

You can containerize Nodius using Docker for easier deployment and scaling.

**Example Dockerfile for server:**

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy workspace configuration
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/
COPY packages/utils/package.json packages/utils/
COPY packages/process/package.json packages/process/

# Install dependencies
RUN npm install

# Copy source code
COPY packages/server packages/server
COPY packages/utils packages/utils
COPY packages/process packages/process

# Build packages (utils → process → server)
RUN npm run build --workspace=@nodius/utils
RUN npm run build --workspace=@nodius/process
RUN npm run build --workspace=@nodius/server

# Expose server port
EXPOSE 8426

# Start server (HTTP mode - SSL handled by reverse proxy)
CMD ["node", "packages/server/dist/server.js", "--port=8426", "--host=0.0.0.0", "--https=false"]
```

**Example docker-compose.yml:**

```yaml
version: '3.8'

services:
  arangodb:
    image: arangodb:latest
    environment:
      ARANGO_ROOT_PASSWORD: your_secure_password
    ports:
      - "8529:8529"
    volumes:
      - arangodb_data:/var/lib/arangodb3

  nodius-server:
    build: .
    ports:
      - "8426:8426"
    environment:
      ARANGO_URL: http://arangodb:8529
      ARANGO_DB: nodius
      ARANGO_USER: root
      ARANGO_PASS: your_secure_password
    depends_on:
      - arangodb

volumes:
  arangodb_data:
```

### Cluster Configuration (Advanced)

For high-availability deployments with multiple server instances:

1. **Configure ZeroMQ** on each server instance for inter-process communication
2. **Shared Database**: Ensure all instances connect to the same ArangoDB database
3. **Load Balancer**: Use nginx or HAProxy with sticky sessions for WebSocket support
4. **Session Persistence**: Configure sticky sessions based on client IP or cookies

**Example nginx load balancer configuration:**

```nginx
upstream nodius_backend {
    ip_hash;  # Sticky sessions for WebSocket
    server 127.0.0.1:8426;
    server 127.0.0.1:8427;
    server 127.0.0.1:8428;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location /api {
        proxy_pass http://nodius_backend;
        # ... (same headers as single server setup)
    }

    location /ws {
        proxy_pass http://nodius_backend;
        # ... (same headers as single server setup)
    }
}
```

**Note**: Advanced production deployments with custom domains, DNS management, SSL/TLS automation (Let's Encrypt), CDN integration, and enterprise security configurations are beyond the scope of this documentation. Please consult standard DevOps resources for these setups.

## Database Management

### Exporting the Database

You can export all workflows, node configurations, and data to a JSON file for backup or migration:

```bash
# From packages/server directory
cd packages/server

# Export with default settings
npx tsx src/cli/export.ts

# Export with custom output path
npx tsx src/cli/export.ts output=./my-backup.json

# Export with custom database connection
npx tsx src/cli/export.ts \
  arangodb=http://127.0.0.1:8529 \
  arangodb_user=root \
  arangodb_pass=azerty \
  arangodb_name=nodius \
  output=./backup/nodius-backup.json
```

**Available Options:**
- `arangodb`: ArangoDB URL (default: `http://127.0.0.1:8529`)
- `arangodb_user`: Database username (default: `root`)
- `arangodb_pass`: Database password (default: `azerty`)
- `arangodb_name`: Database name (default: `nodius`)
- `output`: Output file path (default: `./backup/nodius-export.json`)

The export file contains:
- All collections (workflows, nodes, edges, node configurations, etc.)
- All documents with their metadata
- Export timestamp and database information

### Importing the Database

Import data from a JSON backup file:

```bash
# From packages/server directory
cd packages/server

# Import with default settings
npx tsx src/cli/import.ts

# Import from custom path
npx tsx src/cli/import.ts input=./my-backup.json

# Import to custom database
npx tsx src/cli/import.ts \
  arangodb=http://127.0.0.1:8529 \
  arangodb_user=root \
  arangodb_pass=azerty \
  arangodb_name=nodius \
  input=./backup/nodius-backup.json
```

**Available Options:**
- `arangodb`: ArangoDB URL (default: `http://127.0.0.1:8529`)
- `arangodb_user`: Database username (default: `root`)
- `arangodb_pass`: Database password (default: `azerty`)
- `arangodb_name`: Database name (default: `nodius`)
- `input`: Input file path (default: `./backup/nodius-export.json`)

**Import Behavior:**
- Creates the database if it doesn't exist
- Creates collections if they don't exist (with correct type: document or edge)
- Replaces existing documents (based on `_key`)
- Inserts new documents that don't exist
- Does NOT delete existing documents not in the import file

**Use Cases:**
- **Backup & Restore**: Regular backups of your workflows and data
- **Migration**: Moving data between development, staging, and production environments
- **Cloning**: Duplicating a Nodius instance for testing
- **Disaster Recovery**: Restoring data after system failures

## Contributing

Contributions are welcome! To contribute:

### 1. Fork the Project

```bash
git clone https://github.com/Nodius-kit/Nodius.git
cd Nodius
```

### 2. Create a Branch

```bash
git checkout -b feature/my-new-feature
```

### 3. Develop

- Respect the monorepo structure
- Add tests if applicable
- Keep documentation up to date
- Follow TypeScript code conventions

### 4. Commit and Push

```bash
git add .
git commit -m "feat: add new feature"
git push origin feature/my-new-feature
```

### 5. Create a Pull Request

Open a PR on GitHub with a detailed description of changes.

### Code Conventions

- **TypeScript**: Use strict types
- **Naming**: camelCase for variables, PascalCase for components
- **Imports**: Use barrel files (@nodius/utils, etc.)
- **Documentation**: Document public functions with JSDoc

## License

This project is licensed under the **ISC** license. See the [LICENSE](./LICENSE) file for more details.

---

## Creator

**Hugo MATHIEU**
- Email: hugo.mathieu771@gmail.com
- LinkedIn: https://www.linkedin.com/in/hugo-mathieu-fullstack/

## Support

For any questions or issues:

- **Issues**: https://github.com/Nodius-kit/Nodius/issues
- **Documentation**: See each package's README

---

**Built with passion by Hugo MATHIEU**
