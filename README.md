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