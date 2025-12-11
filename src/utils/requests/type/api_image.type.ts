/**
 * @file api_image.type.ts
 * @description Type definitions for secure image storage API
 * @module requests/type
 *
 * API request/response types for image operations:
 * - api_image_upload: Upload image with validation and compression
 * - api_image_retrieve: Retrieve image by secure token
 * - ImageMetadata: Stored image information in database
 *
 * Key features:
 * - Strict MIME type validation (image/jpeg, image/png, image/webp, image/gif)
 * - Size and dimension limits for security
 * - Automatic compression for supported formats
 * - Token-based access control
 * - XSS and injection protection
 */

/**
 * Supported image MIME types
 */
export type ImageMimeType =
    | "image/jpeg"
    | "image/png"
    | "image/webp"
    | "image/gif";

/**
 * Upload image request (multipart/form-data)
 */
export interface api_image_upload {
    /** Image file (multipart upload) */
    file: Buffer;
    /** Original filename for reference */
    filename: string;
    /** Image MIME type */
    mimeType: ImageMimeType;
    /** Optional workspace/user context */
    workspace?: string;
    /** Optional custom metadata */
    metadata?: Record<string, string>;
}

/**
 * Upload image response
 */
export interface api_image_upload_response {
    /** Secure token to retrieve the image */
    token: string;
    /** Image metadata */
    metadata: {
        /** Original filename */
        originalName: string;
        /** Final MIME type (may differ if converted) */
        mimeType: ImageMimeType;
        /** File size in bytes (compressed) */
        size: number;
        /** Image width in pixels */
        width: number;
        /** Image height in pixels */
        height: number;
        /** Whether the image was compressed */
        compressed: boolean;
        /** Upload timestamp */
        uploadedAt: string;
    };
}

/**
 * Retrieve image request (query parameters)
 */
export interface api_image_retrieve {
    /** Secure token */
    token: string;
}

/**
 * Image document stored in ArangoDB
 */
export interface ImageDocument {
    /** ArangoDB document key */
    _key: string;
    /** Secure access token (indexed) */
    token: string;
    /** Image data (base64 encoded) */
    data: string;
    /** MIME type */
    mimeType: ImageMimeType;
    /** Original filename */
    originalName: string;
    /** File size in bytes */
    size: number;
    /** Image width */
    width: number;
    /** Image height */
    height: number;
    /** Whether compressed */
    compressed: boolean;
    /** Upload timestamp (ISO string) */
    uploadedAt: string;
    /** Optional workspace */
    workspace?: string;
    /** Optional custom metadata */
    metadata?: Record<string, string>;
    /** SHA-256 hash of original data (deduplication) */
    hash: string;
}

/**
 * Image validation configuration
 */
export interface ImageValidationConfig {
    /** Maximum file size in bytes (default: 10MB) */
    maxSize: number;
    /** Maximum width in pixels (default: 4096) */
    maxWidth: number;
    /** Maximum height in pixels (default: 4096) */
    maxHeight: number;
    /** Allowed MIME types */
    allowedMimeTypes: ImageMimeType[];
    /** Whether to compress images (default: true) */
    compress: boolean;
    /** Compression quality 0-100 (default: 85) */
    compressionQuality: number;
}
