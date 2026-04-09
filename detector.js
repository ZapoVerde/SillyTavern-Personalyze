/**
 * @file data/default-user/extensions/personalyze/detector.js
 * @stamp {"utc":"2026-04-10T12:20:00.000Z"}
 * @architectural-role IO Executor (LLM)
 * @description
 * Wraps all LLM calls for the 3-Phase Layered State pipeline.
 * Implements Dual-Model routing via ST Connection Manager profiles.
 *
 * Phases:
 * 1. Subject Detection (Fast Model)
 * 2. Change Gate (Fast Model)
 * 3. State Extraction (Smart Model)
 *
 * @api-declaration
 * detectSubject(message, roster, profileId) -> Promise<string|null>
 * detectChange(message, charName, layers, profileId) -> Promise<boolean>
 * detectLayers(message, charName, anchor, profileId) -> Promise<string>
 * detectAnchorScan(context, charName, profileId) -> Promise<object|null>
 * 
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [ConnectionManagerRequestService, prompts.js, logger.js, callLog.js]
 */

import { ConnectionManagerRequestService } from '../../shared.js';
import { log, warn, error } from './utils/logger.js';
import { logCall } from './utils/callLog.js';
import { 
    PHASE_1_SUBJECT_PROMPT, 
    PHASE_2_CHANGE_PROMPT, 
    PHASE_3_LAYERED_PROMPT,
    ANCHOR_SCAN_PROMPT,
    OUTFIT_GENERATOR_PROMPT 
} from './logic/prompts.js';
import { parsePhase1, parsePhase2 } from './logic/parsers.js';

// ─── Internal Dispatcher ──────────────────────────────────────────────────────

/**
 * Sends a prompt to the LLM and logs the turn.
 */
async function dispatch(prompt, profileId, label, extraOptions = {}) {
    if (!profileId) {
        warn(label, 'No connection profile configured for this stage.');
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
        error(label, 'LLM Request failed:', err);
        logCall(label, prompt, null, err.message);
        throw err;
    }
}

// ─── Phase 1: Subject Detection ───────────────────────────────────────────────

/**
 * Identifies which character from the roster is the main subject.
 */
export async function detectSubject(message, roster, profileId) {
    const rosterList = roster.join(', ') || 'None';
    const prompt = PHASE_1_SUBJECT_PROMPT
        .replace('{{active_roster}}', rosterList)
        .replace('{{message}}', message);

    const raw = await dispatch(prompt, profileId, 'SubjectDetect', { temperature: 0.1 });
    return parsePhase1(raw);
}

// ─── Phase 2: Change Gate ─────────────────────────────────────────────────────

/**
 * Checks if the visual state needs an update based on the message.
 */
export async function detectChange(message, charName, layers, profileId) {
    // Stringify current layers for context
    const layerSummary = Object.entries(layers)
        .map(([k, v]) => {
            if (!v) return `${k}: None`;
            if (typeof v === 'string') return `${k}: ${v}`;
            return `${k}: ${v.item} | ${v.modifier || 'None'}`;
        })
        .join('\n');

    const prompt = PHASE_2_CHANGE_PROMPT
        .replace('{{character_name}}', charName)
        .replace('{{current_layers}}', layerSummary)
        .replace('{{message}}', message);

    const raw = await dispatch(prompt, profileId, 'ChangeGate', { temperature: 0.1 });
    return parsePhase2(raw);
}

// ─── Phase 3: Extraction ──────────────────────────────────────────────────────

/**
 * Extracts the specific layer updates from the text.
 * Note: Uses the Smart Profile.
 */
export async function detectLayers(message, charName, anchor, profileId) {
    const prompt = PHASE_3_LAYERED_PROMPT
        .replace('{{character_name}}', charName)
        .replace('{{identity_anchor}}', anchor)
        .replace('{{message}}', message);

    return await dispatch(prompt, profileId, 'Extraction', { temperature: 0.3 });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Scans chat for permanent physical identity.
 */
export async function detectAnchorScan(context, charName, profileId) {
    const charFocus = charName ? `CHARACTER FOCUS: ${charName}\n` : '';
    const prompt = ANCHOR_SCAN_PROMPT
        .replace('{{character_focus}}', charFocus)
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

/**
 * Generates an outfit description from a keyword.
 */
export async function detectOutfitGenerator(keyword, profileId) {
    const prompt = OUTFIT_GENERATOR_PROMPT.replace('{{keyword}}', keyword);
    const raw = await dispatch(prompt, profileId, 'OutfitGen', { temperature: 0.5 });
    return raw.replace(/^\[|\]$/g, '').trim();
}