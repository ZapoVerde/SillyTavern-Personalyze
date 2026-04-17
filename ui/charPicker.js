/**
 * @file data/default-user/extensions/personalyze/ui/charPicker.js
 * @stamp {"utc":"2026-04-17T17:00:00.000Z"}
 * @architectural-role UI (Character Picker Modal)
 * @description
 * Cascading layered state picker. Lets the user manually set the active 
 * visual state for the current turn using the 5-slot architecture.
 *
 * Updated for Dynamic Variable Architecture:
 * 1. Removed compilePrompt usage; generate() now handles iterative prompt synthesis.
 *
 * @api-declaration
 * openCharPicker(initialOverride) → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: [state (via setters)]
 *     external_io: [callPopup, dnaWriter.js, vocabularyService.js, state.js, imageCache.js, callLog.js]
 */

import { callPopup } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import {
    state, updateActiveCharacter, updateActiveLayers, updateActiveImage,
    addToFileIndex, updateChainLayers, upsertChatSlots, upsertChatEnsemble,
    setActiveRoster, removeFromFileIndex, upsertChatCharacterDef
} from '../state.js';
import { buildFilenamePrefix, findCachedImage, generate, deleteFiles } from '../imageCache.js';
import { 
    lockedWriteVisualState, 
    lockedPatchVisualStateImage, 
    lockedWriteSlots,
    lockedWriteEnsemble,
    lockedWriteRoster,
    lockedWriteCharacterDef
} from '../io/dnaWriter.js';
import { escapeHtml, slugify } from '../utils/history.js';
import { error } from '../utils/logger.js';
import { getSettings, updateSetting } from '../settings.js';
import { applyEnsemble } from '../logic/ensembleEngine.js';
import { BASE_SLOTS, META_SLOTS } from '../defaults.js';
import { generateEnsembleLabel, generateEnsembleKey } from '../logic/parsers.js';
import { buildVocabularyDatalists } from '../logic/vocabularyService.js';
import { startWorkshopTurn } from '../utils/callLog.js';

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

    const s = getSettings();
    const initId = (state.activeCharacterId && dnaChars.includes(state.activeCharacterId))
        ? state.activeCharacterId : dnaChars[0];

    const currentLayers = initialOverride || state.characterChain[initId]?.layers || state.activeLayers;
    const currentSlots = state.chatCharacters[initId]?.slots || [...BASE_SLOTS];
    const initialSeed = state.chatCharacters[initId]?.seed ?? 1;

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
            <div id="plz-cp-grid-container">${buildGridHTML(currentSlots, currentLayers, initId, initialSeed, !!s.autoIncrementSeed)}</div>
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
            const seed = charData?.seed ?? 1;
            $('#plz-cp-grid-container').html(buildGridHTML(slots, layers, id, seed, !!getSettings().autoIncrementSeed));
            $('#plz-cp-datalists-container').html(buildVocabularyDatalists(id, charData, chain));
        });

        $(document).on('input.plzCp', '#plz-cp-seed', function() {
            const val = parseInt($(this).val(), 10);
            $('#plz-cp-inc').prop('disabled', val === -1);
        });

        $(document).on('change.plzCp', '#plz-cp-inc', function() {
            updateSetting('autoIncrementSeed', $(this).prop('checked'));
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
            
            const layers = getPickerCurrentLayers();
            const seed = parseInt($('#plz-cp-seed').val(), 10) || 1;
            $('#plz-cp-grid-container').html(buildGridHTML(newSlots, layers, id, seed, !!getSettings().autoIncrementSeed));
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

    // Forensic Logging: Open a Workshop turn so the generation is filed correctly
    startWorkshopTurn(`Manual Appearance Change: ${charId}`);

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
    const settings = getSettings();
    
    // Seed Determination & Clamping Logic
    let currentSeed = parseInt($('#plz-cp-seed').val(), 10);
    if (isNaN(currentSeed)) currentSeed = character.seed ?? 1;
    currentSeed = Math.max(-1, Math.min(currentSeed, 999));

    let apiSeed = currentSeed;

    if (forceRegen) {
        if ($('#plz-cp-inc').prop('checked') && currentSeed > -1) {
            // 3-Digit Loop Logic (1-999)
            apiSeed = (currentSeed % 999) + 1;
        } else if (currentSeed === -1) {
            // Truly random request
            apiSeed = -1;
        }
    }

    // UNIVERSAL PERSISTENCE: If the resolved seed (new or incremented) differs from DNA, commit it.
    if (apiSeed !== character.seed) {
        upsertChatCharacterDef(charId, character.identity, apiSeed);
        await lockedWriteCharacterDef(lastAiIdx, charId, character.identity, apiSeed);
    }

    const emotionSlug = slugify(layers.emotion);
    const prefix = buildFilenamePrefix(charId, 'layered', emotionSlug);
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
        filename = await generate(
            charId, 
            'layered', 
            emotionSlug, 
            layers, 
            layers.emotion, 
            layers.pose, 
            character.identity,
            apiSeed,
            forceRegen
        );
        addToFileIndex(filename);
        updateActiveImage(filename);
        updateChainLayers(charId, layers, filename);
        await lockedPatchVisualStateImage(lastAiIdx, charId, filename, recordId);

        // Ephemeral Cleanup
        if (!settings.keepCache) {
            const charPrefix = `plz_${charId}_`;
            const staleFiles = Array.from(state.fileIndex).filter(f => 
                f.startsWith(charPrefix) && f !== filename
            );
            if (staleFiles.length > 0) {
                await deleteFiles(staleFiles);
                removeFromFileIndex(staleFiles);
            }
        }

        document.dispatchEvent(new CustomEvent('plz:roster-render-req'));
    } catch (err) {
        error('CharPicker', 'Gen failed:', err);
    }
}