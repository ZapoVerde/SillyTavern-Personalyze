/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaListeners.js
 * @stamp {"utc":"2026-04-19T22:40:00.000Z"}
 * @architectural-role UI Coordinator (Workshop DNA)
 * @description
 * Coordinator hub for the Workshop DNA and Studio tabs. 
 * 
 * Updated for Explicit Seed Architecture (Bug Fixes):
 * 1. Fixed Bug 2: Studio seed input now correctly enables/disables the increment checkbox.
 * 2. Standardized parseInt radix for reactive UI updates.
 * 
 * @api-declaration
 * renderDNAView()
 * renderStudioView()
 * getGridLayers() -> object
 * bindDNAHandlers()
 * 
 * @contract
 *   assertions:
 *     purity: UI Coordinator
 *     state_ownership: [state]
 *     external_io: [dnaTemplates.js, specialized sub-modules, vocabularyService.js, DOM]
 */

import { state } from '../../state.js';
import { getMetaSettings, getSettings, updateSetting } from '../../settings.js';
import { getDnaRosterHTML, getStudioHTML, getStudioEmptyHTML } from './dnaTemplates.js';
import { smartResize } from '../../utils/dom.js';
import { buildVocabularyDatalists } from '../../logic/vocabularyService.js';

// Sub-module binders
import { bindRosterHandlers } from './dnaRoster.js';
import { bindIdentityHandlers } from './dnaIdentity.js';
import { bindSlotHandlers } from './dnaSlots.js';
import { bindEnsembleHandlers } from './dnaEnsembles.js';
import { bindScanningHandlers } from './dnaScanning.js';
import { bindCommitHandlers } from './dnaCommit.js';

/** 
 * Renders the character roster list. 
 */
export function renderDNAView() {
    const html = getDnaRosterHTML(state.chatCharacters, state.activeRoster, state.activeCharacterId);
    $('#plz-tab-dna').html(html);
}

/** 
 * Renders the active character's dashboard grid. 
 */
export function renderStudioView() {
    const id = state._workshopCharacterId;
    const char = id ? state.chatCharacters[id] : null;
    const $panel = $('#plz-tab-studio');

    if (!id || !char) {
        $panel.html(getStudioEmptyHTML());
        return;
    }

    const chain = state.characterChain[id];
    const layers = chain?.layers || state.activeLayers;
    const meta = getMetaSettings();
    const settings = getSettings();
    
    // 1. Render base Studio HTML
    $panel.html(getStudioHTML(
        id, 
        char, 
        layers, 
        meta.styleLibrary ?? {}, 
        meta.defaultStyleName ?? '',
        !!settings.autoIncrementSeed
    ));

    // 2. Inject JIT Vocabulary into the placeholder container
    const vocabHtml = buildVocabularyDatalists(id, char, chain);
    $panel.find('#plz-studio-datalists-container').html(vocabHtml);

    // 3. Size textareas
    $panel.find('.plz-auto-textarea').each(function() { 
        smartResize(this); 
    });
}

/** 
 * Shared Utility: Collects values from the Layered Grid into a standardized layers object. 
 * Implements ORPHAN SWEEPING: If an item is blank, its modifier is automatically set to null.
 * @returns {object} The layered visual state.
 */
export function getGridLayers() {
    const layers = {
        emotion: $('#plz-layer-emotion').val().trim() || 'neutral',
        pose:    $('#plz-layer-pose').val().trim()    || 'upright',
    };
    
    $('.plz-layer-item').each(function() {
        const slot = $(this).data('slot');
        let item = $(this).val().trim();
        let mod = $(`.plz-layer-mod[data-slot="${slot}"]`).val().trim();

        // Orphan Sweeping Logic
        if (item === '' || item.toLowerCase() === 'none') {
            item = null;
            mod  = null;
        }

        layers[slot] = item ? { item, modifier: mod || null } : null;
    });
    
    return layers;
}

/** 
 * Central entry point for binding all DNA-related DOM handlers.
 */
export function bindDNAHandlers() {
    const $overlay = $('#plz-workshop-overlay');

    // --- Pinned Clear Button Logic ---
    $overlay.on('click', '.plz-input-clear', function(e) {
        e.stopPropagation();
        const $wrapper = $(this).closest('.plz-input-wrapper');
        const $input = $wrapper.find('input, textarea');
        
        $input.val('').trigger('input');

        if ($input.hasClass('plz-layer-item')) {
            const slot = $input.data('slot');
            $(`.plz-layer-mod[data-slot="${slot}"]`).val('').trigger('input');
        }

        if ($input.attr('id') === 'plz-studio-anchor') {
            smartResize($input[0]);
        }
    });

    // --- Reactive Seed Logic (Bug 2) ---
    $overlay.on('input', '#plz-studio-seed', function() {
        const val = parseInt($(this).val(), 10);
        // Reactive UI: Disable increment if seed is -1 (random)
        $('#plz-studio-inc').prop('disabled', val === -1);
    });

    bindRosterHandlers($overlay);
    bindIdentityHandlers($overlay);
    bindSlotHandlers($overlay);
    bindEnsembleHandlers($overlay);
    bindScanningHandlers($overlay);
    bindCommitHandlers($overlay);
}