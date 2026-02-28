/**
 * Run all AI test scripts sequentially.
 *
 * Usage: npx tsx packages/server/test-ai/run-all.ts
 */

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../../..");

const tests = [
    { name: "Unit Tests (vitest)", file: "packages/server", command: "npx vitest run" },
    { name: "DeepSeek Connection", file: "packages/server/test-ai/test-deepseek.ts" },
    { name: "Tool Calling", file: "packages/server/test-ai/test-tools.ts" },
    { name: "RAG Pipeline", file: "packages/server/test-ai/test-rag.ts" },
    { name: "Provider Test", file: "packages/server/test-ai/test-provider.ts" },
    { name: "Integration Tests", file: "packages/server/test-ai/test-integration.ts" },
];

const introspectScripts = [
    { name: "Dump Context", command: `npx tsx packages/server/test-ai/introspect/dump-context.ts "NBA stats"` },
    { name: "Dump Tools", command: `npx tsx packages/server/test-ai/introspect/dump-tools.ts` },
    { name: "Dump Prompt", command: `npx tsx packages/server/test-ai/introspect/dump-prompt.ts "Que fait le fetch-api?"` },
];

console.log("╔═══════════════════════════════════════════════════╗");
console.log("║          Nodius AI Test Suite Runner              ║");
console.log("╚═══════════════════════════════════════════════════╝\n");

let passed = 0;
let failed = 0;

// Run tests
for (const test of tests) {
    console.log(`\n▶ Running: ${test.name}\n`);

    const cmd = test.command ?? `npx tsx ${test.file}`;

    try {
        execSync(cmd, {
            cwd: test.command ? resolve(__dirname, "../../..") : rootDir,
            stdio: "inherit",
            env: { ...process.env },
            timeout: 120_000,
        });
        passed++;
        console.log(`\n✓ ${test.name}: PASSED\n`);
    } catch {
        failed++;
        console.log(`\n✗ ${test.name}: FAILED\n`);
    }
}

// Run introspection scripts (informational, don't count as pass/fail)
const runIntrospect = process.argv.includes("--introspect");
if (runIntrospect) {
    console.log("\n╔═══════════════════════════════════════════════════╗");
    console.log("║          Introspection Scripts                    ║");
    console.log("╚═══════════════════════════════════════════════════╝\n");

    for (const script of introspectScripts) {
        console.log(`\n▶ ${script.name}\n`);
        try {
            execSync(script.command, {
                cwd: rootDir,
                stdio: "inherit",
                env: { ...process.env },
                timeout: 30_000,
            });
        } catch {
            console.log(`  (introspect script failed — informational only)`);
        }
    }
}

console.log("\n╔═══════════════════════════════════════════════════╗");
console.log(`║  Results: ${passed} passed, ${failed} failed, ${tests.length} total`);
if (!runIntrospect) {
    console.log(`║  Tip: add --introspect to also run introspection scripts`);
}
console.log("╚═══════════════════════════════════════════════════╝");

if (failed > 0) process.exit(1);
