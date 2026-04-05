/**
 * @file data/default-user/extensions/personalyze/ui/vnPanel.js
 * @stamp {"utc":"2026-04-05T00:00:00.000Z"}
 * @architectural-role UI (Split-Screen Character View)
 * @description
 * PersonaLyze's own split-screen character display mode.
 * Completely independent of SillyTavern's built-in VN mode.
 *
 * When active, injects a character portrait panel above ST's chat window
 * (#sheld) and provides a drag handle so the user can resize the split.
 * The split ratio is persisted to settings.
 *
 * Portrait images are received via a DOM CustomEvent ('plz:portrait-set')
 * dispatched by portrait.js — no direct import coupling.
 *
 * @api-declaration
 * injectVnPanel()            — Builds the DOM (idempotent). Call once on init.
 * setVnPanelEnabled(bool)    — Activates or deactivates split-screen mode.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [_currentSplit, _dragging]
 *     external_io: [#plz-vn-panel DOM, #sheld inline styles, body class, settings.js]
 */

import { state } from '../state.js';
import { getSettings, updateSetting } from '../settings.js';
import { log } from '../utils/logger.js';

const PANEL_ID   = 'plz-vn-panel';
const HANDLE_ID  = 'plz-vn-drag-handle';
const IMG_ID     = 'plz-vn-portrait-img';
const BODY_CLASS = 'plz-vn-active';
const SPLIT_VAR  = '--plz-vn-split';

/** Clamp bounds for the split (percent of screen height). */
const MIN_SPLIT = 15;
const MAX_SPLIT = 75;

let _currentSplit = 40;
let _dragging     = false;

// ─── Injection ────────────────────────────────────────────────────────────────

/**
 * Builds and appends the VN panel elements to the document body.
 * Safe to call multiple times — exits early if already present.
 */
export function injectVnPanel() {
    if (document.getElementById(PANEL_ID)) return;

    $('body').append(`
        <div id="${PANEL_ID}">
            <div id="plz-vn-portrait-area">
                <div id="plz-vn-placeholder">
                    <i class="fa-solid fa-user-slash"></i>
                    <span id="plz-vn-placeholder-text">Enable characters to load</span>
                </div>
                <img id="${IMG_ID}" src="" alt="Character portrait" />
                <div id="plz-vn-change-hint">
                    <i class="fa-solid fa-shuffle"></i>
                    Click to change
                </div>
                <div id="${HANDLE_ID}" title="Drag to resize">
                    <div class="plz-vn-grip"></div>
                </div>
            </div>
        </div>
    `);

    // ── Portrait events from portrait.js ─────────────────────────────────────
    document.addEventListener('plz:portrait-set', ({ detail: { src } }) => {
        $('#plz-vn-placeholder').hide();
        $('#plz-vn-change-hint').css('display', 'flex');
        $(`#${IMG_ID}`).attr('src', src).css('opacity', 0).show()
            .animate({ opacity: 1 }, 300);
    });

    document.addEventListener('plz:portrait-cleared', () => {
        $(`#${IMG_ID}`).fadeOut(300, function () { $(this).attr('src', ''); });
        $('#plz-vn-change-hint').hide();
        const text = state.activeRoster.length === 0
            ? 'Enable characters to load'
            : 'Click to change character';
        $('#plz-vn-placeholder-text').text(text);
        $('#plz-vn-placeholder').delay(300).fadeIn(200);
    });

    document.addEventListener('plz:roster-changed', () => {
        const hasPortrait = !!$(`#${IMG_ID}`).attr('src');
        if (!hasPortrait) {
            const text = state.activeRoster.length === 0
                ? 'Enable characters to load'
                : 'Click to change character';
            $('#plz-vn-placeholder-text').text(text);
        }
    });

    // ── Portrait area click → character picker ────────────────────────────────
    $('#plz-vn-portrait-area').on('click', async () => {
        const { openCharPicker } = await import('./charPicker.js');
        await openCharPicker();
    });

    // ── Drag bindings ─────────────────────────────────────────────────────────
    const $handle = $(`#${HANDLE_ID}`);
    $handle.on('mousedown',  _onDragStart);
    $handle.on('touchstart', _onDragStart, { passive: false });
    // Prevent the handle tap from bubbling to the portrait-area click (char picker).
    $handle.on('click', e => e.stopPropagation());

    // ── Restore saved state ───────────────────────────────────────────────────
    const settings = getSettings();
    _currentSplit = settings.plzVnSplitPercent ?? 40;
    _applySplit(_currentSplit, false /* don't save on init */);

    if (settings.plzVnMode) {
        _activate();
    }

    log('VnPanel', 'Injected.');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Activates or deactivates the split-screen character view and persists the change.
 * @param {boolean} enabled
 */
export function setVnPanelEnabled(enabled) {
    if (enabled) {
        _activate();
    } else {
        _deactivate();
    }
    updateSetting('plzVnMode', enabled);
}

// ─── Activation ───────────────────────────────────────────────────────────────

function _activate() {
    document.body.classList.add(BODY_CLASS);
    _applySheldOverride(_currentSplit);

    // Suppress the floating portrait overlay while split-screen is active.
    $('#plz-portrait-container').hide();

    // If the floating overlay already had a portrait loaded, mirror it here.
    const existingSrc = $('#plz-portrait-container .plz-layer-back').attr('src');
    if (existingSrc) {
        $('#plz-vn-placeholder').hide();
        $(`#${IMG_ID}`).attr('src', existingSrc).show();
    }

    log('VnPanel', 'Activated. Split:', _currentSplit + '%');
}

function _deactivate() {
    document.body.classList.remove(BODY_CLASS);
    _removeSheldOverride();

    // Mirror the VN portrait back to the floating overlay and always show it.
    const src = $(`#${IMG_ID}`).attr('src');
    if (src) {
        $('#plz-portrait-container .plz-layer-back').attr('src', src);
    }
    $('#plz-portrait-container').show();

    log('VnPanel', 'Deactivated.');
}

// ─── Split Management ─────────────────────────────────────────────────────────

/**
 * Updates the CSS variable and #sheld override to reflect a new split percentage.
 * @param {number}  raw     — unclamped percentage
 * @param {boolean} [save]  — whether to persist to settings (default true)
 */
function _applySplit(raw, save = true) {
    _currentSplit = Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, raw));
    document.body.style.setProperty(SPLIT_VAR, _currentSplit);

    if (document.body.classList.contains(BODY_CLASS)) {
        _applySheldOverride(_currentSplit);
    }

    if (save) {
        updateSetting('plzVnSplitPercent', _currentSplit);
    }
}

/**
 * Pushes #sheld down to start at the split point.
 * Uses inline styles (highest specificity) to override ST's normal positioning.
 * @param {number} split — percentage of screen height for the portrait panel
 */
function _applySheldOverride(split) {
    const chatPct = (100 - split).toFixed(2);
    $('#sheld').css({
        top:       `${split.toFixed(2)}dvh`,
        height:    `${chatPct}dvh`,
        maxHeight: `${chatPct}dvh`,
    });
}

/**
 * Removes the inline style overrides so #sheld returns to its normal CSS layout.
 */
function _removeSheldOverride() {
    $('#sheld').css({ top: '', height: '', maxHeight: '' });
}

// ─── Drag Logic ───────────────────────────────────────────────────────────────

function _onDragStart(e) {
    e.preventDefault();
    _dragging = true;

    $(document).on('mousemove.plz-vn  touchmove.plz-vn',  _onDragMove);
    $(document).on('mouseup.plz-vn    touchend.plz-vn',   _onDragEnd);
}

function _onDragMove(e) {
    if (!_dragging) return;
    e.preventDefault();

    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const splitPct = (clientY / window.innerHeight) * 100;
    _applySplit(splitPct, false /* save on end, not on every move */);
}

function _onDragEnd() {
    if (!_dragging) return;
    _dragging = false;

    $(document).off('mousemove.plz-vn touchmove.plz-vn mouseup.plz-vn touchend.plz-vn');

    // Persist the final position
    updateSetting('plzVnSplitPercent', _currentSplit);
    log('VnPanel', `Split saved: ${_currentSplit.toFixed(1)}%`);
}
