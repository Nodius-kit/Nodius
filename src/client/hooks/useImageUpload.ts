/**
 * @file useImageUpload.ts
 * @description React hook for easy image upload with state management
 * @module client/hooks
 *
 * Provides a simple React hook that manages all image upload state:
 * - Progress tracking
 * - Error handling
 * - Loading states
 * - Upload result
 *
 * USAGE:
 * ```typescript
 * const { upload, uploading, progress, result, error } = useImageUpload();
 *
 * const handleFile = (file: File) => {
 *   upload(file, { workspace: 'my-workspace' });
 * };
 * ```
 */

import { useState, useCallback } from "react";
import {
    uploadImage,
    ImageUploadOptions,
    ImageUploadResult,
    ImageApiException,
} from "../utils/imageApi";

/**
 * Hook state interface
 */
interface UseImageUploadState {
    /** Upload function */
    upload: (file: File | Blob, options: Omit<ImageUploadOptions, "onProgress">) => Promise<void>;
    /** Whether upload is in progress */
    uploading: boolean;
    /** Upload progress (0-100) */
    progress: number;
    /** Upload result (available when complete) */
    result: ImageUploadResult | null;
    /** Error message (if upload failed) */
    error: string | null;
    /** Error code (if upload failed) */
    errorCode: string | null;
    /** Reset state */
    reset: () => void;
}

/**
 * Hook for managing image uploads
 *
 * @returns Upload state and functions
 *
 * @example
 * // Basic usage
 * function MyComponent() {
 *   const { upload, uploading, progress, result, error } = useImageUpload();
 *
 *   const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 *     const file = e.target.files?.[0];
 *     if (file) upload(file);
 *   };
 *
 *   return (
 *     <div>
 *       <input type="file" onChange={handleFileChange} disabled={uploading} />
 *       {uploading && <progress value={progress} max={100} />}
 *       {error && <p style={{color: 'red'}}>{error}</p>}
 *       {result && <img src={getImageUrl(result.token)} />}
 *     </div>
 *   );
 * }
 *
 * @example
 * // With options
 * const { upload, result } = useImageUpload();
 *
 * const handleUpload = (file: File) => {
 *   upload(file, {
 *     workspace: 'profile-photos',
 *     metadata: { userId: '123' }
 *   });
 * };
 */
export function useImageUpload(): UseImageUploadState {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<ImageUploadResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [errorCode, setErrorCode] = useState<string | null>(null);

    const upload = useCallback(
        async (file: File | Blob, options: Omit<ImageUploadOptions, "onProgress">) => {
            // Reset state
            setUploading(true);
            setProgress(0);
            setResult(null);
            setError(null);
            setErrorCode(null);

            try {
                const uploadResult = await uploadImage(file, {
                    ...options,
                    onProgress: (percent) => setProgress(percent),
                });

                setResult(uploadResult);
            } catch (err) {
                if (err instanceof ImageApiException) {
                    setError(err.message);
                    setErrorCode(err.code);
                } else {
                    setError("An unknown error occurred");
                    setErrorCode("UNKNOWN_ERROR");
                }
            } finally {
                setUploading(false);
            }
        },
        []
    );

    const reset = useCallback(() => {
        setUploading(false);
        setProgress(0);
        setResult(null);
        setError(null);
        setErrorCode(null);
    }, []);

    return {
        upload,
        uploading,
        progress,
        result,
        error,
        errorCode,
        reset,
    };
}

/**
 * Hook for managing multiple image uploads
 *
 * @example
 * function MultiUpload() {
 *   const { uploads, uploadFile, removeUpload } = useMultipleImageUpload();
 *
 *   const handleFiles = (files: FileList) => {
 *     Array.from(files).forEach(file => uploadFile(file));
 *   };
 *
 *   return (
 *     <div>
 *       <input type="file" multiple onChange={e => e.target.files && handleFiles(e.target.files)} />
 *       {uploads.map(upload => (
 *         <div key={upload.id}>
 *           <p>{upload.fileName}</p>
 *           {upload.uploading && <progress value={upload.progress} max={100} />}
 *           {upload.error && <p style={{color: 'red'}}>{upload.error}</p>}
 *           {upload.result && <img src={getImageUrl(upload.result.token)} />}
 *           <button onClick={() => removeUpload(upload.id)}>Remove</button>
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 */

interface UploadItem {
    id: string;
    fileName: string;
    uploading: boolean;
    progress: number;
    result: ImageUploadResult | null;
    error: string | null;
}

interface UseMultipleImageUploadState {
    uploads: UploadItem[];
    uploadFile: (file: File | Blob, options: Omit<ImageUploadOptions, "onProgress">) => void;
    removeUpload: (id: string) => void;
    clearAll: () => void;
}

export function useMultipleImageUpload(): UseMultipleImageUploadState {
    const [uploads, setUploads] = useState<UploadItem[]>([]);

    const uploadFile = useCallback(
        async (file: File | Blob, options: Omit<ImageUploadOptions, "onProgress">) => {
            const id = Math.random().toString(36).substr(2, 9);
            const fileName = file instanceof File ? file.name : "blob";

            // Add to uploads list
            const newUpload: UploadItem = {
                id,
                fileName,
                uploading: true,
                progress: 0,
                result: null,
                error: null,
            };

            setUploads((prev) => [...prev, newUpload]);

            try {
                const result = await uploadImage(file, {
                    ...options,
                    onProgress: (percent) => {
                        setUploads((prev) =>
                            prev.map((u) =>
                                u.id === id ? { ...u, progress: percent } : u
                            )
                        );
                    },
                });

                setUploads((prev) =>
                    prev.map((u) =>
                        u.id === id
                            ? { ...u, uploading: false, result, progress: 100 }
                            : u
                    )
                );
            } catch (err) {
                const errorMessage =
                    err instanceof ImageApiException
                        ? err.message
                        : "Unknown error occurred";

                setUploads((prev) =>
                    prev.map((u) =>
                        u.id === id ? { ...u, uploading: false, error: errorMessage } : u
                    )
                );
            }
        },
        []
    );

    const removeUpload = useCallback((id: string) => {
        setUploads((prev) => prev.filter((u) => u.id !== id));
    }, []);

    const clearAll = useCallback(() => {
        setUploads([]);
    }, []);

    return {
        uploads,
        uploadFile,
        removeUpload,
        clearAll,
    };
}

/**
 * Hook for image with preview URL
 * Automatically creates and manages object URLs for preview
 *
 * @example
 * function ImagePreview() {
 *   const { upload, previewUrl, imageToken, uploading } = useImageWithPreview();
 *
 *   const handleFile = (file: File) => {
 *     upload(file);
 *   };
 *
 *   return (
 *     <div>
 *       <input type="file" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
 *       {uploading && <p>Uploading...</p>}
 *       {previewUrl && <img src={previewUrl} alt="Preview" />}
 *       {imageToken && <p>Token: {imageToken}</p>}
 *     </div>
 *   );
 * }
 */
interface UseImageWithPreviewState {
    upload: (file: File | Blob, options: Omit<ImageUploadOptions, "onProgress">) => Promise<void>;
    previewUrl: string | null;
    imageToken: string | null;
    uploading: boolean;
    progress: number;
    error: string | null;
    reset: () => void;
}

export function useImageWithPreview(): UseImageWithPreviewState {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [imageToken, setImageToken] = useState<string | null>(null);
    const imageUpload = useImageUpload();

    const upload = useCallback(
        async (file: File | Blob, options: Omit<ImageUploadOptions, "onProgress">) => {
            // Create preview URL
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
            setImageToken(null);

            // Upload image
            await imageUpload.upload(file, options);

            // Set token if successful
            if (imageUpload.result) {
                setImageToken(imageUpload.result.token);
            }
        },
        [imageUpload]
    );

    const reset = useCallback(() => {
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }
        setPreviewUrl(null);
        setImageToken(null);
        imageUpload.reset();
    }, [previewUrl, imageUpload]);

    // Cleanup preview URL on unmount
    React.useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    return {
        upload,
        previewUrl,
        imageToken,
        uploading: imageUpload.uploading,
        progress: imageUpload.progress,
        error: imageUpload.error,
        reset,
    };
}

// Import React for useEffect
import React from "react";
