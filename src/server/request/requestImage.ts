/**
 * @file requestImage.ts
 * @description Secure image storage API with validation, compression, and token-based retrieval
 * @module server/request
 *
 * Provides REST API endpoints for secure image management:
 * - POST /api/image/upload: Upload image with validation and compression
 * - GET /api/image/:token: Retrieve image by secure token
 *
 * SECURITY FEATURES:
 * - Magic byte verification (prevents MIME spoofing)
 * - File size limits (default 10MB)
 * - Dimension validation (max 4096x4096)
 * - Filename sanitization (prevents path traversal)
 * - Token-based access control (64 char random tokens)
 * - SHA-256 hash deduplication
 * - XSS protection via proper Content-Type headers
 *
 * PERFORMANCE:
 * - Automatic compression (JPEG, PNG, WebP)
 * - Progressive JPEG encoding
 * - Base64 storage in ArangoDB
 * - Indexed token field for fast lookups
 *
 * Database Collection:
 * - nodius_images: Stores image data with metadata
 * - Indexed on: token (unique, sparse)
 * - Indexed on: hash (for deduplication)
 */

import { HttpServer, Request, Response } from "../http/HttpServer";
import { DocumentCollection } from "arangojs/collections";
import { ensureCollection, createUniqueToken } from "../utils/arangoUtils";
import { db } from "../server";
import { aql } from "arangojs";
import multer, { type Multer } from "multer";
import {
    ImageDocument,
    ImageMimeType,
    api_image_upload_response,
} from "../../utils/requests/type/api_image.type";
import {
    validateImageBuffer,
    sanitizeFilename,
    DEFAULT_IMAGE_CONFIG,
    ImageValidationError,
    generateSecureToken,
    calculateHash,
} from "../../utils/image/imageValidation";
import { processImage } from "../../utils/image/imageCompression";

/**
 * Configure multer for memory storage (no disk writes)
 * Images are processed in memory for security and performance
 */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: DEFAULT_IMAGE_CONFIG.maxSize, // 10MB default
        files: 1, // Only one file at a time
    },
    fileFilter: (req, file, cb) => {
        // Basic MIME type check (will be verified again with magic bytes)
        if (!file.mimetype.startsWith("image/")) {
            cb(new Error("Only image files are allowed"));
            return;
        }
        cb(null, true);
    },
});

export class RequestImage {
    public static init = async (app: HttpServer) => {
        // Ensure images collection exists
        const image_collection: DocumentCollection = await ensureCollection("nodius_images");

        // Create indexes for performance and uniqueness
        try {
            // Index on token for fast lookups (unique, sparse)
            await image_collection.ensureIndex({
                type: "persistent",
                fields: ["token"],
                unique: true,
                sparse: true,
                name: "idx_token",
            });

            // Index on hash for deduplication checks
            await image_collection.ensureIndex({
                type: "persistent",
                fields: ["hash"],
                sparse: true,
                name: "idx_hash",
            });

            // Index on workspace for filtering (optional)
            await image_collection.ensureIndex({
                type: "persistent",
                fields: ["workspace"],
                sparse: true,
                name: "idx_workspace",
            });

            console.log("✅ Image collection indexes created");
        } catch (error) {
            console.warn("⚠️ Failed to create image indexes (may already exist):", error);
        }

        /**
         * POST /api/image/upload
         * Upload and store an image with validation and compression
         *
         * SECURITY:
         * - Validates MIME type with magic bytes
         * - Checks file size and dimensions
         * - Sanitizes filename
         * - Generates cryptographically secure token
         *
         * Request: multipart/form-data
         * - file: Image file (required)
         * - workspace: Optional workspace ID
         * - metadata: Optional JSON metadata
         *
         * Response: { token, metadata }
         */
        app.post("/api/image/upload", async (req: Request, res: Response) => {
            // Wrap multer in a promise for async/await
            await new Promise<void>((resolve, reject) => {
                upload.single("file")(req as any, res as any, (err: any) => {
                    if (err) reject(err);
                    else resolve();
                });
            }).catch(error => {
                if (error instanceof multer.MulterError) {
                    console.warn(`⚠️ Upload error: ${error.code} - ${error.message}`);
                    return res.status(400).json({
                        error: error.message,
                        code: error.code,
                    });
                }
                throw error;
            });

            try {
                // Check if file was uploaded
                const file = (req as any).file as Express.Multer.File | undefined;
                if (!file) {
                    return res.status(400).json({
                        error: "No file uploaded",
                        code: "NO_FILE",
                    });
                }

                const buffer = file.buffer;
                const claimedMimeType = file.mimetype;
                const originalFilename = file.originalname;

                // Parse optional fields
                const workspace = req.body.workspace || undefined;
                let customMetadata: Record<string, string> | undefined;
                if (req.body.metadata) {
                    try {
                        customMetadata = JSON.parse(req.body.metadata);
                    } catch {
                        return res.status(400).json({
                            error: "Invalid metadata JSON",
                            code: "INVALID_METADATA",
                        });
                    }
                }

                // 1. Validate image buffer (magic bytes, size, MIME type)
                const { mimeType, hash } = validateImageBuffer(
                    buffer,
                    claimedMimeType,
                    DEFAULT_IMAGE_CONFIG
                );

                // 2. Check for duplicate by hash (deduplication)
                const duplicateQuery = aql`
                    FOR doc IN nodius_images
                    FILTER doc.hash == ${hash}
                    LIMIT 1
                    RETURN doc
                `;
                const duplicateCursor = await db.query(duplicateQuery);
                if (await duplicateCursor.hasNext) {
                    const existingImage = (await duplicateCursor.next()) as ImageDocument;
                    // Return existing image token (deduplication)
                    return res.status(200).json({
                        token: existingImage.token,
                        metadata: {
                            originalName: existingImage.originalName,
                            mimeType: existingImage.mimeType,
                            size: existingImage.size,
                            width: existingImage.width,
                            height: existingImage.height,
                            compressed: existingImage.compressed,
                            uploadedAt: existingImage.uploadedAt,
                        },
                        deduplicated: true,
                    } as api_image_upload_response & { deduplicated: boolean });
                }

                // 3. Process image (extract metadata, compress)
                const processed = await processImage(buffer, mimeType, DEFAULT_IMAGE_CONFIG);

                // 4. Generate unique token
                const token = await createUniqueToken(image_collection, 64);

                // 5. Sanitize filename
                const safeFilename = sanitizeFilename(originalFilename);

                // 6. Prepare document
                const imageDoc: Omit<ImageDocument, "_key"> = {
                    token,
                    data: processed.buffer.toString("base64"), // Store as base64
                    mimeType,
                    originalName: safeFilename,
                    size: processed.compressedSize,
                    width: processed.metadata.width,
                    height: processed.metadata.height,
                    compressed: processed.compressed,
                    uploadedAt: new Date().toISOString(),
                    workspace,
                    metadata: customMetadata,
                    hash,
                };

                // 7. Insert into database
                const result = await image_collection.save(imageDoc);

                // 8. Return response
                const response: api_image_upload_response = {
                    token,
                    metadata: {
                        originalName: safeFilename,
                        mimeType,
                        size: processed.compressedSize,
                        width: processed.metadata.width,
                        height: processed.metadata.height,
                        compressed: processed.compressed,
                        uploadedAt: imageDoc.uploadedAt,
                    },
                };

                console.log(`✅ Image uploaded: ${token} (${safeFilename}, ${processed.compressedSize} bytes, ${processed.compressed ? "compressed" : "original"})`);

                res.status(201).json(response);
            } catch (error) {
                // Handle validation errors
                if (error instanceof ImageValidationError) {
                    console.warn(`⚠️ Image validation failed: ${error.code} - ${error.message}`);
                    return res.status(400).json({
                        error: error.message,
                        code: error.code,
                        details: error.details,
                    });
                }

                // Handle multer errors
                if (error instanceof multer.MulterError) {
                    console.warn(`⚠️ Upload error: ${error.code} - ${error.message}`);
                    return res.status(400).json({
                        error: error.message,
                        code: error.code,
                    });
                }

                // Handle unexpected errors
                console.error("❌ Image upload failed:", error);
                res.status(500).json({
                    error: "Internal server error during image upload",
                    code: "INTERNAL_ERROR",
                });
            }
        });

        /**
         * GET /api/image/:token
         * Retrieve an image by its secure token
         *
         * SECURITY:
         * - Token-based access control
         * - Proper Content-Type headers (prevents XSS)
         * - Content-Disposition for download option
         *
         * Query parameters:
         * - download: If "true", forces download instead of inline display
         *
         * Response: Image binary data with appropriate headers
         */
        app.get("/api/image/:token", async (req: Request, res: Response) => {
            try {
                const token = req.params?.token;

                if (!token || typeof token !== "string") {
                    return res.status(400).json({
                        error: "Invalid or missing token",
                        code: "INVALID_TOKEN",
                    });
                }

                // Query image by token (uses index)
                const query = aql`
                    FOR doc IN nodius_images
                    FILTER doc.token == ${token}
                    LIMIT 1
                    RETURN doc
                `;

                const cursor = await db.query(query);

                if (!(await cursor.hasNext)) {
                    return res.status(404).json({
                        error: "Image not found",
                        code: "NOT_FOUND",
                    });
                }

                const imageDoc = (await cursor.next()) as ImageDocument;

                // Decode base64 data
                const imageBuffer = Buffer.from(imageDoc.data, "base64");

                // Set proper headers
                res.setHeader("Content-Type", imageDoc.mimeType);
                res.setHeader("Content-Length", imageBuffer.length);
                res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); // Cache for 1 year

                // Optional download mode
                const forceDownload = req.query?.download === "true";
                if (forceDownload) {
                    res.setHeader(
                        "Content-Disposition",
                        `attachment; filename="${imageDoc.originalName}"`
                    );
                } else {
                    res.setHeader(
                        "Content-Disposition",
                        `inline; filename="${imageDoc.originalName}"`
                    );
                }

                // Send image data
                res.status(200).send(imageBuffer);

                console.log(`✅ Image retrieved: ${token} (${imageDoc.originalName})`);
            } catch (error) {
                console.error("❌ Image retrieval failed:", error);
                res.status(500).json({
                    error: "Internal server error during image retrieval",
                    code: "INTERNAL_ERROR",
                });
            }
        });

        /**
         * DELETE /api/image/:token
         * Delete an image by its token
         *
         * SECURITY:
         * - Requires authentication (protected by auth middleware)
         * - Token-based deletion
         *
         * Response: { success: true, deleted: { token, originalName } }
         */
        app.delete("/api/image/:token", async (req: Request, res: Response) => {
            try {
                const token = req.params?.token;

                if (!token || typeof token !== "string") {
                    return res.status(400).json({
                        error: "Invalid or missing token",
                        code: "INVALID_TOKEN",
                    });
                }

                // Query to find and delete
                const query = aql`
                    FOR doc IN nodius_images
                    FILTER doc.token == ${token}
                    LIMIT 1
                    REMOVE doc IN nodius_images
                    RETURN OLD
                `;

                const cursor = await db.query(query);

                if (!(await cursor.hasNext)) {
                    return res.status(404).json({
                        error: "Image not found",
                        code: "NOT_FOUND",
                    });
                }

                const deletedDoc = (await cursor.next()) as ImageDocument;

                console.log(`✅ Image deleted: ${token} (${deletedDoc.originalName})`);

                res.status(200).json({
                    success: true,
                    deleted: {
                        token: deletedDoc.token,
                        originalName: deletedDoc.originalName,
                    },
                });
            } catch (error) {
                console.error("❌ Image deletion failed:", error);
                res.status(500).json({
                    error: "Internal server error during image deletion",
                    code: "INTERNAL_ERROR",
                });
            }
        });

        /**
         * GET /api/image/metadata/:token
         * Get image metadata without downloading the image
         *
         * Response: { metadata: ImageMetadata }
         */
        app.get("/api/image/metadata/:token", async (req: Request, res: Response) => {
            try {
                const token = req.params?.token;

                if (!token || typeof token !== "string") {
                    return res.status(400).json({
                        error: "Invalid or missing token",
                        code: "INVALID_TOKEN",
                    });
                }

                const query = aql`
                    FOR doc IN nodius_images
                    FILTER doc.token == ${token}
                    LIMIT 1
                    RETURN {
                        token: doc.token,
                        originalName: doc.originalName,
                        mimeType: doc.mimeType,
                        size: doc.size,
                        width: doc.width,
                        height: doc.height,
                        compressed: doc.compressed,
                        uploadedAt: doc.uploadedAt,
                        workspace: doc.workspace,
                        metadata: doc.metadata
                    }
                `;

                const cursor = await db.query(query);

                if (!(await cursor.hasNext)) {
                    return res.status(404).json({
                        error: "Image not found",
                        code: "NOT_FOUND",
                    });
                }

                const metadata = await cursor.next();

                res.status(200).json({ metadata });
            } catch (error) {
                console.error("❌ Image metadata retrieval failed:", error);
                res.status(500).json({
                    error: "Internal server error",
                    code: "INTERNAL_ERROR",
                });
            }
        });
    };
}
