/**
 * @file data/default-user/extensions/personalyze/logic/parsers.js
 * @stamp {"utc":"2026-04-12T14:00:00.000Z"}
 * @architectural-role State Derivation (Pure)
 * @description
 * Pure functions to parse structured text responses from the Layered State Pipeline.
 * Implements the logic for handling "KEEP" (persistence) and "None" (removal) instructions.
 * 
 * Added chunky autonaming logic for the Ensemble Autosave system, including 
 * support for accessories in the identity chain.
 *
 * @api-declaration
 * parsePhase1(raw) -> string|null
 * parsePhase2(raw) -> boolean
 * parsePhase3(raw) -> object
 * mergeLayeredUpdate(current, update) -> object
 * generateEnsembleLabel(layers) -> string
 * generateEnsembleKey(layers) -> string
 * 
 * @contract
 *   assertions:
 *     purity: Pure Function
 *     state_ownership: []
 *     external_io: []
 */

import { META_SLOTS } from '../defaults.js';
import { slugify } from '../utils/history.js';

/**
 * Parses Phase 1: Subject Detection.
 * Extracts the character name from the result line.
 * 
 * @param {string} raw - Raw LLM response.
 * @returns {string|null} The character name or null if 'None'.
 */
export function parsePhase1(raw) {
    const text = (raw ?? '').trim().replace(/^RESULT:\s*/i, '');
    if (!text || /^none$/i.test(text)) return null;
    return text;
}

/**
 * Parses Phase 2: Change Gate.
 * Validates a simple YES/NO response from the fast model.
 * 
 * @param {string} raw - Raw LLM response.
 * @returns {boolean} True if the response indicates a change (YES).
 */
export function parsePhase2(raw) {
    const text = (raw ?? '').trim().replace(/^RESULT:\s*/i, '');
    return /^yes(?:[^a-zA-Z]|$)/i.test(text);
}

/**
 * Parses Phase 3: Layered State Extraction.
 * Key-agnostic: accepts any "Key: Item | Modifier" line the LLM returns.
 * The key is lowercased and slugified so it matches state slot names.
 *
 * @param {string} raw - Raw Key-Value list from LLM.
 * @returns {object} Map of slot keys to {item, modifier}.
 */
export function parsePhase3(raw) {
    const lines = (raw ?? '').split('\n');
    const update = {};

    for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;

        const key     = line.slice(0, colonIdx).trim().toLowerCase().replace(/\s+/g, '_');
        const content = line.slice(colonIdx + 1).trim();
        if (!key || !content) continue;

        const pipeIdx = content.indexOf('|');
        let item, mod;

        if (pipeIdx !== -1) {
            item = content.slice(0, pipeIdx).trim();
            mod  = content.slice(pipeIdx + 1).trim();
        } else {
            item = content;
            mod  = 'None';
        }

        update[key] = {
            item: item || 'KEEP',
            modifier: mod || 'None',
        };
    }

    return update;
}

/**
 * Merges a Phase 3 update into the current visual state.
 * Implements the 3-state transition logic:
 * 1. KEEP | KEEP -> Use existing value from previous turn.
 * 2. None | None -> Set slot to null (explicit removal).
 * 3. Item | Mod  -> Update slot with new visual data.
 * 
 * Ensures all standard slots (including pose) exist in the output even if missing in current.
 * 
 * @param {object} current - The current layers object from state.
 * @param {object} update - The parsed update from the LLM.
 * @returns {object} The new consolidated state.
 */
export function mergeLayeredUpdate(current, update) {
    // 1. Initialize next state with full standard slot template
    const next = Object.assign({
        outerwear:   null,
        top:         null,
        bottom:      null,
        accessories: null,
        emotion:     'neutral',
        pose:        'upright',
    }, structuredClone(current ?? {}));

    // 2. Iterate through the LLM-derived updates
    for (const [slot, val] of Object.entries(update)) {
        if (!val || val.item === 'KEEP') {
            continue;
        }

        if (val.item === 'None') {
            next[slot] = null;
        } else {
            if (META_SLOTS.includes(slot)) {
                next[slot] = val.item;
            } else {
                next[slot] = {
                    item: val.item,
                    modifier: (val.modifier === 'None' ? null : val.modifier),
                };
            }
        }
    }

    return next;
}

/**
 * Helper to limit a string to the first three words.
 * @param {string|object} val 
 * @returns {string|null}
 */
function limitToThreeWords(val) {
    if (!val) return null;
    const str = (typeof val === 'object' ? val.item : val) || '';
    const words = str.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    return words.slice(0, 3).join(' ');
}

/**
 * Generates a descriptive, chunky label for an ensemble based on current layers.
 * Format: [Outerwear + Top + Bottom + Accessories] | [Emotion] | [Pose]
 * Each category is limited to its first 3 words.
 * 
 * @param {object} layers 
 * @returns {string}
 */
export function generateEnsembleLabel(layers) {
    const outerwear   = limitToThreeWords(layers.outerwear);
    const top         = limitToThreeWords(layers.top);
    const bottom      = limitToThreeWords(layers.bottom);
    const accessories = limitToThreeWords(layers.accessories);
    const emotion     = limitToThreeWords(layers.emotion);
    const pose        = limitToThreeWords(layers.pose);

    const clothes = [outerwear, top, bottom, accessories].filter(Boolean).join(' + ');
    
    return [
        clothes || 'Base Identity',
        emotion || 'neutral',
        pose    || 'upright'
    ].join(' | ');
}

/**
 * Generates a stable unique key for an ensemble.
 * Includes accessories in the identity chain to ensure that changes in equipment
 * create distinct ensemble entries.
 * 
 * @param {object} layers 
 * @returns {string}
 */
export function generateEnsembleKey(layers) {
    const components = [
        limitToThreeWords(layers.outerwear),
        limitToThreeWords(layers.top),
        limitToThreeWords(layers.bottom),
        limitToThreeWords(layers.accessories),
        limitToThreeWords(layers.emotion)
    ].filter(Boolean).join('_');

    return slugify(components || 'base_identity');
}