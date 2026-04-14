/**
 * @file data/default-user/extensions/personalyze/ui/panel/models.js
 * @stamp {"utc":"2026-04-17T10:30:00.000Z"}
 * @architectural-role UI Logic (API Discovery)
 * @description
 * Handles dynamic discovery for image generation engines.
 * 
 * Updated:
 * 1. Rewired Runware discovery to call the API directly from the browser.
 * 2. Bypasses server-side proxy to utilize local browser VPN for Civitai/Runware metadata.
 * 3. Integrated findSecret for secure frontend key retrieval.
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
 *     external_io: [fetch (Direct API), settings.js, secrets.js]
 */

import { findSecret } from '../../../../../secrets.js';
import { POLLINATIONS_BASE_URL, POLLINATIONS_MODELS, SECRET_RUNWARE } from '../../defaults.js';
import { log, error } from '../../utils/logger.js';
import { updateSetting } from '../../settings.js';

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
 * Fetches latest Checkpoints from Runware directly from the browser.
 * Utilizes local browser network (VPN) to bypass server-side tunnel restrictions.
 */
export async function fetchRunwareModels() {
    try {
        const apiKey = await findSecret(SECRET_RUNWARE);
        if (!apiKey) {
            log('Models', 'Runware model fetch skipped: No API key found.');
            return;
        }

        log('Models', 'Fetching Runware checkpoints (Browser Direct)...');
        
        const task = {
            taskType: "modelSearch",
            taskUUID: crypto.randomUUID(),
            category: "checkpoint",
            limit: 100
        };

        const res = await fetch('https://api.runware.ai/v1', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}` 
            },
            body: JSON.stringify([task])
        });

        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        
        const data = await res.json();
        const taskResult = data.data?.find(t => t.taskUUID === task.taskUUID);
        
        cachedRunwareModels = taskResult?.models || [];
        log('Models', `Cached ${cachedRunwareModels.length} Runware checkpoints via browser.`);
    } catch (err) {
        error('Models', 'Browser-direct Runware checkpoint fetch failed:', err);
    }
}

/**
 * Fetches top 300 LoRAs from Runware directly from the browser.
 * Utilizes local browser network (VPN) for Civitai access.
 */
export async function fetchRunwareLoras() {
    try {
        const apiKey = await findSecret(SECRET_RUNWARE);
        if (!apiKey) {
            throw new Error('Runware API key not found in vault.');
        }

        log('Models', 'Fetching top 300 Runware LoRAs (Browser Direct)...');
        
        const task = {
            taskType: "modelSearch",
            taskUUID: crypto.randomUUID(),
            category: "lora",
            limit: 300
        };

        const res = await fetch('https://api.runware.ai/v1', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}` 
            },
            body: JSON.stringify([task])
        });

        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        
        const data = await res.json();
        const taskResult = data.data?.find(t => t.taskUUID === task.taskUUID);
        const models = taskResult?.models || [];

        if (models.length > 0) {
            updateSetting('runwareLoras', models);
            log('Models', `Saved ${models.length} Runware LoRAs to persistent storage via browser.`);
        }
    } catch (err) {
        error('Models', 'Browser-direct Runware LoRA fetch failed:', err);
        throw err;
    }
}