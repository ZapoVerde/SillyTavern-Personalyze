/**
 * @file data/default-user/extensions/personalyze/logic/parsers.js
 * @stamp {"utc":"2026-04-10T10:40:00.000Z"}
 * @architectural-role State Derivation (Pure)
 * @description
 * Pure functions to parse structured text responses from the Layered State Pipeline.
 * Implements the logic for handling "KEEP" (persistence) and "None" (removal) instructions
 * without side effects.
 *
 * @api-declaration
 * parsePhase1(raw) -> string|null
 * parsePhase2(raw) -> boolean
 * parsePhase3(raw) -> object
 * mergeLayeredUpdate(current, update) -> object
 * 
 * @contract
 *   assertions:
 *     purity: Pure Function
 *     state_ownership: []
 *     external_io: []
 */

import { META_SLOTS } from '../defaults.js';

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
 * @param {object} current - The current layers object from state.
 * @param {object} update - The parsed update from the LLM.
 * @returns {object} The new consolidated state.
 */
export function mergeLayeredUpdate(current, update) {
    const next = structuredClone(current ?? {
        outerwear: null,
        top: null,
        bottom: null,
        accessories: null,
        emotion: 'neutral',
        pose: 'upright',
    });

    for (const [slot, val] of Object.entries(update)) {
        if (!val || val.item === 'KEEP') {
            // State: Unknown/Unchanged. Persist existing.
            continue;
        }

        if (val.item === 'None') {
            // State: Explicitly removed.
            next[slot] = null;
        } else {
            // Meta-slots (emotion, pose) store a plain string, not {item, modifier}.
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