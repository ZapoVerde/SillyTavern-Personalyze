/**
 * @file data/default-user/extensions/personalyze/logic/computationalParser.js
 * @stamp {"utc":"2026-05-01T10:20:00.000Z"}
 * @architectural-role Pure Logic
 * @description
 * Implements the "Fast-Path" Domain Specific Language (DSL) for Computational Probes.
 * Evaluates simple string-based logical expressions against character state
 * without requiring an LLM call.
 *
 * Syntax: {{token}} [!] [is|in|contains] target
 *
 * @api-declaration
 * evaluateComputationalLogic(expression, contextData) -> boolean
 * extractTokens(text) -> string[]
 *
 * @contract
 *   assertions:
 *     purity: Pure Function
 *     state_ownership: []
 *     external_io: []
 */

/**
 * Escapes a string for safe use inside a Regular Expression.
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Scans a string for tokens in double curly braces.
 * @param {string} text
 * @returns {string[]} Lowercased keys.
 */
export function extractTokens(text) {
    if (!text || typeof text !== 'string') return [];
    const matches = text.match(/\{\{([a-zA-Z0-9_]+)\}\}/g);
    return matches ? matches.map(m => m.slice(2, -2).toLowerCase()) : [];
}

/**
 * Evaluates a logical expression against provided context data.
 *
 * Operators:
 * - is: Strict whole-word equality using word boundaries (\b).
 * - in: List membership. RHS is a comma-separated list, often in parentheses.
 * - contains: Loose partial string match.
 * - !: Negation prefix for any operator.
 *
 * @param {string} expression - The raw expression (e.g., "{{gender}} ! is male").
 * @param {Object} contextData - Key-value map of current character state and metadata.
 * @returns {boolean}
 */
export function evaluateComputationalLogic(expression, contextData) {
    if (!expression || !contextData) return false;

    // 1. Structural Parsing
    // Pattern: {{token}} [!] [operator] [rhs]
    const match = expression.match(/^\{\{([a-z0-9_]+)\}\}\s+(!)?\s*(is|in|contains)\s+(.*)$/i);
    if (!match) return false;

    const [_, token, notFlag, op, rhsRaw] = match;

    // 2. Data Preparation
    // Get LHS value from context (identity or wardrobe) and normalize
    const lhsValue = String(contextData[token] || '').toLowerCase().trim();

    // Normalize RHS (strip optional wrapping parentheses for "in" operator)
    const rhsValue = rhsRaw.trim().replace(/^\(|\)$/g, '').toLowerCase();
    const isNot = !!notFlag;

    let result = false;

    // 3. Operator Execution
    switch (op.toLowerCase()) {
        case 'is':
            // Strict whole-word match using word boundaries
            // Prevents "man" matching "woman"
            result = new RegExp(`^\\b${escapeRegex(rhsValue)}\\b$`, 'i').test(lhsValue);
            break;

        case 'in': {
            // Membership check against comma-separated list
            // Uses full-match anchors (^...$) for consistency with "is"
            const list = rhsValue.split(',').map(s => s.trim()).filter(Boolean);
            result = list.some(item =>
                new RegExp(`^\\b${escapeRegex(item)}\\b$`, 'i').test(lhsValue)
            );
            break;
        }

        case 'contains':
            // Loose fuzzy match
            result = lhsValue.includes(rhsValue);
            break;
    }

    // 4. Negation Handling
    return isNot ? !result : result;
}
