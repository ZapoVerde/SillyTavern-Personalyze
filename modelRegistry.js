/**
 * @file data/default-user/extensions/personalyze/modelRegistry.js
 * @stamp {"utc":"2026-04-19T14:45:00.000Z"}
 * @architectural-role Stateful Owner (Model Registry)
 * @description
 * Manages the Global Model Blueprint Registry in extension_settings.
 * 
 * Provides centralized CRUD operations for technical API blueprints. 
 * Maps technical Model IDs (AIRs) to UI descriptors and default values.
 * 
 * @api-declaration
 * initModelRegistry()                     — Initializes the global storage.
 * getModelBlueprint(modelId)              — Returns the blueprint for a specific model.
 * saveModelBlueprint(modelId, blueprint)  — Updates or creates a model blueprint.
 * deleteModelBlueprint(modelId)           — Removes a model from the registry.
 * getAllRegisteredModels()                — Returns all technical IDs in the registry.
 * getBaseTemplates()                      — Returns the default blueprints from defaults.js.
 * 
 * @contract
 *   assertions:
 *     purity: Stateful Owner
 *     state_ownership: [extension_settings.personalyze.modelBlueprints]
 *     external_io: [saveSettingsDebounced]
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { DEFAULT_BLUEPRINTS } from './defaults.js';
import { log } from './utils/logger.js';

const EXT_NAME = 'personalyze';

/**
 * Returns the root blueprint storage object in settings.
 */
function getStorage() {
    return extension_settings[EXT_NAME].modelBlueprints;
}

/**
 * Ensures the global blueprint structure exists in extension_settings.
 * Handles migration from legacy monolithic schema if present.
 */
export function initModelRegistry() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = {};
    }

    const root = extension_settings[EXT_NAME];

    if (!root.modelBlueprints) {
        log('ModelRegistry', 'Initializing fresh model blueprint storage...');
        root.modelBlueprints = structuredClone(DEFAULT_BLUEPRINTS);
        
        // Migration Logic: Check for legacy schema and attempt to preserve it
        if (root.activeState?.modelParameterSchema) {
            try {
                const legacy = JSON.parse(root.activeState.modelParameterSchema);
                Object.assign(root.modelBlueprints, legacy);
                log('ModelRegistry', 'Migrated legacy parameter schema to new registry.');
                delete root.activeState.modelParameterSchema;
            } catch (err) {
                log('ModelRegistry', 'Failed to parse legacy schema during migration.');
            }
        }
        
        saveSettingsDebounced();
    }
}

/**
 * Retrieves a technical blueprint for a model.
 * If the exact ID isn't found, it attempts a fuzzy architecture match.
 * 
 * @param {string} modelId 
 * @returns {Object|null}
 */
export function getModelBlueprint(modelId) {
    const storage = getStorage();
    if (!storage) return null;
    if (storage[modelId]) return storage[modelId];

    // Fuzzy Match Logic: If modelId contains architecture keywords, fallback to defaults
    const id = String(modelId).toLowerCase();
    if (id.includes('flux')) return storage['flux'] || DEFAULT_BLUEPRINTS['flux'];
    if (id.includes('sdxl') || id.includes('pony')) return storage['sdxl'] || DEFAULT_BLUEPRINTS['sdxl'];
    if (id.includes('sd15') || id.includes('v1-5')) return storage['sd15'] || DEFAULT_BLUEPRINTS['sd15'];

    return null;
}

/**
 * Updates or creates a new entry in the blueprint registry.
 * 
 * @param {string} modelId 
 * @param {Object} blueprint 
 */
export function saveModelBlueprint(modelId, blueprint) {
    if (!modelId || !blueprint) return;
    
    getStorage()[modelId] = structuredClone(blueprint);
    saveSettingsDebounced();
    
    log('ModelRegistry', `Blueprint for "${modelId}" saved.`);
}

/**
 * Removes a model from the registry.
 * 
 * @param {string} modelId 
 */
export function deleteModelBlueprint(modelId) {
    const storage = getStorage();
    if (storage[modelId]) {
        delete storage[modelId];
        saveSettingsDebounced();
        log('ModelRegistry', `Blueprint for "${modelId}" deleted.`);
    }
}

/**
 * Returns a list of all technical IDs currently registered.
 * @returns {string[]}
 */
export function getAllRegisteredModels() {
    const storage = getStorage();
    return storage ? Object.keys(storage) : [];
}

/**
 * Returns the hardcoded base templates for UI resetting.
 * @returns {Object}
 */
export function getBaseTemplates() {
    return structuredClone(DEFAULT_BLUEPRINTS);
}