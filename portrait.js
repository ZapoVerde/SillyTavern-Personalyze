/**
 * @file data/default-user/extensions/personalyze/portrait.js
 * @stamp {"utc":"2026-04-05T00:00:00.000Z"}
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

import { state } from './state.js';
import { log } from './utils/logger.js';
import { PLZ_IMAGE_FOLDER } from './imageCache.js';

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

const STATUS_PCT = { pending: 15, starting: 35, processing: 65, retry: 65, removing_bg: 85, success: 100, failed: 100 };
const STATUS_LABEL = { generating: 'generating…', pending: 'pending…', starting: 'starting…', processing: 'rendering…', retry: 'retrying…', removing_bg: 'removing bg…', success: 'done', failed: 'failed' };

/**
 * Updates the portrait status bar element.
 * @param {string} selector  CSS selector for the .plz-portrait-status element.
 * @param {{ status: string, poll?: number, max?: number, error?: string }} detail
 */
function _updateStatusBar(selector, { status, poll, max, error }) {
    const $bar   = $(selector);
    const $fill  = $bar.find('.plz-portrait-status-fill');
    const $label = $bar.find('.plz-portrait-status-label');

    $fill.removeClass('plz-status-indeterminate plz-status-failed');

    if (status === 'generating') {
        $fill.css('width', '').addClass('plz-status-indeterminate');
    } else if (status === 'failed') {
        $fill.css('width', '').addClass('plz-status-failed');
        const msg = error ? error.slice(0, 50) : 'failed';
        $label.text(msg);
        $bar.show();
        setTimeout(() => $bar.fadeOut(400), 4000);
        return;
    } else {
        $fill.css('width', `${STATUS_PCT[status] ?? 20}%`);
    }

    const pollSuffix = (poll != null && max != null) ? ` (${poll}/${max})` : '';
    $label.text((STATUS_LABEL[status] ?? status) + pollSuffix);
    $bar.show();
}

/** Builds the portrait HTML and appends it to the body if not already present. */
export function injectPortraitContainer() {
    if (document.getElementById(CONTAINER_ID)) return;

    const container = $(`
        <div id="${CONTAINER_ID}" class="plz-position-bottom-right">
            <div class="plz-portrait-frame">
                <img class="plz-layer-back"  src="" alt="" draggable="false" />
                <img class="plz-layer-front" src="" alt="" draggable="false" style="opacity:0;" />
                <div id="plz-portrait-empty-hint">
                    <i class="fa-solid fa-user-slash"></i>
                    <span>Enable characters to load</span>
                </div>
                <div id="plz-portrait-change-hint">
                    <i class="fa-solid fa-shuffle"></i>
                    Click to change
                </div>
                <div id="plz-portrait-status" class="plz-portrait-status" style="display:none;">
                    <div class="plz-portrait-status-track">
                        <div class="plz-portrait-status-fill"></div>
                    </div>
                    <span class="plz-portrait-status-label"></span>
                </div>
            </div>
        </div>
    `);

    $('body').append(container);

    // Open the character picker on click
    container.on('click', async () => {
        const { openCharPicker } = await import('./ui/charPicker.js');
        await openCharPicker();
    });

    // Update hint text when the roster changes
    document.addEventListener('plz:roster-changed', _refreshEmptyHint);

    // Portrait generation status bar
    document.addEventListener('plz:portrait-status', ({ detail }) => {
        _updateStatusBar('#plz-portrait-status', detail);
    });
    document.addEventListener('plz:portrait-set', () => {
        $('#plz-portrait-status').fadeOut(200);
    });

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
 * When PLZ split-screen mode is active (body.plz-vn-active) the floating
 * overlay is suppressed — vnPanel.js handles display via the plz:portrait-set event.
 * @param {string} filename  The background-relative image path.
 */
export function setPortrait(filename) {
    if (!filename) return;

    const cacheBuster = `?v=${Date.now()}`;
    const src = `user/images/${PLZ_IMAGE_FOLDER}/${encodeURIComponent(filename)}${cacheBuster}`;

    // Always notify the VN panel regardless of which display mode is active.
    document.dispatchEvent(new CustomEvent('plz:portrait-set', { detail: { src } }));

    // In PLZ split-screen mode the floating overlay is not used.
    if (document.body.classList.contains('plz-vn-active')) {
        log('Portrait', 'Split-screen active — floating overlay skipped.');
        return;
    }

    const $container = $(`#${CONTAINER_ID}`);
    if (!$container.length) {
        injectPortraitContainer();
    }

    const $back  = $container.find('.plz-layer-back');
    const $front = $container.find('.plz-layer-front');

    // Load the new image on the hidden front layer
    $front.attr('src', src).css('opacity', 0);

    // Show the container and switch to the "click to change" hint
    $container.show();
    $('#plz-portrait-empty-hint').hide();
    $('#plz-portrait-change-hint').css('display', 'flex');

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
 * When PLZ split-screen mode is active, only notifies the VN panel.
 */
export function clearPortrait() {
    // Notify VN panel.
    document.dispatchEvent(new CustomEvent('plz:portrait-cleared'));

    // In PLZ split-screen mode the floating overlay is not used.
    if (document.body.classList.contains('plz-vn-active')) {
        log('Portrait', 'Split-screen active — floating overlay clear skipped.');
        return;
    }

    const $container = $(`#${CONTAINER_ID}`);
    if (!$container.length) return;

    // Fade out the image layers but keep the container visible — show empty hint instead.
    $container.find('.plz-layer-back, .plz-layer-front')
        .css('transition', `opacity ${FADE_DURATION_MS}ms ease`)
        .css('opacity', 0);

    setTimeout(() => {
        $container.find('.plz-layer-back, .plz-layer-front')
            .css('transition', '').css('opacity', '').attr('src', '');
        $('#plz-portrait-change-hint').hide();
        _refreshEmptyHint();
        $('#plz-portrait-empty-hint').show();
    }, FADE_DURATION_MS);

    log('Portrait', 'Cleared.');
}

/**
 * Updates the empty-hint text to reflect the current roster state.
 * Called on clearPortrait and whenever the roster changes.
 */
function _refreshEmptyHint() {
    const text = state.activeRoster.length === 0
        ? 'Enable characters to load'
        : 'Click to change character';
    $('#plz-portrait-empty-hint span').text(text);
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
