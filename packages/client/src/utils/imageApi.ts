/**
 * @file imageApi.ts
 * @description Client-side utility for secure image upload and retrieval
 * @module client/utils
 *
 * Provides easy-to-use functions for interacting with the Image Storage API:
 * - uploadImage: Upload image with validation and progress tracking (workspace required)
 * - getImageUrl: Get URL for displaying images (supports workspace-based access)
 * - getImageMetadata: Fetch image metadata without downloading (supports workspace-based access)
 * - listImages: List images filtered by userId and/or workspace
 * - renameImage: Rename image by token (ownership verified)
 * - deleteImage: Delete image by token (ownership verified)
 * - downloadImage: Download image to user's device
 *
 * SECURITY:
 * - All endpoints require authentication (JWT token)
 * - Images are scoped by userId and workspace
 * - Access control: userId match OR workspace match required for retrieval
 * - Upload requires workspace parameter
 * - Rename/Delete requires ownership (userId match)
 *
 * USAGE:
 * ```typescript
 * import { uploadImage, getImageUrl, listImages } from './utils/imageApi';
 *
 * // Upload image (name and workspace required)
 * const { token } = await uploadImage(file, {
 *   name: 'My Image',
 *   workspace: 'my-workspace',
 *   onProgress: (percent) => console.log(`${percent}%`)
 * });
 *
 * // Display your own image
 * <img src={getImageUrl(token)} alt="Uploaded" />
 *
 * // Display image from specific workspace
 * <img src={getImageUrl(token, { workspace: 'my-workspace' })} alt="Shared" />
 *
 * // List images by workspace with thumbnails
 * const { images } = await listImages({
 *   workspace: 'my-workspace',
 *   maxSize: 200 // Get 200px thumbnails
 * });
 * ```
 */

import { ImageMimeType } from "@nodius/utils";

/**
 * Image upload options
 */
export interface ImageUploadOptions {
    /** User-defined name for the image (required) */
    name: string;
    /** Workspace identifier (required) */
    workspace: string;
    /** Optional custom metadata */
    metadata?: Record<string, string>;
    /** Progress callback (0-100) */
    onProgress?: (percent: number) => void;
    /** Custom API URL (defaults to VITE_API_URL) */
    apiUrl?: string;
    /** Custom JWT token (defaults to localStorage) */
    jwtToken?: string;
}

/**
 * Image upload result
 */
export interface ImageUploadResult {
    /** Unique access token */
    token: string;
    /** Image metadata */
    metadata: {
        name: string;
        originalName: string;
        mimeType: ImageMimeType;
        size: number;
        width: number;
        height: number;
        compressed: boolean;
        uploadedAt: string;
    };
    /** Whether this was a deduplicated upload */
    deduplicated?: boolean;
}

/**
 * Image metadata response
 */
export interface ImageMetadataResponse {
    metadata: {
        token: string;
        name: string;
        originalName: string;
        mimeType: ImageMimeType;
        size: number;
        width: number;
        height: number;
        compressed: boolean;
        uploadedAt: string;
        userId: string;
        workspace: string;
        metadata?: Record<string, string>;
    };
}

/**
 * API error response
 */
export interface ImageApiError {
    error: string;
    code: string;
    details?: any;
}

/**
 * Custom error class for image API errors
 */
export class ImageApiException extends Error {
    constructor(
        message: string,
        public code: string,
        public details?: any
    ) {
        super(message);
        this.name = "ImageApiException";
    }
}

/**
 * Get API base URL from environment or custom override
 */
function getApiUrl(customUrl?: string): string {
    return customUrl || import.meta.env.VITE_API_URL || "http://localhost:8426";
}

/**
 * Get JWT token from localStorage or custom override
 */
function getJwtToken(customToken?: string): string {
    if (customToken) return customToken;

    const token = localStorage.getItem("authToken");
    if (!token) {
        throw new ImageApiException(
            "No JWT token found. Please login first.",
            "NO_TOKEN"
        );
    }
    return token;
}

/**
 * Upload an image to the server
 *
 * @param file - File or Blob to upload
 * @param options - Upload options (name and workspace are required)
 * @returns Upload result with token and metadata
 *
 * @example
 * // Upload with name and workspace
 * const result = await uploadImage(file, {
 *   name: 'Profile Photo',
 *   workspace: 'profile-photos'
 * });
 * console.log('Token:', result.token);
 *
 * @example
 * // Upload with full options
 * const result = await uploadImage(file, {
 *   name: 'User Avatar',
 *   workspace: 'profile-photos',
 *   metadata: { purpose: 'avatar' },
 *   onProgress: (percent) => setProgress(percent)
 * });
 *
 * @example
 * // Handle errors
 * try {
 *   const result = await uploadImage(file, {
 *     name: 'Gallery Image',
 *     workspace: 'gallery'
 *   });
 * } catch (error) {
 *   if (error instanceof ImageApiException) {
 *     console.error(`Error ${error.code}: ${error.message}`);
 *   }
 * }
 */
export async function uploadImage(
    file: File | Blob,
    options: ImageUploadOptions
): Promise<ImageUploadResult> {
    const apiUrl = getApiUrl(options.apiUrl);
    const jwtToken = getJwtToken(options.jwtToken);

    // Validate file before upload
    if (!file) {
        throw new ImageApiException(
            "No file provided",
            "NO_FILE"
        );
    }

    if (file.size === 0) {
        throw new ImageApiException(
            "File is empty",
            "EMPTY_FILE"
        );
    }

    // Prepare form data
    const formData = new FormData();

    // If it's a Blob without a name, provide one
    if (file instanceof File) {
        formData.append("file", file, file.name);
    } else {
        // Blob: use provided name or default
        const fileName = options.name || 'image.jpg';
        formData.append("file", file, fileName);
    }

    formData.append("name", options.name);
    formData.append("workspace", options.workspace);

    if (options.metadata) {
        formData.append("metadata", JSON.stringify(options.metadata));
    }

    // Create XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Progress tracking
        if (options.onProgress) {
            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    options.onProgress!(percent);
                }
            });
        }

        // Handle completion
        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const result: ImageUploadResult = JSON.parse(xhr.responseText);
                    resolve(result);
                } catch (error) {
                    reject(
                        new ImageApiException(
                            "Failed to parse server response",
                            "PARSE_ERROR",
                            { originalError: error }
                        )
                    );
                }
            } else {
                try {
                    const errorData: ImageApiError = JSON.parse(xhr.responseText);
                    reject(
                        new ImageApiException(
                            errorData.error,
                            errorData.code,
                            errorData.details
                        )
                    );
                } catch {
                    reject(
                        new ImageApiException(
                            `Upload failed with status ${xhr.status}`,
                            "UPLOAD_FAILED"
                        )
                    );
                }
            }
        });

        // Handle network errors
        xhr.addEventListener("error", () => {
            reject(
                new ImageApiException(
                    "Network error during upload",
                    "NETWORK_ERROR"
                )
            );
        });

        // Handle abort
        xhr.addEventListener("abort", () => {
            reject(
                new ImageApiException(
                    "Upload cancelled by user",
                    "UPLOAD_CANCELLED"
                )
            );
        });

        // Send request
        xhr.open("POST", `${apiUrl}/api/image/upload`);
        xhr.setRequestHeader("Authorization", `Bearer ${jwtToken}`);

        // Add timeout
        xhr.timeout = 60000; // 60 seconds timeout

        xhr.addEventListener("timeout", () => {
            reject(
                new ImageApiException(
                    "Upload timeout (60s)",
                    "UPLOAD_TIMEOUT"
                )
            );
        });

        xhr.send(formData);

    });
}

/**
 * Get URL for displaying an image
 *
 * @param token - Image token
 * @param options - Optional configuration
 * @returns Full URL to the image
 *
 * @example
 * // Display image (user owns it)
 * <img src={getImageUrl(token)} alt="Image" />
 *
 * @example
 * // Display image from workspace
 * <img src={getImageUrl(token, { workspace: 'profile-photos' })} alt="Image" />
 *
 * @example
 * // Force download
 * <a href={getImageUrl(token, { download: true })}>Download</a>
 *
 * @example
 * // Custom API URL
 * const url = getImageUrl(token, { apiUrl: 'https://api.example.com' });
 */
export function getImageUrl(
    token: string,
    options: { workspace?: string; download?: boolean; apiUrl?: string } = {}
): string {
    const apiUrl = getApiUrl(options.apiUrl);
    const params = new URLSearchParams();

    if (options.download) {
        params.append("download", "true");
    }

    if (options.workspace) {
        params.append("workspace", options.workspace);
    }

    const queryString = params.toString();
    return `${apiUrl}/api/image/${token}${queryString ? `?${queryString}` : ""}`;
}

/**
 * Fetch image metadata without downloading the image
 *
 * @param token - Image token
 * @param options - Optional configuration
 * @returns Image metadata
 *
 * @example
 * // Get metadata (user owns the image)
 * const { metadata } = await getImageMetadata(token);
 * console.log(`Size: ${metadata.width}x${metadata.height}`);
 *
 * @example
 * // Get metadata from workspace
 * const { metadata } = await getImageMetadata(token, {
 *   workspace: 'profile-photos'
 * });
 */
export async function getImageMetadata(
    token: string,
    options: { workspace?: string; apiUrl?: string; jwtToken?: string } = {}
): Promise<ImageMetadataResponse> {
    const apiUrl = getApiUrl(options.apiUrl);
    const jwtToken = getJwtToken(options.jwtToken);

    // Build query parameters
    const params = new URLSearchParams();
    if (options.workspace) {
        params.append("workspace", options.workspace);
    }

    const queryString = params.toString();
    const url = `${apiUrl}/api/image/metadata/${token}${queryString ? `?${queryString}` : ""}`;

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${jwtToken}`,
            },
        });

        if (!response.ok) {
            const errorData: ImageApiError = await response.json();
            throw new ImageApiException(
                errorData.error,
                errorData.code,
                errorData.details
            );
        }

        return await response.json();
    } catch (error) {
        if (error instanceof ImageApiException) {
            throw error;
        }
        throw new ImageApiException(
            `Failed to fetch metadata: ${error instanceof Error ? error.message : String(error)}`,
            "FETCH_FAILED",
            { originalError: error }
        );
    }
}

/**
 * Delete an image by its token
 *
 * @param token - Image token to delete
 * @param options - Optional configuration
 * @returns Deletion confirmation
 *
 * @example
 * await deleteImage(token);
 * console.log('Image deleted successfully');
 *
 * @example
 * // Custom JWT token
 * await deleteImage(token, { jwtToken: customToken });
 */
export async function deleteImage(
    token: string,
    options: { apiUrl?: string; jwtToken?: string } = {}
): Promise<{ success: true; deleted: { token: string; originalName: string } }> {
    const apiUrl = getApiUrl(options.apiUrl);
    const jwtToken = getJwtToken(options.jwtToken);

    try {
        const response = await fetch(`${apiUrl}/api/image/${token}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${jwtToken}`,
            },
        });

        if (!response.ok) {
            const errorData: ImageApiError = await response.json();
            throw new ImageApiException(
                errorData.error,
                errorData.code,
                errorData.details
            );
        }

        return await response.json();
    } catch (error) {
        if (error instanceof ImageApiException) {
            throw error;
        }
        throw new ImageApiException(
            `Failed to delete image: ${error instanceof Error ? error.message : String(error)}`,
            "DELETE_FAILED",
            { originalError: error }
        );
    }
}

/**
 * Rename an image by its token
 *
 * @param token - Image token to rename
 * @param newName - New name for the image
 * @param options - Optional configuration
 * @returns Rename confirmation
 *
 * @example
 * await renameImage(token, 'New Image Name');
 * console.log('Image renamed successfully');
 *
 * @example
 * // Custom JWT token
 * await renameImage(token, 'Updated Name', { jwtToken: customToken });
 */
export async function renameImage(
    token: string,
    newName: string,
    options: { apiUrl?: string; jwtToken?: string } = {}
): Promise<{ success: true; updated: { token: string; name: string } }> {
    const apiUrl = getApiUrl(options.apiUrl);
    const jwtToken = getJwtToken(options.jwtToken);

    // Validate new name
    if (!newName || newName.trim() === '') {
        throw new ImageApiException(
            "New name cannot be empty",
            "EMPTY_NAME"
        );
    }

    try {
        const response = await fetch(`${apiUrl}/api/image/${token}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${jwtToken}`,
            },
            body: JSON.stringify({ name: newName.trim() }),
        });

        if (!response.ok) {
            const errorData: ImageApiError = await response.json();
            throw new ImageApiException(
                errorData.error,
                errorData.code,
                errorData.details
            );
        }

        return await response.json();
    } catch (error) {
        if (error instanceof ImageApiException) {
            throw error;
        }
        throw new ImageApiException(
            `Failed to rename image: ${error instanceof Error ? error.message : String(error)}`,
            "RENAME_FAILED",
            { originalError: error }
        );
    }
}

/**
 * Download image as blob for processing
 *
 * @param token - Image token
 * @param options - Optional configuration
 * @returns Image blob
 *
 * @example
 * // Download and create object URL
 * const blob = await downloadImageBlob(token);
 * const url = URL.createObjectURL(blob);
 * imgElement.src = url;
 *
 * @example
 * // Download and read as data URL
 * const blob = await downloadImageBlob(token);
 * const reader = new FileReader();
 * reader.onload = () => {
 *   const dataUrl = reader.result as string;
 *   console.log(dataUrl);
 * };
 * reader.readAsDataURL(blob);
 */
export async function downloadImageBlob(
    token: string,
    options: { apiUrl?: string } = {}
): Promise<Blob> {
    const apiUrl = getApiUrl(options.apiUrl);

    try {
        const response = await fetch(`${apiUrl}/api/image/${token}`);

        if (!response.ok) {
            const errorData: ImageApiError = await response.json();
            throw new ImageApiException(
                errorData.error,
                errorData.code,
                errorData.details
            );
        }

        return await response.blob();
    } catch (error) {
        if (error instanceof ImageApiException) {
            throw error;
        }
        throw new ImageApiException(
            `Failed to download image: ${error instanceof Error ? error.message : String(error)}`,
            "DOWNLOAD_FAILED",
            { originalError: error }
        );
    }
}

/**
 * Trigger browser download of an image
 *
 * @param token - Image token
 * @param filename - Optional custom filename
 * @param options - Optional configuration
 *
 * @example
 * // Download with original filename
 * await triggerImageDownload(token);
 *
 * @example
 * // Download with custom filename
 * await triggerImageDownload(token, 'my-photo.jpg');
 */
export async function triggerImageDownload(
    token: string,
    filename?: string,
    options: { apiUrl?: string } = {}
): Promise<void> {
    const apiUrl = getApiUrl(options.apiUrl);

    // If filename not provided, fetch metadata to get original name
    if (!filename) {
        const { metadata } = await getImageMetadata(token, options);
        filename = metadata.originalName;
    }

    // Create temporary link and trigger download
    const link = document.createElement("a");
    link.href = getImageUrl(token, { download: true, apiUrl: options.apiUrl });
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Validate image file before upload
 *
 * @param file - File to validate
 * @param options - Validation options
 * @returns True if valid, throws error otherwise
 *
 * @example
 * // Validate before upload
 * try {
 *   validateImageFile(file);
 *   const result = await uploadImage(file);
 * } catch (error) {
 *   console.error('Invalid file:', error.message);
 * }
 *
 * @example
 * // Custom validation rules
 * validateImageFile(file, {
 *   maxSize: 5 * 1024 * 1024, // 5MB
 *   allowedTypes: ['image/jpeg', 'image/png']
 * });
 */
export function validateImageFile(
    file: File | Blob,
    options: {
        maxSize?: number;
        allowedTypes?: string[];
    } = {}
): true {
    const maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB default
    const allowedTypes = options.allowedTypes || [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    ];

    // Check file size
    if (file.size > maxSize) {
        throw new ImageApiException(
            `File size ${file.size} bytes exceeds maximum ${maxSize} bytes`,
            "FILE_TOO_LARGE",
            { size: file.size, maxSize }
        );
    }

    // Check MIME type (basic check, server will verify magic bytes)
    if (file instanceof File) {
        if (!allowedTypes.includes(file.type)) {
            throw new ImageApiException(
                `File type ${file.type} is not allowed`,
                "INVALID_TYPE",
                { type: file.type, allowedTypes }
            );
        }
    }

    return true;
}

/**
 * Options for listing images
 */
export interface ListImagesOptions {
    /** Filter by user ID (optional) */
    userId?: string;
    /** Filter by workspace (optional) */
    workspace?: string;
    /** Maximum number of results (default: 100, max: 500) */
    limit?: number;
    /** Number of results to skip (default: 0) */
    offset?: number;
    /** Maximum size for thumbnail generation (longest dimension, optional) */
    maxSize?: number;
    /** Compression quality 0-100 (default: 85, only used with maxSize) */
    quality?: number;
    /** Custom API URL (defaults to VITE_API_URL) */
    apiUrl?: string;
    /** Custom JWT token (defaults to localStorage) */
    jwtToken?: string;
}

/**
 * Image list item
 */
export interface ImageListItem {
    token: string;
    name: string;
    originalName: string;
    mimeType: ImageMimeType;
    size: number;
    width: number;
    height: number;
    compressed: boolean;
    uploadedAt: string;
    userId: string;
    workspace: string;
    metadata?: Record<string, string>;
    /** Base64 image data (only present when maxSize is specified) */
    data?: string;
    /** Thumbnail width (only present when maxSize is specified) */
    thumbnailWidth?: number;
    /** Thumbnail height (only present when maxSize is specified) */
    thumbnailHeight?: number;
    /** Thumbnail size in bytes (only present when maxSize is specified) */
    thumbnailSize?: number;
}

/**
 * Image list response
 */
export interface ImageListResponse {
    images: ImageListItem[];
    total: number;
    limit: number;
    offset: number;
    /** Whether images were compressed (only present when maxSize is specified) */
    compressed?: boolean;
    /** Maximum size used for compression (only present when maxSize is specified) */
    maxSize?: number;
    /** Quality used for compression (only present when maxSize is specified) */
    quality?: number;
}

/**
 * List images filtered by userId and/or workspace
 *
 * @param options - Filter and pagination options
 * @returns List of images with metadata (and optionally compressed thumbnail data)
 *
 * @example
 * // List all images for current user
 * const result = await listImages();
 * console.log(`Found ${result.total} images`);
 *
 * @example
 * // List images for specific workspace
 * const result = await listImages({ workspace: 'profile-photos' });
 *
 * @example
 * // List images with pagination
 * const result = await listImages({
 *   workspace: 'gallery',
 *   limit: 50,
 *   offset: 0
 * });
 *
 * @example
 * // List images with thumbnails (200px max dimension)
 * const result = await listImages({
 *   workspace: 'gallery',
 *   maxSize: 200
 * });
 * // Each image will have data, thumbnailWidth, thumbnailHeight, thumbnailSize
 * result.images.forEach(img => {
 *   if (img.data) {
 *     const imgSrc = `data:${img.mimeType};base64,${img.data}`;
 *     console.log(`${img.name}: ${img.thumbnailWidth}x${img.thumbnailHeight}`);
 *   }
 * });
 *
 * @example
 * // List images with custom quality thumbnails
 * const result = await listImages({
 *   workspace: 'gallery',
 *   maxSize: 300,
 *   quality: 70
 * });
 *
 * @example
 * // List images for specific user
 * const result = await listImages({ userId: 'user123' });
 */
export async function listImages(
    options: ListImagesOptions = {}
): Promise<ImageListResponse> {
    const apiUrl = getApiUrl(options.apiUrl);
    const jwtToken = getJwtToken(options.jwtToken);

    // Build query parameters
    const params = new URLSearchParams();

    if (options.userId) {
        params.append("userId", options.userId);
    }

    if (options.workspace) {
        params.append("workspace", options.workspace);
    }

    if (options.limit !== undefined) {
        params.append("limit", options.limit.toString());
    }

    if (options.offset !== undefined) {
        params.append("offset", options.offset.toString());
    }

    if (options.maxSize !== undefined) {
        params.append("maxSize", options.maxSize.toString());
    }

    if (options.quality !== undefined) {
        params.append("quality", options.quality.toString());
    }


    const queryString = params.toString();
    const url = `${apiUrl}/api/image/list${queryString ? `?${queryString}` : ""}`;

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${jwtToken}`,
            },
        });

        if (!response.ok) {
            const errorData: ImageApiError = await response.json();
            throw new ImageApiException(
                errorData.error,
                errorData.code,
                errorData.details
            );
        }

        const result: ImageListResponse = await response.json();
        return result;
    } catch (error) {
        if (error instanceof ImageApiException) {
            throw error;
        }

        throw new ImageApiException(
            error instanceof Error ? error.message : "Failed to list images",
            "LIST_FAILED",
            { originalError: error }
        );
    }
}

/**
 * Format bytes to human-readable string
 *
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places
 * @returns Formatted string (e.g., "1.5 MB")
 *
 * @example
 * formatBytes(1024); // "1 KB"
 * formatBytes(1536000); // "1.46 MB"
 * formatBytes(1536000, 1); // "1.5 MB"
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
