/**
 * @file data/default-user/extensions/personalyze/logic/ensembleEngine.js
 * @stamp {"utc":"2026-04-17T17:30:00.000Z"}
 * @architectural-role State Derivation (Pure)
 * @description
 * Pure logic engine for deriving visual states from saved ensemble snapshots.
 *
 * Updated for Dynamic Variable Architecture:
 * 1. applyEnsemble is now slot-agnostic (iterates over all keys in the snapshot).
 * 2. getDefaultEnsembleLayers uses the character's DNA slot schema for fallbacks.
 *
 * @api-declaration
 * applyEnsemble(current, ensemble) -> object
 * getDefaultEnsembleLayers(charId, stateObj) -> object
 *
 * @contract
 *   assertions:
 *     purity: Pure Function
 *     state_ownership: []
 *     external_io: []
 */

import { BASE_SLOTS, META_SLOT_EMOTION, META_SLOT_POSE } from '../defaults.js';

/**
 * Applies a saved ensemble (snapshot) to the current visual state.
 * Performs a deep merge/replacement based on all keys present in the ensemble.
 * 
 * @param {object} current - The current layers object.
 * @param {object} ensemble - The saved ensemble layers.
 * @returns {object} The updated layers object.
 */
export function applyEnsemble(current, ensemble) {
    if (!ensemble) return current;

    const next = structuredClone(current ?? {});
    const allKeys = new Set([...Object.keys(next), ...Object.keys(ensemble)]);

    for (const key of allKeys) {
        // Ensembles are snapshots: prefer ensemble data, fall back to current
        const val = ensemble[key] ?? next[key] ?? null;
        next[key] = (val && typeof val === 'object') ? structuredClone(val) : val;
    }

    // Ensure system defaults if missing from both
    if (!next[META_SLOT_EMOTION]) next[META_SLOT_EMOTION] = 'neutral';
    if (!next[META_SLOT_POSE])    next[META_SLOT_POSE]    = 'upright';

    return next;
}

/**
 * Retrieves the layers for a character's designated Default Ensemble.
 * Used during the Redress flow when the narrative state is ambiguous.
 * 
 * @param {string} charId - The canonical ID of the character.
 * @param {object} stateObj - The current state object (chatCharacters).
 * @returns {object} The default layers or a schema-compliant fallback.
 */
export function getDefaultEnsembleLayers(charId, stateObj) {
    const char = stateObj.chatCharacters?.[charId];
    const defaultKey = char?.defaultEnsemble;

    if (defaultKey && char.ensembles?.[defaultKey]) {
        return structuredClone(char.ensembles[defaultKey].layers);
    }

    // Dynamic Fallback: build based on the character's specific slot list
    const layers = {
        [META_SLOT_EMOTION]: 'neutral',
        [META_SLOT_POSE]:    'upright'
    };

    const slots = char?.slots || BASE_SLOTS;
    slots.forEach(s => {
        // Logic: ensure a base 'top' exists to prevent naked fallbacks
        if (s === 'top') {
            layers[s] = { item: 'clothes', modifier: null };
        } else {
            layers[s] = null;
        }
    });

    return layers;
}