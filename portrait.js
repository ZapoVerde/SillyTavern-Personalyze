/**
 * @file data/default-user/extensions/personalyze/portrait.js
 * @stamp {"utc":"2026-04-14T13:40:00.000Z"}
 * @architectural-role IO Executor (DOM)
 * @description
 * Manages the floating Multi-Character roster container in the SillyTavern DOM.
 * 
 * Acts as a thin wrapper for the roster rendering engine. Responsible for:
 * 1. Injecting the flexbox grid shell (#plz-portrait-container).
 * 2. Managing spatial positioning (bottom-right vs center-left).
 * 3. Handling SillyTavern 'waifuMode' overrides.
 * 4. Suppressing the floating overlay when the VN Panel (split-screen) is active.
 *
 * @api-declaration
 * injectPortraitContainer()          — Creates and appends the grid shell.
 * setPortraitPosition(position)      — Stores and applies position preferences.
 * setPortrait(filename)              — (Legacy) Triggers a roster refresh.
 * clearPortrait()                    — (Legacy) Triggers a roster refresh.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [_preferredPosition]
 *     external_io: [#plz-portrait-container DOM, document.body MutationObserver]
 */

import { renderRoster } from './ui/roster/renderer.js';
import { log } from './utils/logger.js';

const CONTAINER_ID = 'plz-portrait-container';

/** The user's saved position preference (used when waifuMode is off). */
let _preferredPosition = 'bottom-right';

/**
 * Applies spatial positioning classes.
 * Switches to a 'waifu' specific position if ST's waifuMode is detected.
 */
function _applyPosition() {
    const $container = $(`#${CONTAINER_ID}`);
    if (!$container.length) return;

    const isWaifu = document.body.classList.contains('waifuMode');
    const posClass = isWaifu
        ? 'plz-position-waifu'
        : `plz-position-${_preferredPosition}`;

    $container
        .removeClass('plz-position-bottom-right plz-position-center-left plz-position-waifu')
        .addClass(posClass);
}

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

    const container = $(`<div id="${CONTAINER_ID}" class="plz-roster-grid plz-position-bottom-right"></div>`);
    $('body').append(container);

    // Watch for SillyTavern toggling waifuMode on/off
    const observer = new MutationObserver(() => _applyPosition());
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Global UI refresh listeners
    document.addEventListener('plz:roster-changed', () => _syncVisibility());
    document.addEventListener('plz:roster-render-req', () => _syncVisibility());

    _applyPosition();
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

/**
 * Updates the preferred screen quadrant for the floating roster.
 * @param {'bottom-right'|'center-left'} position
 */
export function setPortraitPosition(position) {
    _preferredPosition = (position === 'center-left') ? 'center-left' : 'bottom-right';
    _applyPosition();
}