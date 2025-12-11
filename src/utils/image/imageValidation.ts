/**
 * @file imageValidation.ts
 * @description Secure image validation utilities with magic byte verification
 * @module utils/image
 *
 * Provides comprehensive security validation for image uploads:
 * - Magic byte verification (prevents MIME type spoofing)
 * - Size and dimension limits
 * - Format detection and validation
 * - Token generation with cryptographic randomness
 * - Hash calculation for deduplication
 *
 * SECURITY FEATURES:
 * - Validates actual file content, not just MIME type
 * - Prevents buffer overflow attacks via size limits
 * - Protects against zip bombs via dimension limits
 * - Uses crypto.randomBytes for secure token generation
 * - Sanitizes filenames to prevent path traversal
 */

import crypto from "crypto";
import { ImageMimeType, ImageValidationConfig } from "../requests/type/api_image.type";

/**
 * Magic bytes (file signatures) for supported image formats
 * Used to verify actual file type regardless of MIME type claim
 */
const MAGIC_BYTES: Record<ImageMimeType, Buffer[]> = {
    "image/jpeg": [
        Buffer.from([0xFF, 0xD8, 0xFF]), // JPEG
    ],
    "image/png": [
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), // PNG
    ],
    "image/webp": [
        Buffer.from([0x52, 0x49, 0x46, 0x46]), // RIFF (WebP starts with RIFF)
    ],
    "image/gif": [
        Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]), // GIF87a
        Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), // GIF89a
    ],
};

/**
 * Default validation configuration
 */
export const DEFAULT_IMAGE_CONFIG: ImageValidationConfig = {
    maxSize: 10 * 1024 * 1024, // 10MB
    maxWidth: 4096,
    maxHeight: 4096,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    compress: true,
    compressionQuality: 85,
};

/**
 * Validation error types
 */
export class ImageValidationError extends Error {
    constructor(
        message: string,
        public code: string,
        public details?: any
    ) {
        super(message);
        this.name = "ImageValidationError";
    }
}

/**
 * Verify file magic bytes match claimed MIME type
 * CRITICAL SECURITY: Prevents MIME type spoofing attacks
 */
export function verifyMagicBytes(buffer: Buffer, mimeType: ImageMimeType): boolean {
    const signatures = MAGIC_BYTES[mimeType];
    if (!signatures) {
        return false;
    }

    return signatures.some((signature) => {
        if (buffer.length < signature.length) {
            return false;
        }
        return buffer.subarray(0, signature.length).equals(signature);
    });
}

/**
 * Detect actual MIME type from buffer content
 * Returns null if not a recognized image format
 */
export function detectMimeType(buffer: Buffer): ImageMimeType | null {
    for (const [mimeType, signatures] of Object.entries(MAGIC_BYTES)) {
        for (const signature of signatures) {
            if (buffer.length >= signature.length) {
                if (buffer.subarray(0, signature.length).equals(signature)) {
                    // Additional check for WebP (must have WEBP at offset 8)
                    if (mimeType === "image/webp") {
                        if (buffer.length >= 12) {
                            const webpMarker = buffer.subarray(8, 12);
                            if (webpMarker.equals(Buffer.from([0x57, 0x45, 0x42, 0x50]))) {
                                return mimeType as ImageMimeType;
                            }
                        }
                    } else {
                        return mimeType as ImageMimeType;
                    }
                }
            }
        }
    }
    return null;
}

/**
 * Validate file size
 * SECURITY: Prevents DoS attacks via large file uploads
 */
export function validateFileSize(
    size: number,
    config: ImageValidationConfig = DEFAULT_IMAGE_CONFIG
): void {
    if (size <= 0) {
        throw new ImageValidationError(
            "Invalid file size: file is empty",
            "EMPTY_FILE"
        );
    }

    if (size > config.maxSize) {
        throw new ImageValidationError(
            `File size ${size} bytes exceeds maximum allowed size ${config.maxSize} bytes`,
            "FILE_TOO_LARGE",
            { size, maxSize: config.maxSize }
        );
    }
}

/**
 * Validate image dimensions
 * SECURITY: Prevents zip bomb/decompression bomb attacks
 */
export function validateDimensions(
    width: number,
    height: number,
    config: ImageValidationConfig = DEFAULT_IMAGE_CONFIG
): void {
    if (width <= 0 || height <= 0) {
        throw new ImageValidationError(
            "Invalid dimensions: width and height must be positive",
            "INVALID_DIMENSIONS",
            { width, height }
        );
    }

    if (width > config.maxWidth) {
        throw new ImageValidationError(
            `Image width ${width}px exceeds maximum ${config.maxWidth}px`,
            "WIDTH_TOO_LARGE",
            { width, maxWidth: config.maxWidth }
        );
    }

    if (height > config.maxHeight) {
        throw new ImageValidationError(
            `Image height ${height}px exceeds maximum ${config.maxHeight}px`,
            "HEIGHT_TOO_LARGE",
            { height, maxHeight: config.maxHeight }
        );
    }

    // Additional check: prevent extremely large pixel count (zip bomb)
    const pixelCount = width * height;
    const maxPixels = config.maxWidth * config.maxHeight;
    if (pixelCount > maxPixels) {
        throw new ImageValidationError(
            `Image pixel count ${pixelCount} exceeds maximum ${maxPixels}`,
            "TOO_MANY_PIXELS",
            { pixelCount, maxPixels }
        );
    }
}

/**
 * Validate MIME type is allowed
 */
export function validateMimeType(
    mimeType: string,
    config: ImageValidationConfig = DEFAULT_IMAGE_CONFIG
): ImageMimeType {
    if (!config.allowedMimeTypes.includes(mimeType as ImageMimeType)) {
        throw new ImageValidationError(
            `MIME type ${mimeType} is not allowed. Allowed types: ${config.allowedMimeTypes.join(", ")}`,
            "INVALID_MIME_TYPE",
            { mimeType, allowedTypes: config.allowedMimeTypes }
        );
    }
    return mimeType as ImageMimeType;
}

/**
 * Sanitize filename to prevent path traversal attacks
 * Removes: ../, ..\, absolute paths, null bytes, control characters
 */
export function sanitizeFilename(filename: string): string {
    if (!filename || typeof filename !== "string") {
        return "unnamed.bin";
    }

    // Remove null bytes and control characters
    let safe = filename.replace(/[\x00-\x1F\x7F]/g, "");

    // Remove path components (both Unix and Windows)
    safe = safe.replace(/^.*[/\\]/, "");

    // Remove leading dots (hidden files)
    safe = safe.replace(/^\.+/, "");

    // Remove dangerous patterns
    safe = safe.replace(/\.\./g, "");

    // Limit length
    if (safe.length > 255) {
        const ext = safe.substring(safe.lastIndexOf("."));
        safe = safe.substring(0, 255 - ext.length) + ext;
    }

    // If nothing left, use default
    if (!safe || safe.length === 0) {
        return "unnamed.bin";
    }

    return safe;
}

/**
 * Generate cryptographically secure random token
 * Uses crypto.randomBytes for security
 */
export function generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString("base64url");
}

/**
 * Calculate SHA-256 hash of buffer
 * Used for deduplication and integrity verification
 */
export function calculateHash(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Comprehensive validation of image buffer
 * SECURITY: Performs all security checks
 */
export function validateImageBuffer(
    buffer: Buffer,
    claimedMimeType: string,
    config: ImageValidationConfig = DEFAULT_IMAGE_CONFIG
): { mimeType: ImageMimeType; hash: string } {
    // 1. Validate file size
    validateFileSize(buffer.length, config);

    // 2. Validate claimed MIME type is allowed
    const validMimeType = validateMimeType(claimedMimeType, config);

    // 3. Detect actual MIME type from content
    const detectedMimeType = detectMimeType(buffer);
    if (!detectedMimeType) {
        throw new ImageValidationError(
            "Could not detect valid image format from file content",
            "INVALID_IMAGE_FORMAT"
        );
    }

    // 4. CRITICAL: Verify claimed type matches detected type
    if (validMimeType !== detectedMimeType) {
        throw new ImageValidationError(
            `MIME type mismatch: claimed ${validMimeType} but detected ${detectedMimeType}`,
            "MIME_TYPE_MISMATCH",
            { claimed: validMimeType, detected: detectedMimeType }
        );
    }

    // 5. Verify magic bytes
    if (!verifyMagicBytes(buffer, detectedMimeType)) {
        throw new ImageValidationError(
            "File signature (magic bytes) verification failed",
            "INVALID_SIGNATURE"
        );
    }

    // 6. Calculate hash for deduplication
    const hash = calculateHash(buffer);

    return { mimeType: detectedMimeType, hash };
}
