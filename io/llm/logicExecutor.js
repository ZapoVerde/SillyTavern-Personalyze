/**
 * @file data/default-user/extensions/personalyze/io/llm/logicExecutor.js
 * @stamp {"utc":"2026-05-01T08:00:00.000Z"}
 * @architectural-role IO Executor (LLM)
 * @description
 * Executes dynamic logic probes via the AI connection.
 * Implements robust boolean parsing and forensic logging protocols.
 * 
 * Updated for Forensic Reality:
 * 1. logCall now captures the literal compiled string (fullPrompt) as the 
 *    primary log entry, removing "interpreted" blind spots.
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
 */
function parseAffirmative(text) {
    if (!text) return false;
    const clean = text.trim().toLowerCase();
    // Match common affirmative responses: yes, true, 1, affirmative, indeed.
    const regex = /\b(yes|true|1|affirmative|indeed)\b/i;
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

    // 1. Compile the literal string that will be sent to the wire
    const fullPrompt = compileProbePrompt(probe.prompt, contextData);
    
    // 2. Forensic Protocol: Mirror the literal reality, not the interpretation.
    // The second argument (prompt) is what displays in the flight recorder.
    logCall(label, fullPrompt, null, null, { 
        probeKey: key, 
        type: probe.type,
        rawPromptSent: fullPrompt,
        contextVariables: contextData 
    });

    try {
        const result = await ConnectionManagerRequestService.sendRequest(profileId, fullPrompt, null, { 
            temperature: 0.1, 
            signal 
        });

        const rawText = String(result?.content ?? result ?? '').trim();
        let finalOutput = '';

        if (probe.type === 'boolean') {
            const isTrue = parseAffirmative(rawText);
            finalOutput = isTrue ? (probe.trueTemplate ?? '') : (probe.falseTemplate ?? '');
            log('LogicExecutor', `${key} evaluated: ${isTrue ? 'TRUE' : 'FALSE'}`);
        } else {
            finalOutput = rawText;
            log('LogicExecutor', `${key} extracted: "${finalOutput}"`);
        }

        // 3. Forensic Protocol: Patch the response and final parsed reality into logs
        logPatchLast(finalOutput, null, { rawResponse: rawText }, rawText);

        return finalOutput;

    } catch (err) {
        const msg = err.cause?.message || err.message;
        error(label, `LLM Request failed for probe "${key}":`, msg);
        logPatchLast(null, msg, null, null);
        throw err;
    }
}