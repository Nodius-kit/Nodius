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

### 4. Environment Variables Configuration

The project automatically generates necessary configuration files at startup. However, you can customize the configuration:

**For the server** (optional - environment variables or CLI arguments):
- `ARANGO_URL`: ArangoDB connection URL (default: `http://localhost:8529`)
- `ARANGO_DB`: Database name (default: `nodius`)
- `ARANGO_USER`: ArangoDB user (default: `root`)
- `ARANGO_PASSWORD`: ArangoDB password (default: empty)

## Development

### Quick Start

To start the complete development environment (server + client):

```bash
npm run dev
```

This command:
1. Starts the API server on `https://192.168.1.72:8426`
2. Starts the React client on an available port (usually `https://192.168.1.72:5173`)
3. Automatically configures HTTPS with self-signed certificates
4. Synchronizes server and client logs

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

### Production Deployment

#### 1. Build Packages

```bash
npm run build
```

#### 2. Server Configuration

Create a configuration file for the server (or use environment variables):

```bash
# Configure ArangoDB
export ARANGO_URL=https://your-arangodb-server:8529
export ARANGO_DB=nodius
export ARANGO_USER=nodius_user
export ARANGO_PASSWORD=your_secure_password

# SSL certificates (recommended for production)
export SSL_CERT=/path/to/cert.pem
export SSL_KEY=/path/to/key.pem
```

#### 3. Start the Server

```bash
cd packages/server
node dist/server.js --port=8426 --host=0.0.0.0 --https=true --cert=$SSL_CERT --key=$SSL_KEY
```

#### 4. Serve the Client

The client can be served by any static web server (nginx, Apache, etc.):

```bash
cd packages/client
# Build the client
npm run build

# Copy dist folder to your web server
cp -r dist /var/www/nodius
```

Nginx configuration example:

```nginx
server {
    listen 443 ssl http2;
    server_name nodius.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    root /var/www/nodius;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy for API
    location /api {
        proxy_pass https://localhost:8426;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Proxy for WebSocket
    location /ws {
        proxy_pass https://localhost:8426;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

### Docker Deployment (Optional)

You can create Docker images for easier deployment. Example Dockerfile:

```dockerfile
# Dockerfile for server
FROM node:18-alpine

WORKDIR /app

# Copy workspace files
COPY package.json .
COPY packages/server packages/server
COPY packages/utils packages/utils
COPY packages/process packages/process

# Install dependencies
RUN npm install

# Build packages
RUN npm run build

# Expose ports
EXPOSE 8426

# Start server
CMD ["node", "packages/server/dist/server.js"]
```

### Cluster Configuration (Advanced)

To deploy multiple server instances in cluster:

1. Configure ZeroMQ on each instance
2. Ensure all instances can communicate with each other
3. Share the same ArangoDB database
4. Use a load balancer (nginx, HAProxy) in front of instances

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
