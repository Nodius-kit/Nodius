#!/usr/bin/env tsx

import { Database } from 'arangojs';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {CollectionType} from "arangojs/collections";

/**
 * ArangoDB Import Script
 *
 * Imports data from a JSON file to ArangoDB:
 * - Creates database if it doesn't exist
 * - Creates collections if they don't exist (with correct type: document or edge)
 * - Replaces existing documents (based on _key)
 * - Inserts new documents that don't exist
 * - Does NOT delete existing documents
 *
 * Usage:
 *   tsx scripts/import.ts [options]
 *
 * Options:
 *   arangodb=<url>       ArangoDB URL (default: http://127.0.0.1:8529)
 *   arangodb_user=<user> Database username (default: root)
 *   arangodb_pass=<pass> Database password (default: azerty)
 *   arangodb_name=<name> Database name (default: nodius)
 *   input=<path>         Input file path (default: ./backup/nodius-export.json)
 */

interface ImportData {
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
    input: string;
}> {
    const args = process.argv.slice(2);
    const config = {
        url: 'http://127.0.0.1:8529',
        user: 'root',
        password: 'azerty',
        database: 'nodius',
        input: './backup/nodius-export.json'
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
            case 'input':
                config.input = value;
                break;
        }
    }

    return config;
}

async function importDatabase() {
    console.log('🚀 Starting ArangoDB import (replace mode)...\n');

    const config = await parseArgs();

    console.log(`📋 Configuration:`);
    console.log(`   Database: ${config.database}`);
    console.log(`   URL: ${config.url}`);
    console.log(`   User: ${config.user}`);
    console.log(`   Input: ${config.input}\n`);

    // Read import file
    const inputPath = resolve(config.input);
    let importData: ImportData;

    try {
        const fileContent = readFileSync(inputPath, 'utf-8');
        importData = JSON.parse(fileContent);
        console.log(`✅ Loaded import file: ${inputPath}`);
        console.log(`   Export date: ${importData.metadata.exportDate}`);
        console.log(`   Collections: ${Object.keys(importData.collections).length}\n`);
    } catch (error) {
        console.error(`❌ Failed to read import file: ${inputPath}`);
        console.error(error);
        process.exit(1);
    }

    // Connect to ArangoDB (first connect to _system database to check/create target database)
    const systemDb = new Database({
        url: config.url,
        databaseName: '_system',
        auth: { username: config.user, password: config.password }
    });

    let db: Database;

    try {
        // Test connection to _system database
        await systemDb.get();
        console.log('✅ Connected to ArangoDB');

        // Check if target database exists, create if not
        const databases = await systemDb.listDatabases();

        if (!databases.includes(config.database)) {
            console.log(`📝 Database "${config.database}" does not exist, creating...`);
            await systemDb.createDatabase(config.database);
            console.log(`✅ Database "${config.database}" created successfully`);
        } else {
            console.log(`✅ Database "${config.database}" exists`);
        }

        // Now connect to the target database
        db = new Database({
            url: config.url,
            databaseName: config.database,
            auth: { username: config.user, password: config.password }
        });

        // Verify connection to target database
        await db.get();
        console.log('');

        let totalReplaced = 0;
        let totalInserted = 0;
        let totalErrors = 0;

        // Import each collection
        for (const [collectionName, collectionData] of Object.entries(importData.collections)) {
            console.log(`📂 Processing collection: ${collectionName}`);
            console.log(`   Documents to process: ${collectionData.documents.length}`);

            try {
                // Check if collection exists, create if not
                const collections = await db.collections();
                const collectionExists = collections.some(col => col.name === collectionName);

                const collection = db.collection(collectionName);

                if (!collectionExists) {
                    console.log(`   📝 Collection does not exist, creating...`);
                    // CollectionType: 2 = document collection, 3 = edge collection
                    const collectionType = collectionData.type as CollectionType;
                    await collection.create({ type: collectionType });
                    console.log(`   ✅ Collection created successfully`);
                }
                let replaced = 0;
                let inserted = 0;
                let errors = 0;

                // Process each document
                for (const doc of collectionData.documents) {
                    try {
                        // Check if document exists
                        const exists = await collection.documentExists(doc._key);

                        if (exists) {
                            // Replace existing document
                            await collection.replace(doc._key, doc);
                            replaced++;
                        } else {
                            // Insert new document
                            await collection.save(doc, { overwriteMode: 'ignore' });
                            inserted++;
                        }
                    } catch (error) {
                        console.error(`      ❌ Error processing document ${doc._key}:`, error);
                        errors++;
                    }
                }

                console.log(`   ✅ Replaced: ${replaced} | ➕ Inserted: ${inserted} | ❌ Errors: ${errors}`);

                totalReplaced += replaced;
                totalInserted += inserted;
                totalErrors += errors;

            } catch (error) {
                console.error(`   ❌ Failed to process collection ${collectionName}:`, error);
            }

            console.log('');
        }

        console.log(`\n✅ Import completed!`);
        console.log(`📊 Summary:`);
        console.log(`   ✅ Documents replaced: ${totalReplaced}`);
        console.log(`   ➕ Documents inserted: ${totalInserted}`);
        console.log(`   ❌ Errors: ${totalErrors}`);

    } catch (error) {
        console.error('\n❌ Import failed:', error);
        process.exit(1);
    }
}

// Export the function for programmatic use
export { importDatabase };

// CLI execution: run only if this file is executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('import.ts') ||
    process.argv[1]?.endsWith('import.js');

if (isMainModule) {
    importDatabase().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
