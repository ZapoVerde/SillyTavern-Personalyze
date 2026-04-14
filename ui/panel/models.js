/**
 * @file data/default-user/extensions/personalyze/ui/panel/models.js
 * @stamp {"utc":"2026-04-14T10:10:00.000Z"}
 * @architectural-role UI Logic (API Discovery)
 * @description
 * Handles dynamic model discovery for image generation engines.
 * 
 * Functions:
 * 1. Pollinations: Fetches and caches available models for UI dropdowns.
 * 2. Runware: Fetches checkpoints (session-cache) and LoRAs (persistent storage).
 * 
 * Updated:
 * 1. Added fetchRunwareModels() for non-persistent checkpoint discovery.
 * 2. Added fetchRunwareLoras() for persistent LoRA discovery (top 300).
 * 3. Integrated getRequestHeaders for proxy authentication.
 *
 * @api-declaration
 * refreshModelDropdown(currentModel) -> Promise<void>
 * getCachedModels() -> string[]
 * fetchRunwareModels() -> Promise<void>
 * fetchRunwareLoras() -> Promise<void>
 * getCachedRunwareModels() -> Object[]
 * 
 * @contract
 *   assertions:
 *     purity: IO / Side-effect
 *     state_ownership: [cachedModels, cachedRunwareModels]
 *     external_io: [fetch, settings.js, SillyTavern script.js]
 */

import { getRequestHeaders } from '../../../../../../script.js';
import { POLLINATIONS_BASE_URL, POLLINATIONS_MODELS } from '../../defaults.js';
import { log, error } from '../../utils/logger.js';
import { getSettings, updateSetting } from '../../settings.js';

/**
 * Global cache of fetched Pollinations models.
 */
let cachedModels = [...POLLINATIONS_MODELS];

/**
 * Session cache of fetched Runware models (checkpoints).
 */
let cachedRunwareModels = [];

/**
 * Returns the latest known list of Pollinations models.
 * @returns {string[]}
 */
export function getCachedModels() {
    return cachedModels;
}

/**
 * Returns the session cache of Runware models.
 * @returns {Object[]}
 */
export function getCachedRunwareModels() {
    return cachedRunwareModels;
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

        if (Array.isArray(data)) {
            models = data.map(m => typeof m === 'object' ? (m.id || m.name) : m).filter(Boolean);
        } else if (data.data && Array.isArray(data.data)) {
            models = data.data.map(m => typeof m === 'object' ? (m.id || m.name) : m).filter(Boolean);
        }

        if (models.length === 0) {
            log('Models', 'Empty model list received, falling back to defaults.');
            models = [...POLLINATIONS_MODELS];
        }

        if (currentModel && !models.includes(currentModel)) {
            models.unshift(currentModel);
        }

        cachedModels = [...new Set(models)];

        if ($select.length) {
            const options = cachedModels
                .map(m => `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`)
                .join('');

            $select.html(options);
            $select.val(currentModel);
        }

        log('Models', `Discovered ${cachedModels.length} models from Pollinations API.`);
    } catch (err) {
        log('Models', 'Pollinations discovery failed, utilizing fallback list.', err);
        
        if ($select.length && $select.find('option').length === 0) {
            const fallback = [...new Set([...POLLINATIONS_MODELS, currentModel])].filter(Boolean);
            $select.html(fallback.map(m => `<option value="${m}">${m}</option>`).join(''));
            $select.val(currentModel);
        }
    }
}

/**
 * Fetches latest Checkpoints from Runware.
 * Stored in session memory (cachedRunwareModels).
 */
export async function fetchRunwareModels() {
    try {
        log('Models', 'Fetching Runware checkpoints...');
        const res = await fetch('/api/plugins/personalyze/runware-search', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ category: 'checkpoint', limit: 100 }),
        });

        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        
        const { models } = await res.json();
        cachedRunwareModels = models || [];
        log('Models', `Cached ${cachedRunwareModels.length} Runware checkpoints.`);
    } catch (err) {
        error('Models', 'Runware checkpoint fetch failed:', err);
    }
}

/**
 * Fetches top 300 LoRAs from Runware.
 * Stored persistently in extension settings to handle VPN/Civitai availability.
 */
export async function fetchRunwareLoras() {
    try {
        log('Models', 'Fetching top 300 Runware LoRAs...');
        const res = await fetch('/api/plugins/personalyze/runware-search', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ category: 'lora', limit: 300 }),
        });

        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        
        const { models } = await res.json();
        if (models && Array.isArray(models)) {
            // Persistent write to extension settings
            updateSetting('runwareLoras', models);
            log('Models', `Saved ${models.length} Runware LoRAs to persistent storage.`);
        }
    } catch (err) {
        error('Models', 'Runware LoRA fetch failed:', err);
        throw err; // Re-throw to allow UI to show failure (spinner etc)
    }
}