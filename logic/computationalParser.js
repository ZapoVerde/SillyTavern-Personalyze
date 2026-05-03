/**
 * @file data/default-user/extensions/personalyze/logic/computationalParser.js
 * @stamp {"utc":"2026-05-01T21:40:00.000Z"}
 * @architectural-role Pure Logic
 * @description
 * Implements a recursive boolean evaluator for Computational Probes.
 * Supports a narrative Domain Specific Language (DSL) with:
 * 1. Atomic comparisons: {{token}} [is|in|contains|empty] [target]
 * 2. Logical Operators: AND, OR, ! (NOT)
 * 3. Grouping: Parentheses ( ) for order of operations.
 * 
 * Updated with Forensic Tracing:
 * 1. Added explicit logging to _evaluateAtomic to track value comparisons.
 * 2. Added phase-tracing to evaluateComputationalLogic to see boolean string conversion.
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

    let result = false;

    switch (op.toLowerCase()) {
        case 'empty':
            // Catch standard JS empty states AND pipeline fallback strings
            result = (!rawValue || 
                    lhsValue === '' || 
                    lhsValue === 'none' || 
                    lhsValue === 'unspecified');
            break;

        case 'is':
            result = new RegExp(`^\\b${escapeRegex(rhsValue)}\\b$`, 'i').test(lhsValue);
            break;

        case 'in': {
            const cleanRhs = rhsValue.replace(/^\(|\)$/g, '');
            const list = cleanRhs.split(',').map(s => s.trim()).filter(Boolean);
            result = list.some(item =>
                new RegExp(`^\\b${escapeRegex(item)}\\b$`, 'i').test(lhsValue)
            );
            break;
        }

        case 'contains':
            result = lhsValue.includes(rhsValue);
            break;

        default:
            result = false;
            break;
    }

    console.log(`[Logic:Atomic] {{${token}}} (Val: "${lhsValue}") ${op} "${rhsValue || ''}" -> [${result ? 'TRUE' : 'FALSE'}]`);
    return result;
}

/**
 * Pass 2: Evaluates a string of true/false/AND/OR/!/() tokens.
 */
function _resolveBooleanAlgebra(expression) {
    let str = expression.trim();

    // 1. Recursive Parentheses Resolution
    while (str.includes('(')) {
        let prev = str;
        str = str.replace(/\(([^()]+)\)/g, (_, group) => {
            return _resolveBooleanAlgebra(group) ? 'true' : 'false';
        });
        if (str === prev) break; 
    }

    // 2. Unary NOT (!)
    while (/\!\s*(true|false)\b/i.test(str)) {
        str = str.replace(/\!\s*true\b/gi, 'false');
        str = str.replace(/\!\s*false\b/gi, 'true');
    }

    // 3. Binary AND
    while (/\b(true|false)\s+AND\s+(true|false)\b/i.test(str)) {
        str = str.replace(/\b(true|false)\s+AND\s+(true|false)\b/gi, (match, left, right) => {
            return (left.toLowerCase() === 'true' && right.toLowerCase() === 'true') ? 'true' : 'false';
        });
    }

    // 4. Binary OR
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
 * @param {string} expression - The raw logical string
 * @param {Object} contextData - Key-value map of current character state
 * @returns {boolean}
 */
export function evaluateComputationalLogic(expression, contextData) {
    if (!expression || !contextData) return false;

    console.log(`[Logic:Expression] Input: "${expression}"`);

    let booleanString = expression;

    // Pass 1a: Resolve 'empty' operator
    booleanString = booleanString.replace(/\{\{([a-z0-9_]+)\}\}\s+empty\b/gi, (match, token) => {
        return _evaluateAtomic(token, 'empty', null, contextData) ? 'true' : 'false';
    });

    // Pass 1b: Resolve 'in' operator
    booleanString = booleanString.replace(/\{\{([a-z0-9_]+)\}\}\s+in\s+\(([^)]+)\)/gi, (match, token, list) => {
        return _evaluateAtomic(token, 'in', list, contextData) ? 'true' : 'false';
    });

    // Pass 1c: Resolve 'is' and 'contains' operators
    const isContainsRegex = /\{\{([a-z0-9_]+)\}\}\s+(is|contains)\s+(.+?)(?=\s+(?:AND|OR)\b|\s*\)|\s*$)/gi;
    booleanString = booleanString.replace(isContainsRegex, (match, token, op, rhs) => {
        return _evaluateAtomic(token, op, rhs, contextData) ? 'true' : 'false';
    });

    console.log(`[Logic:Expression] Boolean conversion: "${booleanString}"`);

    // Pass 2: Evaluate the resulting boolean algebra string
    try {
        const result = _resolveBooleanAlgebra(booleanString);
        console.log(`[Logic:Expression] Final Result -> ${result ? 'TRUE' : 'FALSE'}`);
        return result;
    } catch (err) {
        console.error('[PLZ:Logic] Computational evaluation failed:', err, 'Expression:', expression);
        return false;
    }
}