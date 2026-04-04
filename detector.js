/**
 * @file data/default-user/extensions/personalyze/detector.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role IO Executor (LLM)
 * @description
 * Wraps all LLM calls made by the PersonaLyze pipeline.
 *
 * Pipeline call sequence per turn (best case 2, worst case 4):
 *   Step 1   — detectSubjectMatch     — Is the current character the main subject? (YES/NO)
 *   Step 2   — detectSubjectFromList  — Who is the main subject? (key or NONE)
 *   Step 2.9 — detectChangeCheck      — Did outfit or expression change? (YES/NO)
 *   Step 3   — detectCombined         — What outfit + expression? (two plain-text lines)
 *
 * All detection calls share detectionProfileId. The describer uses describerProfileId.
 * Raw LLM text is never exposed outside this module.
 *
 * @api-declaration
 * detectSubjectMatch(messageMes, characterName, history, promptTemplate, profileId)
 *   → Promise<boolean>
 *
 * detectSubjectFromList(messageMes, characterIds, userName, history, promptTemplate, profileId)
 *   → Promise<string|null>  — matched characterId, or null (NONE)
 *
 * detectChangeCheck(messageMes, characterName, currentOutfit, currentExpression, history, promptTemplate, profileId)
 *   → Promise<boolean>  — true = no change (still same), false = changed
 *
 * detectCombined(messageMes, characterName, outfitKeys, outfits, expressionLabels, history, promptTemplate, profileId)
 *   → Promise<{ outfitKey: string|'NEW'|null, expressionKey: string|null }>
 *
 * detectOutfitDescriber(context, characterName, anchor, promptTemplate, profileId)
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
 * Dispatches a prompt to the LLM with profile-aware routing.
 * Falls back to the active ST connection if the profileId call fails or is absent.
 * @param {string} prompt
 * @param {string|null} profileId
 * @param {string} label   Log tag (e.g. 'SubjectMatch').
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

// ─── YES/NO Parser ────────────────────────────────────────────────────────────

/**
 * Parses a YES/NO response. Returns true for YES, false for NO or unrecognised.
 * @param {string} raw
 * @param {string} label
 * @returns {boolean}
 */
function parseYesNo(raw, label) {
    const text = String(raw ?? '').trim();
    if (/\byes\b/i.test(text)) {
        log(label, 'Result: YES');
        return true;
    }
    if (/\bno\b/i.test(text)) {
        log(label, 'Result: NO');
        return false;
    }
    warn(label, `Could not parse YES/NO from: "${text.slice(0, 80)}". Defaulting to NO.`);
    return false;
}

// ─── Step 1: Subject Match ────────────────────────────────────────────────────

/**
 * Asks whether the current active character is the main subject of this message.
 * @param {string}      messageMes
 * @param {string}      characterName
 * @param {string}      history
 * @param {string}      promptTemplate
 * @param {string|null} profileId
 * @returns {Promise<boolean>}  true = is the main subject
 */
export async function detectSubjectMatch(messageMes, characterName, history, promptTemplate, profileId) {
    const prompt = promptTemplate
        .replace('{{character_name}}', characterName ?? 'Unknown')
        .replace('{{history}}',        history       ?? '')
        .replace('{{message}}',        messageMes    ?? '');

    const raw = await dispatch(prompt, profileId, 'SubjectMatch', { temperature: 0.1 });
    return parseYesNo(raw, 'SubjectMatch');
}

// ─── Step 2: Subject From List ────────────────────────────────────────────────

/**
 * Asks the LLM to identify the main subject from the registered character list.
 * Returns the matched characterId, or null if NONE.
 *
 * @param {string}      messageMes
 * @param {string[]}    characterIds   All registered character IDs.
 * @param {string}      userName       The ST user name to exclude.
 * @param {string}      history
 * @param {string}      promptTemplate
 * @param {string|null} profileId
 * @returns {Promise<string|null>}
 */
export async function detectSubjectFromList(messageMes, characterIds, userName, history, promptTemplate, profileId) {
    const characterList = characterIds
        .map(id => `[${id}] ${id.replace(/_/g, ' ')}`)
        .join('\n');

    const prompt = promptTemplate
        .replace('{{character_list}}', characterList)
        .replace(/\{\{user_name\}\}/g, userName ?? 'User')
        .replace('{{history}}',        history  ?? '')
        .replace('{{message}}',        messageMes ?? '');

    const raw = await dispatch(prompt, profileId, 'SubjectList', { temperature: 0.1 });
    const text = String(raw ?? '').trim();

    if (/\bNONE\b/i.test(text)) {
        log('SubjectList', 'Result: NONE');
        return null;
    }

    // Word-boundary match against known IDs
    for (const id of characterIds) {
        const regex = new RegExp(`\\b${id.replace(/_/g, '[_ ]')}\\b`, 'i');
        if (regex.test(text)) {
            log('SubjectList', `Result: matched "${id}"`);
            return id;
        }
    }

    warn('SubjectList', `No character matched in response. Treating as NONE.`);
    return null;
}

// ─── Step 2.9: Change Check ───────────────────────────────────────────────────

/**
 * Asks whether the character's outfit and expression are unchanged from the current state.
 * Returns true if UNCHANGED (no action needed), false if something changed.
 *
 * @param {string}      messageMes
 * @param {string}      characterName
 * @param {string}      currentOutfit      Label of the current outfit.
 * @param {string}      currentExpression  Key/label of the current expression.
 * @param {string}      history
 * @param {string}      promptTemplate
 * @param {string|null} profileId
 * @returns {Promise<boolean>}  true = unchanged, false = changed
 */
export async function detectChangeCheck(messageMes, characterName, currentOutfit, currentExpression, history, promptTemplate, profileId) {
    const prompt = promptTemplate
        .replace('{{character_name}}',    characterName     ?? 'Unknown')
        .replace('{{current_outfit}}',    currentOutfit     ?? 'unknown')
        .replace('{{current_expression}}',currentExpression ?? 'neutral')
        .replace('{{history}}',           history           ?? '')
        .replace('{{message}}',           messageMes        ?? '');

    const raw = await dispatch(prompt, profileId, 'ChangeCheck', { temperature: 0.1 });
    // YES = still the same = unchanged = true
    return parseYesNo(raw, 'ChangeCheck');
}

// ─── Step 3: Combined Classifier ─────────────────────────────────────────────

/**
 * Classifies both the current outfit and expression in a single LLM call.
 * Returns:
 *   outfitKey:     matched outfit key | 'NEW' | null (NULL / no change)
 *   expressionKey: matched expression label | null (NULL / no change)
 *
 * @param {string}      messageMes
 * @param {string}      characterName
 * @param {string[]}    outfitKeys
 * @param {object}      outfits        { key: { label, description } }
 * @param {string[]}    expressionLabels
 * @param {string}      history
 * @param {string}      promptTemplate
 * @param {string|null} profileId
 * @returns {Promise<{ outfitKey: string|'NEW'|null, expressionKey: string|null }>}
 */
export async function detectCombined(messageMes, characterName, outfitKeys, outfits, expressionLabels, history, promptTemplate, profileId) {
    const outfitList = outfitKeys.length > 0
        ? outfitKeys.map(k => `[${k}] ${outfits[k].label} — ${outfits[k].description}`).join('\n')
        : '(none registered — reply NEW if any outfit is described)';

    const expressionList = expressionLabels.join(', ');

    const prompt = promptTemplate
        .replace('{{character_name}}',  characterName  ?? 'Unknown')
        .replace('{{outfit_list}}',     outfitList)
        .replace('{{expression_list}}', expressionList)
        .replace('{{history}}',         history        ?? '')
        .replace('{{message}}',         messageMes     ?? '');

    const raw = await dispatch(prompt, profileId, 'Combined', { temperature: 0.1 });

    return {
        outfitKey:     parseOutfitLine(raw, outfitKeys),
        expressionKey: parseExpressionLine(raw, expressionLabels),
    };
}

// ─── Step 3 Parsers ───────────────────────────────────────────────────────────

/**
 * Extracts the Outfit line result from a combined classifier response.
 * @param {string}   raw
 * @param {string[]} outfitKeys
 * @returns {string|'NEW'|null}
 */
function parseOutfitLine(raw, outfitKeys) {
    const line = extractLine(raw, 'outfit');

    if (!line) {
        warn('Combined', 'No "Outfit:" line found in response.');
        return null;
    }

    if (/\bNULL\b/i.test(line)) return null;
    if (/\bNEW\b/i.test(line))  return 'NEW';

    for (const key of outfitKeys) {
        const regex = new RegExp(`\\b${key.replace(/_/g, '[_ ]')}\\b`, 'i');
        if (regex.test(line)) {
            log('Combined', `Outfit matched: "${key}"`);
            return key;
        }
    }

    warn('Combined', `Outfit line could not be matched: "${line}"`);
    return null;
}

/**
 * Extracts the Expression line result from a combined classifier response.
 * @param {string}   raw
 * @param {string[]} expressionLabels
 * @returns {string|null}
 */
function parseExpressionLine(raw, expressionLabels) {
    const line = extractLine(raw, 'expression');

    if (!line) {
        warn('Combined', 'No "Expression:" line found in response.');
        return null;
    }

    if (/\bNULL\b/i.test(line)) return null;

    for (const label of expressionLabels) {
        const regex = new RegExp(`\\b${label}\\b`, 'i');
        if (regex.test(line)) {
            log('Combined', `Expression matched: "${label}"`);
            return label;
        }
    }

    warn('Combined', `Expression line could not be matched: "${line}"`);
    return null;
}

/**
 * Extracts the value portion of a labelled line (e.g. "Outfit: casual" → "casual").
 * @param {string} raw
 * @param {string} fieldName   e.g. 'outfit' or 'expression'
 * @returns {string|null}
 */
function extractLine(raw, fieldName) {
    const match = raw.match(new RegExp(`${fieldName}\\s*:\\s*(.+)`, 'i'));
    return match ? match[1].trim() : null;
}

// ─── Anchor Scanner ───────────────────────────────────────────────────────────

/**
 * Scans recent chat context to extract a character's name and permanent physical
 * appearance (Identity Anchor). Used by the Character Workshop to pre-fill the
 * Register and Studio forms from the live chat.
 *
 * When characterName is provided the prompt focuses on that character.
 * When null the LLM identifies whoever is most prominently described.
 *
 * @param {string}      context        Transcript context (from buildDescriberContext).
 * @param {string|null} characterName  Optional focus character name.
 * @param {string}      promptTemplate
 * @param {string|null} profileId
 * @returns {Promise<{ name: string, anchor: string }|null>}
 */
export async function detectAnchorScan(context, characterName, promptTemplate, profileId) {
    const hasFocus       = !!characterName;
    const characterFocus = hasFocus ? `CHARACTER FOCUS: ${characterName}\n` : '';
    const focusNote      = hasFocus ? ` (focus on ${characterName})` : '';

    const prompt = promptTemplate
        .replace('{{character_focus}}', characterFocus)
        .replace('{{focus_note}}',      focusNote)
        .replace('{{context}}',         context ?? '');

    const raw = await dispatch(prompt, profileId, 'AnchorScan', { temperature: 0.3 });
    return parseAnchorScanResponse(raw);
}

/**
 * Parses an anchor scan response into { name, anchor }.
 * @param {string} raw
 * @returns {{ name: string, anchor: string }|null}
 */
function parseAnchorScanResponse(raw) {
    const text = String(raw ?? '');

    const nameMatch   = text.match(/\*?\*?Name\*?\*?:\s*(.+)/i);
    const anchorMatch = text.match(/\*?\*?Identity\s+Anchor\*?\*?:\s*([\s\S]+?)(?=\n\*?\*?[A-Z]|$)/i);

    if (!nameMatch || !anchorMatch) {
        warn('AnchorScan', 'Could not extract Name/Identity Anchor from response.');
        return null;
    }

    return {
        name:   nameMatch[1].trim().replace(/^\*+|\*+$/g, ''),
        anchor: anchorMatch[1].trim().replace(/^\*+|\*+$/g, ''),
    };
}

// ─── Outfit Describer ─────────────────────────────────────────────────────────

/**
 * Extracts a label and visual description for a newly discovered outfit.
 * @param {string}      context        Transcript context window.
 * @param {string}      characterName
 * @param {string}      anchor         Identity anchor for the character.
 * @param {string}      promptTemplate
 * @param {string|null} profileId
 * @returns {Promise<{ label: string, description: string }|null>}
 */
export async function detectOutfitDescriber(context, characterName, anchor, promptTemplate, profileId) {
    const prompt = promptTemplate
        .replace('{{character_name}}',  characterName ?? 'Unknown')
        .replace('{{identity_anchor}}', anchor        ?? '')
        .replace('{{context}}',         context       ?? '');

    const raw = await dispatch(prompt, profileId, 'OutfitDescriber', { temperature: 0.3 });
    return parseDescriberResponse(raw);
}

// ─── Describer Parser ─────────────────────────────────────────────────────────

/**
 * Parses a describer response into { label, description }.
 * Tolerates bold markdown around the field names (e.g. **Label:**).
 * Returns null if the required fields cannot be extracted.
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
