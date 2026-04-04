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
 * toggled by the settings panel.
 *
 * @api-declaration
 * injectPortraitContainer()          — Creates and appends the portrait DOM structure (idempotent).
 * setPortrait(filename)              — Crossfades to a new portrait image.
 * clearPortrait()                    — Fades out and hides the portrait container.
 * setPortraitPosition(position)      — Switches the container's layout position class.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [#plz-portrait-container DOM (write), CSS transitions]
 */

import { log } from './utils/logger.js';

const CONTAINER_ID     = 'plz-portrait-container';
const FADE_DURATION_MS = 300;

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
 * Switches the portrait container's CSS position class.
 * @param {'bottom-right'|'center-left'} position
 */
export function setPortraitPosition(position) {
    const $container = $(`#${CONTAINER_ID}`);
    if (!$container.length) return;

    $container
        .removeClass('plz-position-bottom-right plz-position-center-left')
        .addClass(position === 'center-left' ? 'plz-position-center-left' : 'plz-position-bottom-right');

    log('Portrait', 'Position set:', position);
}
