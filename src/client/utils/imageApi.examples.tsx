/**
 * @file imageApi.examples.tsx
 * @description Usage examples for the Image API utility
 * @module client/utils
 *
 * This file contains complete examples of how to use the imageApi utility
 * in various React components and scenarios.
 */

import React, { useState, useRef, ChangeEvent, DragEvent } from "react";
import {
    uploadImage,
    getImageUrl,
    getImageMetadata,
    deleteImage,
    triggerImageDownload,
    validateImageFile,
    formatBytes,
    ImageApiException,
    ImageUploadResult,
} from "./imageApi";

/* ============================================================================
 * EXAMPLE 1: Simple Image Upload
 * ============================================================================
 * Basic image upload component with preview
 */

export function SimpleImageUpload() {
    const [imageToken, setImageToken] = useState<string>("");
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string>("");

    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setError("");

        try {
            // Upload image
            const result = await uploadImage(file);
            setImageToken(result.token);
            console.log("Upload successful:", result);
        } catch (err) {
            if (err instanceof ImageApiException) {
                setError(`${err.code}: ${err.message}`);
            } else {
                setError("Unknown error occurred");
            }
        } finally {
            setUploading(false);
        }
    };

    return (
        <div>
            <h2>Simple Image Upload</h2>
            <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} />

            {uploading && <p>Uploading...</p>}
            {error && <p style={{ color: "red" }}>{error}</p>}

            {imageToken && (
                <div>
                    <p>Upload successful! Token: {imageToken}</p>
                    <img src={getImageUrl(imageToken)} alt="Uploaded" style={{ maxWidth: "100%" }} />
                </div>
            )}
        </div>
    );
}

/* ============================================================================
 * EXAMPLE 2: Upload with Progress Bar
 * ============================================================================
 * Shows upload progress with a progress bar
 */

export function ImageUploadWithProgress() {
    const [progress, setProgress] = useState(0);
    const [imageToken, setImageToken] = useState<string>("");
    const [uploading, setUploading] = useState(false);

    const handleUpload = async (file: File) => {
        setUploading(true);
        setProgress(0);

        try {
            const result = await uploadImage(file, {
                workspace: "user-uploads",
                metadata: {
                    uploadedBy: "user123",
                    category: "photos",
                },
                onProgress: (percent) => setProgress(percent),
            });

            setImageToken(result.token);
            console.log("Compressed:", result.metadata.compressed);
            console.log("Size:", formatBytes(result.metadata.size));
        } catch (err) {
            console.error("Upload failed:", err);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div>
            <h2>Upload with Progress</h2>
            <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />

            {uploading && (
                <div>
                    <progress value={progress} max={100} />
                    <span>{progress}%</span>
                </div>
            )}

            {imageToken && <img src={getImageUrl(imageToken)} alt="Uploaded" />}
        </div>
    );
}

/* ============================================================================
 * EXAMPLE 3: Drag and Drop Upload
 * ============================================================================
 * Drag and drop zone for image uploads
 */

export function DragDropImageUpload() {
    const [imageToken, setImageToken] = useState<string>("");
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string>("");

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        setError("");

        const file = e.dataTransfer.files[0];
        if (!file) return;

        try {
            // Validate before upload
            validateImageFile(file, {
                maxSize: 10 * 1024 * 1024, // 10MB
                allowedTypes: ["image/jpeg", "image/png", "image/webp"],
            });

            // Upload
            const result = await uploadImage(file);
            setImageToken(result.token);
        } catch (err) {
            if (err instanceof ImageApiException) {
                setError(err.message);
            }
        }
    };

    return (
        <div>
            <h2>Drag and Drop Upload</h2>
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                    border: `2px dashed ${isDragging ? "blue" : "gray"}`,
                    padding: "40px",
                    textAlign: "center",
                    background: isDragging ? "#f0f0ff" : "transparent",
                }}
            >
                {isDragging ? "Drop image here..." : "Drag and drop an image here"}
            </div>

            {error && <p style={{ color: "red" }}>{error}</p>}
            {imageToken && <img src={getImageUrl(imageToken)} alt="Uploaded" />}
        </div>
    );
}

/* ============================================================================
 * EXAMPLE 4: Image Gallery Manager
 * ============================================================================
 * Manage multiple images with upload, view, and delete
 */

interface ImageItem {
    token: string;
    name: string;
    size: number;
    width: number;
    height: number;
}

export function ImageGalleryManager() {
    const [images, setImages] = useState<ImageItem[]>([]);
    const [uploading, setUploading] = useState(false);

    const handleUpload = async (file: File) => {
        setUploading(true);

        try {
            const result = await uploadImage(file, {
                workspace: "gallery",
            });

            // Add to gallery
            setImages((prev) => [
                ...prev,
                {
                    token: result.token,
                    name: result.metadata.originalName,
                    size: result.metadata.size,
                    width: result.metadata.width,
                    height: result.metadata.height,
                },
            ]);
        } catch (err) {
            console.error("Upload failed:", err);
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (token: string) => {
        try {
            await deleteImage(token);
            setImages((prev) => prev.filter((img) => img.token !== token));
            console.log("Image deleted successfully");
        } catch (err) {
            console.error("Delete failed:", err);
        }
    };

    const handleDownload = async (token: string) => {
        try {
            await triggerImageDownload(token);
        } catch (err) {
            console.error("Download failed:", err);
        }
    };

    return (
        <div>
            <h2>Image Gallery Manager</h2>

            <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                disabled={uploading}
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "20px", marginTop: "20px" }}>
                {images.map((img) => (
                    <div key={img.token} style={{ border: "1px solid #ddd", padding: "10px" }}>
                        <img
                            src={getImageUrl(img.token)}
                            alt={img.name}
                            style={{ width: "100%", height: "150px", objectFit: "cover" }}
                        />
                        <p style={{ fontSize: "12px", margin: "5px 0" }}>{img.name}</p>
                        <p style={{ fontSize: "11px", color: "#666" }}>
                            {img.width}x{img.height} • {formatBytes(img.size)}
                        </p>
                        <button onClick={() => handleDownload(img.token)}>Download</button>
                        <button onClick={() => handleDelete(img.token)}>Delete</button>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ============================================================================
 * EXAMPLE 5: Profile Photo Upload
 * ============================================================================
 * Upload and preview profile photo with crop preview
 */

export function ProfilePhotoUpload({ userId }: { userId: string }) {
    const [photoToken, setPhotoToken] = useState<string>("");
    const [preview, setPreview] = useState<string>("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (file: File) => {
        // Show preview immediately
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target?.result as string);
        reader.readAsDataURL(file);

        try {
            // Validate image
            validateImageFile(file, {
                maxSize: 5 * 1024 * 1024, // 5MB for profile photos
                allowedTypes: ["image/jpeg", "image/png"],
            });

            // Upload with metadata
            const result = await uploadImage(file, {
                workspace: "profile-photos",
                metadata: {
                    userId,
                    purpose: "avatar",
                    uploadDate: new Date().toISOString(),
                },
            });

            setPhotoToken(result.token);

            // TODO: Save token to user profile in backend
            // await updateUserProfile(userId, { profilePhotoToken: result.token });
        } catch (err) {
            if (err instanceof ImageApiException) {
                alert(`Upload failed: ${err.message}`);
            }
            setPreview("");
        }
    };

    return (
        <div>
            <h2>Profile Photo</h2>

            <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                    width: "150px",
                    height: "150px",
                    borderRadius: "50%",
                    overflow: "hidden",
                    border: "2px solid #ddd",
                    cursor: "pointer",
                    background: "#f0f0f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                {photoToken ? (
                    <img
                        src={getImageUrl(photoToken)}
                        alt="Profile"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                ) : preview ? (
                    <img
                        src={preview}
                        alt="Preview"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                ) : (
                    <span>Click to upload</span>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                style={{ display: "none" }}
            />
        </div>
    );
}

/* ============================================================================
 * EXAMPLE 6: Image Metadata Viewer
 * ============================================================================
 * Fetch and display image metadata without downloading
 */

export function ImageMetadataViewer({ token }: { token: string }) {
    const [metadata, setMetadata] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const loadMetadata = async () => {
        setLoading(true);
        try {
            const result = await getImageMetadata(token);
            setMetadata(result.metadata);
        } catch (err) {
            console.error("Failed to load metadata:", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h2>Image Metadata</h2>
            <button onClick={loadMetadata} disabled={loading}>
                {loading ? "Loading..." : "Load Metadata"}
            </button>

            {metadata && (
                <div style={{ marginTop: "20px", fontFamily: "monospace" }}>
                    <p><strong>Token:</strong> {metadata.token}</p>
                    <p><strong>Original Name:</strong> {metadata.originalName}</p>
                    <p><strong>MIME Type:</strong> {metadata.mimeType}</p>
                    <p><strong>Size:</strong> {formatBytes(metadata.size)}</p>
                    <p><strong>Dimensions:</strong> {metadata.width}x{metadata.height}</p>
                    <p><strong>Compressed:</strong> {metadata.compressed ? "Yes" : "No"}</p>
                    <p><strong>Uploaded:</strong> {new Date(metadata.uploadedAt).toLocaleString()}</p>
                    {metadata.workspace && <p><strong>Workspace:</strong> {metadata.workspace}</p>}
                    {metadata.metadata && (
                        <div>
                            <strong>Custom Metadata:</strong>
                            <pre>{JSON.stringify(metadata.metadata, null, 2)}</pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ============================================================================
 * EXAMPLE 7: Multiple File Upload
 * ============================================================================
 * Upload multiple files with individual progress tracking
 */

interface UploadItem {
    id: string;
    file: File;
    progress: number;
    token?: string;
    error?: string;
}

export function MultipleFileUpload() {
    const [uploads, setUploads] = useState<UploadItem[]>([]);

    const handleFilesSelect = (files: FileList) => {
        const newUploads: UploadItem[] = Array.from(files).map((file) => ({
            id: Math.random().toString(36).substr(2, 9),
            file,
            progress: 0,
        }));

        setUploads((prev) => [...prev, ...newUploads]);

        // Start uploads
        newUploads.forEach((upload) => uploadFile(upload));
    };

    const uploadFile = async (upload: UploadItem) => {
        try {
            const result = await uploadImage(upload.file, {
                workspace: "batch-upload",
                onProgress: (percent) => {
                    setUploads((prev) =>
                        prev.map((u) =>
                            u.id === upload.id ? { ...u, progress: percent } : u
                        )
                    );
                },
            });

            setUploads((prev) =>
                prev.map((u) =>
                    u.id === upload.id ? { ...u, token: result.token, progress: 100 } : u
                )
            );
        } catch (err) {
            setUploads((prev) =>
                prev.map((u) =>
                    u.id === upload.id
                        ? { ...u, error: err instanceof Error ? err.message : "Unknown error" }
                        : u
                )
            );
        }
    };

    return (
        <div>
            <h2>Multiple File Upload</h2>
            <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => e.target.files && handleFilesSelect(e.target.files)}
            />

            <div style={{ marginTop: "20px" }}>
                {uploads.map((upload) => (
                    <div key={upload.id} style={{ marginBottom: "15px", padding: "10px", border: "1px solid #ddd" }}>
                        <p>{upload.file.name} ({formatBytes(upload.file.size)})</p>
                        {upload.error ? (
                            <p style={{ color: "red" }}>Error: {upload.error}</p>
                        ) : upload.token ? (
                            <div>
                                <p style={{ color: "green" }}>✓ Uploaded</p>
                                <img src={getImageUrl(upload.token)} alt={upload.file.name} style={{ maxWidth: "100px" }} />
                            </div>
                        ) : (
                            <progress value={upload.progress} max={100} style={{ width: "100%" }} />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ============================================================================
 * EXAMPLE 8: Clipboard Image Paste
 * ============================================================================
 * Upload images from clipboard (Ctrl+V)
 */

export function ClipboardImageUpload() {
    const [imageToken, setImageToken] = useState<string>("");
    const [message, setMessage] = useState("Press Ctrl+V to paste an image");

    React.useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) {
                        setMessage("Uploading pasted image...");
                        try {
                            const result = await uploadImage(blob, {
                                workspace: "clipboard",
                                metadata: { source: "clipboard" },
                            });
                            setImageToken(result.token);
                            setMessage("Image uploaded successfully!");
                        } catch (err) {
                            setMessage("Upload failed");
                        }
                    }
                }
            }
        };

        window.addEventListener("paste", handlePaste);
        return () => window.removeEventListener("paste", handlePaste);
    }, []);

    return (
        <div>
            <h2>Clipboard Image Upload</h2>
            <p>{message}</p>
            {imageToken && <img src={getImageUrl(imageToken)} alt="Pasted" style={{ maxWidth: "100%" }} />}
        </div>
    );
}

/* ============================================================================
 * EXAMPLE 9: Image URL Input with Fetch
 * ============================================================================
 * Fetch image from URL and upload to server
 */

export function ImageUrlUpload() {
    const [url, setUrl] = useState("");
    const [imageToken, setImageToken] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleUrlUpload = async () => {
        setLoading(true);
        setError("");

        try {
            // Fetch image from URL
            const response = await fetch(url);
            if (!response.ok) throw new Error("Failed to fetch image");

            const blob = await response.blob();

            // Upload to our server
            const result = await uploadImage(blob, {
                workspace: "url-imports",
                metadata: { sourceUrl: url },
            });

            setImageToken(result.token);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h2>Upload from URL</h2>
            <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                style={{ width: "300px" }}
            />
            <button onClick={handleUrlUpload} disabled={loading || !url}>
                {loading ? "Uploading..." : "Upload"}
            </button>

            {error && <p style={{ color: "red" }}>{error}</p>}
            {imageToken && <img src={getImageUrl(imageToken)} alt="Uploaded" />}
        </div>
    );
}
