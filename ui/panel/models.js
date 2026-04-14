/**
 * @file data/default-user/extensions/personalyze/ui/panel/models.js
 * @stamp {"utc":"2026-04-17T14:10:00.000Z"}
 * @architectural-role UI Logic (API Discovery)
 * @description
 * Handles dynamic discovery for image generation engines. 
 * 
 * Updated:
 * 1. Removed strict API key checks that were blocking the discovery fallback.
 * 2. Logic now attempts Browser Direct only if a key is found, then always tries Server Proxy.
 * 3. Maintains detailed debug logging for both success and failure paths.
 *
 * @api-declaration
 * refreshModelDropdown(currentModel) -> Promise<void>
 * getCachedModels() -> string[]
 * fetchRunwareModels() -> Promise<void>
 * fetchRunwareLoras(searchTerm) -> Promise<void>
 * getCachedRunwareModels() -> Object[]
 * 
 * @contract
 *   assertions:
 *     purity: IO / Side-effect
 *     state_ownership: [cachedModels, cachedRunwareModels]
 *     external_io: [fetch (Direct & Proxy), settings.js, secrets.js, SillyTavern script.js]
 */

import { findSecret } from '../../../../../secrets.js';
import { getRequestHeaders } from '../../../../../../script.js';
import { POLLINATIONS_BASE_URL, POLLINATIONS_MODELS, SECRET_RUNWARE } from '../../defaults.js';
import { log, error } from '../../utils/logger.js';
import { updateSetting, getSettings } from '../../settings.js';

/**
 * Global cache of fetched Pollinations models.
 */
let cachedModels = [...POLLINATIONS_MODELS];

/**
 * Session cache of fetched Runware models (checkpoints).
 */
let cachedRunwareModels = [];

/**
 * Returns a UUID v4. 
 * Includes a fallback for browsers where crypto.randomUUID is restricted (non-HTTPS).
 */
function generateUUID() {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

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
 */
export async function refreshModelDropdown(currentModel) {
    const selector = '#plz-eng-pol-model';
    const $select  = $(selector);

    try {
        log('Models', `Refreshing Pollinations models (Current: ${currentModel})...`);
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
 * Attempts Browser Direct if key is found, then falls back to Server Proxy.
 */
export async function fetchRunwareModels() {
    const apiKey = await findSecret(SECRET_RUNWARE);

    // --- Path A: Browser Direct (VPN check) ---
    if (apiKey) {
        try {
            log('Models', 'Path A: Fetching Runware checkpoints (Browser Direct)...');
            const taskUUID = generateUUID();
            const res = await fetch('https://api.runware.ai/v1', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify([{
                    taskType: "modelSearch",
                    taskUUID: taskUUID,
                    category: "checkpoint",
                    search: "realistic",
                    limit: 100
                }])
            });

            if (!res.ok) throw new Error(`Browser direct failed: ${res.status}`);
            
            const data = await res.json();
            const taskResult = data.data?.find(t => t.taskUUID === taskUUID);
            
            cachedRunwareModels = taskResult?.models || [];
            log('Models', `Success (Browser): Cached ${cachedRunwareModels.length} checkpoints.`);
            return;
        } catch (err) {
            log('Models', `Path A failed: ${err.message}. Attempting Path B (Server Proxy)...`);
        }
    } else {
        log('Models', 'Path A skipped: No API key found in browser vault. Attempting Path B (Server Proxy)...');
    }

    // --- Path B: Server Proxy (Fallback) ---
    try {
        log('Models', 'Path B: Fetching Runware checkpoints (Server Proxy)...');
        const res = await fetch('/api/plugins/personalyze/runware-search', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ category: 'checkpoint', search: 'realistic', limit: 100 }),
        });

        if (!res.ok) throw new Error(`Server proxy failed: ${res.status}`);
        
        const { models } = await res.json();
        cachedRunwareModels = models || [];
        log('Models', `Success (Server): Cached ${cachedRunwareModels.length} checkpoints.`);
    } catch (err) {
        error('Models', 'CRITICAL: Both discovery paths for Runware checkpoints failed.', err);
    }
}

/**
 * Fetches top 200 LoRAs related to a specific search term.
 * Attempts Browser Direct if key is found, then falls back to Server Proxy.
 * 
 * @param {string} searchTerm - Query related to the active model (e.g. "flux", "pony")
 */
export async function fetchRunwareLoras(searchTerm = "flux") {
    const apiKey = await findSecret(SECRET_RUNWARE);
    let newModels = [];

    // --- Path A: Browser Direct (VPN check) ---
    if (apiKey) {
        try {
            log('Models', `Path A: Fetching LoRAs for "${searchTerm}" (Browser Direct)...`);
            const taskUUID = generateUUID();
            const res = await fetch('https://api.runware.ai/v1', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify([{
                    taskType: "modelSearch",
                    taskUUID: taskUUID,
                    category: "lora",
                    search: searchTerm,
                    limit: 200
                }])
            });

            if (!res.ok) throw new Error(`Browser direct failed: ${res.status}`);
            
            const data = await res.json();
            const taskResult = data.data?.find(t => t.taskUUID === taskUUID);
            newModels = taskResult?.models || [];
            log('Models', `Path A Response: Found ${newModels.length} LoRAs.`);
        } catch (err) {
            log('Models', `Path A failed: ${err.message}. Attempting Path B (Server Proxy)...`);
        }
    } else {
        log('Models', 'Path A skipped: No API key found in browser vault.');
    }

    // --- Path B: Server Proxy (Fallback) ---
    if (newModels.length === 0) {
        try {
            log('Models', `Path B: Fetching LoRAs for "${searchTerm}" (Server Proxy)...`);
            const res = await fetch('/api/plugins/personalyze/runware-search', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ category: 'lora', search: searchTerm, limit: 200 }),
            });

            if (!res.ok) throw new Error(`Server proxy failed: ${res.status}`);
            
            const data = await res.json();
            newModels = data.models || [];
            log('Models', `Path B Response: Found ${newModels.length} LoRAs.`);
        } catch (serverErr) {
            error('Models', `CRITICAL: Both discovery paths for LoRA "${searchTerm}" failed.`, serverErr);
        }
    }

    // --- Shared Registry Update ---
    if (newModels.length > 0) {
        const currentSettings = getSettings();
        const existingLoras = currentSettings.runwareLoras || [];
        
        const loraMap = new Map();
        existingLoras.forEach(l => {
            const air = l.air || l.modelId;
            if (air) loraMap.set(air, l);
        });
        
        newModels.forEach(l => {
            const air = l.air || l.modelId;
            if (air) loraMap.set(air, l);
        });

        const merged = Array.from(loraMap.values());
        updateSetting('runwareLoras', merged);
        log('Models', `Persistent registry updated. Total entries: ${merged.length}.`);
    } else {
        log('Models', `Query for "${searchTerm}" returned 0 results across both paths.`);
    }
}