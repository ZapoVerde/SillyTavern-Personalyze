/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaListeners.js
 * @stamp {"utc":"2026-04-14T21:20:00.000Z"}
 * @architectural-role UI Coordinator (Workshop DNA)
 * @description
 * Coordinator hub for the Workshop DNA and Studio tabs. 
 * 
 * Updated for the Smart Wardrobe:
 * 1. Fixed Orphan Sweeping to explicitly check for empty strings.
 * 2. Added delegated clear button logic for the (x) pinned overlays.
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
 *     external_io: [dnaTemplates.js, specialized sub-modules, DOM]
 */

import { state } from '../../state.js';
import { getSettings, getMetaSettings } from '../../settings.js';
import { getDnaRosterHTML, getStudioHTML, getStudioEmptyHTML } from './dnaTemplates.js';
import { smartResize } from '../../utils/dom.js';

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

    const layers = state.characterChain[id]?.layers || state.activeLayers;
    const s = getSettings();
    const meta = getMetaSettings();
    
    const enabledEngines = {
        engineEnablePollinations: s.engineEnablePollinations,
        engineEnableFal:          s.engineEnableFal,
        engineEnablePiAPI:        s.engineEnablePiAPI,
    };
    
    $panel.html(getStudioHTML(id, char, layers, enabledEngines, meta.styleLibrary ?? {}, meta.defaultStyleName ?? ''));

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

        // Orphan Sweeping Logic (Fixed: explicit check for empty string/None)
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
        
        // Clear the primary target
        $input.val('').trigger('input');

        // Cascade Clear: If an item is cleared, clear its modifier too
        if ($input.hasClass('plz-layer-item')) {
            const slot = $input.data('slot');
            $(`.plz-layer-mod[data-slot="${slot}"]`).val('').trigger('input');
        }

        // Special case for identity anchor (resize)
        if ($input.attr('id') === 'plz-studio-anchor') {
            smartResize($input[0]);
        }
    });

    // Delegate to specialized, single-purpose modules
    bindRosterHandlers($overlay);
    bindIdentityHandlers($overlay);
    bindSlotHandlers($overlay);
    bindEnsembleHandlers($overlay);
    bindScanningHandlers($overlay);
    bindCommitHandlers($overlay);
}