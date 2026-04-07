/**
 * @file data/default-user/extensions/personalyze/ui/enginesModal.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role UI Orchestrator (Engines Modal)
 * @description
 * Manages the lifecycle of the Image Engines configuration modal. 
 * Handles the two-tab layout (Pollinations/Hugging Face) and the internal
 * mode toggle for Hugging Face (Router vs Spaces).
 *
 * @api-declaration
 * injectEnginesModal() — idempotent, injects modal HTML into DOM
 * openEnginesModal() — opens the modal, refreshes UI
 *
 * @contract
 *   assertions:
 *     purity: Stateful UI Shell
 *     state_ownership: []
 *     external_io: [jQuery DOM]
 */

import { getSettings, updateSetting } from '../settings.js';
import { getEnginesModalHTML } from './engines/templates.js';
import { bindEnginesHandlers, refreshEnginesUI } from './engines/listeners.js';

// ─── Mode Switching Logic ───────────────────────────────────────────────────

/**
 * Updates the Hugging Face mode UI (Router vs Space).
 * @param {jQuery} $overlay 
 * @param {'router'|'space'} mode 
 */
function switchHFMode($overlay, mode) {
    // 1. Update buttons
    $overlay.find('.plz-eng-mode-btn').removeClass('plz-active');
    $overlay.find(`.plz-eng-mode-btn[data-mode="${mode}"]`).addClass('plz-active');

    // 2. Update content visibility
    $overlay.find('#plz-eng-mode-router-content, #plz-eng-mode-space-content').addClass('plz-hidden');
    $overlay.find(`#plz-eng-mode-${mode}-content`).removeClass('plz-hidden');
    
    // 3. Persist setting
    updateSetting('hfEngine', mode);
}

// ─── Injection ────────────────────────────────────────────────────────────────

/**
 * Idempotently injects the engines modal into the DOM and wires all handlers.
 */
export function injectEnginesModal() {
    if ($('#plz-engines-overlay').length) return;

    const settings = getSettings();
    const $overlay = $(getEnginesModalHTML(settings));
    $('body').append($overlay);

    // 1. Main Tab Switching
    $overlay.on('click', '.plz-tab-btn', function (e) {
        e.stopPropagation();
        const tab = $(this).data('tab');
        
        $overlay.find('.plz-tab-btn').removeClass('plz-active');
        $(this).addClass('plz-active');

        $overlay.find('.plz-tab-panel').addClass('plz-hidden');
        $overlay.find(`#plz-eng-tab-${tab}`).removeClass('plz-hidden');
    });

    // 2. HF Internal Mode Switching
    $overlay.on('click', '.plz-eng-mode-btn', function (e) {
        e.stopPropagation();
        const mode = $(this).data('mode');
        switchHFMode($overlay, mode);
    });

    // 3. Close button
    $overlay.on('click', '#plz-engines-close', function (e) {
        e.stopPropagation();
        $overlay.addClass('plz-hidden');
    });

    // 4. Backdrop click (idempotent modal pattern)
    $overlay.on('click', function (e) {
        if (e.target === this) {
            $(this).addClass('plz-hidden');
        }
    });

    // 5. Wire up logic (ping, test, save) from listeners.js
    bindEnginesHandlers($overlay);
}

// ─── Open ─────────────────────────────────────────────────────────────────────

/**
 * Opens the engines modal, injecting if necessary, and refreshes UI state.
 */
export function openEnginesModal() {
    injectEnginesModal();
    const $overlay = $('#plz-engines-overlay');
    const s = getSettings();

    $overlay.removeClass('plz-hidden');
    
    // Initial sync of the HF Mode UI
    switchHFMode($overlay, s.hfEngine || 'router');

    // Refresh model dropdowns and key statuses via listeners.js
    refreshEnginesUI();

    // Default to Pollinations tab on open
    $overlay.find('.plz-tab-btn[data-tab="pollinations"]').trigger('click');
}