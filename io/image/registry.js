/**
 * @file data/default-user/extensions/personalyze/io/image/registry.js
 * @stamp {"utc":"2026-04-16T13:40:00.000Z"}
 * @architectural-role IO Utility (Asset Metadata)
 * @description
 * Manages filename construction, cache lookups, and filesystem indexing.
 * Provides the source of truth for which PersonaLyze assets exist on disk.
 * 
 * @api-declaration
 * FILE_PREFIX
 * buildFilenamePrefix(characterId, tag, emotion) -> string
 * findCachedImage(prefix, fileIndex) -> string|null
 * fetchFileIndex() -> Promise<{ fileIndex: Set<string>, allImages: string[] }>
 * 
 * @contract
 *   assertions:
 *     purity: IO Utility / Naming
 *     state_ownership: []
 *     external_io: [/api/images/list]
 */

import { getRequestHeaders } from '../../../../script.js';
import { PLZ_IMAGE_FOLDER } from '../../defaults.js';

/** Standard prefix for all PersonaLyze image files. */
export const FILE_PREFIX = 'plz_';

/**
 * Builds a standardized filename prefix for a character's state.
 * 
 * @param {string} characterId 
 * @param {string} tag - Generation source (layered, manual, redress)
 * @param {string} emotion - Slugified emotion label
 * @returns {string}
 */
export function buildFilenamePrefix(characterId, tag, emotion) {
    return `${FILE_PREFIX}${characterId}_${tag}_${emotion}_`;
}

/**
 * Scans a file index for the latest match of a given prefix.
 * Implements timestamp-based "best match" logic.
 * 
 * @param {string} prefix 
 * @param {Set<string>} fileIndex 
 * @returns {string|null}
 */
export function findCachedImage(prefix, fileIndex) {
    let best = null;
    for (const f of fileIndex) {
        if (f.startsWith(prefix) && (!best || f > best)) best = f;
    }
    return best;
}

/**
 * Fetches the current list of images from the extension folder.
 * Filters for the PersonaLyze prefix.
 * 
 * @returns {Promise<{ fileIndex: Set<string>, allImages: string[] }>}
 */
export async function fetchFileIndex() {
    const res = await fetch('/api/images/list', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ folder: PLZ_IMAGE_FOLDER }),
    });
    
    if (!res.ok) {
        throw new Error(`Failed to fetch file index: ${res.status}`);
    }

    const allImages = await res.json();
    const fileIndex = new Set(allImages.filter(f => f.startsWith(FILE_PREFIX)));
    
    return { fileIndex, allImages };
}