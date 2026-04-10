/**
 * @file data/default-user/extensions/personalyze/ui/charPicker.js
 * @stamp {"utc":"2026-04-11T16:40:00.000Z"}
 * @architectural-role UI (Character Picker Modal)
 * @description
 * Cascading layered state picker. Lets the user manually set the active 
 * visual state for the current turn using the 5-slot architecture.
 *
 * Updated for Flexible Wardrobe:
 * 1. Dynamically renders inputs based on character.slots.
 * 2. Slot-agnostic data collection and ensemble loading.
 *
 * @api-declaration
 * openCharPicker() → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: [state (via setters)]
 *     external_io: [callPopup, dnaWriter.js, promptCompiler.js, imageCache.js, portrait.js]
 */

import { callPopup } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import {
    state, updateActiveCharacter, updateActiveLayers, updateActiveImage,
    addToFileIndex, updateChainLayers,
} from '../state.js';
import { compilePrompt } from '../logic/promptCompiler.js';
import { buildFilenamePrefix, findCachedImage, generate } from '../imageCache.js';
import { setPortrait } from '../portrait.js';
import { lockedWriteVisualState, lockedPatchVisualStateImage } from '../io/dnaWriter.js';
import { escapeHtml, slugify } from '../utils/history.js';
import { error } from '../utils/logger.js';
import { smartResize } from '../utils/dom.js';
import { getSettings } from '../settings.js';
import { applyEnsemble } from '../logic/ensembleEngine.js';
import { BASE_SLOTS } from '../defaults.js';

/**
 * Builds the HTML for the dynamic layered grid inside the picker.
 * @param {string[]} slots - The categories to render.
 * @param {object} layers - Current values for those slots.
 */
function buildGridHTML(slots, layers) {
    const effectiveSlots = slots && slots.length > 0 ? slots : BASE_SLOTS;

    const clothingHtml = effectiveSlots.map(key => {
        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        const item = layers[key]?.item ?? '';
        const mod  = layers[key]?.modifier ?? '';
        return `
        <div style="margin-bottom:10px;">
            <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:2px;">${escapeHtml(label)}</label>
            <div style="display:flex; gap:4px;">
                <input class="plz-cp-item text_pole" data-slot="${key}" type="text" placeholder="Item" value="${escapeHtml(item)}" style="flex:2;" />
                <input class="plz-cp-mod text_pole" data-slot="${key}" type="text" placeholder="Mod" value="${escapeHtml(mod)}" style="flex:1;" />
            </div>
        </div>`;
    }).join('');

    return `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        ${clothingHtml}
        <div>
            <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:2px;">Emotion</label>
            <input id="plz-cp-emotion" class="text_pole" type="text" value="${escapeHtml(layers.emotion || 'neutral')}" style="width:100%;" />
        </div>
        <div>
            <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:2px;">Pose</label>
            <input id="plz-cp-pose" class="text_pole" type="text" value="${escapeHtml(layers.pose || 'upright')}" style="width:100%;" />
        </div>
    </div>`;
}

/**
 * Opens the manual character/layer picker.
 */
export async function openCharPicker() {
    const context = getContext();
    const lastAiIdx = context.chat.findLastIndex(m => !m.is_user);
    if (lastAiIdx === -1) {
        if (window.toastr) window.toastr.info('No AI message yet.', 'PersonaLyze');
        return;
    }

    const rosterChars = state.activeRoster.filter(id => state.chatCharacters[id]);
    if (rosterChars.length === 0) return;

    const initId = (state.activeCharacterId && rosterChars.includes(state.activeCharacterId))
        ? state.activeCharacterId : rosterChars[0];

    const currentLayers = state.characterChain[initId]?.layers || state.activeLayers;
    const currentSlots = state.chatCharacters[initId]?.slots || [...BASE_SLOTS];

    const charOptions = rosterChars.map(id => {
        const label = state.chatCharacters[id]?.label || id.replace(/_/g, ' ');
        return `<option value="${escapeHtml(id)}"${id === initId ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

    function buildEnsembleOptions(id) {
        const ensembles = Object.entries(state.chatCharacters[id]?.ensembles ?? {});
        if (!ensembles.length) return '<option value="">— No ensembles —</option>';
        return '<option value="">— Quick Load Ensemble —</option>' +
            ensembles.map(([k, v]) => `<option value="${escapeHtml(k)}">${escapeHtml(v.label)}</option>`).join('');
    }

    // Track whether the user requested a forced regeneration
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
            <div id="plz-cp-grid-container">${buildGridHTML(currentSlots, currentLayers)}</div>
            <button id="plz-cp-force-regen" class="menu_button" style="width:100%;margin-top:12px;opacity:0.75;">
                <i class="fa-solid fa-rotate-right"></i> Force New Generation
            </button>`,
            'confirm'
        ).then(ok => finish(!!ok)).catch(() => finish(false));

        // Dynamic Roster Switching
        $(document).on('change.plzCp', '#plz-cp-char', function() {
            const id = $(this).val();
            $('#plz-cp-ensemble').html(buildEnsembleOptions(id));
            const charData = state.chatCharacters[id];
            const layers = state.characterChain[id]?.layers || state.activeLayers;
            const slots = charData?.slots || [...BASE_SLOTS];
            $('#plz-cp-grid-container').html(buildGridHTML(slots, layers));
        });

        // Ensemble Quick Load
        $(document).on('change.plzCp', '#plz-cp-ensemble', function() {
            const charId = $('#plz-cp-char').val();
            const key = $(this).val();
            if (!key) return;
            const ensemble = state.chatCharacters[charId].ensembles[key];
            const layers = applyEnsemble(state.activeLayers, ensemble.layers);
            
            $('#plz-cp-emotion').val(layers.emotion || 'neutral');
            $('#plz-cp-pose').val(layers.pose || 'upright');

            // Find all inputs in the current grid and update them from the loaded ensemble
            $('#plz-cp-grid-container .plz-cp-item').each(function() {
                const slot = $(this).data('slot');
                const val = layers[slot];
                $(this).val(val?.item || '');
                $(`#plz-cp-grid-container .plz-cp-mod[data-slot="${slot}"]`).val(val?.modifier || '');
            });
        });

        // Force Regen: set flag then close via OK
        $(document).on('click.plzCp', '#plz-cp-force-regen', () => {
            forceRegen = true;
            $('#dialogue_popup_ok').trigger('click');
        });
    });

    if (!confirmed) return;

    // Collect Layers dynamically from all inputs in the grid
    const characterId = $('#plz-cp-char').val();
    const layers = { 
        emotion: $('#plz-cp-emotion').val().trim() || 'neutral',
        pose:    $('#plz-cp-pose').val().trim()    || 'upright'
    };
    
    $('#plz-cp-grid-container .plz-cp-item').each(function() {
        const slot = $(this).data('slot');
        const item = $(this).val().trim();
        const mod = $(`#plz-cp-grid-container .plz-cp-mod[data-slot="${slot}"]`).val().trim();
        layers[slot] = item ? { item, modifier: mod || null } : null;
    });

    const character = state.chatCharacters[characterId];
    const s = getSettings();
    const engine = character.engine || s.defaultEngine || 'pollinations';
    const prompt = compilePrompt(character.identityAnchor, layers);
    const prefix = buildFilenamePrefix(characterId, 'layered', slugify(layers.emotion));

    // Force regen bypasses the cache — always generates a fresh image
    let filename = forceRegen ? null : findCachedImage(prefix, state.fileIndex);

    updateActiveCharacter(characterId);
    updateActiveLayers(layers);
    updateChainLayers(characterId, layers, filename);

    // Write 1
    await lockedWriteVisualState(lastAiIdx, characterId, layers, filename);

    if (filename) {
        updateActiveImage(filename);
        setPortrait(filename);
        return;
    }

    if (window.toastr) window.toastr.info('Generating...', 'PersonaLyze');

    try {
        // Randomize seed if forceRegen is true to bypass provider-side caching
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
        await lockedPatchVisualStateImage(lastAiIdx, characterId, filename);
        setPortrait(filename);
    } catch (err) {
        const reason = err.cause?.message || err.message;
        if (window.toastr) window.toastr.warning(`Image generation failed — ${reason}`, 'PersonaLyze');
        error('CharPicker', 'Gen failed:', err);
    }
}