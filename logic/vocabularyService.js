/**
 * @file data/default-user/extensions/personalyze/logic/vocabularyService.js
 * @stamp {"utc":"2026-04-14T22:50:00.000Z"}
 * @architectural-role Pure Logic (JIT Harvester)
 * @description
 * Stateless service for generating character-specific wardrobe suggestions.
 * Crawls saved ensembles and recent visual history (the DNA chain) to build
 * de-duplicated vocabulary datalists for the UI.
 * 
 * @api-declaration
 * buildVocabularyDatalists(characterId, characterData, characterChain) -> string
 * 
 * @contract
 *   assertions:
 *     purity: Pure Function (Logic + HTML)
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../utils/history.js';
import { getDatalistId } from '../utils/domRegistry.js';
import { BASE_SLOTS, META_SLOTS } from '../defaults.js';

/**
 * Generates the HTML string for all <datalist> elements relevant to a character.
 * 
 * @param {string} characterId - The technical ID of the character.
 * @param {object} characterData - Entry from state.chatCharacters[id].
 * @param {object} characterChain - Entry from state.characterChain[id].
 * @returns {string} Concatenated <datalist> HTML tags.
 */
export function buildVocabularyDatalists(characterId, characterData, characterChain) {
    const slots = characterData?.slots || [...BASE_SLOTS];
    const ensembles = Object.values(characterData?.ensembles || {});
    const currentLayers = characterChain?.layers || {};

    // 1. Initialize Sets for unique values
    const vocab = {};
    [...slots, ...META_SLOTS].forEach(s => {
        vocab[s] = { items: new Set(), mods: new Set() };
    });

    /** Normalization helper for harvesting */
    const processLayers = (layers) => {
        if (!layers) return;
        [...slots, ...META_SLOTS].forEach(s => {
            const val = layers[s];
            if (!val) return;

            if (META_SLOTS.includes(s)) {
                // Meta slots (emotion, pose) are plain strings
                const clean = String(val).trim();
                if (clean && !['None', 'KEEP'].includes(clean)) vocab[s].items.add(clean);
            } else if (typeof val === 'object') {
                // Standard slots are { item, modifier }
                const cleanItem = String(val.item || '').trim();
                const cleanMod  = String(val.modifier || '').trim();
                if (cleanItem && !['None', 'KEEP'].includes(cleanItem)) vocab[s].items.add(cleanItem);
                if (cleanMod  && !['None', 'KEEP'].includes(cleanMod))  vocab[s].mods.add(cleanMod);
            }
        });
    };

    // 2. Harvest from all sources
    processLayers(currentLayers);
    ensembles.forEach(e => processLayers(e.layers));

    // 3. Render HTML strings using deterministic IDs
    let html = '';
    Object.entries(vocab).forEach(([slot, data]) => {
        if (META_SLOTS.includes(slot)) {
            const id = getDatalistId(characterId, slot);
            const options = Array.from(data.items).map(v => `<option value="${escapeHtml(v)}">`).join('');
            html += `<datalist id="${id}">${options}</datalist>`;
        } else {
            const itemId = getDatalistId(characterId, `${slot}-item`);
            const modId  = getDatalistId(characterId, `${slot}-mod`);
            
            const itemOpts = Array.from(data.items).map(v => `<option value="${escapeHtml(v)}">`).join('');
            const modOpts  = Array.from(data.mods).map(v => `<option value="${escapeHtml(v)}">`).join('');
            
            html += `<datalist id="${itemId}">${itemOpts}</datalist>`;
            html += `<datalist id="${modId}">${modOpts}</datalist>`;
        }
    });

    return html;
}