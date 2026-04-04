/**
 * @file data/default-user/extensions/personalyze/state.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role Stateful Owner (Runtime State)
 * @description
 * Single source of truth for all PersonaLyze in-memory runtime state.
 *
 * Tracks the active character, their current outfit and expression pointers,
 * and the set of image files known to exist on the server. All state is
 * derived from pointer reconstruction on chat load and updated by the
 * pipeline on each new message.
 *
 * STRICT CONTRACT:
 * 1. This module is the ONLY module permitted to mutate the 'state' object.
 * 2. External modules MUST use the provided Setter API for all updates.
 * 3. External modules may READ from the exported 'state' object directly.
 * 4. All objects passed into setters are structured-cloned to prevent reference leaks.
 *
 * @api-declaration
 * state                                    — Read-only access to runtime data.
 * resetState()                             — Restores state to factory defaults.
 * updateActiveCharacter(characterId)       — Sets the currently tracked character.
 * updateActivePointers(outfit, expression) — Updates the active outfit/expression keys.
 * bulkInitState(data)                      — Hydrates state from a reconstruction pass.
 * setFileIndex(files)                      — Overwrites the known image file set.
 * addToFileIndex(file)                     — Appends a single filename to the known set.
 *
 * @contract
 *   assertions:
 *     purity: Stateful
 *     state_ownership: [state object]
 *     external_io: []
 */

export const state = {
    // Active character for the current chat turn
    activeCharacterId: null,  // string | null

    // Current visual pointers
    activeOutfitKey:      null,  // string | null
    activeExpressionKey:  null,  // string | null
    activeImageFile:      null,  // string | null — resolved filename on disk

    // Filesystem cache — set of filenames confirmed present on the server
    fileIndex: new Set(),
}

/**
 * Restores the entire state to its initial null/empty values.
 * Called on chat change.
 */
export function resetState() {
    state.activeCharacterId   = null;
    state.activeOutfitKey     = null;
    state.activeExpressionKey = null;
    state.activeImageFile     = null;
    state.fileIndex           = new Set();
}

/**
 * Sets the character currently being tracked for this chat turn.
 * @param {string|null} characterId
 */
export function updateActiveCharacter(characterId) {
    state.activeCharacterId = characterId;
}

/**
 * Updates the active outfit and expression pointer keys.
 * @param {string|null} outfitKey
 * @param {string|null} expressionKey
 */
export function updateActivePointers(outfitKey, expressionKey) {
    state.activeOutfitKey     = outfitKey;
    state.activeExpressionKey = expressionKey;
}

/**
 * Updates the filename of the currently displayed portrait image.
 * @param {string|null} filename
 */
export function updateActiveImage(filename) {
    state.activeImageFile = filename;
}

/**
 * Performs a bulk hydration of state from a reconstruction pass.
 * Called by the bootstrapper after reading the chat's pointer history.
 * @param {object} data
 * @param {string|null} data.activeCharacterId
 * @param {string|null} data.activeOutfitKey
 * @param {string|null} data.activeExpressionKey
 * @param {string|null} data.activeImageFile
 */
export function bulkInitState({ activeCharacterId, activeOutfitKey, activeExpressionKey, activeImageFile }) {
    state.activeCharacterId   = activeCharacterId   ?? null;
    state.activeOutfitKey     = activeOutfitKey     ?? null;
    state.activeExpressionKey = activeExpressionKey ?? null;
    state.activeImageFile     = activeImageFile     ?? null;
}

/**
 * Overwrites the file index with a fresh list from the server.
 * @param {string[]} files
 */
export function setFileIndex(files) {
    state.fileIndex = new Set(files);
}

/**
 * Appends a single confirmed filename to the file index.
 * @param {string} filename
 */
export function addToFileIndex(filename) {
    state.fileIndex.add(filename);
}
