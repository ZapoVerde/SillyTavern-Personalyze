/**
 * @file data/default-user/extensions/personalyze/ui/charPicker.js
 * @stamp {"utc":"2026-04-14T21:00:00.000Z"}
 * @architectural-role UI (Character Picker Modal)
 * @description
 * Cascading layered state picker. Lets the user manually set the active 
 * visual state for the current turn using the 5-slot architecture.
 *
 * Updated for the Smart Wardrobe:
 * 1. State Preservation: Bracket Guard now recurses with captured layers.
 * 2. Defensive Lookup: Added null guards for character and ensemble access.
 * 3. Character-specific Wardrobe Dictionary datalists.
 * 4. Mobile-friendly stacked/indented modifier layout.
 * 5. Orphan Sweeping: Clears modifiers when items are blanked.
 *
 * @api-declaration
 * openCharPicker(initialOverride) → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: [state (via setters)]
 *     external_io: [callPopup, dnaWriter.js, promptCompiler.js, imageCache.js]
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
import { error, log } from '../utils/logger.js';
import { smartResize } from '../utils/dom.js';
import { getSettings } from '../settings.js';
import { applyEnsemble } from '../logic/ensembleEngine.js';
import { BASE_SLOTS, META_SLOTS } from '../defaults.js';
import { generateEnsembleLabel, generateEnsembleKey } from '../logic/parsers.js';

/**
 * Scans character ensembles to build unique datalists for each wardrobe slot.
 */
function buildDatalistsHTML(charId, character) {
    const ensembles = Object.values(character?.ensembles || {});
    const slots = character?.slots || [...BASE_SLOTS];
    const lists = {};

    ensembles.forEach(e => {
        const layers = e.layers || {};
        slots.forEach(s => {
            if (!lists[`${s}-item`]) lists[`${s}-item`] = new Set();
            if (!lists[`${s}-mod`])  lists[`${s}-mod`]  = new Set();
            if (layers[s]?.item)     lists[`${s}-item`].add(layers[s].item);
            if (layers[s]?.modifier) lists[`${s}-mod`].add(layers[s].modifier);
        });
        if (!lists['emotion']) lists['emotion'] = new Set();
        if (!lists['pose'])    lists['pose']    = new Set();
        if (layers.emotion)    lists['emotion'].add(layers.emotion);
        if (layers.pose)       lists['pose'].add(layers.pose);
    });

    return Object.entries(lists).map(([key, values]) => {
        const options = Array.from(values)
            .filter(v => v && v !== 'None' && v !== 'KEEP')
            .map(v => `<option value="${escapeHtml(v)}">`)
            .join('');
        return `<datalist id="plz-cp-list-${charId}-${key}">${options}</datalist>`;
    }).join('');
}

/**
 * Builds the HTML for the dynamic layered grid inside the picker.
 */
function buildGridHTML(slots, layers, charId) {
    const effectiveSlots = slots && slots.length > 0 ? slots : BASE_SLOTS;

    const clothingHtml = effectiveSlots.map(key => {
        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        const item = layers[key]?.item ?? '';
        const mod  = layers[key]?.modifier ?? '';
        return `
        <div style="margin-bottom:10px;">
            <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:2px;">${escapeHtml(label)}</label>
            <div class="plz-layer-row">
                <div class="plz-input-wrapper" style="flex:2;">
                    <input class="plz-cp-item text_pole" data-slot="${key}" type="text" placeholder="Item" 
                           list="plz-cp-list-${charId}-${key}-item" value="${escapeHtml(item)}" style="width:100%;" />
                    <div class="plz-input-clear" title="Clear Item">✕</div>
                </div>
                <div class="plz-input-wrapper" style="flex:1;">
                    <input class="plz-cp-mod text_pole" data-slot="${key}" type="text" placeholder="Mod" 
                           list="plz-cp-list-${charId}-${key}-mod" value="${escapeHtml(mod)}" style="width:100%;" />
                    <div class="plz-input-clear" title="Clear Mod">✕</div>
                </div>
            </div>
        </div>`;
    }).join('');

    return `
    <div class="plz-layered-grid">
        ${clothingHtml}
        <div>
            <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:2px;">Emotion</label>
            <div class="plz-input-wrapper">
                <input id="plz-cp-emotion" class="text_pole" type="text" list="plz-cp-list-${charId}-emotion" 
                       value="${escapeHtml(layers.emotion || 'neutral')}" style="width:100%;" />
                <div class="plz-input-clear" title="Clear Emotion">✕</div>
            </div>
        </div>
        <div>
            <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:2px;">Pose</label>
            <div class="plz-input-wrapper">
                <input id="plz-cp-pose" class="text_pole" type="text" list="plz-cp-list-${charId}-pose" 
                       value="${escapeHtml(layers.pose || 'upright')}" style="width:100%;" />
                <div class="plz-input-clear" title="Clear Pose">✕</div>
            </div>
        </div>
    </div>
    <div style="margin-top:10px; display:flex; justify-content:flex-end;">
        <button id="plz-cp-add-slot" class="menu_button" style="font-size:0.75em; opacity:0.7;">
            <i class="fa-solid fa-plus"></i> Add Category
        </button>
    </div>`;
}

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

        // Orphan Sweeping (Fix: Check specifically for empty string or None)
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

    // Priority: 1. Manual Override (Guard recovery) 2. Character History 3. Active Session
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
            <div id="plz-cp-datalists-container">${buildDatalistsHTML(initId, state.chatCharacters[initId])}</div>
            <button id="plz-cp-force-regen" class="menu_button" style="width:100%;margin-top:12px;opacity:0.75;">
                <i class="fa-solid fa-rotate-right"></i> Force New Generation
            </button>`,
            'confirm'
        ).then(ok => finish(!!ok)).catch(() => finish(false));

        // Pinned Clear Button Handler
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
            $('#plz-cp-ensemble').html(buildEnsembleOptions(id));
            const layers = state.characterChain[id]?.layers || state.activeLayers;
            const slots = charData?.slots || [...BASE_SLOTS];
            $('#plz-cp-grid-container').html(buildGridHTML(slots, layers, id));
            $('#plz-cp-datalists-container').html(buildDatalistsHTML(id, charData));
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
            const lastMsgId = Math.max(0, getContext().chat.length - 1);
            await lockedWriteSlots(lastMsgId, id, newSlots);
            upsertChatSlots(id, newSlots);
            const preservedLayers = getPickerCurrentLayers();
            $('#plz-cp-grid-container').html(buildGridHTML(newSlots, preservedLayers, id));
        });

        $(document).on('click.plzCp', '#plz-cp-force-regen', () => {
            forceRegen = true;
            $('#dialogue_popup_ok').trigger('click');
        });
    });

    if (!confirmed) return;

    // ─── Post-Confirmation Logic ───
    const characterId = $('#plz-cp-char').val();
    const layers = getPickerCurrentLayers();

    // Bracket Guard Check (Priority 1 Fix: Recurse with captured layers)
    const serialized = JSON.stringify(layers);
    if (serialized.includes('[') || serialized.includes(']')) {
        const guardOk = await callPopup(
            '<h3>Potential Placeholder Detected</h3>' +
            'Brackets <b style="color:var(--SmartThemeErrorColor);">[ ]</b> were found in the outfit details. ' +
            'Are you sure you want to save this state?',
            'confirm'
        );
        if (!guardOk) {
            return openCharPicker(layers);
        }
    }

    const ensembleLabel = generateEnsembleLabel(layers);
    const ensembleKey   = generateEnsembleKey(layers);
    await lockedWriteEnsemble(lastAiIdx, characterId, ensembleKey, ensembleLabel, layers);
    upsertChatEnsemble(characterId, ensembleKey, ensembleLabel, layers);

    if (!state.activeRoster.includes(characterId)) {
        const nextRoster = [...state.activeRoster, characterId];
        await lockedWriteRoster(lastAiIdx, nextRoster);
        setActiveRoster(nextRoster);
        document.dispatchEvent(new CustomEvent('plz:roster-changed'));
    }

    const character = state.chatCharacters[characterId];
    const s = getSettings();
    const engine = character.engine || s.defaultEngine || 'pollinations';
    const prompt = compilePrompt(character.identityAnchor, layers);
    const prefix = buildFilenamePrefix(characterId, 'layered', slugify(layers.emotion));

    let filename = forceRegen ? null : findCachedImage(prefix, state.fileIndex);

    updateActiveCharacter(characterId);
    updateActiveLayers(layers);
    updateChainLayers(characterId, layers, filename);

    const recordId = await lockedWriteVisualState(lastAiIdx, characterId, layers, filename);

    if (filename) {
        updateActiveImage(filename);
        document.dispatchEvent(new CustomEvent('plz:roster-render-req'));
        return;
    }

    if (window.toastr) window.toastr.info('Generating...', 'PersonaLyze');

    try {
        const generationSeed = forceRegen ? Math.floor(Math.random() * 1000000) : (character.seed ?? 1);

        filename = await generate(
            characterId, 
            'layered', 
            slugify(layers.emotion),
            prompt, 
            layers.emotion, 
            layers.pose,
            character.identityAnchor, 
            generationSeed,
            engine
        );
        addToFileIndex(filename);
        updateActiveImage(filename);
        updateChainLayers(characterId, layers, filename);
        await lockedPatchVisualStateImage(lastAiIdx, characterId, filename, recordId);
        
        document.dispatchEvent(new CustomEvent('plz:roster-render-req'));
    } catch (err) {
        const reason = err.cause?.message || err.message;
        if (window.toastr) window.toastr.warning(`Image generation failed — ${reason}`, 'PersonaLyze');
        error('CharPicker', 'Gen failed:', err);
    }
}