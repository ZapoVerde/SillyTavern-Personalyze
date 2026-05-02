/**
 * @file data/default-user/extensions/personalyze/logic/computationalParser.js
 * @stamp {"utc":"2026-05-01T12:00:00.000Z"}
 * @architectural-role Pure Logic
 * @description
 * Implements a recursive boolean evaluator for Computational Probes.
 * Supports a narrative Domain Specific Language (DSL) with:
 * 1. Atomic comparisons: {{token}} [is|in|contains|empty] [target]
 * 2. Logical Operators: AND, OR, ! (NOT)
 * 3. Grouping: Parentheses ( ) for order of operations.
 * 
 * Evaluation follows two passes:
 * Pass 1: Resolve all {{atoms}} into "true" or "false" strings using explicit,
 *         sequential regex replacements to prevent parenthesis collision.
 * Pass 2: Recursively evaluate the boolean string (Paren -> ! -> AND -> OR).
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
 * Pass 1: Evaluates a single atomic comparison.
 */
function _evaluateAtomic(token, op, rhsRaw, contextData) {
    const rawValue = contextData[token];
    const lhsValue = String(rawValue || '').toLowerCase().trim();
    const rhsValue = (rhsRaw || '').trim().toLowerCase();

    switch (op.toLowerCase()) {
        case 'empty':
            // Catch standard JS empty states AND pipeline fallback strings
            return (!rawValue || 
                    lhsValue === '' || 
                    lhsValue === 'none' || 
                    lhsValue === 'unspecified');

        case 'is':
            return new RegExp(`^\\b${escapeRegex(rhsValue)}\\b$`, 'i').test(lhsValue);

        case 'in': {
            const cleanRhs = rhsValue.replace(/^\(|\)$/g, '');
            const list = cleanRhs.split(',').map(s => s.trim()).filter(Boolean);
            return list.some(item =>
                new RegExp(`^\\b${escapeRegex(item)}\\b$`, 'i').test(lhsValue)
            );
        }

        case 'contains':
            return lhsValue.includes(rhsValue);

        default:
            return false;
    }
}

/**
 * Pass 2: Evaluates a string of true/false/AND/OR/!/() tokens.
 */
function _resolveBooleanAlgebra(expression) {
    let str = expression.trim();

    // 1. Recursive Parentheses Resolution
    // Resolves innermost (groups) first
    while (str.includes('(')) {
        let prev = str;
        str = str.replace(/\(([^()]+)\)/g, (_, group) => {
            return _resolveBooleanAlgebra(group) ? 'true' : 'false';
        });
        // Infinite loop protection for mismatched parens
        if (str === prev) break; 
    }

    // 2. Unary NOT (!)
    // Format: ! true -> false
    while (/\!\s*(true|false)\b/i.test(str)) {
        str = str.replace(/\!\s*true\b/gi, 'false');
        str = str.replace(/\!\s*false\b/gi, 'true');
    }

    // 3. Binary AND
    // Evaluates all ANDs left-to-right
    while (/\b(true|false)\s+AND\s+(true|false)\b/i.test(str)) {
        str = str.replace(/\b(true|false)\s+AND\s+(true|false)\b/gi, (match, left, right) => {
            return (left.toLowerCase() === 'true' && right.toLowerCase() === 'true') ? 'true' : 'false';
        });
    }

    // 4. Binary OR
    // Evaluates all ORs left-to-right
    while (/\b(true|false)\s+OR\s+(true|false)\b/i.test(str)) {
        str = str.replace(/\b(true|false)\s+OR\s+(true|false)\b/gi, (match, left, right) => {
            return (left.toLowerCase() === 'true' || right.toLowerCase() === 'true') ? 'true' : 'false';
        });
    }

    return str.toLowerCase().trim() === 'true';
}

/**
 * Main logical evaluator entry point.
 * 
 * @param {string} expression - The raw logical string (e.g. "({{top}} is shirt OR {{top}} is rags) AND ! {{is_wet}} empty")
 * @param {Object} contextData - Key-value map of current character state and metadata.
 * @returns {boolean}
 */
export function evaluateComputationalLogic(expression, contextData) {
    if (!expression || !contextData) return false;

    let booleanString = expression;

    // Pass 1a: Resolve 'empty' operator
    booleanString = booleanString.replace(/\{\{([a-z0-9_]+)\}\}\s+empty\b/gi, (match, token) => {
        return _evaluateAtomic(token, 'empty', null, contextData) ? 'true' : 'false';
    });

    // Pass 1b: Resolve 'in' operator (explicitly captures everything inside the parentheses)
    booleanString = booleanString.replace(/\{\{([a-z0-9_]+)\}\}\s+in\s+\(([^)]+)\)/gi, (match, token, list) => {
        return _evaluateAtomic(token, 'in', list, contextData) ? 'true' : 'false';
    });

    // Pass 1c: Resolve 'is' and 'contains' operators
    // Positive lookahead safely halts the capture when it hits AND, OR, ), or the end of the string.
    const isContainsRegex = /\{\{([a-z0-9_]+)\}\}\s+(is|contains)\s+(.+?)(?=\s+(?:AND|OR)\b|\s*\)|\s*$)/gi;
    booleanString = booleanString.replace(isContainsRegex, (match, token, op, rhs) => {
        return _evaluateAtomic(token, op, rhs, contextData) ? 'true' : 'false';
    });

    // Pass 2: Evaluate the resulting boolean algebra string
    try {
        return _resolveBooleanAlgebra(booleanString);
    } catch (err) {
        console.error('[PLZ:Logic] Computational evaluation failed:', err, 'Expression:', expression);
        return false;
    }
}