/**
 * @file data/default-user/extensions/personalyze/detector.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role IO Executor (LLM)
 * @description
 * Wraps all LLM calls made by the PersonaLyze pipeline.
 *
 * Each exported function corresponds to one pipeline step. All functions send
 * a structured prompt to the configured LLM connection profile, parse the
 * response, and return a typed result. Callers receive clean values — raw LLM
 * text is never exposed outside this module.
 *
 * Response parsing uses heuristic word-boundary matching to tolerate noisy or
 * markdown-wrapped replies from chatty models.
 *
 * @api-declaration
 * detectBoolean(message, characterName, currentOutfit, currentExpression, history, prompt, profileId)
 *   → Promise<{ outfit_changed: boolean, expression_changed: boolean }>
 *
 * detectOutfitClassifier(message, characterName, outfitKeys, outfits, history, prompt, profileId)
 *   → Promise<string|null>   — matched key, 'NEW', or null (no change / NULL)
 *
 * detectExpressionClassifier(message, characterName, expressionKeys, expressions, history, prompt, profileId)
 *   → Promise<string|null>   — matched key, 'NEW', or null (no change / NULL)
 *
 * detectOutfitDescriber(context, characterName, anchor, prompt, profileId)
 *   → Promise<{ label: string, description: string }|null>
 *
 * detectExpressionDescriber(context, characterName, anchor, prompt, profileId)
 *   → Promise<{ label: string, description: string }|null>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [generateQuietPrompt, ConnectionManagerRequestService]
 */

import { generateQuietPrompt } from '../../../../script.js';
import { ConnectionManagerRequestService } from '../../shared.js';
import { log, warn, error } from './utils/logger.js';

// ─── Core Dispatch ────────────────────────────────────────────────────────────

/**
 * Dispatches a prompt to the LLM with profile-aware routing and raw response logging.
 * Falls back to the active ST connection if the profileId call fails.
 * @param {string} prompt
 * @param {string|null} profileId
 * @param {string} label   Log tag for this step (e.g. 'Boolean', 'Classifier').
 * @param {object} extraOptions
 * @returns {Promise<string>}
 */
async function dispatch(prompt, profileId, label, extraOptions = {}) {
    log(label, `--- PROMPT SENT ---\n${prompt}`);

    let result;

    if (profileId) {
        try {
            result = await ConnectionManagerRequestService.sendRequest(profileId, prompt, null, extraOptions);
        } catch (err) {
            warn(label, 'ConnectionManager failed, falling back to active connection:', err);
        }
    }

    if (!result) {
        try {
            result = await generateQuietPrompt({
                quietPrompt: prompt,
                removeReasoning: true,
                ...extraOptions,
            });
        } catch (err) {
            error(label, 'generateQuietPrompt failed:', err);
            throw err;
        }
    }

    const text = result?.content ?? result;
    log(label, `--- RAW AI RESPONSE ---\n${text}`);
    return String(text ?? '');
}

// ─── Step 1: Boolean Gate ─────────────────────────────────────────────────────

/**
 * Asks the LLM whether the outfit or expression changed in the current message.
 * Parses the expected JSON response. Falls back to false/false on parse failure.
 *
 * @returns {Promise<{ outfit_changed: boolean, expression_changed: boolean }>}
 */
export async function detectBoolean(
    message, characterName, currentOutfit, currentExpression,
    history, promptTemplate, profileId
) {
    const prompt = promptTemplate
        .replace('{{character_name}}',     characterName       ?? 'Unknown')
        .replace('{{current_outfit}}',     currentOutfit       ?? 'Unknown')
        .replace('{{current_expression}}', currentExpression   ?? 'Unknown')
        .replace('{{history}}',            history             ?? '')
        .replace('{{message}}',            message             ?? '');

    try {
        const raw = await dispatch(prompt, profileId, 'Boolean', { temperature: 0.1 });

        // Extract first JSON object from the response (tolerates markdown fences)
        const match = raw.match(/\{[\s\S]*?\}/);
        if (!match) {
            warn('Boolean', 'No JSON object found in response. Defaulting to no change.');
            return { outfit_changed: false, expression_changed: false };
        }

        const parsed = JSON.parse(match[0]);
        const result = {
            outfit_changed:     !!parsed.outfit_changed,
            expression_changed: !!parsed.expression_changed,
        };

        log('Boolean', `Result: outfit_changed=${result.outfit_changed}, expression_changed=${result.expression_changed}`);
        return result;

    } catch (err) {
        error('Boolean', 'Parse failed:', err);
        return { outfit_changed: false, expression_changed: false };
    }
}

// ─── Step 2a: Outfit Classifier ───────────────────────────────────────────────

/**
 * Matches the current message against the character's known outfit portfolio.
 * Returns a matched key, 'NEW' if unrecognised, or null (no outfit mentioned).
 *
 * @param {string}   message
 * @param {string}   characterName
 * @param {string[]} outfitKeys
 * @param {object}   outfits       { key: { label, description } }
 * @param {string}   history
 * @param {string}   promptTemplate
 * @param {string|null} profileId
 * @returns {Promise<string|null>}
 */
export async function detectOutfitClassifier(
    message, characterName, outfitKeys, outfits, history, promptTemplate, profileId
) {
    const outfitList = outfitKeys
        .map(k => `[${k}] ${outfits[k].label} — ${outfits[k].description}`)
        .join('\n');

    const prompt = promptTemplate
        .replace('{{character_name}}', characterName ?? 'Unknown')
        .replace('{{outfit_list}}',    outfitList)
        .replace('{{history}}',        history ?? '')
        .replace('{{message}}',        message ?? '');

    try {
        const raw = await dispatch(prompt, profileId, 'OutfitClassifier', { temperature: 0.1 });
        return parseClassifierResponse(raw, outfitKeys, 'OutfitClassifier');
    } catch (err) {
        error('OutfitClassifier', 'Failed:', err);
        return null;
    }
}

// ─── Step 2b: Expression Classifier ──────────────────────────────────────────

/**
 * Matches the current message against the character's known expression portfolio.
 * Returns a matched key, 'NEW' if unrecognised, or null (no expression mentioned).
 *
 * @param {string}   message
 * @param {string}   characterName
 * @param {string[]} expressionKeys
 * @param {object}   expressions    { key: { label, description } }
 * @param {string}   history
 * @param {string}   promptTemplate
 * @param {string|null} profileId
 * @returns {Promise<string|null>}
 */
export async function detectExpressionClassifier(
    message, characterName, expressionKeys, expressions, history, promptTemplate, profileId
) {
    const expressionList = expressionKeys
        .map(k => `[${k}] ${expressions[k].label} — ${expressions[k].description}`)
        .join('\n');

    const prompt = promptTemplate
        .replace('{{character_name}}',  characterName ?? 'Unknown')
        .replace('{{expression_list}}', expressionList)
        .replace('{{history}}',         history ?? '')
        .replace('{{message}}',         message ?? '');

    try {
        const raw = await dispatch(prompt, profileId, 'ExpressionClassifier', { temperature: 0.1 });
        return parseClassifierResponse(raw, expressionKeys, 'ExpressionClassifier');
    } catch (err) {
        error('ExpressionClassifier', 'Failed:', err);
        return null;
    }
}

// ─── Step 3a: Outfit Describer ────────────────────────────────────────────────

/**
 * Extracts a label and visual description for a newly discovered outfit.
 * @returns {Promise<{ label: string, description: string }|null>}
 */
export async function detectOutfitDescriber(context, characterName, anchor, promptTemplate, profileId) {
    const prompt = promptTemplate
        .replace('{{character_name}}',  characterName ?? 'Unknown')
        .replace('{{identity_anchor}}', anchor ?? '')
        .replace('{{context}}',         context ?? '');

    try {
        const raw = await dispatch(prompt, profileId, 'OutfitDescriber', { temperature: 0.3 });
        return parseDescriberResponse(raw);
    } catch (err) {
        error('OutfitDescriber', 'Failed:', err);
        return null;
    }
}

// ─── Step 3b: Expression Describer ───────────────────────────────────────────

/**
 * Extracts a label and visual description for a newly discovered expression.
 * @returns {Promise<{ label: string, description: string }|null>}
 */
export async function detectExpressionDescriber(context, characterName, anchor, promptTemplate, profileId) {
    const prompt = promptTemplate
        .replace('{{character_name}}',  characterName ?? 'Unknown')
        .replace('{{identity_anchor}}', anchor ?? '')
        .replace('{{context}}',         context ?? '');

    try {
        const raw = await dispatch(prompt, profileId, 'ExpressionDescriber', { temperature: 0.3 });
        return parseDescriberResponse(raw);
    } catch (err) {
        error('ExpressionDescriber', 'Failed:', err);
        return null;
    }
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

/**
 * Parses a classifier response using word-boundary heuristics.
 *
 * Precedence:
 *   1. NULL  → null  (LLM says nothing relevant happening)
 *   2. NEW   → 'NEW' (LLM says it's something not in the portfolio)
 *   3. exact key match anywhere in response → that key
 *   4. fallback → null
 *
 * @param {string}   raw
 * @param {string[]} validKeys
 * @param {string}   label   For log output.
 * @returns {string|null}
 */
function parseClassifierResponse(raw, validKeys, label) {
    const text = String(raw ?? '').trim();

    if (/\bNULL\b/i.test(text)) {
        log(label, 'Result: NULL (no change)');
        return null;
    }

    if (/\bNEW\b/i.test(text)) {
        log(label, 'Result: NEW');
        return 'NEW';
    }

    for (const key of validKeys) {
        // Word-boundary match to avoid partial key collisions (e.g. "red" matching "red_dress")
        const regex = new RegExp(`\\b${key.replace(/_/g, '[_ ]')}\\b`, 'i');
        if (regex.test(text)) {
            log(label, `Result: matched key "${key}"`);
            return key;
        }
    }

    warn(label, 'No key matched in response. Treating as NULL.');
    return null;
}

/**
 * Parses a describer response into { label, description }.
 * Tolerates bold markdown around the field names (e.g. **Label:**).
 * Returns null if the required fields cannot be extracted.
 *
 * @param {string} raw
 * @returns {{ label: string, description: string }|null}
 */
function parseDescriberResponse(raw) {
    const text = String(raw ?? '');

    const labelMatch = text.match(/\*?\*?Label\*?\*?:\s*(.+)/i);
    const descMatch  = text.match(/\*?\*?Description\*?\*?:\s*([\s\S]+?)(?=\n\*?\*?[A-Z]|$)/i);

    if (!labelMatch || !descMatch) {
        warn('Describer', 'Could not extract Label/Description from response.');
        return null;
    }

    return {
        label:       labelMatch[1].trim().replace(/^\*+|\*+$/g, ''),
        description: descMatch[1].trim().replace(/^\*+|\*+$/g, ''),
    };
}
