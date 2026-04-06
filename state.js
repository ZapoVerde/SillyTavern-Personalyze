/**
 * @file data/default-user/extensions/personalyze/state.js
 * @stamp {"utc":"2026-04-05T00:00:00.000Z"}
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
 * setWorkshopCharacter(characterId)        — Sets the character open in the Workshop.
 * resetState()                             — Restores state to factory defaults.
 * updateActiveCharacter(characterId)       — Sets the currently tracked character.
 * updateActivePointers(outfit, expression) — Updates the active outfit/expression keys.
 * updateChainEntry(characterId, outfit, expression, image) — Updates one character's chain slot.
 * getChainEntry(characterId)              — Returns a character's last-known state or null.
 * bulkInitState(data)                      — Hydrates state from a reconstruction pass.
 * setFileIndex(files)                      — Overwrites the known image file set.
 * addToFileIndex(file)                     — Appends a single filename to the known set.
 * setActiveRoster(roster)                  — Replaces the active character roster for this chat.
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

    // Per-chat roster — the set of character IDs enabled for the active chat.
    // Empty array = nothing enabled; pipeline stays dormant.
    // Rebuilt from the chat's pointer history on every chat load (last roster
    // record in the DNA chain wins). Changed explicitly by the user via the
    // Workshop Roster tab; each change writes a roster record to the last AI turn.
    activeRoster: [],   // string[]

    // DNA Chain — last-known visual state per character.
    // Keyed by characterId. Rebuilt from message pointers on every chat load
    // so it correctly reflects the active branch of the conversation.
    // Future: outfit frequency counts for Markov prediction can be added here.
    characterChain: {},   // { [characterId]: { outfit, expression, image } }

    // Filesystem cache — set of filenames confirmed present on the server
    fileIndex: new Set(),

    // Workshop (Temporary UI State)
    _workshopCharacterId: null,   // string | null — character currently open in Studio tab
}

/**
 * Sets the character currently being edited in the Workshop.
 * @param {string|null} characterId
 */
export function setWorkshopCharacter(characterId) {
    state._workshopCharacterId = characterId ?? null;
}

/**
 * Restores the entire state to its initial null/empty values.
 * Called on chat change.
 */
export function resetState() {
    state.activeCharacterId    = null;
    state.activeOutfitKey      = null;
    state.activeExpressionKey  = null;
    state.activeImageFile      = null;
    state.activeRoster         = [];
    state.characterChain       = {};
    state.fileIndex            = new Set();
    state._workshopCharacterId = null;
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
 * Updates a single character's DNA chain slot with their latest visual state.
 * Called by the pipeline after each resolved turn.
 * @param {string}      characterId
 * @param {string|null} outfit
 * @param {string|null} expression
 * @param {string|null} image
 */
export function updateChainEntry(characterId, outfit, expression, image) {
    state.characterChain[characterId] = { outfit, expression, image };
}

/**
 * Returns the last-known visual state for a character, or null if unseen.
 * @param {string} characterId
 * @returns {{ outfit: string|null, expression: string|null, image: string|null }|null}
 */
export function getChainEntry(characterId) {
    return state.characterChain[characterId] ?? null;
}

/**
 * Performs a bulk hydration of state from a reconstruction pass.
 * Called by the bootstrapper after reading the chat's pointer history.
 * @param {object}   data
 * @param {object}   data.characterChain
 * @param {string[]} data.activeRoster
 * @param {string|null} data.activeCharacterId
 * @param {string|null} data.activeOutfitKey
 * @param {string|null} data.activeExpressionKey
 * @param {string|null} data.activeImageFile
 */
export function bulkInitState({ characterChain, activeRoster, activeCharacterId, activeOutfitKey, activeExpressionKey, activeImageFile }) {
    state.characterChain      = characterChain      ?? {};
    state.activeRoster        = Array.isArray(activeRoster) ? activeRoster : [];
    state.activeCharacterId   = activeCharacterId   ?? null;
    state.activeOutfitKey     = activeOutfitKey     ?? null;
    state.activeExpressionKey = activeExpressionKey ?? null;
    state.activeImageFile     = activeImageFile     ?? null;
}

/**
 * Replaces the active character roster for this chat.
 * Called when the user toggles characters in the Workshop Roster tab.
 * @param {string[]} roster
 */
export function setActiveRoster(roster) {
    state.activeRoster = Array.isArray(roster) ? [...roster] : [];
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

/**
 * Removes a list of filenames from the in-memory file index.
 * @param {string[]} filenames
 */
export function removeFromFileIndex(filenames) {
    for (const f of filenames) state.fileIndex.delete(f);
}
