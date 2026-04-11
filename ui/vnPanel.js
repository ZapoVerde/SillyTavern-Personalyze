/**
 * @file data/default-user/extensions/personalyze/ui/vnPanel.js
 * @stamp {"utc":"2026-04-11T14:30:00.000Z"}
 * @architectural-role UI (Split-Screen Character View)
 * @description
 * PersonaLyze's split-screen character display mode.
 *
 * Two-zone layout:
 *   LEFT  — non-focus cards, centered, dynamically overlapping so all fit
 *   RIGHT — focus card, always full width, controls always visible
 *
 * Clicking a left-group card promotes it to the focus slot.
 * Overlap in the left group is computed from available width so cards never
 * compress — they overlap more the tighter the space.
 *
 * @api-declaration
 * injectVnPanel()            — Builds the DOM (idempotent).
 * setVnPanelEnabled(bool)    — Activates or deactivates split-screen mode.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [_splitIndex, _focusCardId]
 *     external_io: [#plz-vn-panel DOM, #sheld inline styles, body class, settings.js]
 */

import { state } from '../state.js';
import { getSettings, updateSetting } from '../settings.js';
import { getPortraitCardHTML, getAddCardHTML } from './roster/templates.js';
import { log } from '../utils/logger.js';

const PANEL_ID   = 'plz-vn-panel';
const CYCLE_ID   = 'plz-vn-cycle-btn';
const BODY_CLASS = 'plz-vn-active';
const SPLIT_VAR  = '--plz-vn-split';

/** Preset split sizes (% of viewport height) cycling through 2/3 → 1/2 → 1/3 → 1/4 → 1/5. */
const SPLIT_PRESETS = [
    { pct: 66.67, label: '⅔' },
    { pct: 50,    label: '½' },
    { pct: 33.33, label: '⅓' },
    { pct: 25,    label: '¼' },
    { pct: 20,    label: '⅕' },
];

let _splitIndex  = 1;    // default: ½
let _focusCardId = null; // the card currently in the right focus slot

// ─── Rendering ────────────────────────────────────────────────────────────────

/**
 * Triggers a roster re-render if the split-screen panel is currently active.
 */
function _syncVisibility() {
    if (document.body.classList.contains(BODY_CLASS)) {
        _renderVnRoster();
    }
}

/**
 * Renders the VN panel with two zones:
 *  - .plz-vn-left-group  — all cards except the focus card, centered, overlapping
 *  - .plz-vn-focus-slot  — the focus card, always at the right, never overlapped
 *
 * When only one card exists it renders as the focus card only (centred by CSS).
 */
function _renderVnRoster() {
    const $panel = $(`#${PANEL_ID}`);
    $panel.empty();

    const roster = state.activeRoster;

    // Keep focus card valid; default to the last roster entry
    if (!_focusCardId || !roster.includes(_focusCardId)) {
        _focusCardId = roster.length ? roster[roster.length - 1] : null;
    }

    if (!_focusCardId) {
        $panel.append(getAddCardHTML());
        return;
    }

    const nonFocusIds = roster.filter(id => id !== _focusCardId);

    // ── Left Group ────────────────────────────────────────────────────────────
    if (nonFocusIds.length > 0) {
        const $leftGroup = $('<div class="plz-vn-left-group"></div>');

        nonFocusIds.forEach(id => {
            const char = state.chatCharacters[id];
            if (!char) return;
            const chain = state.characterChain[id];
            const ui    = state.uiState[id] || {};
            $leftGroup.append(
                getPortraitCardHTML(id, char.label || id, chain?.image || null, ui.flipped)
            );
        });

        // Clicking a left-group card promotes it to the focus slot
        $leftGroup.on('click', '.plz-portrait-card', function (e) {
            if ($(e.target).closest('.plz-card-btn').length) return; // ignore control buttons
            const id = $(this).data('id');
            if (id) {
                _focusCardId = id;
                _renderVnRoster();
            }
        });

        $panel.append($leftGroup);
        _applyOverlap($leftGroup, nonFocusIds.length);
    }

    // ── Focus Slot ────────────────────────────────────────────────────────────
    const $focusSlot = $('<div class="plz-vn-focus-slot"></div>');
    const focusChar  = state.chatCharacters[_focusCardId];
    if (focusChar) {
        const chain = state.characterChain[_focusCardId];
        const ui    = state.uiState[_focusCardId] || {};
        $focusSlot.append(
            getPortraitCardHTML(
                _focusCardId,
                focusChar.label || _focusCardId,
                chain?.image || null,
                ui.flipped
            )
        );
    }
    $panel.append($focusSlot);

    // ── Add FAB ───────────────────────────────────────────────────────────────
    $panel.append(getAddCardHTML());
}

/**
 * Computes and applies a CSS --plz-overlap variable so all left-group cards fit
 * within the space to the left of the focus card.
 *
 * Cards always maintain full height; they overlap each other rather than
 * compressing. The focus slot is always guaranteed one full card-width.
 *
 * @param {jQuery} $group     The .plz-vn-left-group element
 * @param {number} cardCount  Number of cards in the group
 */
function _applyOverlap($group, cardCount) {
    if (cardCount <= 1) {
        $group.css('--plz-overlap', '0px');
        return;
    }

    const panelHeight   = $(`#${PANEL_ID}`).height() || 300;
    const cardWidth     = panelHeight * (2 / 3);         // derives from aspect-ratio: 2/3
    const leftZoneWidth = Math.max(window.innerWidth - cardWidth, cardWidth);
    const totalNatural  = cardCount * cardWidth;

    if (totalNatural <= leftZoneWidth) {
        $group.css('--plz-overlap', '0px');              // cards fit — spread out naturally
        return;
    }

    // Overlap just enough so the total footprint equals leftZoneWidth.
    // Cap at 85% of card width so a sliver of each card is always visible.
    const excess   = totalNatural - leftZoneWidth;
    const overlap  = Math.min(excess / (cardCount - 1), cardWidth * 0.85);
    $group.css('--plz-overlap', `${Math.round(overlap)}px`);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Builds and appends the VN panel elements to the document body (idempotent).
 */
export function injectVnPanel() {
    if (document.getElementById(PANEL_ID)) return;

    $('body').append(`
        <div id="${PANEL_ID}" class="plz-roster-grid"></div>
        <button id="${CYCLE_ID}" title="Cycle portrait size" type="button">½</button>
    `);

    // Global roster events
    document.addEventListener('plz:roster-changed',    () => _syncVisibility());
    document.addEventListener('plz:roster-render-req', () => _syncVisibility());

    // Cycle size button
    $(`#${CYCLE_ID}`).on('click', () => {
        _splitIndex = (_splitIndex + 1) % SPLIT_PRESETS.length;
        _applySplit();
    });

    // Recalculate overlap on resize (debounced)
    let _resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(() => {
            if (document.body.classList.contains(BODY_CLASS)) {
                _renderVnRoster();
            }
        }, 150);
    });

    // Restore saved split ratio
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

    // Let the floating portrait overlay take back control
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
