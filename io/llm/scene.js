/**
 * @file data/default-user/extensions/personalyze/io/llm/scene.js
 * @stamp {"utc":"2026-04-10T20:20:00.000Z"}
 * @architectural-role IO Executor (LLM)
 * @description
 * LLM interface for proactive scene and wardrobe management.
 * 
 * Functions:
 * 1. Scene Exit Detection (YES/NO)
 * 2. Batched Wardrobe Validity (Multi-character check)
 * 3. Redress Extraction (supports USE_DEFAULT)
 *
 * @api-declaration
 * detectSceneChange(currentLoc, history, currentTurn, profileId, template?) -> Promise<boolean>
 * detectWardrobeValidity(history, currentTurn, rosterItems, profileId, template?) -> Promise<object>
 * detectRedress(charName, history, currentTurn, profileId, template?) -> Promise<string>
 * 
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [ConnectionManagerRequestService, prompts.js, logger.js]
 */

import { ConnectionManagerRequestService } from '../../../../shared.js';
import { log, warn, error } from '../../utils/logger.js';
import { logCall } from '../../utils/callLog.js';
import { 
    SCENE_CHANGE_PROMPT, 
    WARDROBE_VALIDITY_PROMPT, 
    REDRESS_PROMPT 
} from '../../logic/prompts.js';

// ─── Internal Dispatcher ──────────────────────────────────────────────────────

async function dispatch(prompt, profileId, label, extraOptions = {}) {
    if (!profileId) {
        warn(label, 'No connection profile configured.');
        return '';
    }

    log(label, `--- PROMPT ---\n${prompt}`);
    try {
        const result = await ConnectionManagerRequestService.sendRequest(profileId, prompt, null, extraOptions);
        const text   = String(result?.content ?? result ?? '').trim();
        log(label, `--- RESPONSE ---\n${text}`);
        logCall(label, prompt, text, null);
        return text;
    } catch (err) {
        const msg = err.cause?.message || err.message;
        error(label, 'LLM Request failed:', msg);
        logCall(label, prompt, null, msg);
        throw err;
    }
}

// ─── Scene Detection ──────────────────────────────────────────────────────────

/**
 * Checks if the characters have exited the current location.
 * @returns {Promise<boolean>}
 */
export async function detectSceneChange(currentLoc, history, currentTurn, profileId, template = SCENE_CHANGE_PROMPT) {
    const prompt = template
        .replace('{{current_location}}', currentLoc || 'Unknown')
        .replace('{{history}}', history || 'None')
        .replace('{{current_turn}}', currentTurn);

    const raw = await dispatch(prompt, profileId, 'SceneDetect', { temperature: 0.1 });
    return /^yes(?:[^a-zA-Z]|$)/i.test(raw);
}

// ─── Wardrobe Validity ────────────────────────────────────────────────────────

/**
 * Batches a check for the entire active roster to see if their outfits
 * are still narratively valid for the new scene.
 *
 * @param {string} history - Preceding turns for context.
 * @param {string} currentTurn - The scene transition message.
 * @param {Array<{name: string, layers: object}>} rosterItems
 * @returns {Promise<Record<string, boolean>>} Map of charName to validity (true = needs redress).
 */
export async function detectWardrobeValidity(history, currentTurn, rosterItems, profileId, template = WARDROBE_VALIDITY_PROMPT) {
    const characterNames = rosterItems
        .map(item => `- ${item.name}`)
        .join('\n');

    const currentLayers = rosterItems.map(item => {
        const layerSummary = Object.entries(item.layers)
            .map(([k, v]) => {
                if (!v) return `${k}: None`;
                if (typeof v === 'string') return `${k}: ${v}`;
                return `${k}: ${v.item} | ${v.modifier || 'None'}`;
            })
            .join(', ');
        return `${item.name}: ${layerSummary}`;
    }).join('\n');

    const prompt = template
        .replace('{{character_names}}', characterNames)
        .replace('{{current_layers}}', currentLayers)
        .replace('{{history}}', history || 'None')
        .replace('{{current_turn}}', currentTurn);

    const raw = await dispatch(prompt, profileId, 'WardrobeGate', { temperature: 0.1 });

    // Parser for "Name: YES/NO" lines
    const results = {};
    raw.split('\n').forEach(line => {
        const parts = line.split(':');
        if (parts.length < 2) return;
        const name = parts[0].trim();
        const needsRedress = /^no(?:[^a-zA-Z]|$)/i.test(parts[1].trim()); // NO = Invalid = Needs Redress
        results[name] = needsRedress;
    });

    return results;
}

// ─── Redress ──────────────────────────────────────────────────────────────────

/**
 * Extracts new clothing from a scene transition.
 * Returns the raw LLM response (5-slot list OR "USE_DEFAULT").
 */
export async function detectRedress(charName, history, currentTurn, profileId, template = REDRESS_PROMPT) {
    const prompt = template
        .replace('{{character_name}}', charName)
        .replace('{{history}}', history || 'None')
        .replace('{{current_turn}}', currentTurn);

    return await dispatch(prompt, profileId, 'RedressExtract', { temperature: 0.3 });
}