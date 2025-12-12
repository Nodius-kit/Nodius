/**
 * @file ImageManagerModal.tsx
 * @description Modal for browsing, uploading, and managing images
 *
 * Features:
 * - List images with thumbnails (using maxSize API parameter)
 * - Filter by name, date, size
 * - Sort by various criteria
 * - Upload images with drag & drop
 * - Rename and delete images
 * - Two modes: selection mode (for picking an image) and view-only mode
 */

import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import {
    uploadImage,
    listImages,
    deleteImage,
    getImageUrl,
    ImageListItem,
    ImageApiException,
    formatBytes
} from '../utils/imageApi';
import {
    Image,
    Upload,
    X,
    Search,
    Filter,
    SortAsc,
    SortDesc,
    Calendar,
    HardDrive,
    FileText,
    Trash2,
    Edit2,
    Check,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { ThemeContext } from '../hooks/contexts/ThemeContext';
import { useDynamicClass } from '../hooks/useDynamicClass';

export interface ImageManagerModalProps {
    /** Workspace to filter images */
    workspace: string;
    /** Mode: 'select' allows selecting an image, 'view' is read-only */
    mode: 'select' | 'view';
    /** Callback when image is selected (only in select mode) */
    onSelect?: (imageUrl: string, imageToken: string, imageName: string) => void;
    /** Callback when modal is closed */
    onClose?: () => void;
}

type SortField = 'name' | 'uploadedAt' | 'size';
type SortOrder = 'asc' | 'desc';

export const ImageManagerModal = ({
    workspace,
    mode,
    onSelect,
    onClose
}:ImageManagerModalProps) => {
    const Theme = useContext(ThemeContext);

    // State
    const [images, setImages] = useState<ImageListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<SortField>('uploadedAt');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [editingImageId, setEditingImageId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);
    const pageSize = 20;

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load images
    const loadImages = useCallback(async () => {
        setLoading(true);
        try {
            const result = await listImages({
                workspace,
                maxSize: 200, // Get 200px thumbnails
                quality: 85,
                limit: pageSize,
                offset: page * pageSize
            });
            setImages(result.images);
            setTotal(result.total);
        } catch (error) {
            console.error('Failed to load images:', error);
        } finally {
            setLoading(false);
        }
    }, [workspace, page]);

    useEffect(() => {
        loadImages();
    }, [loadImages]);

    // Filter and sort images
    const filteredAndSortedImages = React.useMemo(() => {
        let filtered = images;

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(img =>
                img.name.toLowerCase().includes(query) ||
                img.originalName.toLowerCase().includes(query)
            );
        }

        // Sort
        return [...filtered].sort((a, b) => {
            let comparison = 0;

            switch (sortField) {
                case 'name':
                    comparison = a.name.localeCompare(b.name);
                    break;
                case 'uploadedAt':
                    comparison = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
                    break;
                case 'size':
                    comparison = a.size - b.size;
                    break;
            }

            return sortOrder === 'asc' ? comparison : -comparison;
        });
    }, [images, searchQuery, sortField, sortOrder]);

    // Upload handler
    const handleUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        setUploading(true);
        const uploadPromises = Array.from(files).map(async (file) => {
            try {
                await uploadImage(file, {
                    name: file.name,
                    workspace
                });
            } catch (error) {
                console.error(`Failed to upload ${file.name}:`, error);
            }
        });

        await Promise.all(uploadPromises);
        setUploading(false);
        loadImages();
    };

    // Drag & drop handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        handleUpload(e.dataTransfer.files);
    };

    // Delete image
    const handleDelete = async (token: string) => {
        if (!confirm('Are you sure you want to delete this image?')) return;

        try {
            await deleteImage(token);
            loadImages();
        } catch (error) {
            console.error('Failed to delete image:', error);
            alert('Failed to delete image');
        }
    };

    // Rename image
    const startRename = (image: ImageListItem) => {
        setEditingImageId(image.token);
        setEditingName(image.name);
    };

    const cancelRename = () => {
        setEditingImageId(null);
        setEditingName('');
    };

    const saveRename = async (token: string) => {
        // Note: This requires a rename endpoint which doesn't exist yet
        // For now, we'll just cancel
        console.log('Rename not implemented on server yet');
        cancelRename();
    };

    // Select image
    const handleSelect = (image: ImageListItem) => {
        if (mode === 'select' && onSelect) {
            const imageUrl = getImageUrl(image.token, { workspace });
            onSelect(imageUrl, image.token, image.name);
            onClose?.();
        }
    };

    // Styles
    const containerClass = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            height: 100%;
            gap: 16px;
        }
    `);

    const toolbarClass = useDynamicClass(`
        & {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            align-items: center;
        }
    `);

    const searchBoxClass = useDynamicClass(`
        & {
            flex: 1;
            min-width: 200px;
            position: relative;
            display: flex;
            align-items: center;
        }
        & input {
            width: 100%;
            padding: 8px 12px 8px 36px;
            border: 1px solid var(--nodius-background-paper);
            border-radius: 8px;
            background-color: var(--nodius-background-default);
            color: var(--nodius-text-primary);
            font-size: 14px;
            outline: none;
        }
        & input:focus {
            border-color: var(--nodius-primary-main);
        }
        & svg {
            position: absolute;
            left: 10px;
            color: var(--nodius-text-secondary);
        }
    `);

    const buttonClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 12px;
            border: 1px solid var(--nodius-background-paper);
            border-radius: 8px;
            background-color: var(--nodius-background-default);
            color: var(--nodius-text-primary);
            cursor: pointer;
            transition: var(--nodius-transition-default);
            font-size: 14px;
        }
        &:hover {
            background-color: var(--nodius-background-paper);
        }
    `);

    const uploadButtonClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            border: 1px solid var(--nodius-primary-main);
            border-radius: 8px;
            background-color: ${Theme.state.changeOpacity(Theme.state.primary[Theme.state.theme].main, 0.1)};
            color: var(--nodius-primary-main);
            cursor: pointer;
            transition: var(--nodius-transition-default);
            font-size: 14px;
            font-weight: 500;
        }
        &:hover {
            background-color: ${Theme.state.changeOpacity(Theme.state.primary[Theme.state.theme].main, 0.2)};
        }
    `);

    const dropZoneClass = useDynamicClass(`
        & {
            flex: 1;
            overflow: auto;
            border: 2px dashed ${isDragging ? 'var(--nodius-primary-main)' : 'var(--nodius-background-paper)'};
            border-radius: 8px;
            padding: 16px;
            background-color: ${isDragging ? Theme.state.changeOpacity(Theme.state.primary[Theme.state.theme].main, 0.05) : 'transparent'};
            transition: var(--nodius-transition-default);
        }
    `);

    const gridClass = useDynamicClass(`
        & {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 16px;
        }
    `);

    const imageCardClass = useDynamicClass(`
        & {
            border: 2px solid ${selectedImage ? 'var(--nodius-primary-main)' : 'var(--nodius-background-paper)'};
            border-radius: 8px;
            padding: 8px;
            background-color: var(--nodius-background-default);
            cursor: ${mode === 'select' ? 'pointer' : 'default'};
            transition: var(--nodius-transition-default);
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        &:hover {
            border-color: ${mode === 'select' ? 'var(--nodius-primary-main)' : 'var(--nodius-background-paper)'};
            box-shadow: var(--nodius-shadow-2);
        }
    `);

    const imageThumbClass = useDynamicClass(`
        & {
            width: 100%;
            aspect-ratio: 1;
            object-fit: cover;
            border-radius: 4px;
            background-color: var(--nodius-background-paper);
        }
    `);

    const imageInfoClass = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-size: 12px;
        }
        & .name {
            font-weight: 500;
            color: var(--nodius-text-primary);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        & .meta {
            color: var(--nodius-text-secondary);
            font-size: 11px;
        }
    `);

    const actionsClass = useDynamicClass(`
        & {
            display: flex;
            gap: 4px;
            justify-content: flex-end;
        }
        & button {
            padding: 4px;
            border: none;
            background: none;
            cursor: pointer;
            color: var(--nodius-text-secondary);
            border-radius: 4px;
            transition: var(--nodius-transition-default);
        }
        & button:hover {
            background-color: var(--nodius-background-paper);
            color: var(--nodius-text-primary);
        }
    `);

    const paginationClass = useDynamicClass(`
        & {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-top: 1px solid var(--nodius-background-paper);
        }
        & .info {
            color: var(--nodius-text-secondary);
            font-size: 14px;
        }
        & .buttons {
            display: flex;
            gap: 8px;
        }
    `);

    const emptyStateClass = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 64px 32px;
            color: var(--nodius-text-secondary);
            text-align: center;
            gap: 16px;
        }
        & svg {
            opacity: 0.5;
        }
        & p {
            margin: 0;
        }
    `);

    return (
        <div className={containerClass}>
            {/* Toolbar */}
            <div className={toolbarClass}>
                {/* Search */}
                <div className={searchBoxClass}>
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder="Search images..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Sort */}
                <button
                    className={buttonClass}
                    onClick={() => {
                        if (sortField === 'name') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                            setSortField('name');
                            setSortOrder('asc');
                        }
                    }}
                    title="Sort by name"
                >
                    <FileText size={16} />
                    {sortField === 'name' && (sortOrder === 'asc' ? <SortAsc size={16} /> : <SortDesc size={16} />)}
                </button>

                <button
                    className={buttonClass}
                    onClick={() => {
                        if (sortField === 'uploadedAt') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                            setSortField('uploadedAt');
                            setSortOrder('desc');
                        }
                    }}
                    title="Sort by date"
                >
                    <Calendar size={16} />
                    {sortField === 'uploadedAt' && (sortOrder === 'asc' ? <SortAsc size={16} /> : <SortDesc size={16} />)}
                </button>

                <button
                    className={buttonClass}
                    onClick={() => {
                        if (sortField === 'size') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                            setSortField('size');
                            setSortOrder('desc');
                        }
                    }}
                    title="Sort by size"
                >
                    <HardDrive size={16} />
                    {sortField === 'size' && (sortOrder === 'asc' ? <SortAsc size={16} /> : <SortDesc size={16} />)}
                </button>

                {/* Upload Button */}
                <button
                    className={uploadButtonClass}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                >
                    <Upload size={16} />
                    {uploading ? 'Uploading...' : 'Upload'}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => handleUpload(e.target.files)}
                />
            </div>

            {/* Drop Zone / Image Grid */}
            <div
                className={dropZoneClass}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {loading ? (
                    <div className={emptyStateClass}>
                        <p>Loading images...</p>
                    </div>
                ) : filteredAndSortedImages.length === 0 ? (
                    <div className={emptyStateClass}>
                        <Image size={64} />
                        <div>
                            <p style={{ fontSize: '16px', fontWeight: 500, color: 'var(--nodius-text-primary)' }}>
                                No images found
                            </p>
                            <p>Upload your first image or adjust your filters</p>
                        </div>
                    </div>
                ) : (
                    <div className={gridClass}>
                        {filteredAndSortedImages.map((image) => (
                            <div
                                key={image.token}
                                className={imageCardClass}
                                style={{
                                    borderColor: selectedImage === image.token ? 'var(--nodius-primary-main)' : undefined
                                }}
                                onClick={() => {
                                    if (mode === 'select') {
                                        setSelectedImage(image.token);
                                    }
                                }}
                                onDoubleClick={() => handleSelect(image)}
                            >
                                {/* Thumbnail */}
                                {image.data && (
                                    <img
                                        src={`data:${image.mimeType};base64,${image.data}`}
                                        alt={image.name}
                                        className={imageThumbClass}
                                    />
                                )}

                                {/* Info */}
                                <div className={imageInfoClass}>
                                    {editingImageId === image.token ? (
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <input
                                                type="text"
                                                value={editingName}
                                                onChange={(e) => setEditingName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveRename(image.token);
                                                    if (e.key === 'Escape') cancelRename();
                                                }}
                                                style={{
                                                    flex: 1,
                                                    padding: '2px 4px',
                                                    fontSize: '12px',
                                                    border: '1px solid var(--nodius-primary-main)',
                                                    borderRadius: '4px',
                                                    background: 'var(--nodius-background-default)',
                                                    color: 'var(--nodius-text-primary)'
                                                }}
                                                autoFocus
                                            />
                                            <button onClick={() => saveRename(image.token)} title="Save">
                                                <Check size={12} />
                                            </button>
                                            <button onClick={cancelRename} title="Cancel">
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="name" title={image.name}>
                                            {image.name}
                                        </div>
                                    )}
                                    <div className="meta">
                                        {formatBytes(image.size)} • {image.width}×{image.height}
                                    </div>
                                    <div className="meta" title={new Date(image.uploadedAt).toLocaleString()}>
                                        {new Date(image.uploadedAt).toLocaleDateString()}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className={actionsClass}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            startRename(image);
                                        }}
                                        title="Rename"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(image.token);
                                        }}
                                        title="Delete"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Pagination */}
            {!loading && total > pageSize && (
                <div className={paginationClass}>
                    <div className="info">
                        Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {total}
                    </div>
                    <div className="buttons">
                        <button
                            className={buttonClass}
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                        >
                            <ChevronLeft size={16} />
                            Previous
                        </button>
                        <button
                            className={buttonClass}
                            onClick={() => setPage(p => p + 1)}
                            disabled={(page + 1) * pageSize >= total}
                        >
                            Next
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Select Button (only in select mode) */}
            {mode === 'select' && selectedImage && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--nodius-background-paper)' }}>
                    <button
                        className={uploadButtonClass}
                        onClick={() => {
                            const image = images.find(img => img.token === selectedImage);
                            if (image) handleSelect(image);
                        }}
                    >
                        <Check size={16} />
                        Select Image
                    </button>
                </div>
            )}
        </div>
    );
};
