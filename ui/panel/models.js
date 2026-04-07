/**
 * @file data/default-user/extensions/personalyze/ui/panel/models.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role UI Logic (API Discovery)
 * @description
 * Handles dynamic model discovery for the Pollinations Image API.
 * 
 * Pollinations often updates their model roster. This module fetches the 
 * latest available models from their unified endpoint and updates the 
 * settings dropdown accordingly. It handles string arrays, object arrays, 
 * and ensures the user's currently selected model is preserved even 
 * if the API call fails or the model is deprecated.
 *
 * @api-declaration
 * refreshModelDropdown(currentModel) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO / Side-effect
 *     state_ownership: []
 *     external_io: [fetch(Pollinations API), DOM (#plz-image-model)]
 */

import { POLLINATIONS_BASE_URL, POLLINATIONS_MODELS } from '../../defaults.js';
import { log } from '../../utils/logger.js';

/**
 * Fetches latest models from Pollinations and updates the #plz-image-model dropdown.
 * 
 * @param {string|null} currentModel — The currently selected model in the settings.
 */
export async function refreshModelDropdown(currentModel) {
    const $select = $('#plz-image-model');
    if (!$select.length) return;

    try {
        const response = await fetch(`${POLLINATIONS_BASE_URL}/image/models`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        let models = [];

        // Pollinations response format can vary; handle arrays of strings or objects
        if (Array.isArray(data)) {
            models = data.map(m => typeof m === 'object' ? (m.id || m.name) : m).filter(Boolean);
        } else if (data.data && Array.isArray(data.data)) {
            models = data.data.map(m => typeof m === 'object' ? (m.id || m.name) : m).filter(Boolean);
        }

        if (models.length === 0) {
            log('Models', 'Empty model list received, falling back to defaults.');
            models = [...POLLINATIONS_MODELS];
        }

        // Ensure the current selection is always part of the list to prevent empty selects
        if (currentModel && !models.includes(currentModel)) {
            models.unshift(currentModel);
        }

        // De-duplicate and sort
        const finalModels = [...new Set(models)];

        // Update the DOM
        const options = finalModels
            .map(m => `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`)
            .join('');

        $select.html(options);
        $select.val(currentModel);

        log('Models', `Updated dropdown with ${finalModels.length} models.`);
    } catch (err) {
        log('Models', 'Discovery failed, utilizing current list.', err);
        
        // Final safety: if the dropdown is currently empty, at least populate the hardcoded ones
        if ($select.find('option').length === 0) {
            const fallback = [...new Set([...POLLINATIONS_MODELS, currentModel])].filter(Boolean);
            $select.html(fallback.map(m => `<option value="${m}">${m}</option>`).join(''));
            $select.val(currentModel);
        }
    }
}