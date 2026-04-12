/**
 * @file data/default-user/extensions/personalyze/ui/charPicker.js
 * @stamp {"utc":"2026-04-14T23:20:00.000Z"}
 * @architectural-role UI (Character Picker Modal)
 * @description
 * Cascading layered state picker. Lets the user manually set the active 
 * visual state for the current turn using the 5-slot architecture.
 *
 * Updated for the Smart Wardrobe:
 * 1. JIT Harvesting: Uses vocabularyService to scan history for suggestions.
 * 2. Deterministic Linking: Integrated with domRegistry for space-safe IDs.
 * 3. Orphan Sweeping: Clears modifiers when items are blanked.
 *
 * @api-declaration
 * openCharPicker(initialOverride) → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: [state (via setters)]
 *     external_io: [callPopup, dnaWriter.js, vocabularyService.js, state.js]
 */

import { callPopup } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import {
    state, updateActiveCharacter, updateActiveLayers, updateActiveImage,
    addToFileIndex, updateChainLayers, upsertChatSlots, upsertChatEnsemble,
    setActiveRoster
} from '../state.js';
import { compilePrompt } from '../logic/promptCompiler.js';
import { buildFilenamePrefix, findCachedImage, generate } from '../imageCache.js';
import { 
    lockedWriteVisualState, 
    lockedPatchVisualStateImage, 
    lockedWriteSlots,
    lockedWriteEnsemble,
    lockedWriteRoster
} from '../io/dnaWriter.js';
import { escapeHtml, slugify } from '../utils/history.js';
import { error } from '../utils/logger.js';
import { getSettings } from '../settings.js';
import { applyEnsemble } from '../logic/ensembleEngine.js';
import { BASE_SLOTS, META_SLOTS } from '../defaults.js';
import { generateEnsembleLabel, generateEnsembleKey } from '../logic/parsers.js';
import { buildVocabularyDatalists } from '../logic/vocabularyService.js';

// Decomposed Templates
import { buildGridHTML } from './charPickerTemplates.js';

/**
 * Scrapes the current DOM inputs. Implements Orphan Sweeping.
 */
function getPickerCurrentLayers() {
    const layers = { 
        emotion: $('#plz-cp-emotion').val()?.trim() || 'neutral',
        pose:    $('#plz-cp-pose').val()?.trim()    || 'upright'
    };
    
    $('.plz-cp-item').each(function() {
        const slot = $(this).data('slot');
        let item = $(this).val().trim();
        let mod = $(`.plz-cp-mod[data-slot="${slot}"]`).val().trim();

        if (item === '' || item === null || item.toLowerCase() === 'none') {
            item = null;
            mod  = null;
        }

        layers[slot] = item ? { item, modifier: mod || null } : null;
    });
    return layers;
}

/**
 * Opens the manual character/layer picker.
 * 
 * @param {object|null} initialOverride - Optional layers object to restore state on guard re-open.
 */
export async function openCharPicker(initialOverride = null) {
    const context = getContext();
    const lastAiIdx = context.chat.findLastIndex(m => !m.is_user);
    if (lastAiIdx === -1) {
        if (window.toastr) window.toastr.info('No AI message yet.', 'PersonaLyze');
        return;
    }

    const dnaChars = Object.keys(state.chatCharacters);
    if (dnaChars.length === 0) {
        if (window.toastr) window.toastr.info('No character DNA found in this chat.', 'PersonaLyze');
        return;
    }

    const initId = (state.activeCharacterId && dnaChars.includes(state.activeCharacterId))
        ? state.activeCharacterId : dnaChars[0];

    const currentLayers = initialOverride || state.characterChain[initId]?.layers || state.activeLayers;
    const currentSlots = state.chatCharacters[initId]?.slots || [...BASE_SLOTS];

    const charOptions = dnaChars.map(id => {
        const label = state.chatCharacters[id]?.label || id.replace(/_/g, ' ');
        const isOnScreen = state.activeRoster.includes(id) ? ' (On Screen)' : '';
        return `<option value="${escapeHtml(id)}"${id === initId ? ' selected' : ''}>${escapeHtml(label)}${isOnScreen}</option>`;
    }).join('');

    function buildEnsembleOptions(id) {
        const ensembles = Object.entries(state.chatCharacters[id]?.ensembles ?? {});
        if (!ensembles.length) return '<option value="">— No ensembles —</option>';
        const sorted = [...ensembles].reverse();
        return '<option value="">— Quick Load Ensemble —</option>' +
            sorted.map(([k, v]) => `<option value="${escapeHtml(k)}">${escapeHtml(v.label)}</option>`).join('');
    }

    let forceRegen = false;
    let _settled = false;

    const confirmed = await new Promise((resolve) => {
        function finish(result) {
            if (_settled) return;
            _settled = true;
            $(document).off('.plzCp');
            resolve(result);
        }

        callPopup(
            `<h3 style="margin-top:0; margin-bottom:12px;">Change Appearance</h3>
            <div style="margin-bottom:12px;">
                <select id="plz-cp-char" class="text_pole" style="width:100%; margin-bottom:8px;">${charOptions}</select>
                <select id="plz-cp-ensemble" class="text_pole" style="width:100%;">${buildEnsembleOptions(initId)}</select>
            </div>
            <div id="plz-cp-grid-container">${buildGridHTML(currentSlots, currentLayers, initId)}</div>
            <div id="plz-cp-datalists-container">${buildVocabularyDatalists(initId, state.chatCharacters[initId], state.characterChain[initId])}</div>
            <button id="plz-cp-force-regen" class="menu_button" style="width:100%;margin-top:12px;opacity:0.75;">
                <i class="fa-solid fa-rotate-right"></i> Force New Generation
            </button>`,
            'confirm'
        ).then(ok => finish(!!ok)).catch(() => finish(false));

        $(document).on('click.plzCp', '.plz-input-clear', function(e) {
            e.stopPropagation();
            const $wrapper = $(this).closest('.plz-input-wrapper');
            const $input = $wrapper.find('input');
            $input.val('').trigger('input');
            if ($input.hasClass('plz-cp-item')) {
                const slot = $input.data('slot');
                $(`.plz-cp-mod[data-slot="${slot}"]`).val('').trigger('input');
            }
        });

        $(document).on('change.plzCp', '#plz-cp-char', function() {
            const id = $(this).val();
            const charData = state.chatCharacters[id];
            const chain = state.characterChain[id];
            $('#plz-cp-ensemble').html(buildEnsembleOptions(id));
            const layers = chain?.layers || state.activeLayers;
            const slots = charData?.slots || [...BASE_SLOTS];
            $('#plz-cp-grid-container').html(buildGridHTML(slots, layers, id));
            $('#plz-cp-datalists-container').html(buildVocabularyDatalists(id, charData, chain));
        });

        $(document).on('change.plzCp', '#plz-cp-ensemble', function() {
            const charId = $('#plz-cp-char').val();
            const key = $(this).val();
            if (!key) return;
            const ensemble = state.chatCharacters[charId]?.ensembles?.[key];
            if (!ensemble) return;
            const layers = applyEnsemble(state.activeLayers, ensemble.layers);
            $('#plz-cp-emotion').val(layers.emotion || 'neutral');
            $('#plz-cp-pose').val(layers.pose || 'upright');
            $('#plz-cp-grid-container .plz-cp-item').each(function() {
                const slot = $(this).data('slot');
                const val = layers[slot];
                $(this).val(val?.item || '');
                $(`#plz-cp-grid-container .plz-cp-mod[data-slot="${slot}"]`).val(val?.modifier || '');
            });
        });

        $(document).on('click.plzCp', '#plz-cp-add-slot', async (e) => {
            e.preventDefault();
            const id = $('#plz-cp-char').val();
            const nameRaw = await callPopup('<h3>New Category Name</h3>', 'input', '');
            const label = (nameRaw ?? '').trim();
            if (!label) return;
            const key = slugify(label);
            if (META_SLOTS.includes(key) || BASE_SLOTS.includes(key)) {
                if (window.toastr) window.toastr.error(`"${label}" is a reserved system keyword.`, 'PersonaLyze');
                return;
            }
            const char = state.chatCharacters[id];
            const currentSlots = char.slots || [...BASE_SLOTS];
            if (currentSlots.includes(key)) return;
            const newSlots = [...currentSlots, key];
            await lockedWriteSlots(Math.max(0, getContext().chat.length - 1), id, newSlots);
            upsertChatSlots(id, newSlots);
            $('#plz-cp-grid-container').html(buildGridHTML(newSlots, getPickerCurrentLayers(), id));
        });

        $(document).on('click.plzCp', '#plz-cp-force-regen', () => {
            forceRegen = true;
            $('#dialogue_popup_ok').trigger('click');
        });
    });

    if (!confirmed) return;

    const charId = $('#plz-cp-char').val();
    const layers = getPickerCurrentLayers();
    if (JSON.stringify(layers).includes('[') || JSON.stringify(layers).includes(']')) {
        const guardOk = await callPopup('<h3>Potential Placeholder Detected</h3>Brackets <b>[ ]</b> found. Save anyway?', 'confirm');
        if (!guardOk) return openCharPicker(layers);
    }

    const ensembleLabel = generateEnsembleLabel(layers);
    const ensembleKey   = generateEnsembleKey(layers);
    await lockedWriteEnsemble(lastAiIdx, charId, ensembleKey, ensembleLabel, layers);
    upsertChatEnsemble(charId, ensembleKey, ensembleLabel, layers);

    if (!state.activeRoster.includes(charId)) {
        const nextRoster = [...state.activeRoster, charId];
        await lockedWriteRoster(lastAiIdx, nextRoster);
        setActiveRoster(nextRoster);
        document.dispatchEvent(new CustomEvent('plz:roster-changed'));
    }

    const character = state.chatCharacters[charId];
    const s = getSettings();
    const prefix = buildFilenamePrefix(charId, 'layered', slugify(layers.emotion));
    let filename = forceRegen ? null : findCachedImage(prefix, state.fileIndex);
    updateActiveCharacter(charId);
    updateActiveLayers(layers);
    updateChainLayers(charId, layers, filename);
    const recordId = await lockedWriteVisualState(lastAiIdx, charId, layers, filename);

    if (filename) {
        updateActiveImage(filename);
        document.dispatchEvent(new CustomEvent('plz:roster-render-req'));
        return;
    }

    try {
        const seed = forceRegen ? Math.floor(Math.random() * 1000000) : (character.seed ?? 1);
        filename = await generate(charId, 'layered', slugify(layers.emotion), compilePrompt(character.identityAnchor, layers), layers.emotion, layers.pose, character.identityAnchor, seed, character.engine || s.defaultEngine || 'pollinations');
        addToFileIndex(filename);
        updateActiveImage(filename);
        updateChainLayers(charId, layers, filename);
        await lockedPatchVisualStateImage(lastAiIdx, charId, filename, recordId);
        document.dispatchEvent(new CustomEvent('plz:roster-render-req'));
    } catch (err) {
        error('CharPicker', 'Gen failed:', err);
    }
}