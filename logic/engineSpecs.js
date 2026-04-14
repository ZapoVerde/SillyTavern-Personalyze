/**
 * @file data/default-user/extensions/personalyze/logic/engineSpecs.js
 * @stamp {"utc":"2026-04-18T16:20:00.000Z"}
 * @architectural-role Pure Logic (Schema Mapper)
 * @description
 * Pure functions for navigating the Dynamic Parameter Schema.
 * Translates the stringified JSON schema from settings into actionable
 * UI and logic specifications for specific model architectures.
 * 
 * @api-declaration
 * getSpecForArchitecture(schemaJson, architecture) -> Object|null
 * resolveModelArchitecture(modelAir, cachedRunwareModels) -> string
 * 
 * @contract
 *   assertions:
 *     purity: Pure Function
 *     state_ownership: []
 *     external_io: []
 */

/**
 * Extracts the parameter specification for a specific architecture from the schema.
 * 
 * @param {string} schemaJson - The stringified JSON from extension settings.
 * @param {string} architecture - The target architecture key (e.g. "flux").
 * @returns {Object|null} The parameter definitions or null if not found/invalid.
 */
export function getSpecForArchitecture(schemaJson, architecture) {
    if (!schemaJson || !architecture) return null;

    try {
        const schema = JSON.parse(schemaJson);
        const target = String(architecture).toLowerCase();

        // Exact match check
        if (schema[target]) return schema[target];

        // Fuzzy fallback for SDXL variants (e.g. "pony" -> "sdxl")
        if (target.includes('pony') || target.includes('sdxl')) {
            return schema['sdxl'] || null;
        }

        // Fuzzy fallback for SD 1.5 variants
        if (target.includes('sd15') || target.includes('sd 1.5') || target.includes('v1-5')) {
            return schema['sd15'] || null;
        }

        return null;
    } catch (err) {
        console.error('[PLZ:EngineSpecs] Failed to parse parameter schema:', err);
        return null;
    }
}

/**
 * Resolves the architecture string for a specific model AIR using discovery cache.
 * 
 * @param {string} modelAir - The technical AIR of the selected model.
 * @param {Array} cachedRunwareModels - The list of models from ui/panel/models.js.
 * @returns {string} The architecture name (e.g. "flux") or "unknown".
 */
export function resolveModelArchitecture(modelAir, cachedRunwareModels) {
    if (!modelAir || !Array.isArray(cachedRunwareModels)) return 'unknown';

    const entry = cachedRunwareModels.find(m => (m.air || m.modelId) === modelAir);
    if (!entry || !entry.architecture) return 'unknown';

    return String(entry.architecture).toLowerCase();
}