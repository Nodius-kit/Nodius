/**
 * @file env.ts
 * @description Command line argument parsing utilities for server configuration
 * @module server/utils
 *
 * Provides utilities for parsing command line arguments:
 * - parseArgs: Parse key=value arguments from command line
 * - get method: Retrieve argument value with optional default
 *
 * Key features:
 * - Simple key=value format parsing
 * - Default value support
 * - Handles values containing '=' character
 * - Returns convenient getter interface
 *
 * @example
 * // Usage: node server.js port=8080 host=localhost
 * const args = parseArgs();
 * const port = args.get('port', '3000');
 */

// Utility function to parse command line arguments as key=value pairs
export const parseArgs = (args: string[] = process.argv.slice(2)) => {
    const parsed: Record<string, string> = {};

    args.forEach(arg => {
        const [key, ...valueParts] = arg.split('=');
        if (valueParts.length > 0) {
            parsed[key] = valueParts.join('='); // Handle values with = in them
        }
    });

    return {
        get: (key: string, defaultValue?: string) => parsed[key] ?? defaultValue
    };
}
