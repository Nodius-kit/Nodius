/**
 * @file generateCert.ts
 * @description Self-signed certificate generation utility using selfsigned package
 * @module server/utils
 *
 * Generates self-signed SSL certificates for HTTPS development.
 * Uses the 'selfsigned' npm package for reliable certificate generation.
 */

import * as fs from 'fs';
import * as path from 'path';
import {SubjectAltNameEntry} from "selfsigned";

interface CertificateOptions {
    commonName?: string;
    organization?: string;
    country?: string;
    validityDays?: number;
    outputDir?: string | string[];
    keyFilename?: string;
    certFilename?: string;
    /** Additional IP addresses to include in SAN */
    altIPs?: string[];
    /** Additional DNS names to include in SAN */
    altNames?: string[];
}

interface GeneratedCertificate {
    key: string;
    cert: string;
    keyPath: string | string[];
    certPath: string | string[];
}

/**
 * Generate a self-signed certificate using selfsigned package
 * @param options - Certificate generation options
 * @returns Object containing the key and certificate content and file paths
 */
export async function generateSelfSignedCert(options: CertificateOptions = {}): Promise<GeneratedCertificate> {
    const {
        commonName = 'localhost',
        organization = 'Nodius Development',
        country = 'US',
        validityDays = 365,
        outputDir = path.join(process.cwd(), 'certs'),
        keyFilename = 'server.key',
        certFilename = 'server.crt',
        altIPs = [],
        altNames = []
    } = options;

    // Normalize outputDir to array
    const isArray = Array.isArray(outputDir);
    const outputDirs = isArray ? outputDir : [outputDir];

    // Filter directories to only those where parent exists or can be created
    const validOutputDirs: string[] = [];
    for (const dir of outputDirs) {
        const parentDir = path.dirname(dir);
        if (fs.existsSync(parentDir)) {
            // Parent exists, we can create the directory
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            validOutputDirs.push(dir);
        } else {
            console.warn(`Skipping output directory ${dir} - parent directory does not exist`);
        }
    }

    if (validOutputDirs.length === 0) {
        throw new Error('No valid output directories found (all parent directories do not exist)');
    }

    const keyPaths = validOutputDirs.map(dir => path.join(dir, keyFilename));
    const certPaths = validOutputDirs.map(dir => path.join(dir, certFilename));

    // Dynamically import selfsigned (it's an ES module)
    const selfsigned = await import('selfsigned');

    // Build attributes
    const attrs = [
        { name: 'commonName', value: commonName },
        { name: 'countryName', value: country },
        { name: 'organizationName', value: organization }
    ];

    // Build Subject Alternative Names
    const altNamesList: Array<SubjectAltNameEntry> = [];

    // Add DNS names
    altNamesList.push({ type: 2, value: commonName }); // DNS name for commonName
    if (commonName !== 'localhost') {
        altNamesList.push({ type: 2, value: 'localhost' });
    }
    for (const name of altNames) {
        if (!altNamesList.some(a => a.type === 2 && a.value === name)) {
            altNamesList.push({ type: 2, value: name });
        }
    }

    // Add IP addresses
    altNamesList.push({ type: 7, ip: '127.0.0.1' }); // Localhost IPv4

    // Check if commonName is an IP address
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(commonName)) {
        altNamesList.push({ type: 7, ip: commonName });
    }

    // Add additional IPs
    for (const ip of altIPs) {
        if (!altNamesList.some(a => a.type === 7 && a.ip === ip)) {
            altNamesList.push({ type: 7, ip: ip });
        }
    }

    // Generate certificate
    const pems = await selfsigned.generate(attrs, {
        keySize: 2048,
        algorithm: 'sha256',
        extensions: [
            {
                name: 'basicConstraints',
                cA: true
            },
            {
                name: 'keyUsage',
                keyCertSign: true,
                digitalSignature: true,
                keyEncipherment: true
            },
            {
                name: 'extKeyUsage',
                serverAuth: true,
                clientAuth: true
            },
            {
                name: 'subjectAltName',
                altNames: altNamesList
            }
        ]
    });

    // Write files to all valid directories
    for (let i = 0; i < validOutputDirs.length; i++) {
        fs.writeFileSync(keyPaths[i], pems.private, 'utf-8');
        fs.writeFileSync(certPaths[i], pems.cert, 'utf-8');
    }

    console.log(`Generated self-signed certificate:`);
    if (validOutputDirs.length === 1) {
        console.log(`  Key: ${keyPaths[0]}`);
        console.log(`  Cert: ${certPaths[0]}`);
    } else {
        console.log(`  Written to ${validOutputDirs.length} locations:`);
        validOutputDirs.forEach((dir, i) => {
            console.log(`    ${i + 1}. ${dir}/`);
            console.log(`       Key: ${keyPaths[i]}`);
            console.log(`       Cert: ${certPaths[i]}`);
        });
    }
    console.log(`  Valid for: ${validityDays} days`);
    console.log(`  Common Name: ${commonName}`);
    console.log(`  Subject Alt Names: ${altNamesList.map(a => a.value || a.ip).join(', ')}`);

    return {
        key: pems.private,
        cert: pems.cert,
        keyPath: isArray ? keyPaths : keyPaths[0],
        certPath: isArray ? certPaths : certPaths[0]
    };
}

/**
 * Load existing certificate or generate new one if not exists
 * @param options - Certificate options
 * @returns Certificate and key content
 */
export async function loadOrGenerateCert(options: CertificateOptions = {}): Promise<{ key: string; cert: string }> {
    const {
        outputDir = path.join(process.cwd(), 'certs'),
        keyFilename = 'server.key',
        certFilename = 'server.crt'
    } = options;

    // Use first directory for checking existence
    const checkDir = Array.isArray(outputDir) ? outputDir[0] : outputDir;
    const keyPath = path.join(checkDir, keyFilename);
    const certPath = path.join(checkDir, certFilename);

    // Check if certificate files already exist in the first directory
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        console.log(`Loading existing certificate from ${checkDir}`);
        return {
            key: fs.readFileSync(keyPath, 'utf-8'),
            cert: fs.readFileSync(certPath, 'utf-8')
        };
    }

    // Generate new certificate (will write to all directories if array provided)
    console.log(`Generating new self-signed certificate...`);
    const result = await generateSelfSignedCert(options);
    return {
        key: result.key,
        cert: result.cert
    };
}

// CLI support - run directly to generate certificate
const isMainModule = process.argv[1]?.endsWith('generateCert.ts') || process.argv[1]?.endsWith('generateCert.js');
if (isMainModule) {
    const args = process.argv.slice(2);
    const options: CertificateOptions = {};
    const outputDirs: string[] = [];

    for (const arg of args) {
        const [key, value] = arg.split('=');
        switch (key) {
            case 'cn':
            case 'commonName':
                options.commonName = value;
                break;
            case 'org':
            case 'organization':
                options.organization = value;
                break;
            case 'country':
                options.country = value;
                break;
            case 'days':
            case 'validityDays':
                options.validityDays = parseInt(value, 10);
                break;
            case 'output':
            case 'outputDir':
                outputDirs.push(value);
                break;
            case 'ip':
                options.altIPs = [...(options.altIPs || []), value];
                break;
        }
    }

    // Set outputDir based on collected values
    if (outputDirs.length === 1) {
        options.outputDir = outputDirs[0];
    } else if (outputDirs.length > 1) {
        options.outputDir = outputDirs;
    }

    generateSelfSignedCert(options).catch(console.error);
}
