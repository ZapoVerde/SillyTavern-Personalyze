/**
 * @file data/default-user/extensions/personalyze/ui/enginesModal.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role UI Orchestrator (Engines Modal)
 * @description
 * Manages the lifecycle of the Image Engines configuration modal.
 * Handles injection, open/close, and tab switching.
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

import { getSettings } from '../settings.js';
import { getEnginesModalHTML } from './engines/templates.js';
import { bindEnginesHandlers, refreshEnginesUI, updateEngineKeyStatuses } from './engines/listeners.js';

// ─── Injection ────────────────────────────────────────────────────────────────

/**
 * Idempotently injects the engines modal into the DOM and wires all handlers.
 * Optimized to prevent event-bubbling conflicts that cause "greyed out" states.
 */
export function injectEnginesModal() {
    if ($('#plz-engines-overlay').length) return;

    const settings = getSettings();
    const $overlay = $(getEnginesModalHTML(settings));
    $('body').append($overlay);

    // Tab switching (Identical logic to Workshop)
    $overlay.on('click', '.plz-tab-btn', function (e) {
        e.stopPropagation();
        const tab = $(this).data('tab');
        
        // Update Buttons
        $overlay.find('.plz-tab-btn').removeClass('plz-active');
        $(this).addClass('plz-active');

        // Update Panels
        $overlay.find('.plz-tab-panel').addClass('plz-hidden');
        $overlay.find(`#plz-eng-tab-${tab}`).removeClass('plz-hidden');
    });

    // Close buttons
    $overlay.on('click', '#plz-engines-close', () => $overlay.addClass('plz-hidden'));
    $overlay.on('click', function (e) {
        if (e.target === this) $(this).addClass('plz-hidden');
    });

    bindEnginesHandlers($overlay);
}
// ─── Open ─────────────────────────────────────────────────────────────────────

/**
 * Opens the engines modal, injecting if necessary, and refreshes UI state.
 */
export function openEnginesModal() {
    injectEnginesModal();
    $('#plz-engines-overlay').removeClass('plz-hidden');
    refreshEnginesUI();
    // Activate first tab
    $('.plz-eng-tab').first().trigger('click');
}
