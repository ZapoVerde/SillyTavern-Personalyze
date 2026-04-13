/**
 * @file data/default-user/extensions/personalyze/io/image/maintenance.js
 * @stamp {"utc":"2026-04-16T14:00:00.000Z"}
 * @architectural-role IO Utility (Asset Cleanup)
 * @description
 * Handles purely destructive filesystem operations for PersonaLyze.
 * Provides specialized logic for asset garbage collection and cache management.
 * 
 * @api-declaration
 * deleteFiles(filenames) -> Promise<string[]>
 * flushAllImages() -> Promise<string[]>
 * flushChatImages(characterIds) -> Promise<string[]>
 * 
 * @contract
 *   assertions:
 *     purity: IO Utility (Destructive)
 *     state_ownership: []
 *     external_io: [/api/images/delete]
 */

import { getRequestHeaders } from '../../../../script.js';
import { PLZ_IMAGE_FOLDER } from '../../defaults.js';
import { fetchFileIndex, FILE_PREFIX } from './registry.js';

/**
 * Pure IO Executor for batch asset deletion.
 * Caller is responsible for state reconciliation (removeFromFileIndex).
 * 
 * @param {string[]} filenames 
 * @returns {Promise<string[]>} List of deleted filenames.
 */
export async function deleteFiles(filenames) {
    if (!filenames || filenames.length === 0) return [];
    
    await Promise.all(filenames.map(f =>
        fetch('/api/images/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ path: `user/images/${PLZ_IMAGE_FOLDER}/${f}` }),
        })
    ));
    
    return filenames;
}

/**
 * Maintenance: Deletes all images in the extension folder.
 * 
 * @returns {Promise<string[]>} List of deleted filenames.
 */
export async function flushAllImages() {
    const { fileIndex } = await fetchFileIndex();
    const toDelete = Array.from(fileIndex);
    return await deleteFiles(toDelete);
}

/**
 * Maintenance: Deletes images for a specific set of characters.
 * 
 * @param {string[]} characterIds 
 * @returns {Promise<string[]>} List of deleted filenames.
 */
export async function flushChatImages(characterIds) {
    if (!characterIds || characterIds.length === 0) return [];
    
    const { fileIndex } = await fetchFileIndex();
    const toDelete = Array.from(fileIndex).filter(f => 
        characterIds.some(id => f.startsWith(`${FILE_PREFIX}${id}_`))
    );
    
    return await deleteFiles(toDelete);
}