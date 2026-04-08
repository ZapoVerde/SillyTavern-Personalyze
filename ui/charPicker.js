/**
 * @file data/default-user/extensions/personalyze/ui/charPicker.js
 * @stamp {"utc":"2026-04-05T00:00:00.000Z"}
 * @architectural-role UI (Character Picker Modal)
 * @description
 * Cascading character/outfit/expression picker. Opened by clicking the portrait
 * (floating overlay or VN panel). Lets the user manually set the active visual
 * state for the current turn.
 *
 * Flow:
 *   1. Character   — populated from state.activeRoster (enabled chars only)
 *   2. Outfit      — populated from the selected character's registry entry
 *   3. Expression  — populated from the global expression label palette
 *
 * On confirm: if the outfit × expression image exists in the file index, it is
 * applied immediately. If missing, it is generated first then applied.
 *
 * Always writes the result to the last AI message via lockedWritePointer.
 *
 * @api-declaration
 * openCharPicker() → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [callPopup, lockedWritePointer, generate, setPortrait, DOM]
 */

import { callPopup } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import {
    state,
    updateActiveCharacter,
    updateActivePointers,
    updateActiveImage,
    addToFileIndex,
    updateChainEntry,
} from '../state.js';
import { getSettings } from '../settings.js';
import { buildFilenamePrefix, findCachedImage, generate } from '../imageCache.js';
import { setPortrait } from '../portrait.js';
import { lockedWriteVisualState, lockedPatchVisualStateImage } from '../io/dnaWriter.js';
import { escapeHtml } from '../utils/history.js';
import { error } from '../utils/logger.js';

/**
 * Opens the character/outfit/expression picker popup.
 * Writes the confirmed selection to the last AI message and applies the portrait.
 */
export async function openCharPicker() {
    if (state.activeRoster.length === 0) {
        if (window.toastr) window.toastr.info(
            'No characters enabled for this chat. Enable them in the Character Workshop.',
            'PersonaLyze'
        );
        return;
    }

    const context = getContext();
    let lastAiIdx = -1;
    for (let i = context.chat.length - 1; i >= 0; i--) {
        if (!context.chat[i].is_user) { lastAiIdx = i; break; }
    }
    if (lastAiIdx === -1) {
        if (window.toastr) window.toastr.info(
            'No AI message yet — send a message first.',
            'PersonaLyze'
        );
        return;
    }

    const s              = getSettings();
    const exprLabels     = s.expressionLabels ?? [];
    const rosterChars    = state.activeRoster.filter(id => state.chatCharacters[id]);
    if (rosterChars.length === 0) return;

    const initCharId = (state.activeCharacterId && rosterChars.includes(state.activeCharacterId))
        ? state.activeCharacterId
        : rosterChars[0];

    function buildCharOptions(selectedId) {
        return rosterChars.map(id => {
            const label = id.replace(/_/g, ' ');
            const sel   = id === selectedId ? 'selected' : '';
            return `<option value="${escapeHtml(id)}" ${sel}>${escapeHtml(label)}</option>`;
        }).join('');
    }

    function buildOutfitOptions(charId, selectedKey = null) {
        const char    = state.chatCharacters[charId];
        const entries = Object.entries(char?.outfits ?? {});
        if (entries.length === 0) return '<option value="">— no outfits registered —</option>';
        return entries.map(([key, outfit]) => {
            const sel = key === selectedKey ? 'selected' : '';
            return `<option value="${escapeHtml(key)}" ${sel}>${escapeHtml(outfit.label)}</option>`;
        }).join('');
    }

    function buildExprOptions(selectedLabel = null) {
        if (exprLabels.length === 0) return '<option value="">— no expressions configured —</option>';
        return exprLabels.map(label => {
            const sel = label === selectedLabel ? 'selected' : '';
            return `<option value="${escapeHtml(label)}" ${sel}>${escapeHtml(label)}</option>`;
        }).join('');
    }

    const popupPromise = callPopup(
        `<h3 style="margin-top:0;margin-bottom:16px;">Change Character</h3>

        <label style="display:block;margin:0 0 3px;font-size:0.88em;opacity:0.75;">Character</label>
        <select id="plz-cp-char" class="text_pole" style="width:100%;margin-bottom:14px;">
            ${buildCharOptions(initCharId)}
        </select>

        <label style="display:block;margin:0 0 3px;font-size:0.88em;opacity:0.75;">Outfit</label>
        <select id="plz-cp-outfit" class="text_pole" style="width:100%;margin-bottom:14px;">
            ${buildOutfitOptions(initCharId, state.activeOutfitKey)}
        </select>

        <label style="display:block;margin:0 0 3px;font-size:0.88em;opacity:0.75;">Expression</label>
        <select id="plz-cp-expr" class="text_pole" style="width:100%;">
            ${buildExprOptions(state.activeExpressionKey)}
        </select>`,
        'confirm'
    );

    // Repopulate outfits when character changes
    $('#plz-cp-char').on('change', function () {
        $('#plz-cp-outfit').html(buildOutfitOptions($(this).val()));
    });

    const confirmed = await popupPromise;
    if (!confirmed) return;

    const characterId   = $('#plz-cp-char').val();
    const outfitKey     = $('#plz-cp-outfit').val();
    const expressionKey = $('#plz-cp-expr').val();

    if (!characterId || !outfitKey || !expressionKey) {
        if (window.toastr) window.toastr.warning('Select a character, outfit, and expression.', 'PersonaLyze');
        return;
    }

    const character = state.chatCharacters[characterId];
    if (!character) return;

    // Check cache
    const prefix   = buildFilenamePrefix(characterId, outfitKey, expressionKey);
    let   filename = findCachedImage(prefix, state.fileIndex);

    // Update runtime state immediately
    updateActiveCharacter(characterId);
    updateActivePointers(outfitKey, expressionKey);
    updateChainEntry(characterId, outfitKey, expressionKey, filename);

    // Write visual state to the DNA chain (image may be null if not yet generated)
    await lockedWriteVisualState(lastAiIdx, characterId, outfitKey, expressionKey, filename);

    if (filename) {
        updateActiveImage(filename);
        setPortrait(filename);
        if (window.toastr) window.toastr.success('Portrait applied.', 'PersonaLyze');
        return;
    }

    // Not cached — generate, then patch
    const outfitDef = character.outfits[outfitKey];
    if (!outfitDef) return;

    if (window.toastr) window.toastr.info('Generating portrait…', 'PersonaLyze');

    try {
        filename = await generate(
            characterId, outfitKey, expressionKey,
            outfitDef.description, expressionKey, character.identityAnchor
        );
        addToFileIndex(filename);
        await lockedPatchVisualStateImage(lastAiIdx, characterId, filename);
        updateActiveImage(filename);
        updateChainEntry(characterId, outfitKey, expressionKey, filename);
        setPortrait(filename);
        if (window.toastr) window.toastr.success('Portrait generated and applied.', 'PersonaLyze');
    } catch (err) {
        error('CharPicker', 'Generation failed:', err);
        if (window.toastr) window.toastr.error(`Generation failed: ${err.message}`, 'PersonaLyze');
    }
}
