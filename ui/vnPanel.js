/**
 * @file data/default-user/extensions/personalyze/ui/vnPanel.js
 * @stamp {"utc":"2026-04-05T00:00:00.000Z"}
 * @architectural-role UI (Split-Screen Character View)
 * @description
 * PersonaLyze's own split-screen character display mode.
 * Completely independent of SillyTavern's built-in VN mode.
 *
 * When active, injects a character portrait panel above ST's chat window
 * (#sheld). A cycle button on the right edge steps through preset split sizes.
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
 *     state_ownership: [_splitIndex]
 *     external_io: [#plz-vn-panel DOM, #sheld inline styles, body class, settings.js]
 */

import { state } from '../state.js';
import { getSettings, updateSetting } from '../settings.js';
import { log } from '../utils/logger.js';

const PANEL_ID    = 'plz-vn-panel';
const IMG_ID      = 'plz-vn-portrait-img';
const CYCLE_ID    = 'plz-vn-cycle-btn';
const BODY_CLASS  = 'plz-vn-active';
const SPLIT_VAR   = '--plz-vn-split';

/** Preset split sizes (% of viewport height) cycling through 2/3 → 1/2 → 1/3 → 1/4 → 1/5. */
const SPLIT_PRESETS = [
    { pct: 66.67, label: '⅔' },
    { pct: 50,    label: '½' },
    { pct: 33.33, label: '⅓' },
    { pct: 25,    label: '¼' },
    { pct: 20,    label: '⅕' },
];

let _splitIndex = 1; // default: ½

// ─── Status Bar ───────────────────────────────────────────────────────────────

const STATUS_PCT   = { pending: 15, starting: 35, processing: 65, retry: 65, success: 100, failed: 100 };
const STATUS_LABEL = { generating: 'generating…', pending: 'pending…', starting: 'starting…', processing: 'rendering…', retry: 'retrying…', success: 'done', failed: 'failed' };

function _updateStatusBar(selector, { status, poll, max, error }) {
    const $bar  = $(selector);
    const $fill = $bar.find('.plz-portrait-status-fill');
    const $label = $bar.find('.plz-portrait-status-label');

    $fill.removeClass('plz-status-indeterminate plz-status-failed');

    if (status === 'generating') {
        $fill.css('width', '').addClass('plz-status-indeterminate');
    } else if (status === 'failed') {
        $fill.css('width', '').addClass('plz-status-failed');
        $label.text(error ? error.slice(0, 50) : 'failed');
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
                <div id="plz-vn-portrait-status" class="plz-portrait-status" style="display:none;">
                    <div class="plz-portrait-status-track">
                        <div class="plz-portrait-status-fill"></div>
                    </div>
                    <span class="plz-portrait-status-label"></span>
                </div>
            </div>
            <button id="${CYCLE_ID}" title="Cycle portrait size" type="button">½</button>
        </div>
    `);

    // ── Portrait events from portrait.js ─────────────────────────────────────
    document.addEventListener('plz:portrait-set', ({ detail: { src } }) => {
        $('#plz-vn-placeholder').hide();
        $('#plz-vn-change-hint').css('display', 'flex');
        $(`#${IMG_ID}`).attr('src', src).css('opacity', 0).show()
            .animate({ opacity: 1 }, 300);
        $('#plz-vn-portrait-status').fadeOut(200);
    });

    document.addEventListener('plz:portrait-status', ({ detail }) => {
        _updateStatusBar('#plz-vn-portrait-status', detail);
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

    // ── Cycle button ──────────────────────────────────────────────────────────
    $(`#${CYCLE_ID}`).on('click', () => {
        _splitIndex = (_splitIndex + 1) % SPLIT_PRESETS.length;
        _applySplit();
    });

    // ── Restore saved state ───────────────────────────────────────────────────
    const settings = getSettings();
    const savedPct = settings.plzVnSplitPercent;
    if (savedPct != null) {
        // Find the closest preset to the saved value.
        _splitIndex = SPLIT_PRESETS.reduce((best, p, i) =>
            Math.abs(p.pct - savedPct) < Math.abs(SPLIT_PRESETS[best].pct - savedPct) ? i : best
        , 0);
    }
    _applySplit(false /* don't save on init */);

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
    _applySheldOverride(SPLIT_PRESETS[_splitIndex].pct);

    // Suppress the floating portrait overlay while split-screen is active.
    $('#plz-portrait-container').hide();

    // If the floating overlay already had a portrait loaded, mirror it here.
    const existingSrc = $('#plz-portrait-container .plz-layer-back').attr('src');
    if (existingSrc) {
        $('#plz-vn-placeholder').hide();
        $(`#${IMG_ID}`).attr('src', existingSrc).show();
    }

    log('VnPanel', 'Activated. Split:', SPLIT_PRESETS[_splitIndex].label);
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
 * Applies the current preset split, updates the CSS variable, #sheld, and button label.
 * @param {boolean} [save=true]
 */
function _applySplit(save = true) {
    const { pct, label } = SPLIT_PRESETS[_splitIndex];
    document.body.style.setProperty(SPLIT_VAR, pct);
    $(`#${CYCLE_ID}`).text(label);

    if (document.body.classList.contains(BODY_CLASS)) {
        _applySheldOverride(pct);
    }

    if (save) {
        updateSetting('plzVnSplitPercent', pct);
        log('VnPanel', `Split set: ${label} (${pct.toFixed(1)}%)`);
    }
}

/**
 * Pushes #sheld down to start at the split point.
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
