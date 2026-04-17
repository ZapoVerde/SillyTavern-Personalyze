/**
 * @file data/default-user/extensions/personalyze/logic/parsers.js
 * @stamp {"utc":"2026-04-17T13:00:00.000Z"}
 * @architectural-role State Derivation (Pure)
 * @description
 * Pure functions to parse structured text responses from the Layered State Pipeline.
 * Implements logic for handling "KEEP" (persistence) and "None" (removal) instructions.
 * 
 * Updated for Granular Identity Architecture:
 * 1. Added compileIdentityString to join granular traits into a fallback string.
 * 2. Updated mergeLayeredUpdate to handle identity slots as simple strings.
 * 
 * @api-declaration
 * parsePhase1(raw) -> string|null
 * parsePhase2(raw) -> boolean
 * parsePhase3(raw) -> object
 * parseSceneRoster(raw) -> string[]
 * mergeLayeredUpdate(current, update, identitySlots) -> object
 * compileIdentityString(identityMap) -> string
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
 * Key-agnostic: accepts any "Key: Item | Modifier" or "Key: Value" line.
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
 * Parses the output of SCENE_ROSTER_PROMPT.
 * 
 * @param {string} raw - Comma separated list of names/IDs.
 * @returns {string[]}
 */
export function parseSceneRoster(raw) {
    const text = (raw ?? '').trim().replace(/^RESULT:\s*/i, '');
    if (!text || /^none$/i.test(text)) return [];

    return text.split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !/^none$/i.test(s));
}

/**
 * Merges a Phase 3 update into the current state (Visual or Identity).
 * Implements the 3-state transition logic:
 * 1. KEEP | KEEP -> Use existing value from previous turn.
 * 2. None | None -> Set slot to null (explicit removal).
 * 3. Item | Mod  -> Update slot with new data.
 * 
 * @param {object} current - The current map from state.
 * @param {object} update - The parsed update from the LLM.
 * @param {string[]} stringSlots - Optional list of keys that should be stored as simple strings.
 * @returns {object} The new consolidated state.
 */
export function mergeLayeredUpdate(current, update, stringSlots = []) {
    const next = structuredClone(current ?? {});
    const stringKeys = [...META_SLOTS, ...stringSlots];

    for (const [slot, val] of Object.entries(update)) {
        if (!val || val.item === 'KEEP') {
            continue;
        }

        if (val.item === 'None') {
            next[slot] = null;
        } else {
            if (stringKeys.includes(slot)) {
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
 * Formats a granular identity map as a Key: Value display string.
 * Used in the Archivist modal so users can review individual traits.
 *
 * @param {Object} identityMap - { hair: "...", face: "...", ... }
 * @returns {string}
 */
export function formatIdentityDisplay(identityMap) {
    if (!identityMap || typeof identityMap !== 'object') return '';

    return Object.entries(identityMap)
        .filter(([, val]) => typeof val === 'string' && val.trim().length > 0)
        .map(([key, val]) => {
            const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
            return `${label}: ${val}`;
        })
        .join('\n');
}

/**
 * Compiles a granular identity map into a single comma-separated string.
 * Used for the {{identity_anchor}} fallback variable.
 *
 * @param {Object} identityMap - { hair: "...", face: "...", ... }
 * @returns {string}
 */
export function compileIdentityString(identityMap) {
    if (!identityMap || typeof identityMap !== 'object') return '';
    
    return Object.values(identityMap)
        .filter(val => typeof val === 'string' && val.trim().length > 0)
        .join(', ')
        .trim();
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