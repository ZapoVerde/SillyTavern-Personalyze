/**
 * @file data/default-user/extensions/personalyze/ui/charPicker.js
 * @stamp {"utc":"2026-04-28T00:00:00.000Z"}
 * @architectural-role UI (Character Picker Modal)
 * @description
 * Cascading layered state picker. Lets the user manually set the active
 * visual state for the current turn using the 5-slot architecture.
 *
 * Migrated from callPopup to self-owned openModal overlay. Scraping of all
 * DOM values happens inside the button onClick handlers (before teardown
 * removes the overlay), so no DOM reads are needed after await.
 *
 * @api-declaration
 * openCharPicker(initialOverride, initialCharId) → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: [state (via setters)]
 *     external_io: [openModal, promptModal, dnaWriter.js, vocabularyService.js, state.js, imageCache.js, callLog.js]
 */

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
import { openModal, promptModal, confirmModal } from '../utils/modal.js';

// Decomposed Templates
import { buildGridHTML } from './charPickerTemplates.js';

/**
 * Scrapes the current DOM inputs. Implements Orphan Sweeping.
 * Must be called before the overlay is torn down.
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
 * @param {string|null} initialCharId   - Pre-select this character in the dropdown.
 */
export async function openCharPicker(initialOverride = null, initialCharId = null) {
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
    const initId = (initialCharId && dnaChars.includes(initialCharId))
        ? initialCharId
        : (state.activeCharacterId && dnaChars.includes(state.activeCharacterId))
            ? state.activeCharacterId
            : dnaChars[0];

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

    const content = `
        <h3 style="margin-top:0; margin-bottom:12px;">Change Appearance</h3>
        <div style="margin-bottom:12px;">
            <select id="plz-cp-char" class="text_pole" style="width:100%; margin-bottom:8px;">${charOptions}</select>
            <select id="plz-cp-ensemble" class="text_pole" style="width:100%;">${buildEnsembleOptions(initId)}</select>
        </div>
        <div id="plz-cp-grid-container">${buildGridHTML(currentSlots, currentLayers, initId, initialSeed, !!s.autoIncrementSeed)}</div>
        <div id="plz-cp-datalists-container">${buildVocabularyDatalists(initId, state.chatCharacters[initId], state.characterChain[initId])}</div>
        <div id="plz-cp-hist-menu"></div>`;

    // Resolve payload is built inside onClick, before teardown removes the DOM
    const buildPayload = ($m, force) => ({
        ok: true,
        force,
        charId:     $m.find('#plz-cp-char').val(),
        layers:     getPickerCurrentLayers(),
        seed:       parseInt($m.find('#plz-cp-seed').val(), 10),
        incChecked: $m.find('#plz-cp-inc').prop('checked'),
    });

    const result = await openModal({
        content,
        buttons: [
            {
                label: '<i class="fa-solid fa-rotate-right"></i> Force Gen',
                style: 'muted',
                onClick: ($m, resolve) => resolve(buildPayload($m, true)),
            },
            {
                label: 'Accept',
                onClick: ($m, resolve) => resolve(buildPayload($m, false)),
            },
            { label: 'Cancel', value: null, style: 'muted' },
        ],
        onReady: ($overlay) => {
            // History dropdown
            $overlay.on('click', '.plz-history-btn', function(e) {
                e.stopPropagation();
                const $btn = $(this);
                const listId = $btn.data('list');
                const $input = $btn.closest('.plz-input-wrapper').find('input');
                const $menu = $overlay.find('#plz-cp-hist-menu');

                if ($menu.hasClass('plz-hist-open') && $menu.data('plz-for') === listId) {
                    $menu.removeClass('plz-hist-open');
                    return;
                }

                const options = listId
                    ? Array.from(document.querySelectorAll(`#${listId} option`))
                          .map(o => o.value).filter(Boolean)
                    : [];

                if (!options.length) {
                    $menu.html('<div class="plz-hist-empty">No history yet</div>');
                } else {
                    $menu.html(options.map(v => `<div class="plz-hist-opt">${escapeHtml(v)}</div>`).join(''));
                }

                const rect = $input[0].getBoundingClientRect();
                $menu.css({
                    top:      rect.bottom + 4,
                    left:     rect.left,
                    minWidth: rect.width,
                }).data('plz-for', listId).data('plz-target', $input[0]).addClass('plz-hist-open');
            });

            $overlay.on('click', '.plz-hist-opt', function(e) {
                e.stopPropagation();
                const val = $(this).text();
                const $input = $($overlay.find('#plz-cp-hist-menu').data('plz-target'));
                $input.val(val).trigger('input');
                $overlay.find('#plz-cp-hist-menu').removeClass('plz-hist-open');
            });

            $overlay.on('mousedown touchstart', function(e) {
                if (!$(e.target).closest('#plz-cp-hist-menu, .plz-history-btn').length) {
                    $overlay.find('#plz-cp-hist-menu').removeClass('plz-hist-open');
                }
            });

            $overlay.on('click', '.plz-input-clear', function(e) {
                e.stopPropagation();
                $overlay.find('#plz-cp-hist-menu').removeClass('plz-hist-open');
                const $wrapper = $(this).closest('.plz-input-wrapper');
                const $input = $wrapper.find('input');
                $input.val('').trigger('input');
                if ($input.hasClass('plz-cp-item')) {
                    const slot = $input.data('slot');
                    $overlay.find(`.plz-cp-mod[data-slot="${slot}"]`).val('').trigger('input');
                }
            });

            $overlay.on('change', '#plz-cp-char', function() {
                const id = $(this).val();
                const charData = state.chatCharacters[id];
                const chain = state.characterChain[id];
                $overlay.find('#plz-cp-ensemble').html(buildEnsembleOptions(id));
                const layers = chain?.layers || state.activeLayers;
                const slots = charData?.slots || [...BASE_SLOTS];
                const seed = charData?.seed ?? 1;
                $overlay.find('#plz-cp-grid-container').html(buildGridHTML(slots, layers, id, seed, !!getSettings().autoIncrementSeed));
                $overlay.find('#plz-cp-datalists-container').html(buildVocabularyDatalists(id, charData, chain));
            });

            $overlay.on('input', '#plz-cp-seed', function() {
                const val = parseInt($(this).val(), 10);
                $overlay.find('#plz-cp-inc').prop('disabled', val === -1);
            });

            $overlay.on('change', '#plz-cp-inc', function() {
                updateSetting('autoIncrementSeed', $(this).prop('checked'));
            });

            $overlay.on('change', '#plz-cp-ensemble', function() {
                const charId = $overlay.find('#plz-cp-char').val();
                const key = $(this).val();
                if (!key) return;
                const ensemble = state.chatCharacters[charId]?.ensembles?.[key];
                if (!ensemble) return;
                const layers = applyEnsemble(state.activeLayers, ensemble.layers);
                $overlay.find('#plz-cp-emotion').val(layers.emotion || 'neutral');
                $overlay.find('#plz-cp-pose').val(layers.pose || 'upright');
                $overlay.find('#plz-cp-grid-container .plz-cp-item').each(function() {
                    const slot = $(this).data('slot');
                    const val = layers[slot];
                    $(this).val(val?.item || '');
                    $overlay.find(`#plz-cp-grid-container .plz-cp-mod[data-slot="${slot}"]`).val(val?.modifier || '');
                });
            });

            $overlay.on('click', '#plz-cp-add-slot', async (e) => {
                e.preventDefault();
                const id = $overlay.find('#plz-cp-char').val();
                const label = await promptModal('New Category Name');
                if (!label?.trim()) return;
                const key = slugify(label.trim());
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
                const seed = parseInt($overlay.find('#plz-cp-seed').val(), 10) || 1;
                $overlay.find('#plz-cp-grid-container').html(buildGridHTML(newSlots, layers, id, seed, !!getSettings().autoIncrementSeed));
            });
        },
    });

    if (!result?.ok) return;

    const { charId, layers, seed: rawSeed, incChecked, force: forceRegen } = result;

    if (JSON.stringify(layers).includes('[') || JSON.stringify(layers).includes(']')) {
        const guardOk = await confirmModal('Brackets <b>[ ]</b> found in character details. Save anyway?');
        if (!guardOk) return openCharPicker(layers);
    }

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

    let currentSeed = isNaN(rawSeed) ? (character.seed ?? 1) : rawSeed;
    currentSeed = Math.max(-1, Math.min(currentSeed, 999));

    let apiSeed = currentSeed;

    if (forceRegen) {
        if (incChecked && currentSeed > -1) {
            apiSeed = (currentSeed % 999) + 1;
        } else if (currentSeed === -1) {
            apiSeed = -1;
        }
    }

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
