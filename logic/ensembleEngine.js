/**
 * @file data/default-user/extensions/personalyze/logic/ensembleEngine.js
 * @stamp {"utc":"2026-04-10T19:40:00.000Z"}
 * @architectural-role State Derivation (Pure)
 * @description
 * Pure logic engine for deriving visual states from saved ensemble snapshots.
 *
 * Implements logic for applying snapshots to the current state and retrieving 
 * designated "Default" (Everyday Wear) layers for wardrobe resets.
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

/**
 * Applies a saved ensemble (snapshot) to the current visual state.
 * Unlike an incremental update, an ensemble usually replaces all slots.
 * 
 * @param {object} current - The current layers object.
 * @param {object} ensemble - The saved ensemble layers.
 * @returns {object} The updated layers object.
 */
export function applyEnsemble(current, ensemble) {
    if (!ensemble) return current;

    // Ensembles are snapshots, so we perform a full clone of the ensemble data.
    // If the ensemble is missing a slot, we persist the current one (safety).
    return {
        outerwear:   structuredClone(ensemble.outerwear   ?? current.outerwear   ?? null),
        top:         structuredClone(ensemble.top         ?? current.top         ?? null),
        bottom:      structuredClone(ensemble.bottom      ?? current.bottom      ?? null),
        accessories: structuredClone(ensemble.accessories ?? current.accessories ?? null),
        emotion:     ensemble.emotion || current.emotion  || 'neutral'
    };
}

/**
 * Retrieves the layers for a character's designated Default Ensemble.
 * Used during the Redress flow when the narrative state is ambiguous.
 * 
 * @param {string} charId - The canonical ID of the character.
 * @param {object} stateObj - The current state object (chatCharacters).
 * @returns {object} The default layers or a generic fallback.
 */
export function getDefaultEnsembleLayers(charId, stateObj) {
    const char = stateObj.chatCharacters?.[charId];
    const defaultKey = char?.defaultEnsemble;

    if (defaultKey && char.ensembles?.[defaultKey]) {
        return structuredClone(char.ensembles[defaultKey].layers);
    }

    // Safe fallback if no default is designated
    return {
        outerwear: null,
        top: { item: 'clothes', modifier: null },
        bottom: null,
        accessories: null,
        emotion: 'neutral'
    };
}