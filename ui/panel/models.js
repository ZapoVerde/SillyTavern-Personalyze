/**
 * @file data/default-user/extensions/personalyze/ui/panel/models.js
 * @stamp {"utc":"2026-04-18T18:00:00.000Z"}
 * @architectural-role UI Logic (API Discovery)
 * @description
 * Handles dynamic discovery and manual registry management for image generation engines. 
 * Updated to implement the Forensic Observability Standard: all background discovery
 * traffic is mirrored to the System Log.
 *
 * @api-declaration
 * refreshModelDropdown(currentModel) -> Promise<void>
 * getCachedModels() -> string[]
 * fetchRunwareModels() -> Promise<void>
 * fetchRunwareLoras(searchTerm) -> Promise<void>
 * getCachedRunwareModels() -> Object[]
 * saveManualModel(label, air) -> void
 * saveManualLora(label, air, modelAir) -> void
 * 
 * @contract
 *   assertions:
 *     purity: IO / Side-effect
 *     state_ownership: [cachedModels, cachedRunwareModels]
 *     external_io: [fetch, callLog.js, settings.js, secrets.js]
 */

import { findSecret } from '../../../../../secrets.js';
import { getRequestHeaders } from '../../../../../../script.js';
import { 
    POLLINATIONS_BASE_URL, 
    POLLINATIONS_MODELS, 
    SECRET_RUNWARE, 
    RUNWARE_MODELS 
} from '../../defaults.js';
import { log, error } from '../../utils/logger.js';
import { updateSetting, getSettings } from '../../settings.js';
import { startSystemTurn, logCall, logPatchLast } from '../../utils/callLog.js';

/** Session cache of fetched Pollinations models. */
let cachedModels = [...POLLINATIONS_MODELS];

/** Session cache of fetched Runware models (checkpoints). */
let cachedRunwareModels = [];

/** Returns a UUID v4. */
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

/** Returns the latest known list of Pollinations models. */
export function getCachedModels() {
    return cachedModels;
}

/** Returns a merged list of Runware models from all sources. */
export function getCachedRunwareModels() {
    const s = getSettings();
    const manual = s.runwareModels || [];
    const seen = new Set();
    const merged = [];

    const add = (list) => {
        for (const m of list) {
            const air = m.air || m.modelId;
            if (air && !seen.has(air)) {
                seen.add(air);
                merged.push({ 
                    label: m.label || m.name || air, 
                    air,
                    architecture: m.architecture || 'unknown'
                });
            }
        }
    };

    add(manual);
    add(cachedRunwareModels);
    add(RUNWARE_MODELS);
    return merged;
}

export function saveManualModel(label, air) {
    const s = getSettings();
    const current = s.runwareModels || [];
    if (current.some(m => m.air === air)) return;
    updateSetting('runwareModels', [...current, { label, air, architecture: 'unknown' }]);
}

export function saveManualLora(label, air, modelAir) {
    const s = getSettings();
    const current = s.runwareLoras || [];
    if (current.some(l => l.air === air && l.modelAir === modelAir)) return;
    updateSetting('runwareLoras', [...current, { label, air, modelAir }]);
}

/** Fetches latest models from Pollinations with forensic logging. */
export async function refreshModelDropdown(currentModel) {
    startSystemTurn('Pollinations Discovery');
    logCall('FetchModels', 'Requesting model list from Pollinations API', null, null, { url: `${POLLINATIONS_BASE_URL}/image/models` });

    try {
        const response = await fetch(`${POLLINATIONS_BASE_URL}/image/models`);
        const data = await response.json();
        logPatchLast('Success', null, null, data);

        let models = Array.isArray(data) ? data.map(m => m.id || m.name || m) : (data.data || []);
        if (currentModel && !models.includes(currentModel)) models.unshift(currentModel);
        
        cachedModels = [...new Set(models.filter(Boolean))];
        const $select = $('#plz-eng-pol-model');
        if ($select.length) {
            $select.html(cachedModels.map(m => `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`).join(''));
        }
    } catch (err) {
        logPatchLast(null, `Discovery Failed: ${err.message}`, null, null);
    }
}

/** Fetches Runware Checkpoints with forensic logging. */
export async function fetchRunwareModels() {
    const apiKey = await findSecret(SECRET_RUNWARE);
    const reqBundle = { category: 'checkpoint', search: 'realistic', limit: 100 };
    
    startSystemTurn('Runware Model Discovery');
    logCall('FetchCheckpoints', 'Requesting checkpoint list from Runware', null, null, reqBundle);

    try {
        let data;
        if (apiKey) {
            const taskUUID = generateUUID();
            const res = await fetch('https://api.runware.ai/v1', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify([{ ...reqBundle, taskType: "modelSearch", taskUUID }])
            });
            const raw = await res.json();
            data = raw.data?.find(t => t.taskUUID === taskUUID)?.models || [];
        } else {
            const res = await fetch('/api/plugins/personalyze/runware-search', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify(reqBundle),
            });
            const raw = await res.json();
            data = raw.models || [];
        }
        
        cachedRunwareModels = data;
        logPatchLast('Success', null, null, data);
    } catch (err) {
        logPatchLast(null, `Discovery Failed: ${err.message}`, null, null);
    }
}

/** Fetches Runware LoRAs with forensic logging. */
export async function fetchRunwareLoras(searchTerm = "flux") {
    const apiKey = await findSecret(SECRET_RUNWARE);
    const reqBundle = { category: 'lora', search: searchTerm, limit: 200 };

    startSystemTurn('Runware LoRA Discovery');
    logCall('FetchLoras', `Searching LoRAs for keyword: ${searchTerm}`, null, null, reqBundle);

    try {
        let newModels = [];
        if (apiKey) {
            const taskUUID = generateUUID();
            const res = await fetch('https://api.runware.ai/v1', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify([{ ...reqBundle, taskType: "modelSearch", taskUUID }])
            });
            const raw = await res.json();
            newModels = raw.data?.find(t => t.taskUUID === taskUUID)?.models || [];
        } else {
            const res = await fetch('/api/plugins/personalyze/runware-search', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify(reqBundle),
            });
            const raw = await res.json();
            newModels = raw.models || [];
        }

        logPatchLast('Success', null, null, newModels);

        if (newModels.length > 0) {
            const current = getSettings().runwareLoras || [];
            const loraMap = new Map();
            current.forEach(l => loraMap.set(l.air || l.modelId, l));
            newModels.forEach(l => loraMap.set(l.air || l.modelId, l));
            updateSetting('runwareLoras', Array.from(loraMap.values()));
        }
    } catch (err) {
        logPatchLast(null, `Discovery Failed: ${err.message}`, null, null);
    }
}