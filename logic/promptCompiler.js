/**
 * @file data/default-user/extensions/personalyze/logic/promptCompiler.js
 * @stamp {"utc":"2026-04-10T12:00:00.000Z"}
 * @architectural-role State Derivation (Pure)
 * @description
 * Pure function to translate character identity and layered visual state into 
 * a weighted image generation prompt. 
 * 
 * Implements slot-based weighting:
 * - Identity Anchor: Base description.
 * - Meta-slots (emotion, pose): Skipped here; injected via template variables.
 * - Clothes: Concatenates modifier and item.
 *
 * @api-declaration
 * compilePrompt(identityAnchor, layers) -> string
 * 
 * @contract
 *   assertions:
 *     purity: Pure Function
 *     state_ownership: []
 *     external_io: []
 */

/**
 * Compiles a final image generation prompt from the character state.
 * 
 * @param {string} identityAnchor - Permanent physical features.
 * @param {object} layers - The visual state object.
 * @returns {string} The formatted, comma-separated prompt string.
 */
import { META_SLOTS } from '../defaults.js';

export function compilePrompt(identityAnchor, layers) {
    const promptParts = [];

    // 1. Wardrobe: clothing slots only.
    // Meta-slots (emotion, pose) are skipped here — they are injected into
    // the image prompt via {{emotion}} / {{pose}} template variables instead.
    for (const slot of Object.keys(layers ?? {})) {
        if (META_SLOTS.includes(slot)) continue;
        const data = layers[slot];
        
        // Skip empty or unknown slots
        if (!data || !data.item || data.item === 'None' || data.item === 'KEEP') {
            continue;
        }

        let itemString = data.item;
        
        // Prefix with modifier if present (e.g., "leather" + "armor")
        if (data.modifier && data.modifier !== 'None' && data.modifier !== 'KEEP') {
            itemString = `${data.modifier} ${data.item}`;
        }

        // Add to list without weights
        promptParts.push(itemString.toLowerCase());
    }

    // 2. Cleanup and Join
    return promptParts
        .filter(Boolean)
        .join(', ')
        .replace(/(\s*,\s*)+/g, ', ') // deduplicate commas
        .trim();
}