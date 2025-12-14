/**
 * @file requestImage.ts
 * @description Secure image storage API with validation, compression, and access control
 * @module server/request
 *
 * Provides REST API endpoints for secure image management:
 * - POST /api/image/upload: Upload image (workspace required, userId auto-extracted from JWT)
 * - GET /api/image/list: List images by userId/workspace (requires authentication)
 * - GET /api/image/metadata/:token: Get metadata (requires userId match OR workspace match)
 * - GET /api/image/:token: Retrieve image (PUBLIC - no authentication required, token only)
 * - PATCH /api/image/:token: Rename image (requires ownership)
 * - DELETE /api/image/:token: Delete image (requires ownership)
 *
 * SECURITY FEATURES:
 * - Most endpoints require authentication (JWT)
 * - GET /api/image/:token is public (token-based access only)
 * - Access control: userId match OR workspace match for metadata retrieval
 * - Ownership verification for rename/delete operations
 * - Magic byte verification (prevents MIME spoofing)
 * - File size limits (default 10MB)
 * - Dimension validation (max 4096x4096)
 * - Filename sanitization (prevents path traversal)
 * - Token-based access control (64 char random tokens)
 * - SHA-256 hash deduplication (scoped by userId + workspace)
 * - XSS protection via proper Content-Type headers
 *
 * PERFORMANCE:
 * - Automatic compression (JPEG, PNG, WebP)
 * - Progressive JPEG encoding
 * - Base64 storage in ArangoDB
 * - Indexed fields: token, hash, userId, workspace
 *
 * Database Collection:
 * - nodius_images: Stores image data with metadata
 * - Indexed on: token (unique, sparse), hash, userId, workspace
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
import { processImage, resizeAndCompressImage } from "../../utils/image/imageCompression";

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

            // Index on userId for filtering by user (optional)
            await image_collection.ensureIndex({
                type: "persistent",
                fields: ["userId"],
                sparse: true,
                name: "idx_userId",
            });

            // Index on workspace for filtering (optional)
            await image_collection.ensureIndex({
                type: "persistent",
                fields: ["workspace"],
                sparse: true,
                name: "idx_workspace",
            });

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
         * - name: User-defined name for the image (required)
         * - workspace: Workspace ID (required)
         * - metadata: Optional JSON metadata
         *
         * Response: { token, metadata }
         */
        app.post("/api/image/upload", async (req: Request, res: Response) => {
            console.log('📥 Image upload request received');

            try {
                // Wrap multer in a promise for async/await
                await new Promise<void>((resolve, reject) => {
                    upload.single("file")(req as any, res as any, (err: any) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

            } catch (error: any) {
                // Handle multer-specific errors
                if (error instanceof multer.MulterError) {
                    console.warn(`⚠️ Multer upload error: ${error.code} - ${error.message}`);
                    return res.status(400).json({
                        error: error.message,
                        code: error.code,
                    });
                }

                // Handle busboy/multipart errors
                if (error.message && error.message.includes('Unexpected end of form')) {
                    console.warn(`⚠️ Malformed multipart request: ${error.message}`);
                    return res.status(400).json({
                        error: 'Malformed or incomplete multipart/form-data request',
                        code: 'INVALID_MULTIPART',
                        details: error.message
                    });
                }

                // Handle other upload errors
                console.error(`❌ Upload processing error:`, error);
                return res.status(400).json({
                    error: 'Failed to process upload',
                    code: 'UPLOAD_ERROR',
                    details: error.message
                });
            }

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

                // Extract userId from authenticated user (set by auth middleware)
                const userId = (req as any).user?.userId;
                if (!userId) {
                    return res.status(401).json({
                        error: "User ID not found in authentication token",
                        code: "NO_USER_ID",
                    });
                }

                // Workspace is required
                const workspace = req.body.workspace;
                if (!workspace || typeof workspace !== "string" || workspace.trim() === "") {
                    return res.status(400).json({
                        error: "Workspace is required",
                        code: "WORKSPACE_REQUIRED",
                    });
                }

                // Name is required
                const name = req.body.name;
                if (!name || typeof name !== "string" || name.trim() === "") {
                    return res.status(400).json({
                        error: "Image name is required",
                        code: "NAME_REQUIRED",
                    });
                }

                // Parse optional metadata
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

                // 2. Check for duplicate by hash within same userId and workspace (deduplication)
                const duplicateQuery = aql`
                    FOR doc IN nodius_images
                    FILTER doc.hash == ${hash}
                    FILTER doc.userId == ${userId}
                    FILTER doc.workspace == ${workspace}
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
                            name: existingImage.name,
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
                    name: name.trim(),
                    originalName: safeFilename,
                    size: processed.compressedSize,
                    width: processed.metadata.width,
                    height: processed.metadata.height,
                    compressed: processed.compressed,
                    uploadedAt: new Date().toISOString(),
                    userId,
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
                        name: name.trim(),
                        originalName: safeFilename,
                        mimeType,
                        size: processed.compressedSize,
                        width: processed.metadata.width,
                        height: processed.metadata.height,
                        compressed: processed.compressed,
                        uploadedAt: imageDoc.uploadedAt,
                    },
                };

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
         * GET /api/image/list
         * List images filtered by userId and/or workspace
         *
         * SECURITY:
         * - Requires authentication (protected by auth middleware)
         * - Returns metadata by default, or compressed images with maxSize parameter
         *
         * Query parameters:
         * - userId: Filter by user ID (optional)
         * - workspace: Filter by workspace (optional)
         * - limit: Maximum number of results (default: 100, max: 500)
         * - offset: Number of results to skip (default: 0)
         * - maxSize: If specified, returns compressed images with longest dimension <= maxSize (optional)
         *   Useful for image galleries/thumbnails. Returns base64 data in response.
         * - quality: Compression quality 0-100 (default: 85, only used with maxSize)
         *
         * Response: { images: ImageMetadata[] | ImageWithData[], total: number }
         */
        app.get("/api/image/list", async (req: Request, res: Response) => {
            try {
                // Get authenticated user
                const authenticatedUserId = (req as any).user?.userId;

                // Parse query parameters
                const filterUserId = req.query?.userId as string | undefined;
                const filterWorkspace = req.query?.workspace as string | undefined;
                const limit = Math.min(parseInt(req.query?.limit as string) || 100, 500);
                const offset = parseInt(req.query?.offset as string) || 0;
                const maxSize = req.query?.maxSize ? parseInt(req.query.maxSize as string) : undefined;
                const quality = req.query?.quality ? Math.min(Math.max(parseInt(req.query.quality as string), 1), 100) : 85;

                // Build filter conditions
                const filters: string[] = [];
                const bindVars: Record<string, any> = { limit, offset };

                if (filterUserId) {
                    filters.push("FILTER doc.userId == @userId");
                    bindVars.userId = filterUserId;
                }

                if (filterWorkspace) {
                    filters.push("FILTER doc.workspace == @workspace");
                    bindVars.workspace = filterWorkspace;
                }

                // If no filters provided, return images for the authenticated user
                if (filters.length === 0 && authenticatedUserId) {
                    filters.push("FILTER doc.userId == @userId");
                    bindVars.userId = authenticatedUserId;
                }

                const filterClause = filters.join("\n                    ");

                // Determine if we need to include image data (for compression)
                const includeData = maxSize !== undefined;
                // Query images with filters
                const queryStr = `
                    FOR doc IN nodius_images
                    ${filterClause}
                    SORT doc.uploadedAt DESC
                    LIMIT @offset, @limit
                    RETURN {
                        token: doc.token,
                        name: doc.name,
                        originalName: doc.originalName,
                        mimeType: doc.mimeType,
                        size: doc.size,
                        width: doc.width,
                        height: doc.height,
                        compressed: doc.compressed,
                        uploadedAt: doc.uploadedAt,
                        userId: doc.userId,
                        workspace: doc.workspace,
                        metadata: doc.metadata
                        ${includeData ? ',data: doc.data' : ''}
                    }
                `;

                const cursor = await db.query({
                    query: queryStr,
                    bindVars: bindVars
                });
                let images = await cursor.all();

                // If maxSize is specified, compress images
                if (maxSize !== undefined && maxSize > 0) {
                    images = await Promise.all(
                        images.map(async (image: any) => {
                            try {
                                // Decode base64 data
                                const originalBuffer = Buffer.from(image.data, 'base64');

                                // Resize and compress
                                const compressed = await resizeAndCompressImage(
                                    originalBuffer,
                                    image.mimeType,
                                    maxSize,
                                    quality
                                );

                                // Return image with compressed data
                                return {
                                    token: image.token,
                                    name: image.name,
                                    originalName: image.originalName,
                                    mimeType: image.mimeType,
                                    size: image.size,
                                    width: image.width,
                                    height: image.height,
                                    compressed: image.compressed,
                                    uploadedAt: image.uploadedAt,
                                    userId: image.userId,
                                    workspace: image.workspace,
                                    metadata: image.metadata,
                                    // Compressed image data
                                    data: compressed.buffer.toString('base64'),
                                    thumbnailWidth: compressed.width,
                                    thumbnailHeight: compressed.height,
                                    thumbnailSize: compressed.size,
                                };
                            } catch (error) {
                                console.error(`Failed to compress image ${image.token}:`, error);
                                // Return without data if compression fails
                                const { data, ...imageWithoutData } = image;
                                return imageWithoutData;
                            }
                        })
                    );
                }

                // Count total matching images
                const countQueryStr = `
                    FOR doc IN nodius_images
                    ${filterClause}
                    COLLECT WITH COUNT INTO total
                    RETURN total
                `;

                delete bindVars["limit"];
                delete bindVars["offset"];

                const countCursor = await db.query({
                    query: countQueryStr,
                    bindVars: bindVars
                });
                const total = (await countCursor.hasNext) ? await countCursor.next() : 0;

                res.status(200).json({
                    images,
                    total,
                    limit,
                    offset,
                    ...(maxSize !== undefined && { compressed: true, maxSize, quality })
                });

            } catch (error) {
                console.error("❌ Image list retrieval failed:", error);
                res.status(500).json({
                    error: "Internal server error",
                    code: "INTERNAL_ERROR",
                });
            }
        });

        /**
         * GET /api/image/metadata/:token
         * Get image metadata without downloading the image
         *
         * SECURITY:
         * - Requires authentication (protected by auth middleware)
         * - Access control: Only accessible if userId matches OR workspace matches
         *
         * Query parameters:
         * - workspace: Required for workspace-based access
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

                // Get authenticated user
                const authenticatedUserId = (req as any).user?.userId;
                if (!authenticatedUserId) {
                    return res.status(401).json({
                        error: "User ID not found in authentication token",
                        code: "NO_USER_ID",
                    });
                }

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

                // Access control: Check if user has access via userId OR workspace match
                const hasUserIdAccess = imageDoc.userId === authenticatedUserId;

                // Check workspace access: user must provide the workspace in query param
                const requestedWorkspace = req.query?.workspace as string | undefined;
                const hasWorkspaceAccess = requestedWorkspace &&
                    imageDoc.workspace === requestedWorkspace;

                if (!hasUserIdAccess && !hasWorkspaceAccess) {
                    return res.status(403).json({
                        error: "Forbidden: You don't have access to this image",
                        code: "FORBIDDEN",
                        details: "Access requires matching userId or workspace parameter"
                    });
                }

                // Return metadata
                const metadata = {
                    token: imageDoc.token,
                    name: imageDoc.name,
                    originalName: imageDoc.originalName,
                    mimeType: imageDoc.mimeType,
                    size: imageDoc.size,
                    width: imageDoc.width,
                    height: imageDoc.height,
                    compressed: imageDoc.compressed,
                    uploadedAt: imageDoc.uploadedAt,
                    userId: imageDoc.userId,
                    workspace: imageDoc.workspace,
                    metadata: imageDoc.metadata
                };

                res.status(200).json({ metadata });
            } catch (error) {
                console.error("❌ Image metadata retrieval failed:", error);
                res.status(500).json({
                    error: "Internal server error",
                    code: "INTERNAL_ERROR",
                });
            }
        });

        /**
         * GET /api/image/:token
         * Retrieve an image by its secure token (public endpoint)
         *
         * SECURITY:
         * - Public access (no authentication required)
         * - Token-based access only
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

            } catch (error) {
                console.error("❌ Image retrieval failed:", error);
                res.status(500).json({
                    error: "Internal server error during image retrieval",
                    code: "INTERNAL_ERROR",
                });
            }
        });

        /**
         * PATCH /api/image/:token
         * Update image metadata (name)
         *
         * SECURITY:
         * - Requires authentication (protected by auth middleware)
         * - Verifies ownership: Only the user who uploaded can rename
         * - Token-based update
         *
         * Request body:
         * - name: New name for the image (required)
         *
         * Response: { success: true, updated: { token, name } }
         */
        app.patch("/api/image/:token", async (req: Request, res: Response) => {
            try {
                const token = req.params?.token;

                if (!token || typeof token !== "string") {
                    return res.status(400).json({
                        error: "Invalid or missing token",
                        code: "INVALID_TOKEN",
                    });
                }

                // Get new name from body
                const newName = req.body?.name;
                if (!newName || typeof newName !== "string" || newName.trim() === "") {
                    return res.status(400).json({
                        error: "New name is required",
                        code: "NAME_REQUIRED",
                    });
                }

                // Get authenticated user
                const authenticatedUserId = (req as any).user?.userId;

                // First, find the image to check ownership
                const findQuery = aql`
                    FOR doc IN nodius_images
                    FILTER doc.token == ${token}
                    LIMIT 1
                    RETURN doc
                `;

                const findCursor = await db.query(findQuery);

                if (!(await findCursor.hasNext)) {
                    return res.status(404).json({
                        error: "Image not found",
                        code: "NOT_FOUND",
                    });
                }

                const imageDoc = (await findCursor.next()) as ImageDocument;

                // Verify ownership: user can only rename their own images
                if (imageDoc.userId && imageDoc.userId !== authenticatedUserId) {
                    return res.status(403).json({
                        error: "Forbidden: You can only rename your own images",
                        code: "FORBIDDEN",
                    });
                }

                // Update the image name
                const updateQuery = aql`
                    FOR doc IN nodius_images
                    FILTER doc.token == ${token}
                    UPDATE doc WITH { name: ${newName.trim()} } IN nodius_images
                    RETURN NEW
                `;

                const updateCursor = await db.query(updateQuery);
                const updatedDoc = (await updateCursor.next()) as ImageDocument;

                console.log(`✅ Image renamed: ${token} (${imageDoc.name} → ${newName.trim()}) by user ${authenticatedUserId}`);

                res.status(200).json({
                    success: true,
                    updated: {
                        token: updatedDoc.token,
                        name: updatedDoc.name,
                    },
                });
            } catch (error) {
                console.error("❌ Image rename failed:", error);
                res.status(500).json({
                    error: "Internal server error during image rename",
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
         * - Verifies ownership: Only the user who uploaded can delete
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

                // Get authenticated user
                const authenticatedUserId = (req as any).user?.userId;

                // First, find the image to check ownership
                const findQuery = aql`
                    FOR doc IN nodius_images
                    FILTER doc.token == ${token}
                    LIMIT 1
                    RETURN doc
                `;

                const findCursor = await db.query(findQuery);

                if (!(await findCursor.hasNext)) {
                    return res.status(404).json({
                        error: "Image not found",
                        code: "NOT_FOUND",
                    });
                }

                const imageDoc = (await findCursor.next()) as ImageDocument;

                // Verify ownership: user can only delete their own images
                if (imageDoc.userId && imageDoc.userId !== authenticatedUserId) {
                    return res.status(403).json({
                        error: "Forbidden: You can only delete your own images",
                        code: "FORBIDDEN",
                    });
                }

                // Delete the image
                const deleteQuery = aql`
                    FOR doc IN nodius_images
                    FILTER doc.token == ${token}
                    LIMIT 1
                    REMOVE doc IN nodius_images
                    RETURN OLD
                `;

                const deleteCursor = await db.query(deleteQuery);
                const deletedDoc = (await deleteCursor.next()) as ImageDocument;


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
    };
}
