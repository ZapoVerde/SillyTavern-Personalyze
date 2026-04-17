/**
 * @file data/default-user/extensions/personalyze/io/llm/workshop.js
 * @stamp {"utc":"2026-04-17T15:10:00.000Z"}
 * @architectural-role IO Executor (LLM)
 * @description
 * LLM interface for manual Workshop extraction tools.
 * 
 * Updated for Granular Identity Architecture:
 * 1. Overhauled detectAnchorScan parser to utilize parsePhase3.
 * 2. Now returns structured { name, identity: Map } instead of flat strings.
 *
 * @api-declaration
 * detectAnchorScan(context, focusName, profileId) -> Promise<object|null>
 * detectForceCostume(history, currentTurn, charName, hint, hintTemplate, profileId, template?) -> Promise<string>
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
    ANCHOR_SCAN_PROMPT, 
    FORCE_COSTUME_PROMPT 
} from '../../logic/prompts.js';
import { parsePhase3 } from '../../logic/parsers.js';

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

// ─── Anchor Scan ──────────────────────────────────────────────────────────────

/**
 * Scans a transcript for a character's permanent physical identity.
 * Supports a targeted focus name to ignore other characters.
 * 
 * @returns {Promise<{name: string, identity: Object}|null>}
 */
export async function detectAnchorScan(context, focusName, profileId) {
    const focusBlock = focusName 
        ? `CHARACTER FOCUS: ${focusName}\nIgnore all other entities. Extract only the physical features of this specific character.`
        : '';
        
    const prompt = ANCHOR_SCAN_PROMPT
        .replace('{{character_focus}}', focusBlock)
        .replace('{{context}}', context);

    const raw = await dispatch(prompt, profileId, 'AnchorScan', { temperature: 0.3 });
    
    // Use generic Key-Value parser
    const parsed = parsePhase3(raw);

    // 1. Extract Name (case-insensitive key search)
    const nameKey = Object.keys(parsed).find(k => k.toLowerCase() === 'name');
    const name = nameKey ? parsed[nameKey].item : (focusName || 'Unknown');
    if (nameKey) delete parsed[nameKey];

    // 2. Identity items in the prompt are simple strings.
    // parsePhase3 puts the full string in 'item' when no pipe '|' is found.
    const identity = {};
    for (const [k, v] of Object.entries(parsed)) {
        identity[k] = v.item;
    }

    if (Object.keys(identity).length === 0) return null;

    return { name, identity };
}

// ─── Force Costume ────────────────────────────────────────────────────────────

/**
 * Forces the AI to extract a character's outfit from a specific text turn,
 * optionally using a keyword hint to guide the extraction.
 *
 * @param {string} history - Preceding turns for context.
 * @param {string} currentTurn - The target message text.
 * @param {string} charName
 * @param {string} hint - Optional keyword hint from the user.
 * @param {string} hintTemplate - Settings template for building the hint block (contains {{hint}}).
 * @param {string} profileId
 * @param {string} [template] - Optional prompt override from settings.
 */
export async function detectForceCostume(history, currentTurn, charName, hint, hintTemplate, profileId, template = FORCE_COSTUME_PROMPT) {
    const hintBlock = hint
        ? hintTemplate.replace('{{hint}}', hint)
        : '';

    const prompt = template
        .replace('{{character_name}}', charName)
        .replace('{{hint_block}}', hintBlock)
        .replace('{{history}}', history || 'None')
        .replace('{{current_turn}}', currentTurn);

    return await dispatch(prompt, profileId, 'ForceCostume', { temperature: 0.3 });
}