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
 */
export function injectEnginesModal() {
    if ($('#plz-engines-overlay').length) return;

    const settings = getSettings();
    $('body').append(getEnginesModalHTML(settings));

    // Tab switching
    $(document).on('click', '.plz-eng-tab', function () {
        const tab = $(this).data('tab');
        $('#plz-engines-modal .plz-tab-panel').addClass('plz-hidden');
        $('#plz-engines-modal .plz-eng-tab').removeClass('plz-active');
        $(`#plz-eng-tab-${tab}`).removeClass('plz-hidden');
        $(this).addClass('plz-active');
    });

    // Close button
    $('#plz-engines-overlay').on('click', '#plz-engines-close', function () {
        $('#plz-engines-overlay').addClass('plz-hidden');
    });

    // Overlay click closes modal (but not click inside modal)
    $('#plz-engines-overlay').on('click', function (e) {
        if ($(e.target).is('#plz-engines-overlay')) {
            $('#plz-engines-overlay').addClass('plz-hidden');
        }
    });

    // Stop propagation on modal itself
    $('#plz-engines-modal').on('click', function (e) {
        e.stopPropagation();
    });

    bindEnginesHandlers($('#plz-engines-overlay'));
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
