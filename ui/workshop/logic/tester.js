/**
 * @file data/default-user/extensions/personalyze/ui/workshop/logic/tester.js
 * @stamp {"utc":"2026-05-01T19:40:00.000Z"}
 * @architectural-role IO Executor
 * @description
 * Handles the live execution and preview of Logic Probes from the UI.
 * Mirrors the master pipeline's context-building and hydration logic.
 * 
 * @api-declaration
 * handleTestProbe(probeKey, probeObj) -> Promise<void>
 * 
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [LLM, computationalParser.js, logicExecutor.js, toastr]
 */

import { getContext } from '../../../../../../extensions.js';
import { getSettings } from '../../../settings.js';
import { state } from '../../../state.js';
import { buildHistoryText } from '../../utils/history.js';
import { executeLogicProbe } from '../../../io/llm/logicExecutor.js';
import { evaluateComputationalLogic, extractTokens } from '../../../logic/computationalParser.js';
import { warn } from '../../utils/logger.js';

/**
 * Executes a logic probe test and displays the hydrated result.
 * 
 * @param {string} probeKey - The key of the probe.
 * @param {Object} probeObj - The probe definition.
 */
export async function handleTestProbe(probeKey, probeObj) {
    if (!probeKey || !probeObj) return;

    try {
        const context = getContext();
        const lastIdx = Math.max(0, context.chat.length - 1);
        const text = context.chat[lastIdx]?.mes || '';
        const history = buildHistoryText(context.chat, lastIdx, getSettings().detectionHistory);
        
        const workshopChar = state.chatCharacters[state._workshopCharacterId];
        const chain = state.characterChain[state._workshopCharacterId];
        const layers = chain?.layers || {};

        // 1. Build Evaluation Context
        const contextData = { 
            current_turn: text, 
            history, 
            character_name: state._workshopCharacterId || 'test_subject' 
        };

        // Inject Character Identity
        if (workshopChar?.identity) {
            Object.assign(contextData, workshopChar.identity);
        }

        // Inject Serialized Wardrobe
        Object.entries(layers).forEach(([k, v]) => {
            if (k === 'logic') return;
            if (!v) contextData[k] = 'none';
            else if (typeof v === 'string') contextData[k] = v;
            else contextData[k] = `${v.item} (${v.modifier || 'none'})`;
        });

        let finalOutput = '';
        let isTrue = false;

        // 2. Evaluation Step
        if (probeObj.type === 'computational') {
            isTrue = evaluateComputationalLogic(probeObj.prompt, contextData);
            finalOutput = isTrue ? (probeObj.trueTemplate ?? '') : (probeObj.falseTemplate ?? '');
        } else {
            // LLM Evaluation
            finalOutput = await executeLogicProbe(probeKey, probeObj, contextData);
            // Note: LLM Boolean extraction is handled inside logicExecutor.js
        }

        // 3. Hydration Pass (Mirrors pipeline logicPhase.js)
        // Resolves {{variables}} nested inside the Yes/No output boxes.
        const resultTokens = extractTokens(finalOutput);
        for (const rt of resultTokens) {
            if (contextData[rt] !== undefined) {
                const regex = new RegExp(`\\{\\{${rt}\\}\\}`, 'gi');
                finalOutput = finalOutput.replace(regex, String(contextData[rt]));
            }
        }

        // 4. UI Feedback
        if (window.toastr) {
            const title = probeObj.type === 'computational' ? `Instant Test: ${probeKey}` : `LLM Probe: ${probeKey}`;
            const resultLabel = (probeObj.type === 'text') ? 'Extracted Text' : `Result: ${isTrue ? 'TRUE' : 'FALSE'}`;
            
            window.toastr.info(`${resultLabel}${finalOutput ? `\nInjected: "${finalOutput}"` : ''}`, title);
        }

    } catch (err) {
        warn('LogicTester', 'Execution failed:', err.message);
        if (window.toastr) window.toastr.error(`Test failed: ${err.message}`);
    }
}