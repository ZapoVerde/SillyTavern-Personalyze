/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaListeners.js
 * @stamp {"utc":"2026-04-12T12:10:00.000Z"}
 * @architectural-role UI Coordinator (Workshop DNA)
 * @description
 * Coordinator hub for the Workshop DNA and Studio tabs. 
 * Manages the high-level rendering of the roster and character dashboard,
 * and delegates all DOM event handling to specialized sub-modules.
 * 
 * Architectural Note on Circular Dependencies:
 * Sub-modules (like dnaCommit.js) import `getGridLayers` and `renderStudioView` 
 * from this file, while this file imports their `bind*` functions. This is safe 
 * in ES Modules because the DOM handlers are evaluated lazily (after initialization).
 * 
 * Decomposed Modules:
 * - dnaRoster.js     (Navigation & Creation)
 * - dnaIdentity.js   (Metadata & Identity)
 * - dnaSlots.js      (Wardrobe Schema)
 * - dnaEnsembles.js  (Snapshots)
 * - dnaScanning.js   (LLM Tools)
 * - dnaCommit.js     (Promotion & Generation)
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
 * Handles both permanent characters and the '__new__' ghost state.
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
 * Consumed by dnaEnsembles, dnaScanning, and dnaCommit.
 * @returns {object} The layered visual state.
 */
export function getGridLayers() {
    const layers = {
        emotion: $('#plz-layer-emotion').val().trim() || 'neutral',
        pose:    $('#plz-layer-pose').val().trim()    || 'upright',
    };
    
    $('.plz-layer-item').each(function() {
        const slot = $(this).data('slot');
        const item = $(this).val().trim();
        const mod = $(`.plz-layer-mod[data-slot="${slot}"]`).val().trim();
        layers[slot] = item ? { item, modifier: mod || null } : null;
    });
    
    return layers;
}

/** 
 * Central entry point for binding all DNA-related DOM handlers.
 * Called once during Workshop overlay injection via core.js.
 */
export function bindDNAHandlers() {
    const $overlay = $('#plz-workshop-overlay');

    // Delegate to specialized, single-purpose modules
    bindRosterHandlers($overlay);
    bindIdentityHandlers($overlay);
    bindSlotHandlers($overlay);
    bindEnsembleHandlers($overlay);
    bindScanningHandlers($overlay);
    bindCommitHandlers($overlay);
}