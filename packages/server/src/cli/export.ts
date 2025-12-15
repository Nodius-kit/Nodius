#!/usr/bin/env tsx

import { Database } from 'arangojs';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * ArangoDB Export Script
 *
 * Exports all collections and their documents from ArangoDB to a JSON file.
 *
 * Usage:
 *   tsx scripts/export.ts [options]
 *
 * Options:
 *   arangodb=<url>       ArangoDB URL (default: http://127.0.0.1:8529)
 *   arangodb_user=<user> Database username (default: root)
 *   arangodb_pass=<pass> Database password (default: azerty)
 *   arangodb_name=<name> Database name (default: nodius)
 *   output=<path>        Output file path (default: ./backup/nodius-export.json)
 */

interface ExportData {
    metadata: {
        exportDate: string;
        databaseName: string;
        version: string;
    };
    collections: {
        [collectionName: string]: {
            name: string;
            type: number;
            documents: any[];
        };
    };
}

async function parseArgs(): Promise<{
    url: string;
    user: string;
    password: string;
    database: string;
    output: string;
}> {
    const args = process.argv.slice(2);
    const config = {
        url: 'http://127.0.0.1:8529',
        user: 'root',
        password: 'azerty',
        database: 'nodius',
        output: './backup/nodius-export.json'
    };

    for (const arg of args) {
        const [key, value] = arg.split('=');
        switch (key) {
            case 'arangodb':
                config.url = value;
                break;
            case 'arangodb_user':
                config.user = value;
                break;
            case 'arangodb_pass':
                config.password = value;
                break;
            case 'arangodb_name':
                config.database = value;
                break;
            case 'output':
                config.output = value;
                break;
        }
    }

    return config;
}

async function exportDatabase() {
    console.log('🚀 Starting ArangoDB export...\n');

    const config = await parseArgs();

    console.log(`📋 Configuration:`);
    console.log(`   Database: ${config.database}`);
    console.log(`   URL: ${config.url}`);
    console.log(`   User: ${config.user}`);
    console.log(`   Output: ${config.output}\n`);

    // Connect to ArangoDB
    const db = new Database({
        url: config.url,
        databaseName: config.database,
        auth: { username: config.user, password: config.password }
    });

    try {
        // Test connection
        await db.get();
        console.log('✅ Connected to ArangoDB\n');

        // Get all collections
        const collections = await db.collections();
        const userCollections = collections.filter(col => !col.name.startsWith('_'));

        console.log(`📦 Found ${userCollections.length} collections to export:\n`);

        const exportData: ExportData = {
            metadata: {
                exportDate: new Date().toISOString(),
                databaseName: config.database,
                version: '1.0.0'
            },
            collections: {}
        };

        // Export each collection
        for (const collection of userCollections) {
            const collectionName = collection.name;
            console.log(`   📂 Exporting collection: ${collectionName}...`);

            try {
                // Get all documents
                const cursor = await db.query(`
                    FOR doc IN ${collectionName}
                    RETURN doc
                `);
                const documents = await cursor.all();

                // Get collection info
                const collectionInfo = await collection.get();

                exportData.collections[collectionName] = {
                    name: collectionName,
                    type: collectionInfo.type,
                    documents: documents
                };

                console.log(`      ✅ Exported ${documents.length} documents`);
            } catch (error) {
                console.error(`      ❌ Failed to export ${collectionName}:`, error);
            }
        }

        // Create backup directory if it doesn't exist
        const outputPath = resolve(config.output);
        const outputDir = outputPath.substring(0, outputPath.lastIndexOf('\\') || outputPath.lastIndexOf('/'));

        try {
            const { mkdirSync } = await import('fs');
            mkdirSync(outputDir, { recursive: true });
        } catch (error) {
            // Directory might already exist, ignore
        }

        // Write to file
        writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');

        console.log(`\n✅ Export completed successfully!`);
        console.log(`📁 File saved to: ${outputPath}`);
        console.log(`📊 Total collections: ${Object.keys(exportData.collections).length}`);
        console.log(`📄 Total documents: ${Object.values(exportData.collections).reduce((sum, col) => sum + col.documents.length, 0)}`);

    } catch (error) {
        console.error('\n❌ Export failed:', error);
        process.exit(1);
    }
}

// Run export
exportDatabase().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
