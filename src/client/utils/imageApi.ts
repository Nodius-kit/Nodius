/**
 * @file imageApi.ts
 * @description Client-side utility for secure image upload and retrieval
 * @module client/utils
 *
 * Provides easy-to-use functions for interacting with the Image Storage API:
 * - uploadImage: Upload image with validation and progress tracking
 * - getImageUrl: Get URL for displaying images
 * - getImageMetadata: Fetch image metadata without downloading
 * - deleteImage: Delete image by token
 * - downloadImage: Download image to user's device
 *
 * USAGE:
 * ```typescript
 * import { uploadImage, getImageUrl } from './utils/imageApi';
 *
 * // Upload image
 * const { token } = await uploadImage(file, {
 *   workspace: 'my-workspace',
 *   onProgress: (percent) => console.log(`${percent}%`)
 * });
 *
 * // Display image
 * <img src={getImageUrl(token)} alt="Uploaded" />
 * ```
 */

import { ImageMimeType } from "../../utils/requests/type/api_image.type";

/**
 * Image upload options
 */
export interface ImageUploadOptions {
    /** Optional workspace identifier */
    workspace?: string;
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
        originalName: string;
        mimeType: ImageMimeType;
        size: number;
        width: number;
        height: number;
        compressed: boolean;
        uploadedAt: string;
        workspace?: string;
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

    const token = localStorage.getItem("jwt_token") || localStorage.getItem("token");
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
 * @param options - Upload options
 * @returns Upload result with token and metadata
 *
 * @example
 * // Basic upload
 * const result = await uploadImage(file);
 * console.log('Token:', result.token);
 *
 * @example
 * // Upload with options
 * const result = await uploadImage(file, {
 *   workspace: 'profile-photos',
 *   metadata: { userId: '123', purpose: 'avatar' },
 *   onProgress: (percent) => setProgress(percent)
 * });
 *
 * @example
 * // Handle errors
 * try {
 *   const result = await uploadImage(file);
 * } catch (error) {
 *   if (error instanceof ImageApiException) {
 *     console.error(`Error ${error.code}: ${error.message}`);
 *   }
 * }
 */
export async function uploadImage(
    file: File | Blob,
    options: ImageUploadOptions = {}
): Promise<ImageUploadResult> {
    const apiUrl = getApiUrl(options.apiUrl);
    const jwtToken = getJwtToken(options.jwtToken);

    // Prepare form data
    const formData = new FormData();
    formData.append("file", file);

    if (options.workspace) {
        formData.append("workspace", options.workspace);
    }

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
 * // Simple usage
 * <img src={getImageUrl(token)} alt="Image" />
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
    options: { download?: boolean; apiUrl?: string } = {}
): string {
    const apiUrl = getApiUrl(options.apiUrl);
    const downloadParam = options.download ? "?download=true" : "";
    return `${apiUrl}/api/image/${token}${downloadParam}`;
}

/**
 * Fetch image metadata without downloading the image
 *
 * @param token - Image token
 * @param options - Optional configuration
 * @returns Image metadata
 *
 * @example
 * const { metadata } = await getImageMetadata(token);
 * console.log(`Size: ${metadata.width}x${metadata.height}`);
 * console.log(`File size: ${metadata.size} bytes`);
 */
export async function getImageMetadata(
    token: string,
    options: { apiUrl?: string } = {}
): Promise<ImageMetadataResponse> {
    const apiUrl = getApiUrl(options.apiUrl);

    try {
        const response = await fetch(`${apiUrl}/api/image/metadata/${token}`);

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
