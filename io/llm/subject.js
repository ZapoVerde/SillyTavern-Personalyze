/**
 * @file data/default-user/extensions/personalyze/io/llm/subject.js
 * @stamp {"utc":"2026-04-17T13:45:00.000Z"}
 * @architectural-role IO Executor (LLM)
 * @description
 * Primary LLM interface for the 3-Phase standard pipeline.
 *
 * Updated for Granular Identity Architecture:
 * 1. Added support for identity map in detectLayers.
 * 2. Compiles granular identity into a fallback string for prompt context.
 * 3. Dynamically generates format instructions for both clothing and identity slots.
 *
 * @api-declaration
 * detectSubject(message, history, rosterIds, chatCharacters, profileId) -> Promise<string|null>
 * detectChange(message, history, charName, layers, profileId) -> Promise<boolean>
 * detectLayers(message, history, charName, identityMap, layers, slots, profileId) -> Promise<string>
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
import { BASE_SLOTS } from '../../defaults.js';
import { 
    PHASE_1_SUBJECT_PROMPT, 
    PHASE_2_CHANGE_PROMPT, 
    PHASE_3_LAYERED_PROMPT 
} from '../../logic/prompts.js';
import { parsePhase1, parsePhase2, compileIdentityString } from '../../logic/parsers.js';

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

/**
 * Helper to build a clean summary of current visual state.
 * Omit slots that are null, empty, or marked as 'None'/'KEEP' to reduce prompt noise.
 */
function buildStateSummary(layers) {
    const lines = Object.entries(layers || {})
        .filter(([, v]) => {
            if (v === null || v === undefined) return false;
            if (typeof v === 'object' && (!v.item || v.item === 'None' || v.item === 'KEEP')) return false;
            if (typeof v === 'string' && (v === 'None' || v === 'KEEP')) return false;
            return true;
        })
        .map(([k, v]) => {
            const label = k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');
            if (typeof v === 'string') return `${label}: ${v}`;
            return `${label}: ${v.item} | ${v.modifier || 'None'}`;
        });

    return lines.length > 0 ? lines.join('\n') : 'None (Base Identity)';
}

// ─── Phase 1: Subject Detection ───────────────────────────────────────────────

/**
 * Identifies which character is the subject.
 */
export async function detectSubject(message, history, rosterIds, chatCharacters, profileId) {
    const formattedRoster = rosterIds.map(id => {
        const char = chatCharacters[id];
        const displayName = char?.label || id.replace(/_/g, ' ');
        let entry = `${displayName} (ID: ${id})`;
        if (char?.aka && char.aka.length > 0) {
            entry += ` [AKA: ${char.aka.join(', ')}]`;
        }
        return entry;
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
 */
export async function detectChange(message, history, charName, layers, profileId) {
    const prompt = PHASE_2_CHANGE_PROMPT
        .replace('{{character_name}}', charName)
        .replace('{{current_layers}}', buildStateSummary(layers))
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
 * @param {string} history - Preceding turns.
 * @param {string} charName
 * @param {Object} identityMap - Granular physical traits.
 * @param {Object} layers - Current visual state.
 * @param {string[]} slots - The list of clothing slot keys for this character.
 * @param {string} profileId
 */
export async function detectLayers(message, history, charName, identityMap, layers, slots, profileId) {
    // 1. Build Wardrobe instructions
    const formatInstructions = (slots || BASE_SLOTS).map(s => {
        const label = s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
        return `${label}: [Item] | [Modifier]`;
    });

    // 2. Build Identity instructions (Simple Strings)
    if (identityMap && typeof identityMap === 'object') {
        Object.keys(identityMap).forEach(k => {
            const label = k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');
            formatInstructions.push(`${label}: [Description string]`);
        });
    }

    formatInstructions.push('Emotion: [Adjective]');
    formatInstructions.push('Pose: [Description]');

    // 3. Contextual Fallback for prompt template
    const identityAnchor = compileIdentityString(identityMap);

    const prompt = PHASE_3_LAYERED_PROMPT
        .replace('{{character_name}}', charName)
        .replace('{{identity_anchor}}', identityAnchor || 'No specific description.')
        .replace('{{current_state}}', buildStateSummary(layers))
        .replace('{{slot_format_instructions}}', formatInstructions.join('\n'))
        .replace('{{history}}', history || 'None')
        .replace('{{message}}', message);

    return await dispatch(prompt, profileId, 'Extraction', { temperature: 0.3 });
}