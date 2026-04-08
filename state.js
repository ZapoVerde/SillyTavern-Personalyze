/**
 * @file data/default-user/extensions/personalyze/state.js
 * @stamp {"utc":"2026-04-07T12:10:00.000Z"}
 * @architectural-role Stateful Owner (Runtime State)
 * @description
 * Single source of truth for all PersonaLyze in-memory runtime state.
 *
 * Tracks the active character, their current outfit and expression pointers,
 * and the local wardrobe definitions (DNA) derived from the chat history.
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
 * getChainEntry(characterId)               — Returns a character's last-known state or null.
 * bulkInitState(data)                      — Hydrates state from a reconstruction pass.
 * setFileIndex(files)                      — Overwrites the known image file set.
 * addToFileIndex(file)                     — Appends a single filename to the known set.
 * setActiveRoster(roster)                  — Replaces the active character roster for this chat.
 * upsertChatCharacterDef(id, anchor, seed) — Updates local DNA identity.
 * upsertChatOutfitDef(id, key, label, desc, provider) — Updates local DNA outfit.
 * upsertChatExpressionDef(id, key, label, desc) — Updates local DNA expression.
 */

export const state = {
    // Active character for the current chat turn
    activeCharacterId: null,

    // Current visual pointers
    activeOutfitKey:      null,
    activeExpressionKey:  null,
    activeImageFile:      null, // resolved filename on disk

    // Local DNA definitions (The "Working Copy" of the character library for this chat)
    // Keyed by characterId.
    chatCharacters: {}, // { [id]: { identityAnchor, seed, outfits: {}, expressions: {} } }

    // Per-chat roster — the set of character IDs enabled for the active chat.
    activeRoster: [],

    // Last-known visual pointers per character.
    // Keyed by characterId. Rebuilt from DNA array on every chat load.
    characterChain: {}, // { [characterId]: { outfit, expression, image } }

    // Filesystem cache — set of filenames confirmed present on the server
    fileIndex: new Set(),

    // Workshop (Temporary UI State)
    _workshopCharacterId: null,
};

/**
 * Sets the character currently being edited in the Workshop.
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
    state.chatCharacters       = {};
    state.activeRoster         = [];
    state.characterChain       = {};
    state.fileIndex            = new Set();
    state._workshopCharacterId = null;
}

/**
 * Sets the character currently being tracked for this chat turn.
 */
export function updateActiveCharacter(characterId) {
    state.activeCharacterId = characterId;
}

/**
 * Updates the active outfit and expression pointer keys.
 */
export function updateActivePointers(outfitKey, expressionKey) {
    state.activeOutfitKey     = outfitKey;
    state.activeExpressionKey = expressionKey;
}

/**
 * Updates the filename of the currently displayed portrait image.
 */
export function updateActiveImage(filename) {
    state.activeImageFile = filename;
}

/**
 * Updates a single character's DNA chain slot with their latest visual state.
 * Called by the pipeline after each resolved turn.
 */
export function updateChainEntry(characterId, outfit, expression, image) {
    state.characterChain[characterId] = { outfit, expression, image };
}

/**
 * Returns the last-known visual state for a character, or null if unseen.
 */
export function getChainEntry(characterId) {
    return state.characterChain[characterId] ?? null;
}

/**
 * Performs a bulk hydration of state from a reconstruction pass.
 */
export function bulkInitState({ chatCharacters, characterChain, activeRoster, activeCharacterId, activeOutfitKey, activeExpressionKey, activeImageFile }) {
    state.chatCharacters      = structuredClone(chatCharacters ?? {});
    state.characterChain      = structuredClone(characterChain ?? {});
    state.activeRoster        = Array.isArray(activeRoster) ? [...activeRoster] : [];
    state.activeCharacterId   = activeCharacterId   ?? null;
    state.activeOutfitKey     = activeOutfitKey     ?? null;
    state.activeExpressionKey = activeExpressionKey ?? null;
    state.activeImageFile     = activeImageFile     ?? null;
}

/**
 * Replaces the active character roster for this chat.
 */
export function setActiveRoster(roster) {
    state.activeRoster = Array.isArray(roster) ? [...roster] : [];
}

/**
 * Overwrites the file index with a fresh list from the server.
 */
export function setFileIndex(files) {
    state.fileIndex = new Set(files);
}

/**
 * Appends a single confirmed filename to the file index.
 */
export function addToFileIndex(filename) {
    state.fileIndex.add(filename);
}

/**
 * Removes a list of filenames from the in-memory file index.
 */
export function removeFromFileIndex(filenames) {
    for (const f of filenames) state.fileIndex.delete(f);
}

// ─── Local DNA Setters ───────────────────────────────────────────────────────

/** Internal helper to ensure a character structure exists in the chat DNA. */
function _ensureChatChar(id) {
    if (!state.chatCharacters[id]) {
        state.chatCharacters[id] = { identityAnchor: '', seed: 1, outfits: {}, expressions: {} };
    }
    return state.chatCharacters[id];
}

/** Updates identity anchor and seed for a character in the local DNA. */
export function upsertChatCharacterDef(id, anchor, seed) {
    const char = _ensureChatChar(id);
    char.identityAnchor = anchor;
    char.seed = seed;
}

/** Adds or updates an outfit for a character in the local DNA. */
export function upsertChatOutfitDef(id, key, label, description, provider) {
    const char = _ensureChatChar(id);
    char.outfits[key] = { label, description, provider };
}

/** Adds or updates an expression for a character in the local DNA. */
export function upsertChatExpressionDef(id, key, label, description) {
    const char = _ensureChatChar(id);
    char.expressions[key] = { label, description };
}