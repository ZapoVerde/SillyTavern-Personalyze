/**
 * @file data/default-user/extensions/personalyze/library.js
 * @stamp {"utc":"2026-04-07T13:00:00.000Z"}
 * @architectural-role Stateful Owner (Global Library)
 * @description
 * Manages the Global Character Library in extension_settings.
 * 
 * In the DNA-first architecture, this library acts as a "Save Station" or 
 * template gallery. Characters are imported from here into a chat's DNA 
 * and exported from a chat's DNA back here for reuse.
 *
 * @api-declaration
 * initLibrary()                     — Initializes the global storage structure.
 * getLibraryCharacter(id)           — Returns a character template or null.
 * getAllLibraryIds()                 — Returns all character IDs in the library.
 * saveToLibrary(id, characterData)   — Snapshot a character to global storage.
 * removeFromLibrary(id)             — Deletes a template from global storage.
 *
 * @contract
 *   assertions:
 *     purity: Stateful Owner
 *     state_ownership: [extension_settings.personalyze.characters]
 *     external_io: [saveSettingsDebounced]
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { log, warn } from './utils/logger.js';
import { initSettings } from './settings.js';

const EXT_NAME = 'personalyze';

/**
 * Returns the root character storage object in settings.
 */
function getStorage() {
    return extension_settings[EXT_NAME].characters;
}

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * Ensures the global library structure exists in extension_settings.
 */
export function initLibrary() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = {};
    }

    const root = extension_settings[EXT_NAME];

    if (!root.characters) {
        log('Library', 'Creating fresh character storage...');
        root.characters = {};
        saveSettingsDebounced();
    }

    // Initialize profile-based settings (logic in settings.js)
    initSettings();

    log('Library', `Initialized. ${Object.keys(root.characters).length} template(s) available.`);
}

// ─── CRUD Operations ──────────────────────────────────────────────────────────

/**
 * Retrieves a character template from the global library.
 * @param {string} id 
 * @returns {object|null}
 */
export function getLibraryCharacter(id) {
    return getStorage()[id] ?? null;
}

/**
 * Returns a list of all character IDs currently in the global library.
 * @returns {string[]}
 */
export function getAllLibraryIds() {
    return Object.keys(getStorage());
}

/**
 * Saves a snapshot of a character definition to the global library.
 * Usually called during an "Export" action from a chat.
 * 
 * @param {string} id 
 * @param {object} characterData { identityAnchor, seed, outfits, expressions }
 */
export function saveToLibrary(id, characterData) {
    if (!id) return;
    
    getStorage()[id] = structuredClone(characterData);
    saveSettingsDebounced();
    
    log('Library', `Character "${id}" snapshot saved to library.`);
}

/**
 * Removes a character template from the global library.
 * @param {string} id 
 */
export function removeFromLibrary(id) {
    if (getStorage()[id]) {
        delete getStorage()[id];
        saveSettingsDebounced();
        log('Library', `Character "${id}" removed from library.`);
    }
}