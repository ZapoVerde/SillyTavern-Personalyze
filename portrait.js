/**
 * @file data/default-user/extensions/personalyze/portrait.js
 * @stamp {"utc":"2026-04-15T10:20:00.000Z"}
 * @architectural-role IO Executor (DOM)
 * @description
 * Manages the floating Multi-Character roster container in the SillyTavern DOM.
 * 
 * Updated for Asset Management:
 * 1. Removed obsolete spatial positioning and quadrant logic.
 * 2. Removed legacy Waifu Mode overrides.
 * 3. Roster now lives in a stable container above/over the chat.
 *
 * @api-declaration
 * injectPortraitContainer()          — Creates and appends the grid shell.
 * setPortrait(filename)              — (Legacy) Triggers a roster refresh.
 * clearPortrait()                    — (Legacy) Triggers a roster refresh.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [#plz-portrait-container DOM]
 */

import { renderRoster } from './ui/roster/renderer.js';
import { log } from './utils/logger.js';

const CONTAINER_ID = 'plz-portrait-container';

/**
 * Syncs the container visibility with the active display mode.
 * Suppresses the floating overlay if the split-screen VN mode is active.
 */
function _syncVisibility() {
    const $container = $(`#${CONTAINER_ID}`);
    if (!$container.length) return;

    if (document.body.classList.contains('plz-vn-active')) {
        $container.hide();
    } else {
        $container.show();
        renderRoster(`#${CONTAINER_ID}`);
    }
}

/**
 * Idempotently injects the roster grid shell into the body.
 */
export function injectPortraitContainer() {
    if (document.getElementById(CONTAINER_ID)) return;

    // Stable container injection without quadrant classes
    const container = $(`<div id="${CONTAINER_ID}" class="plz-roster-grid"></div>`);
    $('body').append(container);

    // Global UI refresh listeners
    document.addEventListener('plz:roster-changed', () => _syncVisibility());
    document.addEventListener('plz:roster-render-req', () => _syncVisibility());

    _syncVisibility();

    log('Portrait', 'Floating roster container initialized.');
}

/**
 * Legacy API support. 
 * Replaced by event-driven roster updates.
 */
export function setPortrait(filename) {
    document.dispatchEvent(new CustomEvent('plz:roster-changed'));
}

/**
 * Legacy API support.
 */
export function clearPortrait() {
    document.dispatchEvent(new CustomEvent('plz:roster-changed'));
}