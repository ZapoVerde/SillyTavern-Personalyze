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
    // 1. Exit if already in DOM
    if ($('#plz-engines-overlay').length) return;

    const settings = getSettings();
    
    // 2. Create the overlay as a jQuery object and append to body
    const $overlay = $(getEnginesModalHTML(settings));
    $('body').append($overlay);

    // 3. Tab switching (Local listener)
    // Moving this here ensures that even if propagation is stopped elsewhere,
    // this specific container still processes the tab change.
    $overlay.on('click', '.plz-eng-tab', function (e) {
        // e.stopPropagation(); // Optional: keeps the click from hitting ST's UI
        const tab = $(this).data('tab');
        
        // Hide all panels, deactivate all tab buttons
        $overlay.find('.plz-tab-panel').addClass('plz-hidden');
        $overlay.find('.plz-eng-tab').removeClass('plz-active');
        
        // Show target panel, activate clicked button
        $overlay.find(`#plz-eng-tab-${tab}`).removeClass('plz-hidden');
        $(this).addClass('plz-active');
    });

    // 4. Close button handler
    $overlay.on('click', '#plz-engines-close', function (e) {
        e.stopPropagation();
        $overlay.addClass('plz-hidden');
    });

    // 5. Backdrop click handler
    // Only closes if the user clicks the dark background, not the modal content.
    $overlay.on('click', function (e) {
        if (e.target === this) {
            $overlay.addClass('plz-hidden');
        }
    });

    // 6. Bind the internal engine logic (key saves, pings, etc.)
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
