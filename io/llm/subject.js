/**
 * @file data/default-user/extensions/personalyze/io/llm/subject.js
 * @stamp {"utc":"2026-04-10T20:00:00.000Z"}
 * @architectural-role IO Executor (LLM)
 * @description
 * Primary LLM interface for the 3-Phase standard pipeline.
 *
 * Phases:
 * 1. Subject Identification (includes AKA alias awareness)
 * 2. Visual Change Gating
 * 3. Layered State Extraction
 *
 * @api-declaration
 * detectSubject(message, history, rosterIds, chatCharacters, profileId) -> Promise<string|null>
 * detectChange(message, history, charName, layers, profileId) -> Promise<boolean>
 * detectLayers(message, history, charName, anchor, layers, profileId) -> Promise<string>
 * 
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [ConnectionManagerRequestService, prompts.js, logger.js, callLog.js]
 */

import { ConnectionManagerRequestService } from '../../../../shared.js';
import { log, warn, error } from '../../utils/logger.js';
import { logCall } from '../../utils/callLog.js';
import { 
    PHASE_1_SUBJECT_PROMPT, 
    PHASE_2_CHANGE_PROMPT, 
    PHASE_3_LAYERED_PROMPT 
} from '../../logic/prompts.js';
import { parsePhase1, parsePhase2 } from '../../logic/parsers.js';

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
        const msg = err.cause?.message || err.message;
        error(label, 'LLM Request failed:', msg);
        logCall(label, prompt, null, msg);
        throw err;
    }
}

// ─── Phase 1: Subject Detection ───────────────────────────────────────────────

/**
 * Identifies which character is the subject.
 * Formats roster with AKAs so the LLM knows nicknames.
 *
 * @param {string} message - The latest AI message text.
 * @param {string} history - Preceding turns for pronoun resolution.
 * @param {string[]} rosterIds - Canonical IDs in the roster.
 * @param {object} chatCharacters - The state.chatCharacters map.
 * @param {string} profileId - ST Connection Profile ID.
 */
export async function detectSubject(message, history, rosterIds, chatCharacters, profileId) {
    const formattedRoster = rosterIds.map(id => {
        const char = chatCharacters[id];
        const label = id.replace(/_/g, ' ');
        if (char?.aka && char.aka.length > 0) {
            return `${label} (AKA: ${char.aka.join(', ')})`;
        }
        return label;
    }).join('\n');

    const prompt = PHASE_1_SUBJECT_PROMPT
        .replace('{{active_roster}}', formattedRoster || 'None')
        .replace('{{history}}', history || 'None')
        .replace('{{message}}', message);

    const raw = await dispatch(prompt, profileId, 'SubjectDetect', { temperature: 0.1 });
    return parsePhase1(raw);
}

// ─── Phase 2: Change Gate ─────────────────────────────────────────────────────

/**
 * Checks if the visual state needs an update based on the message.
 *
 * @param {string} message - The latest AI message text.
 * @param {string} history - Preceding turns for context.
 * @param {string} charName
 * @param {object} layers
 * @param {string} profileId
 */
export async function detectChange(message, history, charName, layers, profileId) {
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
        .replace('{{history}}', history || 'None')
        .replace('{{message}}', message);

    const raw = await dispatch(prompt, profileId, 'ChangeGate', { temperature: 0.1 });
    return parsePhase2(raw);
}

// ─── Phase 3: Extraction ──────────────────────────────────────────────────────

/**
 * Extracts the specific layer updates from the text.
 *
 * @param {string} message - The latest AI message text.
 * @param {string} history - Preceding turns for pronoun and reference resolution.
 * @param {string} charName
 * @param {string} anchor
 * @param {object} layers - Current visual state, so the LLM can detect removals and modifications.
 * @param {string} profileId
 */
export async function detectLayers(message, history, charName, anchor, layers, profileId) {
    const currentState = Object.entries(layers)
        .map(([k, v]) => {
            if (!v) return `${k}: None`;
            if (typeof v === 'string') return `${k}: ${v}`;
            return `${k}: ${v.item} | ${v.modifier || 'None'}`;
        })
        .join('\n');

    const prompt = PHASE_3_LAYERED_PROMPT
        .replace('{{character_name}}', charName)
        .replace('{{identity_anchor}}', anchor)
        .replace('{{current_state}}', currentState)
        .replace('{{history}}', history || 'None')
        .replace('{{message}}', message);

    return await dispatch(prompt, profileId, 'Extraction', { temperature: 0.3 });
}