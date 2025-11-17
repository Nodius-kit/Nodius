#!/usr/bin/env tsx

import { Database } from 'arangojs';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * ArangoDB Import Script
 *
 * Imports data from a JSON file and replaces existing documents in ArangoDB.
 * Only updates documents that already exist (based on _key).
 * Does NOT delete existing documents or insert new ones.
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

        let totalReplaced = 0;
        let totalSkipped = 0;
        let totalErrors = 0;

        // Import each collection
        for (const [collectionName, collectionData] of Object.entries(importData.collections)) {
            console.log(`📂 Processing collection: ${collectionName}`);
            console.log(`   Documents to process: ${collectionData.documents.length}`);

            try {
                // Check if collection exists
                const collections = await db.collections();
                const collectionExists = collections.some(col => col.name === collectionName);

                if (!collectionExists) {
                    console.log(`   ⚠️  Collection does not exist, skipping...`);
                    totalSkipped += collectionData.documents.length;
                    continue;
                }

                const collection = db.collection(collectionName);
                let replaced = 0;
                let skipped = 0;
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
                            // Skip non-existing documents
                            skipped++;
                        }
                    } catch (error) {
                        console.error(`      ❌ Error processing document ${doc._key}:`, error);
                        errors++;
                    }
                }

                console.log(`   ✅ Replaced: ${replaced} | ⏭️  Skipped: ${skipped} | ❌ Errors: ${errors}`);

                totalReplaced += replaced;
                totalSkipped += skipped;
                totalErrors += errors;

            } catch (error) {
                console.error(`   ❌ Failed to process collection ${collectionName}:`, error);
            }

            console.log('');
        }

        console.log(`\n✅ Import completed!`);
        console.log(`📊 Summary:`);
        console.log(`   ✅ Documents replaced: ${totalReplaced}`);
        console.log(`   ⏭️  Documents skipped (not existing): ${totalSkipped}`);
        console.log(`   ❌ Errors: ${totalErrors}`);

        if (totalSkipped > 0) {
            console.log(`\n💡 Note: ${totalSkipped} documents were skipped because they don't exist in the database.`);
            console.log(`   This script only REPLACES existing documents, it does not INSERT new ones.`);
        }

    } catch (error) {
        console.error('\n❌ Import failed:', error);
        process.exit(1);
    }
}

// Run import
importDatabase().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
