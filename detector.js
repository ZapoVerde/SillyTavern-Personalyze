/**
 * @file data/default-user/extensions/personalyze/detector.js
 * @stamp {"utc":"2026-04-07T12:50:00.000Z"}
 * @architectural-role IO Executor (LLM)
 * @description
 * Wraps all LLM calls made by the Personalyze pipeline.
 *
 * This module is a pure worker: it does not perform state lookups. It executes 
 * detection and extraction requests using the templates and data provided 
 * by the controllers.
 *
 * @api-declaration
 * detectSubjectMatch(messageMes, characterName, history, promptTemplate, profileId)
 *   → Promise<boolean>
 *
 * detectSubjectFromList(messageMes, characterIds, userName, history, promptTemplate, profileId)
 *   → Promise<string|null>
 *
 * detectChangeCheck(messageMes, characterName, outfit, expression, history, promptTemplate, profileId)
 *   → Promise<boolean>
 *
 * detectCombined(messageMes, characterName, outfitKeys, outfits, expressionLabels, history, promptTemplate, profileId)
 *   → Promise<{ outfitKey: string|'NEW'|null, expressionKey: string|null }>
 *
 * detectOutfitDescriber(context, characterName, anchor, promptTemplate, profileId)
 *   → Promise<{ label: string, description: string }|null>
 *
 * detectAnchorScan(context, characterName, promptTemplate, profileId)
 *   → Promise<{ name: string, anchor: string }|null>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [ConnectionManagerRequestService]
 */

import { ConnectionManagerRequestService } from '../../shared.js';
import { log, warn, error } from './utils/logger.js';
import { logCall } from './utils/callLog.js';

// ─── Core Dispatch ────────────────────────────────────────────────────────────

/**
 * Dispatches a prompt to the LLM via ConnectionManagerRequestService.
 *
 * @param {string}      prompt
 * @param {string|null} profileId
 * @param {string}      label   Log tag (e.g. 'SubjectMatch').
 * @param {object}      extraOptions
 * @returns {Promise<string>}
 */
async function dispatch(prompt, profileId, label, extraOptions = {}) {
    if (!profileId) {
        warn(label, 'No detection profile configured — aborting call.');
        if (window.toastr) {
            window.toastr.warning(
                'Personalyze: No Detection Profile set. Configure one in settings to enable detection.',
                'Personalyze',
                { timeOut: 6000, preventDuplicates: true },
            );
        }
        logCall(label, prompt, null, 'No detection profile configured.');
        return '';
    }

    log(label, `--- PROMPT SENT ---\n${prompt}`);

    try {
        const result = await ConnectionManagerRequestService.sendRequest(profileId, prompt, null, extraOptions);
        const text   = result?.content ?? result;
        log(label, `--- RAW AI RESPONSE ---\n${text}`);
        logCall(label, prompt, String(text ?? ''), null);
        return String(text ?? '');
    } catch (err) {
        error(label, 'ConnectionManager request failed:', err);
        logCall(label, prompt, null, err.message);
        if (window.toastr) window.toastr.error(`Detection failed: ${err.message}`, 'Personalyze');
        throw err;
    }
}

// ─── YES/NO Parser ────────────────────────────────────────────────────────────

/**
 * Parses a YES/NO response. Returns true for YES, false for NO or unrecognised.
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
    warn(label, `Could not parse YES/NO from response. Defaulting to NO.`);
    return false;
}

// ─── Step 1: Subject Match ────────────────────────────────────────────────────

export async function detectSubjectMatch(messageMes, characterName, history, promptTemplate, profileId) {
    const prompt = promptTemplate
        .replaceAll('{{character_name}}', characterName ?? 'Unknown')
        .replace('{{history}}',           history       ?? '')
        .replace('{{message}}',           messageMes    ?? '');

    const raw = await dispatch(prompt, profileId, 'SubjectMatch', { temperature: 0.1 });
    return parseYesNo(raw, 'SubjectMatch');
}

// ─── Step 2: Subject From List ────────────────────────────────────────────────

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

export async function detectChangeCheck(messageMes, characterName, currentOutfit, currentExpression, history, promptTemplate, profileId) {
    const prompt = promptTemplate
        .replaceAll('{{character_name}}',    characterName     ?? 'Unknown')
        .replace('{{current_outfit}}',       currentOutfit     ?? 'unknown')
        .replace('{{current_expression}}',   currentExpression ?? 'neutral')
        .replace('{{history}}',              history           ?? '')
        .replace('{{message}}',              messageMes        ?? '');

    const raw = await dispatch(prompt, profileId, 'ChangeCheck', { temperature: 0.1 });
    // YES = still the same = unchanged = true
    return parseYesNo(raw, 'ChangeCheck');
}

// ─── Step 3: Combined Classifier ─────────────────────────────────────────────

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

function parseOutfitLine(raw, outfitKeys) {
    const line = extractLine(raw, 'outfit');
    if (!line) return null;
    if (/\bNULL\b/i.test(line)) return null;
    if (/\bNEW\b/i.test(line))  return 'NEW';

    for (const key of outfitKeys) {
        const regex = new RegExp(`\\b${key.replace(/_/g, '[_ ]')}\\b`, 'i');
        if (regex.test(line)) return key;
    }
    return null;
}

function parseExpressionLine(raw, expressionLabels) {
    const line = extractLine(raw, 'expression');
    if (!line) return null;
    if (/\bNULL\b/i.test(line)) return null;

    for (const label of expressionLabels) {
        const regex = new RegExp(`\\b${label}\\b`, 'i');
        if (regex.test(line)) return label;
    }
    return null;
}

function extractLine(raw, fieldName) {
    const match = raw.match(new RegExp(`${fieldName}\\s*:\\s*(.+)`, 'i'));
    return match ? match[1].trim() : null;
}

// ─── Anchor Scanner ───────────────────────────────────────────────────────────

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

export async function detectOutfitDescriber(context, characterName, anchor, promptTemplate, profileId) {
    const prompt = promptTemplate
        .replace('{{character_name}}',  characterName ?? 'Unknown')
        .replace('{{identity_anchor}}', anchor        ?? '')
        .replace('{{context}}',         context       ?? '');

    const raw = await dispatch(prompt, profileId, 'OutfitDescriber', { temperature: 0.3 });
    return parseDescriberResponse(raw);
}

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