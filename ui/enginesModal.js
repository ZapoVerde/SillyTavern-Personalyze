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
 * 3. Hugging Face (Proxy Router / Proxy Spaces)
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

import { getSettings, updateSetting } from '../settings.js';
import { getEnginesModalHTML } from './engines/templates.js';
import { bindEnginesHandlers, refreshEnginesUI } from './engines/listeners.js';

// ─── Mode Switching Logic ───────────────────────────────────────────────────

/**
 * Updates the Hugging Face internal mode UI (Router vs Space).
 * This only affects the content inside the Hugging Face tab.
 * @param {jQuery} $overlay 
 * @param {'router'|'space'} mode 
 */
function switchHFMode($overlay, mode) {
    // 1. Update mode buttons
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

    // 1. Main Tab Switching (Pollinations / Fal / Hugging Face)
    $overlay.on('click', '.plz-tab-btn', function (e) {
        e.stopPropagation();
        const tab = $(this).data('tab');
        
        $overlay.find('.plz-tab-btn').removeClass('plz-active');
        $(this).addClass('plz-active');

        $overlay.find('.plz-tab-panel').addClass('plz-hidden');
        $overlay.find(`#plz-eng-tab-${tab}`).removeClass('plz-hidden');
    });

    // 2. HF Internal Mode Switching (Router vs Space)
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

    // 4. Backdrop click (close modal if clicking outside the modal content)
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
    
    // Initial sync of the HF Mode UI (Router vs Space)
    switchHFMode($overlay, s.hfEngine || 'router');

    // Refresh model dropdowns, key statuses, and availability toggles via listeners.js
    refreshEnginesUI();

    // Default to Pollinations tab on every fresh open to ensure a clean state
    $overlay.find('.plz-tab-btn[data-tab="pollinations"]').trigger('click');
}