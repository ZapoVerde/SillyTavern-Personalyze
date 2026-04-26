/**
 * @file data/default-user/extensions/personalyze/ui/enginesModal.js
 * @stamp {"utc":"2026-04-07T00:00:00.000Z"}
 * @architectural-role UI Orchestrator (Engines Modal)
 * @description
 * Manages the lifecycle and navigation of the Image Engines configuration modal.
 * 
 * Supports the Multi-Engine architecture with a three-tab layout:
 * 1. Pollinations (Direct API)
 * 2. Fal AI (Proxy API)
 * 3. PiAPI (Proxy API)
 *
 * @api-declaration
 * injectEnginesModal() — idempotent, injects modal HTML into DOM
 * openEnginesModal() — opens the modal, refreshes UI and tab state
 *
 * @contract
 *   assertions:
 *     purity: Stateful UI Shell
 *     state_ownership: []
 *     external_io: [jQuery DOM, templates.js, listeners.js, settings.js]
 */

import { getSettings } from '../settings.js';
import { getEnginesModalHTML } from './engines/templates.js';
import { bindEnginesHandlers, refreshEnginesUI } from './engines/listeners.js';

// ─── Injection ────────────────────────────────────────────────────────────────

/**
 * Idempotently injects the engines modal into the DOM and wires all handlers.
 */
export function injectEnginesModal() {
    if ($('#plz-engines-overlay').length) return;

    const settings = getSettings();
    const $overlay = $(getEnginesModalHTML(settings));
    $('body').append($overlay);

    // 1. Main Tab Switching (Pollinations / Fal / PiAPI)
    $overlay.on('click', '.plz-tab-btn', function (e) {
        e.stopPropagation();
        const tab = $(this).data('tab');
        
        $overlay.find('.plz-tab-btn').removeClass('plz-active');
        $(this).addClass('plz-active');

        $overlay.find('.plz-tab-panel').addClass('plz-hidden');
        $overlay.find(`#plz-eng-tab-${tab}`).removeClass('plz-hidden');

        $overlay.find('#plz-runware-upload-container').toggleClass('plz-hidden', tab !== 'runware');
    });

    // 2. Close button
    $overlay.on('click', '#plz-engines-close', function (e) {
        e.stopPropagation();
        $overlay.addClass('plz-hidden');
    });

    // 4. Backdrop click (close modal if clicking outside the modal content)
    $overlay.on('click', function (e) {
        if (e.target === this) {
            $(this).addClass('plz-hidden');
        }
    });

    // 4. Wire up logic (ping, test, save) from listeners.js
    bindEnginesHandlers($overlay);
}

// ─── Open ─────────────────────────────────────────────────────────────────────

/**
 * Opens the engines modal, injecting if necessary, and refreshes UI state.
 */
export function openEnginesModal() {
    injectEnginesModal();
    const $overlay = $('#plz-engines-overlay');

    $overlay.removeClass('plz-hidden');

    // Refresh model dropdowns, key statuses, and availability toggles via listeners.js
    refreshEnginesUI();

    // Default to Pollinations tab on every fresh open to ensure a clean state
    $overlay.find('.plz-tab-btn[data-tab="pollinations"]').trigger('click');
}