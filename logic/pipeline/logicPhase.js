/**
 * @file data/default-user/extensions/personalyze/logic/pipeline/logicPhase.js
 * @stamp {"utc":"2026-05-01T14:00:00.000Z"}
 * @architectural-role Orchestrator (Phase 3.5)
 * @description
 * Evaluates dynamic logic probes attached to a Style.
 * Implements a Reactive Dependency Graph:
 * 1. Scans Style templates and Probe output templates for {{tokens}} to identify dependencies.
 * 2. Recursively resolves dependencies with cycle protection.
 * 3. Determines "Dirtiness" based on narrative context, changed wardrobe, or template dependencies.
 * 4. Merges resolved strings into nextLayers.logic, performing a hydration pass to resolve
 *    nested variables within True/False output templates.
 * 
 * @api-declaration
 * evaluateLogic(characterId, nextLayers, currentLayers, styleObj, text, history, signal, identity) -> Promise<void>
 * 
 * @contract
 *   assertions:
 *     purity: Orchestrator
 *     state_ownership: []
 *     external_io: [logicExecutor.js, computationalParser.js, callLog.js, logger.js]
 */

import { executeLogicProbe } from '../../io/llm/logicExecutor.js';
import { evaluateComputationalLogic, extractTokens } from '../computationalParser.js';
import { logCall, logPatchLast } from '../../utils/callLog.js';
import { log, warn } from '../../utils/logger.js';

/**
 * Helper to serialize a wardrobe slot for logic context.
 */
function serializeSlot(val) {
    if (!val) return 'none';
    if (typeof val === 'string') return val;
    return `${val.item} (${val.modifier || 'none'})`;
}

/**
 * Evaluates all required logic probes for a character's current state.
 * Mutates nextLayers by attaching a 'logic' dictionary.
 * 
 * @param {string} characterId
 * @param {object} nextLayers - The new state being built.
 * @param {object|null} currentLayers - The state from the previous turn.
 * @param {object} styleObj - The active Style Package.
 * @param {string} text - The current message text.
 * @param {string} history - Preceding turns.
 * @param {AbortSignal} [signal]
 * @param {object} [identity] - Character identity fields (hair, eyes, etc.). Static; never contributes dirtiness.
 */
export async function evaluateLogic(characterId, nextLayers, currentLayers, styleObj, text, history, signal, identity = {}) {
    const probes = styleObj?.logicProbes || {};
    const probeKeys = Object.keys(probes);
    if (probeKeys.length === 0) return;

    // 1. Identify probes directly requested by the Style Template
    const templateTokens = new Set([
        ...extractTokens(styleObj.template),
        ...extractTokens(styleObj.negativePrompt)
    ]);

    // 2. Resolution State
    nextLayers.logic = {};
    const memo = {};   // { [key]: { value: string, dirty: boolean } }
    const path = new Set(); // Cycle detection stack

    /**
     * Recursive resolver for a specific probe.
     */
    const resolve = async (key) => {
        // Return memoized result if already processed this turn
        if (memo[key]) return memo[key];

        // Guard against circular logic
        if (path.has(key)) {
            warn('LogicPhase', `Circular dependency detected for probe: "${key}". Aborting branch.`);
            return { value: '', dirty: false };
        }

        const probe = probes[key];
        if (!probe) return null;

        path.add(key);

        // A. Analyze dependencies in the probe's prompt AND its output templates
        // This ensures {{variable}} in the YES box triggers the dependency.
        const allDeps = new Set([
            ...extractTokens(probe.prompt),
            ...extractTokens(probe.trueTemplate),
            ...extractTokens(probe.falseTemplate)
        ]);

        let isDirty = false;

        // B. Build context and evaluate dirtiness
        const contextData = {
            current_turn: text,
            history,
            character_name: characterId
        };

        // Identity fields are static — inject upfront, never dirty
        for (const [k, v] of Object.entries(identity)) {
            contextData[k] = v || 'unspecified';
        }
        
        for (const dep of allDeps) {
            // Case 1: Narrative Triggers (Always Dirty)
            if (dep === 'current_turn' || dep === 'history' || dep === 'character_name') {
                isDirty = true;
            }
            // Case 2: Wardrobe Slots
            else if (nextLayers[dep] !== undefined) {
                const nextVal = nextLayers[dep];
                const currVal = currentLayers ? currentLayers[dep] : undefined;
                
                if (JSON.stringify(nextVal) !== JSON.stringify(currVal)) {
                    isDirty = true;
                }
                contextData[dep] = serializeSlot(nextVal);
            }
            // Case 3: Other Logic Probes (Recursive)
            else if (probes[dep]) {
                const depRes = await resolve(dep);
                if (depRes) {
                    if (depRes.dirty) isDirty = true;
                    contextData[dep] = depRes.value;
                }
            }
        }

        // C. Final Determination
        let finalValue = '';
        const cachedValue = currentLayers?.logic?.[key];

        // We fire if:
        // 1. Dependencies changed (isDirty)
        // 2. We have no cached value from previous DNA (cachedValue === undefined)
        if (isDirty || cachedValue === undefined) {
            try {
                if (probe.type === 'computational') {
                    // FAST-PATH: Local string comparison
                    const isTrue = evaluateComputationalLogic(probe.prompt, contextData);
                    finalValue = isTrue ? (probe.trueTemplate ?? '') : (probe.falseTemplate ?? '');
                    
                    // Forensic Total Mirror Protocol
                    const label = `LogicProbe:${key} [COMPUTATIONAL]`;
                    logCall(label, probe.prompt, null, null, { context: contextData });
                    logPatchLast(finalValue, null, { evaluated: isTrue }, `Result: ${isTrue ? 'TRUE' : 'FALSE'}`);
                    
                    log('LogicPhase', `Computational ${key} evaluated: ${isTrue}`);
                } else {
                    // SLOW-PATH: LLM execution
                    finalValue = await executeLogicProbe(key, probe, contextData, signal);
                }
            } catch (err) {
                warn('LogicPhase', `Execution failed for probe "${key}":`, err.message);
                finalValue = cachedValue || ''; 
            }
        } else {
            finalValue = cachedValue;
        }

        // D. Hydration Pass
        // If the resulting string contains {{tokens}}, resolve them from contextData
        // (This handles use-cases like "{{hair_color}} armpit hair" in the YES box)
        const resultTokens = extractTokens(finalValue);
        for (const rt of resultTokens) {
            if (contextData[rt] !== undefined) {
                const regex = new RegExp(`\\{\\{${rt}\\}\\}`, 'gi');
                finalValue = finalValue.replace(regex, String(contextData[rt]));
            }
        }

        path.delete(key);
        memo[key] = { value: finalValue, dirty: isDirty };
        return memo[key];
    };

    // 3. Resolve all probes required by the Style
    for (const key of probeKeys) {
        if (templateTokens.has(key)) {
            const res = await resolve(key);
            if (res) nextLayers.logic[key] = res.value;
        }
    }
}