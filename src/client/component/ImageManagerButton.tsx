/**
 * @file ImageManagerButton.tsx
 * @description Reusable button component to open Image Manager
 *
 * This component can be used anywhere in the app to provide quick access
 * to the Image Manager modal.
 */

import React, { useCallback } from 'react';
import { Image } from 'lucide-react';
import { openImageManager, openImageManagerViewMode } from '../utils/imageManagerHelper';

export interface ImageManagerButtonProps {
    /** Workspace to filter images */
    workspace: string;
    /** Mode: 'select' for picking images, 'view' for managing only */
    mode?: 'select' | 'view';
    /** Callback when image is selected (only used in select mode) */
    onSelect?: (imageUrl: string, imageToken: string, imageName: string) => void;
    /** Button text */
    label?: string;
    /** Button class name */
    className?: string;
    /** Button style */
    style?: React.CSSProperties;
    /** Icon size */
    iconSize?: number;
}

/**
 * Button to open Image Manager modal
 *
 * @example
 * // For selecting an image
 * <ImageManagerButton
 *   workspace="default"
 *   mode="select"
 *   onSelect={(url, token, name) => {
 *     console.log('Selected:', name);
 *   }}
 * />
 *
 * @example
 * // For viewing/managing images
 * <ImageManagerButton
 *   workspace="gallery"
 *   mode="view"
 *   label="Manage Gallery"
 * />
 */
export const ImageManagerButton: React.FC<ImageManagerButtonProps> = ({
    workspace,
    mode = 'view',
    onSelect,
    label,
    className,
    style,
    iconSize = 16
}) => {
    const handleClick = useCallback(async () => {
        if (mode === 'select' && onSelect) {
            await openImageManager({
                workspace,
                nodeId: `image-manager}`,
                mode: 'select',
                onSelect
            });
        } else {
            await openImageManagerViewMode({
                workspace,
                nodeId: `image-manager}`
            });
        }
    }, [workspace, mode, onSelect]);

    return (
        <button
            onClick={handleClick}
            className={className}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                border: '1px solid var(--nodius-primary-main)',
                borderRadius: '8px',
                backgroundColor: 'var(--nodius-background-default)',
                color: 'var(--nodius-primary-main)',
                cursor: 'pointer',
                transition: 'var(--nodius-transition-default)',
                ...style
            }}
        >
            <Image size={iconSize} />
            {label || (mode === 'select' ? 'Select Image' : 'Image Manager')}
        </button>
    );
};
