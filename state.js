/**
 * @file data/default-user/extensions/personalyze/state.js
 * @stamp {"utc":"2026-04-10T11:00:00.000Z"}
 * @architectural-role Stateful Owner (Runtime State)
 * @description
 * Single source of truth for all PersonaLyze in-memory runtime state.
 * 
 * Tracks the active character, their current layered visual state (Outerwear, Top, 
 * Bottom, Accessories, Emotion), and the local DNA derived from chat history.
 *
 * @api-declaration
 * state                                    — Read-only access to runtime data.
 * setWorkshopCharacter(characterId)        — Sets the character open in the Workshop.
 * resetState()                             — Restores state to factory defaults.
 * updateActiveCharacter(characterId)       — Sets the currently tracked character.
 * updateActiveLayers(layers)               — Sets the active 5-slot visual state.
 * updateActiveImage(filename)              — Updates the resolved filename on disk.
 * updateChainLayers(characterId, layers, image) — Updates one character's chain slot.
 * getChainEntry(characterId)               — Returns a character's last-known state or null.
 * bulkInitState(data)                      — Hydrates state from a reconstruction pass.
 * setFileIndex(files)                      — Overwrites the known image file set.
 * addToFileIndex(file)                     — Appends a filename to the set.
 * removeFromFileIndex(filenames)           — Removes filenames from the set.
 * setActiveRoster(roster)                  — Replaces the active roster for this chat.
 * upsertChatCharacterDef(id, anchor, seed) — Updates local DNA identity.
 * upsertChatCharacterLabel(id, label)      — Updates a character's display label.
 * upsertChatCharacterEngine(id, engine)   — Updates a character's pinned image engine.
 * upsertChatEnsemble(id, key, label, layers) — Updates local DNA ensemble (saved layers).
 * deleteChatEnsemble(id, key)              — Removes an ensemble from local DNA.
 * upsertChatCharacterAka(id, akaList)      — Updates a character's AKA aliases.
 * upsertChatDefaultEnsemble(id, key)       — Updates a character's designated default ensemble.
 * resolveAliasToId(detectedName)           — Maps a raw name to a canonical character ID.
 * 
 * @contract
 *   assertions:
 *     purity: Stateful Owner
 *     state_ownership: [state]
 *     external_io: []
 */

export const state = {
    // Active character for the current chat turn
    activeCharacterId: null,

    // Current visual state (The Layered Snapshot)
    activeLayers: {
        outerwear:   null, // { item, modifier }
        top:         null, // { item, modifier }
        bottom:      null, // { item, modifier }
        accessories: null, // { item, modifier }
        emotion:     'neutral' // string (adjective)
    },
    
    activeImageFile: null, // resolved filename on disk

    // Local DNA definitions
    // Keyed by characterId.
    chatCharacters: {}, // { [id]: { label, identityAnchor, seed, engine: string|null, ensembles: {}, aka: string[], defaultEnsemble: string|null } }

    // Per-chat roster
    activeRoster: [],

    // Last-known visual state per character.
    // Keyed by characterId. { layers, image }
    characterChain: {},

    // Filesystem cache
    fileIndex: new Set(),

    // Workshop (Temporary UI State)
    _workshopCharacterId: null,
};

/** Sets the character currently being edited in the Workshop. */
export function setWorkshopCharacter(characterId) {
    state._workshopCharacterId = characterId ?? null;
}

/** Restores the entire state to defaults. Called on chat change. */
export function resetState() {
    state.activeCharacterId    = null;
    state.activeLayers = {
        outerwear: null, top: null, bottom: null, accessories: null, emotion: 'neutral'
    };
    state.activeImageFile      = null;
    state.chatCharacters       = {};
    state.activeRoster         = [];
    state.characterChain       = {};
    state.fileIndex            = new Set();
    state._workshopCharacterId = null;
}

/** Sets the character currently being tracked for this chat turn. */
export function updateActiveCharacter(characterId) {
    state.activeCharacterId = characterId;
}

/** Updates the active 5-slot visual state. */
export function updateActiveLayers(layers) {
    state.activeLayers = structuredClone(layers);
}

/** Updates the filename of the currently displayed portrait image. */
export function updateActiveImage(filename) {
    state.activeImageFile = filename;
}

/** Updates a single character's DNA chain slot with their latest visual state. */
export function updateChainLayers(characterId, layers, image) {
    state.characterChain[characterId] = { 
        layers: structuredClone(layers), 
        image 
    };
}

/** Returns the last-known visual state for a character, or null if unseen. */
export function getChainEntry(characterId) {
    return state.characterChain[characterId] ?? null;
}

/** Performs a bulk hydration of state from a reconstruction pass. */
export function bulkInitState({ chatCharacters, characterChain, activeRoster, activeCharacterId, activeLayers, activeImageFile }) {
    state.chatCharacters      = structuredClone(chatCharacters ?? {});
    state.characterChain      = structuredClone(characterChain ?? {});
    state.activeRoster        = Array.isArray(activeRoster) ? [...activeRoster] : [];
    state.activeCharacterId   = activeCharacterId   ?? null;
    state.activeLayers        = structuredClone(activeLayers ?? {
        outerwear: null, top: null, bottom: null, accessories: null, emotion: 'neutral'
    });
    state.activeImageFile     = activeImageFile     ?? null;
}

/** Replaces the active character roster for this chat. */
export function setActiveRoster(roster) {
    state.activeRoster = Array.isArray(roster) ? [...roster] : [];
}

/** Overwrites the file index. */
export function setFileIndex(files) {
    state.fileIndex = new Set(files);
}

/** Appends a confirmed filename. */
export function addToFileIndex(filename) {
    state.fileIndex.add(filename);
}

/** Removes filenames from the in-memory index. */
export function removeFromFileIndex(filenames) {
    for (const f of filenames) state.fileIndex.delete(f);
}

// ─── Local DNA Setters ───────────────────────────────────────────────────────

function _ensureChatChar(id) {
    if (!state.chatCharacters[id]) {
        state.chatCharacters[id] = { label: id.replace(/_/g, ' '), identityAnchor: '', seed: 1, engine: null, ensembles: {}, aka: [], defaultEnsemble: null, styleName: null };
    }
    return state.chatCharacters[id];
}

/** Updates identity anchor and seed for a character in local DNA. */
export function upsertChatCharacterDef(id, anchor, seed) {
    const char = _ensureChatChar(id);
    char.identityAnchor = anchor;
    char.seed = seed;
}

/** Updates a character's display label in local DNA. */
export function upsertChatCharacterLabel(id, label) {
    const char = _ensureChatChar(id);
    char.label = label;
}

/** Updates a character's pinned image engine in local DNA. */
export function upsertChatCharacterEngine(id, engine) {
    const char = _ensureChatChar(id);
    char.engine = engine || null;
}

/** Adds or updates an ensemble (saved layer snapshot) for a character. */
export function upsertChatEnsemble(id, key, label, layers) {
    const char = _ensureChatChar(id);
    char.ensembles[key] = { label, layers: structuredClone(layers) };
}

/** Removes an ensemble from a character in the local DNA. */
export function deleteChatEnsemble(id, key) {
    const char = _ensureChatChar(id);
    delete char.ensembles[key];
    if (char.defaultEnsemble === key) {
        char.defaultEnsemble = null;
    }
}

/** Updates a character's AKA aliases. */
export function upsertChatCharacterAka(id, akaList) {
    const char = _ensureChatChar(id);
    char.aka = Array.isArray(akaList) ? [...akaList] : [];
}

/** Updates a character's designated default ensemble key. */
export function upsertChatDefaultEnsemble(id, key) {
    const char = _ensureChatChar(id);
    char.defaultEnsemble = key ?? null;
}

/** Updates a character's pinned portrait style name. */
export function upsertChatCharacterStyle(id, styleName) {
    const char = _ensureChatChar(id);
    char.styleName = styleName || null;
}

// ─── Reverse Lookup ──────────────────────────────────────────────────────────

/**
 * Maps a raw detected name back to a canonical character ID.
 * Checks exact ID matches first, then checks alias arrays.
 * 
 * @param {string} detectedName - The raw name output by the LLM.
 * @returns {string|null} - The canonical ID, or null if genuinely unknown.
 */
export function resolveAliasToId(detectedName) {
    if (!detectedName) return null;

    const target = detectedName.trim().toLowerCase();

    for (const [id, char] of Object.entries(state.chatCharacters)) {
        // 1. Exact key match (accounting for slug differences)
        if (id.toLowerCase().replace(/_/g, ' ') === target.replace(/_/g, ' ')) {
            return id;
        }

        // 2. Label match
        if (char.label && char.label.toLowerCase() === target) {
            return id;
        }

        // 3. AKA match
        if (char.aka && char.aka.some(alias => alias.toLowerCase() === target)) {
            return id;
        }
    }

    return null;
}