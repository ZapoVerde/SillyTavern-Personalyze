/**
 * @file data/default-user/extensions/personalyze/portrait.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role IO Executor (DOM)
 * @description
 * Owns the floating Visual Novel portrait container in the SillyTavern DOM.
 *
 * Injects a two-layer <img> stack into #plz-portrait-container so that
 * transitions between portraits crossfade smoothly: the incoming image fades in
 * on the top layer while the previous image remains visible on the bottom layer
 * until the animation completes.
 *
 * The container position (bottom-right / center-left) is driven by a CSS class
 * toggled by the settings panel. When SillyTavern's waifuMode is active the
 * portrait is automatically repositioned into the VN window area above the chat
 * regardless of the saved preference; it reverts when waifuMode is removed.
 *
 * @api-declaration
 * injectPortraitContainer()          — Creates and appends the portrait DOM structure (idempotent).
 * setPortrait(filename)              — Crossfades to a new portrait image.
 * clearPortrait()                    — Fades out and hides the portrait container.
 * setPortraitPosition(position)      — Stores the preferred position and applies it (waifuMode overrides).
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [_preferredPosition]
 *     external_io: [#plz-portrait-container DOM (write), CSS transitions, document.body MutationObserver]
 */

import { log } from './utils/logger.js';

const CONTAINER_ID     = 'plz-portrait-container';
const FADE_DURATION_MS = 300;

/** The user's saved position preference (used when waifuMode is off). */
let _preferredPosition = 'bottom-right';

/**
 * Applies the correct position class based on whether waifuMode is currently active.
 * If `body.waifuMode` is present the portrait moves into the VN area; otherwise
 * the stored preferred position is used.
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

    log('Portrait', 'Position applied:', posClass);
}

/** Builds the portrait HTML and appends it to the body if not already present. */
export function injectPortraitContainer() {
    if (document.getElementById(CONTAINER_ID)) return;

    const container = $(`
        <div id="${CONTAINER_ID}" class="plz-position-bottom-right" style="display:none;">
            <div class="plz-portrait-frame">
                <img class="plz-layer-back"  src="" alt="" draggable="false" />
                <img class="plz-layer-front" src="" alt="" draggable="false" style="opacity:0;" />
            </div>
        </div>
    `);

    $('body').append(container);

    // Watch for SillyTavern toggling waifuMode on/off
    const observer = new MutationObserver(() => _applyPosition());
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Apply initial position in case waifuMode is already active
    _applyPosition();

    log('Portrait', 'Container injected.');
}

/**
 * Crossfades the portrait to a new image file.
 * Promotes the front layer over the back layer once the transition completes.
 * @param {string} filename  The background-relative image path.
 */
export function setPortrait(filename) {
    if (!filename) return;

    const $container = $(`#${CONTAINER_ID}`);
    if (!$container.length) {
        injectPortraitContainer();
    }

    const cacheBuster = `?v=${Date.now()}`;
    const src = `backgrounds/${encodeURIComponent(filename)}${cacheBuster}`;

    const $back  = $container.find('.plz-layer-back');
    const $front = $container.find('.plz-layer-front');

    // Load the new image on the hidden front layer
    $front.attr('src', src).css('opacity', 0);

    // Show the container if hidden
    $container.show();

    // Fade front layer in
    $front.css('transition', `opacity ${FADE_DURATION_MS}ms ease`).css('opacity', 1);

    setTimeout(() => {
        // Promote: copy front src to back, reset front
        $back.attr('src', src);
        $front.css('transition', '').css('opacity', 0).attr('src', '');
    }, FADE_DURATION_MS + 50);

    log('Portrait', 'Set:', filename);
}

/**
 * Fades out and hides the portrait container.
 */
export function clearPortrait() {
    const $container = $(`#${CONTAINER_ID}`);
    if (!$container.length) return;

    $container.css('transition', `opacity ${FADE_DURATION_MS}ms ease`).css('opacity', 0);

    setTimeout(() => {
        $container.hide().css('opacity', '').css('transition', '');
        $container.find('.plz-layer-back').attr('src', '');
        $container.find('.plz-layer-front').attr('src', '');
    }, FADE_DURATION_MS);

    log('Portrait', 'Cleared.');
}

/**
 * Stores the user's preferred position and applies it (unless waifuMode overrides).
 * @param {'bottom-right'|'center-left'} position
 */
export function setPortraitPosition(position) {
    _preferredPosition = (position === 'center-left') ? 'center-left' : 'bottom-right';
    _applyPosition();
    log('Portrait', 'Preferred position stored:', _preferredPosition);
}
