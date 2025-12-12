/**
 * @file imageManagerHelper.ts
 * @description Helper functions to open ImageManagerModal easily
 */

import React from 'react';
import { modalManager } from '../../process/modal/ModalManager';
import { ImageManagerModal } from '../component/ImageManagerModal';

export interface OpenImageManagerOptions {
    /** Workspace to filter images */
    workspace: string;
    /** Node ID for modal context */
    nodeId: string;
    /** Mode: 'select' allows selecting, 'view' is read-only */
    mode?: 'select' | 'view';
    /** Callback when image is selected (only in select mode) */
    onSelect?: (imageUrl: string, imageToken: string, imageName: string) => void;
}

/**
 * Open image manager modal for selecting an image
 *
 * @example
 * ```typescript
 * await openImageManager({
 *   workspace: 'my-workspace',
 *   nodeId: 'node-123',
 *   mode: 'select',
 *   onSelect: (url, token, name) => {
 *     console.log('Selected:', name, url);
 *   }
 * });
 * ```
 */
export async function openImageManager(options: OpenImageManagerOptions): Promise<string> {
    const { workspace, nodeId, mode = 'select', onSelect } = options;

    // Variable to store modal ID
    let modalId: string;

    // Open modal with ModalManager using JSX directly
    modalId = await modalManager.open({
        nodeId,
        title: mode === 'select' ? 'Select Image' : 'Image Manager',
        content: <ImageManagerModal
            workspace={workspace}
            mode={mode}
            onSelect={(imageUrl: string, imageToken: string, imageName: string) => {
                if (onSelect) {
                    onSelect(imageUrl, imageToken, imageName);
                }
                // Close modal after selection (only in select mode)
                if (mode === 'select') {
                    modalManager.close(modalId);
                }
            }}
            onClose={() => {
                modalManager.close(modalId);
            }}
        />,
        width: '900px',
        height: '700px'
    });

    return modalId;
}

/**
 * Open image manager in view-only mode (for managing images without selecting)
 *
 * @example
 * ```typescript
 * await openImageManagerViewMode({
 *   workspace: 'my-workspace',
 *   nodeId: 'node-123'
 * });
 * ```
 */
export async function openImageManagerViewMode(options: {
    workspace: string;
    nodeId: string;
}): Promise<string> {
    return openImageManager({
        ...options,
        mode: 'view'
    });
}
