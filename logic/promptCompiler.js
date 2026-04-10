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
 * - Emotion: (Weighted 1.2) - Integrated with hands and body language.
 * - Clothes: (Weighted 1.1) - Concatenates modifier and item.
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
 * @param {object} layers - The 5-slot visual state object.
 * @returns {string} The formatted, comma-separated prompt string.
 */
export function compilePrompt(identityAnchor, layers) {
    const promptParts = [];

    // 1. Wardrobe: Layered Clothing Slots only
    // We skip Identity Anchor and Emotion here because they are handled 
    // by the top-level prompt template tags.
    const clothingSlots = ['outerwear', 'top', 'bottom', 'accessories'];

    for (const slot of clothingSlots) {
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