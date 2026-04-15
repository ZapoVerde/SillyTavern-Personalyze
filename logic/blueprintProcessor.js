/**
 * @file data/default-user/extensions/personalyze/logic/blueprintProcessor.js
 * @stamp {"utc":"2026-04-19T10:40:00.000Z"}
 * @architectural-role Pure Logic (Technical Data Processor)
 * @description
 * Pure functions for managing technical API Blueprints. 
 * Implements validation logic for raw JSON and sanitization logic to ensure 
 * data from the Visual Editor or JSON imports conforms to the registry schema.
 * 
 * @api-declaration
 * isValidBlueprint(jsonString) -> { valid: boolean, error: string|null, data: Object|null }
 * sanitizeBlueprintObject(rawObj) -> Object
 * scrubEngineParams(blueprint, userValues) -> Object
 * 
 * @contract
 *   assertions:
 *     purity: Pure Function
 *     state_ownership: []
 *     external_io: []
 */

/**
 * Validates a JSON string as a valid Technical Blueprint.
 * Ensures the result is a non-null object.
 * 
 * @param {string} jsonString - The raw string from the JSON editor or Import tool.
 * @returns {{ valid: boolean, error: string|null, data: Object|null }}
 */
export function isValidBlueprint(jsonString) {
    if (!jsonString || typeof jsonString !== 'string') {
        return { valid: false, error: 'Empty or invalid input string.', data: null };
    }

    try {
        const data = JSON.parse(jsonString);
        
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
            return { valid: false, error: 'Blueprint must be a JSON object.', data: null };
        }

        // Technical Key Validation
        for (const [key, descriptor] of Object.entries(data)) {
            if (typeof descriptor !== 'object' || descriptor === null) {
                return { valid: false, error: `Key "${key}" must be a descriptor object.`, data: null };
            }
            if (!descriptor.type) {
                return { valid: false, error: `Key "${key}" is missing the "type" attribute.`, data: null };
            }
        }

        return { valid: true, error: null, data };
    } catch (err) {
        return { valid: false, error: err.message, data: null };
    }
}

/**
 * Sanitizes and normalizes a raw blueprint object.
 * Used when importing JSON or saving from the Visual UI to ensure data integrity.
 * 
 * @param {Object} rawObj - The raw key-value pairs from the UI or JSON.
 * @returns {Object} A clean, registry-compliant Blueprint object.
 */
export function sanitizeBlueprintObject(rawObj) {
    const clean = {};
    if (!rawObj || typeof rawObj !== 'object') return clean;

    for (const [key, val] of Object.entries(rawObj)) {
        // Technical keys must be slug-style
        const safeKey = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (!safeKey) continue;

        const descriptor = {
            type:    val.type    || 'text',
            label:   val.label   || key,
            default: val.default ?? ''
        };

        // Type-Specific Sanitization
        switch (descriptor.type) {
            case 'slider':
                descriptor.min   = parseFloat(val.min)   || 0;
                descriptor.max   = parseFloat(val.max)   || 100;
                descriptor.step  = parseFloat(val.step)  || 1;
                descriptor.default = parseFloat(val.default) || 0;
                break;
            case 'select':
                descriptor.options = Array.isArray(val.options) 
                    ? val.options 
                    : (typeof val.options === 'string' ? val.options.split(',').map(s => s.trim()) : []);
                break;
            case 'checkbox':
                descriptor.default = !!val.default;
                break;
        }

        clean[safeKey] = descriptor;
    }

    return clean;
}

/**
 * Merges UI-generated values with a Blueprint and strips metadata.
 * Produces a clean payload suitable for transmission to Runware, Fal, or PiAPI.
 * 
 * @param {Object} blueprint - The technical blueprint object (from ModelRegistry).
 * @param {Object} userValues - Flat map of keys to values (from styleParamGenerator).
 * @returns {Object} A flat key-value object ready for the API.
 */
export function scrubEngineParams(blueprint, userValues = {}) {
    const cleanPayload = {};
    const spec = blueprint || {};

    for (const [key, descriptor] of Object.entries(spec)) {
        let val = userValues[key];

        // 1. Value Resolution: Use user input, fall back to blueprint default
        if (val === undefined || val === null) {
            val = descriptor.default;
        }

        // 2. Type Coercion: Ensure values match expected technical types
        switch (descriptor.type) {
            case 'slider':
                const num = parseFloat(val);
                cleanPayload[key] = isNaN(num) ? (descriptor.default || 0) : num;
                break;
            case 'checkbox':
                cleanPayload[key] = !!val;
                break;
            case 'select':
            case 'text':
            case 'hidden':
            default:
                cleanPayload[key] = val;
                break;
        }
    }

    return cleanPayload;
}