/**
 * @file nodiusFileCodec.ts
 * @description Encode/decode utilities for the .ndex binary export format
 * @module server/utils
 *
 * Binary format (.ndex):
 *   Offset  Size     Content
 *   0       4 bytes  Magic: "NDEX" (0x4E 0x44 0x45 0x58)
 *   4       1 byte   Format version: 0x01
 *   5       1 byte   Export type: 0x01=Graph, 0x02=HtmlGraph, 0x03=NodeConfig
 *   6       16 bytes IV (AES-256-CBC)
 *   22      N bytes  Encrypted payload
 *
 * Pipeline encode: JSON.stringify → zlib.deflateSync → AES-256-CBC encrypt → header + ciphertext
 * Pipeline decode: header validation → AES-256-CBC decrypt → zlib.inflateSync → JSON.parse
 */

import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from "crypto";
import { deflateSync, inflateSync } from "zlib";

const MAGIC = Buffer.from("NDEX", "ascii");
const FORMAT_VERSION = 0x01;
const HEADER_SIZE = 22; // 4 magic + 1 version + 1 type + 16 IV
const SALT = "nodius-ndex-salt";

export const ExportType = {
    GRAPH: 0x01,
    HTML_GRAPH: 0x02,
    NODE_CONFIG: 0x03,
} as const;

export type ExportTypeValue = (typeof ExportType)[keyof typeof ExportType];

const VALID_TYPES = new Set<number>([ExportType.GRAPH, ExportType.HTML_GRAPH, ExportType.NODE_CONFIG]);

function deriveKey(secret: string): Buffer {
    return scryptSync(secret, SALT, 32) as Buffer;
}

function getSecret(): string {
    return process.env.NODIUS_EXPORT_SECRET || "nodius-default-export-key";
}

/**
 * Encode a payload into the .ndex binary format
 */
export function encodeNodiusFile(
    payload: any,
    options: { exportType: ExportTypeValue; secret?: string },
): Buffer {
    const key = deriveKey(options.secret ?? getSecret());
    const iv = randomBytes(16);

    // JSON → compress → encrypt
    const json = JSON.stringify(payload);
    const compressed = deflateSync(Buffer.from(json, "utf-8"));

    const cipher = createCipheriv("aes-256-cbc", key, iv);
    const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);

    // Build header + ciphertext
    const header = Buffer.alloc(HEADER_SIZE);
    MAGIC.copy(header, 0);
    header.writeUInt8(FORMAT_VERSION, 4);
    header.writeUInt8(options.exportType, 5);
    iv.copy(header, 6);

    return Buffer.concat([header, encrypted]);
}

/**
 * Decode a .ndex binary buffer back into its payload
 */
export function decodeNodiusFile(
    buffer: Buffer,
    secret?: string,
): { exportType: ExportTypeValue; version: number; payload: any } {
    if (buffer.length < HEADER_SIZE) {
        throw new Error("Invalid .ndex file: too small");
    }

    // Validate magic
    if (buffer.subarray(0, 4).toString("ascii") !== "NDEX") {
        throw new Error("Invalid .ndex file: bad magic header");
    }

    const version = buffer.readUInt8(4);
    if (version !== FORMAT_VERSION) {
        throw new Error(`Unsupported .ndex version: ${version}`);
    }

    const exportType = buffer.readUInt8(5) as ExportTypeValue;
    if (!VALID_TYPES.has(exportType)) {
        throw new Error(`Unknown export type: ${exportType}`);
    }

    const iv = buffer.subarray(6, 22);
    const encrypted = buffer.subarray(22);

    const key = deriveKey(secret ?? getSecret());

    // Decrypt → decompress → parse
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    let decrypted: Buffer;
    try {
        decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    } catch {
        throw new Error("Decryption failed: invalid key or corrupted file");
    }

    const decompressed = inflateSync(decrypted);
    const payload = JSON.parse(decompressed.toString("utf-8"));

    return { exportType, version, payload };
}
