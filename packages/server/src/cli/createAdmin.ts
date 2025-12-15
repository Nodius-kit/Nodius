/**
 * @file createAdmin.ts
 * @description CLI tool to create an admin user in the database
 * @module server/cli
 *
 * This CLI tool allows creating an admin user with a specified password.
 * It connects to the ArangoDB database and uses the DefaultAuthProvider
 * to create a user with the 'admin' role.
 *
 * Usage:
 * ```bash
 * # Create admin with default database connection
 * tsx src/server/cli/createAdmin.ts username=admin password=mySecurePassword
 *
 * # Create admin with custom database connection
 * tsx src/server/cli/createAdmin.ts username=admin password=mySecurePassword arangodb=http://localhost:8529 arangodb_name=nodius
 * ```
 *
 * Arguments:
 * - username: Admin username (required)
 * - password: Admin password (required)
 * - email: Admin email (optional)
 * - arangodb: ArangoDB URL (default: http://127.0.0.1:8529)
 * - arangodb_user: ArangoDB username (default: root)
 * - arangodb_pass: ArangoDB password (default: azerty)
 * - arangodb_name: ArangoDB database name (default: nodius)
 *
 * Security:
 * - Password is hashed with bcrypt before storage
 * - Prevents duplicate usernames
 * - Admin role is automatically assigned
 */

import { Database } from "arangojs";
import { DefaultAuthProvider } from "../auth";
import { parseArgs } from "../utils/env";

async function createAdminUser() {
    const args = parseArgs();

    // Get CLI arguments
    const username = args.get("username");
    const password = args.get("password");
    const email = args.get("email");

    // Validate required arguments
    if (!username || !password) {
        console.error('❌ Error: username and password are required');
        console.log('\nUsage:');
        console.log('  tsx src/server/cli/createAdmin.ts username=admin password=mySecurePassword');
        console.log('\nOptional arguments:');
        console.log('  email=admin@example.com');
        console.log('  arangodb=http://localhost:8529');
        console.log('  arangodb_user=root');
        console.log('  arangodb_pass=azerty');
        console.log('  arangodb_name=nodius');
        process.exit(1);
    }

    // Database configuration
    const dbUrl = args.get("arangodb", "http://127.0.0.1:8529");
    const dbUser = args.get("arangodb_user", "root");
    const dbPass = args.get("arangodb_pass", "azerty");
    const dbName = args.get("arangodb_name", "nodius");

    console.log('🔌 Connecting to ArangoDB...');
    console.log(`   URL: ${dbUrl}`);
    console.log(`   Database: ${dbName}`);

    try {
        // Connect to database
        const db = new Database({
            url: dbUrl,
            auth: { username: dbUser, password: dbPass },
            databaseName: dbName
        });

        // Initialize auth provider
        const authProvider = new DefaultAuthProvider({
            db
        });

        await authProvider.initialize();

        console.log('✅ Connected to database');
        console.log(`\n👤 Creating admin user: ${username}`);

        // Create admin user
        const result = await authProvider.createUser(username, password, {
            email: email || undefined,
            roles: ['admin', 'user']
        });

        if (result.success) {
            console.log('✅ Admin user created successfully!');
            console.log(`   User ID: ${result.userId}`);
            console.log(`   Username: ${username}`);
            if (email) {
                console.log(`   Email: ${email}`);
            }
            console.log(`   Roles: admin, user`);
            console.log('\n🔐 Password has been securely hashed and stored.');
            console.log('   You can now login with these credentials.');
        } else {
            console.error(`❌ Failed to create admin user: ${result.error}`);
            process.exit(1);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

// Run the CLI
createAdminUser();
