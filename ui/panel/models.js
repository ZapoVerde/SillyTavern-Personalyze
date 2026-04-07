/**
 * @file data/default-user/extensions/personalyze/ui/panel/models.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role UI Logic (API Discovery)
 * @description
 * Handles dynamic model discovery for the Pollinations Image API.
 * 
 * This module fetches the latest available models from Pollinations and 
 * synchronizes the dropdown inside the Engines Modal (#plz-eng-pol-model).
 * It maintains a local cache to allow the modal to populate instantly
 * even if the network call is still in progress or failed.
 *
 * @api-declaration
 * refreshModelDropdown(currentModel) -> Promise<void>
 * getCachedModels() -> string[]
 *
 * @contract
 *   assertions:
 *     purity: IO / Side-effect
 *     state_ownership: [cachedModels]
 *     external_io: [fetch(Pollinations API), DOM (#plz-eng-pol-model)]
 */

import { POLLINATIONS_BASE_URL, POLLINATIONS_MODELS } from '../../defaults.js';
import { log } from '../../utils/logger.js';

/**
 * Global cache of fetched models.
 * Defaults to the hardcoded list from defaults.js.
 */
let cachedModels = [...POLLINATIONS_MODELS];

/**
 * Returns the latest known list of models.
 * @returns {string[]}
 */
export function getCachedModels() {
    return cachedModels;
}

/**
 * Fetches latest models from Pollinations and updates the Engines Modal dropdown.
 * 
 * @param {string|null} currentModel — The currently selected model in the settings.
 */
export async function refreshModelDropdown(currentModel) {
    const selector = '#plz-eng-pol-model';
    const $select  = $(selector);

    try {
        const response = await fetch(`${POLLINATIONS_BASE_URL}/image/models`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        let models = [];

        // Pollinations response format can vary (Array of strings vs Array of objects)
        if (Array.isArray(data)) {
            models = data.map(m => typeof m === 'object' ? (m.id || m.name) : m).filter(Boolean);
        } else if (data.data && Array.isArray(data.data)) {
            models = data.data.map(m => typeof m === 'object' ? (m.id || m.name) : m).filter(Boolean);
        }

        if (models.length === 0) {
            log('Models', 'Empty model list received, falling back to defaults.');
            models = [...POLLINATIONS_MODELS];
        }

        // Ensure the current user selection is part of the list
        if (currentModel && !models.includes(currentModel)) {
            models.unshift(currentModel);
        }

        // Update the cache for subsequent modal opens
        cachedModels = [...new Set(models)];

        // If the modal is currently open, update the DOM immediately
        if ($select.length) {
            const options = cachedModels
                .map(m => `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`)
                .join('');

            $select.html(options);
            $select.val(currentModel);
        }

        log('Models', `Discovered ${cachedModels.length} models from Pollinations API.`);
    } catch (err) {
        log('Models', 'Discovery failed, utilizing fallback list.', err);
        
        // Final safety: if the modal is open and the select is empty, use defaults
        if ($select.length && $select.find('option').length === 0) {
            const fallback = [...new Set([...POLLINATIONS_MODELS, currentModel])].filter(Boolean);
            $select.html(fallback.map(m => `<option value="${m}">${m}</option>`).join(''));
            $select.val(currentModel);
        }
    }
}