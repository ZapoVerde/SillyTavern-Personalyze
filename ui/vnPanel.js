/**
 * @file data/default-user/extensions/personalyze/ui/vnPanel.js
 * @stamp {"utc":"2026-04-14T13:50:00.000Z"}
 * @architectural-role UI (Split-Screen Character View)
 * @description
 * PersonaLyze's split-screen character display mode.
 * 
 * Acts as a thin wrapper for the roster rendering engine. Responsible for:
 * 1. Injecting the split-screen shell (#plz-vn-panel).
 * 2. Managing the viewport split ratio (--plz-vn-split).
 * 3. Applying height overrides to SillyTavern's chat container (#sheld).
 * 4. Triggering roster renders when the panel is active.
 *
 * @api-declaration
 * injectVnPanel()            — Builds the DOM (idempotent).
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
import { renderRoster } from './roster/renderer.js';
import { log } from '../utils/logger.js';

const PANEL_ID    = 'plz-vn-panel';
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

/**
 * Triggers a roster refresh if the split-screen panel is currently active.
 */
function _syncVisibility() {
    if (document.body.classList.contains(BODY_CLASS)) {
        renderRoster(`#${PANEL_ID}`);
    }
}

/**
 * Builds and appends the VN panel elements to the document body.
 */
export function injectVnPanel() {
    if (document.getElementById(PANEL_ID)) return;

    $('body').append(`
        <div id="${PANEL_ID}" class="plz-roster-grid"></div>
        <button id="${CYCLE_ID}" title="Cycle portrait size" type="button">½</button>
    `);

    // ── Global Events ────────────────────────────────────────────────────────
    document.addEventListener('plz:roster-changed', () => _syncVisibility());
    document.addEventListener('plz:roster-render-req', () => _syncVisibility());

    // ── Cycle button ──────────────────────────────────────────────────────────
    $(`#${CYCLE_ID}`).on('click', () => {
        _splitIndex = (_splitIndex + 1) % SPLIT_PRESETS.length;
        _applySplit();
    });

    // ── Restore saved state ───────────────────────────────────────────────────
    const settings = getSettings();
    const savedPct = settings.plzVnSplitPercent;
    if (savedPct != null) {
        _splitIndex = SPLIT_PRESETS.reduce((best, p, i) =>
            Math.abs(p.pct - savedPct) < Math.abs(SPLIT_PRESETS[best].pct - savedPct) ? i : best
        , 0);
    }
    _applySplit(false);

    if (settings.plzVnMode) {
        _activate();
    }

    log('VnPanel', 'Split-screen shell injected.');
}

/**
 * Activates or deactivates the split-screen character view.
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

// ─── Activation ──────────────────────────────────────────────────────────────

function _activate() {
    document.body.classList.add(BODY_CLASS);
    _applySheldOverride(SPLIT_PRESETS[_splitIndex].pct);
    $(`#${CYCLE_ID}`).show();
    _syncVisibility();
}

function _deactivate() {
    document.body.classList.remove(BODY_CLASS);
    _removeSheldOverride();
    $(`#${CYCLE_ID}`).hide();
    
    // Notify the floating portrait wrapper that it can take back control
    document.dispatchEvent(new CustomEvent('plz:roster-changed'));
}

// ─── Split Management ─────────────────────────────────────────────────────────

function _applySplit(save = true) {
    const { pct, label } = SPLIT_PRESETS[_splitIndex];
    document.body.style.setProperty(SPLIT_VAR, pct);
    $(`#${CYCLE_ID}`).text(label);

    if (document.body.classList.contains(BODY_CLASS)) {
        _applySheldOverride(pct);
    }

    if (save) {
        updateSetting('plzVnSplitPercent', pct);
    }
}

function _applySheldOverride(split) {
    const chatPct = (100 - split).toFixed(2);
    $('#sheld').css({
        top:       `${split.toFixed(2)}dvh`,
        height:    `${chatPct}dvh`,
        maxHeight: `${chatPct}dvh`,
    });
}

function _removeSheldOverride() {
    $('#sheld').css({ top: '', height: '', maxHeight: '' });
}