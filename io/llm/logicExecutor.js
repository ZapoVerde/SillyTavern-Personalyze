/**
 * @file data/default-user/extensions/personalyze/io/llm/logicExecutor.js
 * @stamp {"utc":"2026-05-01T07:20:00.000Z"}
 * @architectural-role IO Executor (LLM)
 * @description
 * Executes dynamic logic probes via the AI connection.
 * Implements robust boolean parsing and forensic logging protocols.
 * 
 * @api-declaration
 * executeLogicProbe(key, probe, contextData, signal) -> Promise<string>
 * 
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [ConnectionManagerRequestService, callLog.js, logger.js]
 */

import { ConnectionManagerRequestService } from '../../../../shared.js';
import { log, warn, error } from '../../utils/logger.js';
import { logCall, logPatchLast } from '../../utils/callLog.js';

/**
 * Robustly parses an AI response into a boolean state.
 * Accepts various affirmative signals across different models.
 */
function parseAffirmative(text) {
    if (!text) return false;
    const clean = text.trim().toLowerCase();
    // Match common affirmative responses: yes, true, 1, affirmative, correct, indeed.
    // Also captures "Result: Yes" or "Answer: True" patterns.
    const regex = /\b(yes|true|1|affirmative|correct|indeed)\b/i;
    return regex.test(clean);
}

/**
 * Compiles a probe's prompt by replacing its specific context variables.
 */
function compileProbePrompt(template, contextData) {
    let result = template || '';
    for (const [key, val] of Object.entries(contextData)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
        result = result.replace(regex, String(val ?? ''));
    }
    return result;
}

/**
 * Dispatches a logic probe to the LLM and processes the result.
 * 
 * @param {string} key - The token identifier (e.g. "is_wet").
 * @param {object} probe - The probe definition from the Style.
 * @param {object} contextData - Resolved dependencies for prompt injection.
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>} The string to be injected into the final prompt.
 */
export async function executeLogicProbe(key, probe, contextData, signal) {
    const profileId = probe.profileId;
    const label = `LogicProbe:${key}`;

    if (!profileId) {
        warn(label, `No connection profile configured for probe "${key}".`);
        return '';
    }

    const fullPrompt = compileProbePrompt(probe.prompt, contextData);
    
    // Forensic Protocol: Open the mirrored call log entry
    logCall(label, fullPrompt, null, null, { 
        probeKey: key, 
        type: probe.type, 
        context: contextData 
    });

    try {
        const result = await ConnectionManagerRequestService.sendRequest(profileId, fullPrompt, null, { 
            temperature: 0.1, // Fixed low temp for logic reliability
            signal 
        });

        const rawText = String(result?.content ?? result ?? '').trim();
        let finalOutput = '';

        if (probe.type === 'boolean') {
            const isTrue = parseAffirmative(rawText);
            finalOutput = isTrue ? (probe.trueTemplate ?? '') : (probe.falseTemplate ?? '');
            log('LogicExecutor', `${key} evaluated: ${isTrue ? 'TRUE' : 'FALSE'}`);
        } else {
            // Extraction/Text mode: use raw AI response
            finalOutput = rawText;
            log('LogicExecutor', `${key} extracted: "${finalOutput}"`);
        }

        // Forensic Protocol: Patch the response and final parsed reality into logs
        logPatchLast(finalOutput, null, { rawResponse: rawText }, rawText);

        return finalOutput;

    } catch (err) {
        const msg = err.cause?.message || err.message;
        error(label, `LLM Request failed for probe "${key}":`, msg);
        logPatchLast(null, msg, null, null);
        throw err;
    }
}