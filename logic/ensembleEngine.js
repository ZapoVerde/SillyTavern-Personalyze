/**
 * @file data/default-user/extensions/personalyze/logic/ensembleEngine.js
 * @stamp {"utc":"2026-04-10T11:40:00.000Z"}
 * @architectural-role State Derivation (Pure)
 * @description
 * Pure logic engine for applying saved ensemble snapshots to the current
 * visual state. Incremental narrative merging lives in parsers.js.
 *
 * @api-declaration
 * applyEnsemble(current, ensemble) -> object
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