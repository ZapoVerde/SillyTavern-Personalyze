/**
 * @file data/default-user/extensions/personalyze/ui/workshop/logic/utils.js
 * @stamp {"utc":"2026-05-01T19:10:00.000Z"}
 * @architectural-role Pure Logic / Helper
 * @description
 * Shared utilities for logic probe dependency analysis and UI string preparation.
 * 
 * @api-declaration
 * isCircular(probes, targetKey, currentPrompt, visited) -> boolean
 * getInjectionString(token) -> string
 * 
 * @contract
 *   assertions:
 *     purity: Pure Function
 *     state_ownership: []
 *     external_io: [computationalParser.js]
 */

import { extractTokens } from '../../../logic/computationalParser.js';

/**
 * Checks for circular dependencies in the logic graph.
 * Recursively scans prompts to ensure a probe does not eventually reference itself.
 * 
 * @param {Object} probes - The complete logicProbes dictionary from the Style.
 * @param {string} targetKey - The key of the probe currently being edited.
 * @param {string} currentPrompt - The prompt string (expression or query) to check.
 * @param {Set<string>} [visited] - Internal recursion tracker.
 * @returns {boolean} True if a cycle is detected.
 */
export function isCircular(probes, targetKey, currentPrompt, visited = new Set()) {
    const deps = extractTokens(currentPrompt);
    
    // Direct reference check
    if (deps.includes(targetKey)) return true;

    for (const d of deps) {
        // Only recurse into tokens that are themselves logic probes
        if (probes[d] && !visited.has(d)) {
            visited.add(d);
            if (isCircular(probes, targetKey, probes[d].prompt, visited)) return true;
        }
    }
    return false;
}

/**
 * Prepares a token for cursor-based injection into a textarea.
 * Applies space-padding to logical operators to ensure DSL validity 
 * without requiring manual user spacing.
 * 
 * @param {string} token - The raw token string (e.g. "{{top}}" or "AND").
 * @returns {string} The formatted string to insert.
 */
export function getInjectionString(token) {
    // List of keywords that require surrounding spaces for DSL parsing
    const isOp = ['!', 'is', 'in', 'contains', 'empty', 'AND', 'OR'].includes(token);
    
    return isOp ? ` ${token} ` : token;
}