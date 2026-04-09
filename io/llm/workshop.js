/**
 * @file data/default-user/extensions/personalyze/io/llm/workshop.js
 * @stamp {"utc":"2026-04-10T20:40:00.000Z"}
 * @architectural-role IO Executor (LLM)
 * @description
 * LLM interface for manual Workshop extraction tools.
 * 
 * Functions:
 * 1. Targeted Identity Anchor Scan (Physical features)
 * 2. Force Costume Extraction (Turn-specific 5-slot extraction)
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
 */
export async function detectAnchorScan(context, focusName, profileId) {
    const focusBlock = focusName 
        ? `CHARACTER FOCUS: ${focusName}\nIgnore all other entities. Extract only the physical features of this specific character.`
        : '';
        
    const prompt = ANCHOR_SCAN_PROMPT
        .replace('{{character_focus}}', focusBlock)
        .replace('{{context}}', context);

    const raw = await dispatch(prompt, profileId, 'AnchorScan', { temperature: 0.3 });
    
    // Inline parser for Anchor Scan
    const nameMatch   = raw.match(/Name:\s*(.+)/i);
    const anchorMatch = raw.match(/Identity\s+Anchor:\s*([\s\S]+)/i);

    if (!nameMatch || !anchorMatch) return null;
    return {
        name:   nameMatch[1].trim(),
        anchor: anchorMatch[1].trim()
    };
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