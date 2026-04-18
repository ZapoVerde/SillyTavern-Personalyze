/**
 * @file data/default-user/extensions/personalyze/state.js
 * @stamp {"utc":"2026-04-17T13:10:00.000Z"}
 * @architectural-role Stateful Owner (Runtime State)
 * @description
 * Single source of truth for all PersonaLyze in-memory runtime state.
 * 
 * Updated for Granular Identity Architecture:
 * 1. Replaced identityAnchor (string) with identity (map of strings).
 * 2. Updated ensurers and setters to handle structured physical traits.
 * 
 * @api-declaration
 * state                                    — Read-only access to runtime data.
 * toggleCharacterFlip(characterId)         — Toggles the mirror state for a character.
 * setWorkshopCharacter(characterId)        — Sets the character open in the Workshop.
 * resetState()                             — Restores state to factory defaults.
 * updateActiveCharacter(characterId)       — Sets the currently tracked character.
 * updateActiveLayers(layers)               — Sets the active visual state.
 * updateActiveImage(filename)              — Updates the resolved filename on disk.
 * updateChainLayers(characterId, layers, image) — Updates one character's chain slot.
 * getChainEntry(characterId)               — Returns a character's last-known state or null.
 * bulkInitState(data)                      — Hydrates state from a reconstruction pass.
 * setFileIndex(files)                      — Overwrites the known image file set.
 * addToFileIndex(file)                     — Appends a filename to the set.
 * removeFromFileIndex(filenames)           — Removes filenames from the set.
 * setActiveRoster(roster)                  — Replaces the active roster for this chat.
 * upsertChatCharacterDef(id, identity, seed) — Updates local DNA identity map.
 * upsertChatCharacterLabel(id, label)      — Updates a character's display label.
 * upsertChatEnsemble(id, key, label, layers) — Updates local DNA ensemble.
 * deleteChatEnsemble(id, key)              — Removes an ensemble from local DNA.
 * upsertChatCharacterAka(id, akaList)      — Updates a character's AKA aliases.
 * upsertChatDefaultEnsemble(id, key)       — Updates a character's designated default ensemble.
 * upsertChatSlots(id, slots)               — Updates a character's custom slot schema.
 * resolveAliasToId(detectedName)           — Maps a raw name to a canonical character ID.
 * getCleanLayers(slots)                    — Returns a blank visual state for a new character.
 * 
 * @contract
 *   assertions:
 *     purity: Stateful Owner
 *     state_ownership: [state]
 *     external_io: [DOM (CustomEvents)]
 */

import { BASE_SLOTS, BASE_IDENTITY_SLOTS } from './defaults.js';

export const state = {
    // Active character for the current chat turn
    activeCharacterId: null,

    // Current visual state (The Layered Snapshot)
    activeLayers: {
        outerwear:   null,
        top:         null,
        bottom:      null,
        accessories: null,
        emotion:     'neutral',
        pose:        'upright'
    },
    
    activeImageFile: null,

    // Local DNA definitions
    // Keyed by characterId.
    chatCharacters: {}, // { [id]: { label, identity: {}, seed, ensembles, aka, defaultEnsemble, slots: string[], styleName } }

    // Per-chat roster
    activeRoster: [],

    // Last-known visual state per character.
    characterChain: {},

    // Filesystem cache
    fileIndex: new Set(),

    // Workshop (Temporary UI State)
    _workshopCharacterId: null,

    // Transient UI Preferences (Session-only, not saved to DNA)
    uiState: {}, // { [characterId]: { flipped: boolean } }
};

/**
 * Toggles the horizontal flip state for a specific character's portrait.
 * Dispatches 'plz:roster-render-req' to notify all active UI wrappers.
 * 
 * @param {string} characterId 
 */
export function toggleCharacterFlip(characterId) {
    if (!state.uiState[characterId]) {
        state.uiState[characterId] = { flipped: false };
    }
    state.uiState[characterId].flipped = !state.uiState[characterId].flipped;
    document.dispatchEvent(new CustomEvent('plz:roster-render-req'));
}

/** Sets the character currently being edited in the Workshop. */
export function setWorkshopCharacter(characterId) {
    state._workshopCharacterId = characterId ?? null;
}

/** Restores the entire state to defaults. Called on chat change. */
export function resetState() {
    state.activeCharacterId    = null;
    state.activeLayers = {
        outerwear: null, top: null, bottom: null, accessories: null, emotion: 'neutral', pose: 'upright'
    };
    state.activeImageFile      = null;
    state.chatCharacters       = {};
    state.activeRoster         = [];
    state.characterChain       = {};
    state.fileIndex            = new Set();
    state._workshopCharacterId = null;
    state.uiState              = {};
}

/** Sets the character currently being tracked for this chat turn. */
export function updateActiveCharacter(characterId) {
    state.activeCharacterId = characterId;
}

/** Updates the active visual state. */
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
        outerwear: null, top: null, bottom: null, accessories: null, emotion: 'neutral', pose: 'upright'
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

/**
 * Generates a blank visual state for a character.
 * 
 * @param {string[]} slots - The category list for this character.
 * @returns {object}
 */
export function getCleanLayers(slots) {
    const layers = {
        emotion: 'neutral',
        pose:    'upright'
    };
    (slots || BASE_SLOTS).forEach(s => {
        layers[s] = null;
    });
    return layers;
}

// ─── Local DNA Setters ───────────────────────────────────────────────────────
/**
 * Internal helper to guarantee a valid character structure exists in memory.
 */
export function ensureChatChar(id) {
    if (!state.chatCharacters[id]) {
        const defaultSeed = Math.floor(Math.random() * 999) + 1;

        state.chatCharacters[id] = { 
            label: id.replace(/_/g, ' '), 
            identity: {}, 
            seed: defaultSeed, 
            ensembles: {}, 
            aka: [], 
            defaultEnsemble: null, 
            styleName: null,
            slots: [...BASE_SLOTS], 
        };
        
        // Init with empty base identity slots
        BASE_IDENTITY_SLOTS.forEach(slot => {
            state.chatCharacters[id].identity[slot] = '';
        });
    }
    return state.chatCharacters[id];
}

/** Updates granular identity map and seed for a character in local DNA. */
export function upsertChatCharacterDef(id, identity, seed) {
    const char = ensureChatChar(id);
    if (typeof identity === 'object' && identity !== null) {
        char.identity = structuredClone(identity);
        // Guarantee BASE_IDENTITY_SLOTS are never lost from a partial identity write
        BASE_IDENTITY_SLOTS.forEach(slot => {
            if (char.identity[slot] === undefined) char.identity[slot] = '';
        });
    }
    char.seed = seed;
}

/** Updates a character's display label in local DNA. */
export function upsertChatCharacterLabel(id, label) {
    const char = ensureChatChar(id);
    char.label = label;
}

/** Adds or updates an ensemble (saved layer snapshot) for a character. */
export function upsertChatEnsemble(id, key, label, layers) {
    const char = ensureChatChar(id);
    char.ensembles[key] = { label, layers: structuredClone(layers) };
}

/** Removes an ensemble from a character in the local DNA. */
export function deleteChatEnsemble(id, key) {
    const char = ensureChatChar(id);
    delete char.ensembles[key];
    if (char.defaultEnsemble === key) {
        char.defaultEnsemble = null;
    }
}

/** Updates a character's AKA aliases. */
export function upsertChatCharacterAka(id, akaList) {
    const char = ensureChatChar(id);
    char.aka = Array.isArray(akaList) ? [...akaList] : [];
}

/** Updates a character's designated default ensemble key. */
export function upsertChatDefaultEnsemble(id, key) {
    const char = ensureChatChar(id);
    char.defaultEnsemble = key ?? null;
}

/** Updates a character's pinned portrait style name. */
export function upsertChatCharacterStyle(id, styleName) {
    const char = ensureChatChar(id);
    char.styleName = styleName || null;
}

/** Updates a character's custom wardrobe slot list. */
export function upsertChatSlots(id, slots) {
    const char = ensureChatChar(id);
    char.slots = Array.isArray(slots) ? [...slots] : [...BASE_SLOTS];
}

// ─── Reverse Lookup ──────────────────────────────────────────────────────────

/**
 * Maps a raw detected name back to a canonical character ID.
 */
export function resolveAliasToId(detectedName) {
    if (!detectedName) return null;
    const target = detectedName.trim().toLowerCase();
    for (const [id, char] of Object.entries(state.chatCharacters)) {
        if (id.toLowerCase().replace(/_/g, ' ') === target.replace(/_/g, ' ')) return id;
        if (char.label && char.label.toLowerCase() === target) return id;
        if (char.aka && char.aka.some(alias => alias.toLowerCase() === target)) return id;
    }
    return null;
}