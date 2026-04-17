/**
 * @file data/default-user/extensions/personalyze/ui/vnPanel.js
 * @stamp {"utc":"2026-04-13T06:22:00.000Z"}
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
 * Updated for Asset Resilience:
 * 1. Validates images against state.fileIndex before rendering to prevent 404s.
 *
 * @api-declaration
 * injectVnPanel()            — Builds the DOM (idempotent).
 * setVnPanelEnabled(bool)    — Activates or deactivates split-screen mode.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [_splitIndex, _focusCardId]
 *     external_io: [DOM, state.js, settings.js]
 */

import { state } from '../state.js';
import { getSettings, updateSetting } from '../settings.js';
import { getPortraitCardHTML, getAddCardHTML, getPortraitImageSrc } from './roster/templates.js';
import { log } from '../utils/logger.js';

const PANEL_ID   = 'plz-vn-panel';
const CYCLE_ID   = 'plz-vn-cycle-btn';
const BODY_CLASS = 'plz-vn-active';
const SPLIT_VAR  = '--plz-vn-split';

/** Preset split sizes (% of viewport height) cycling through 2/3 → 1/2 → 1/3 → 1/4 → 1/5. */
const SPLIT_PRESETS =[
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
 * Patches a zone element in-place: updates existing cards, inserts new ones,
 * and removes stale ones — without wiping the container.
 *
 * @param {jQuery} $zone
 * @param {string[]} expectedIds
 */
function _patchZone($zone, expectedIds) {
    if (!$zone?.length) return;
    const processedIds = new Set();

    expectedIds.forEach(id => {
        const char = state.chatCharacters[id];
        if (!char) return;
        processedIds.add(id);

        const chain = state.characterChain[id];
        const ui = state.uiState[id] || { flipped: false };
        const imageToRender = (chain?.image && state.fileIndex.has(chain.image)) ? chain.image : null;
        const label = char.label || id.replace(/_/g, ' ');
        const $existingCard = $zone.find(`> .plz-portrait-card[data-id="${CSS.escape(id)}"]`);

        if ($existingCard.length) {
            // UPDATE IN PLACE
            const src = getPortraitImageSrc(imageToRender);
            const $img = $existingCard.find('.plz-card-img');

            if (($img.attr('src') || '').split('?')[0] !== src.split('?')[0]) {
                $img.attr('src', src);
                if (src) {
                    $img.css('opacity', '1');
                    $existingCard.find('.plz-card-loading-hint').remove();
                } else {
                    $img.css('opacity', '0');
                    if (!$existingCard.find('.plz-card-loading-hint').length) {
                        $existingCard.find('.plz-card-frame').append(`<div class="plz-card-loading-hint"><i class="fa-solid fa-spinner fa-spin"></i></div>`);
                    }
                }
            }

            $img.css('transform', ui.flipped ? 'scaleX(-1)' : 'none');
            $existingCard.find('.plz-card-label').text(label);
        } else {
            // INSERT NEW
            $zone.append(getPortraitCardHTML(id, label, imageToRender, ui.flipped));
        }
    });

    // Remove stale cards
    $zone.find('> .plz-portrait-card').each(function () {
        if (!processedIds.has($(this).data('id'))) $(this).remove();
    });
}

/**
 * Renders the VN panel with two zones:
 *  - .plz-vn-left-group  — non-focus cards, width set by JS to position the focus card
 *  - .plz-vn-focus-slot  — the focus card, controls always visible, never overlapped
 *
 * Patches the DOM in place rather than wiping and rebuilding, so only changed
 * cards are touched and unaffected cards never blink.
 */
function _renderVnRoster() {
    const $panel = $(`#${PANEL_ID}`);

    // Ensure structural containers exist without wiping the panel
    if (!$panel.find('.plz-vn-left-group').length) $panel.append('<div class="plz-vn-left-group"></div>');
    if (!$panel.find('.plz-vn-focus-slot').length) $panel.append('<div class="plz-vn-focus-slot"></div>');
    if (!$panel.find('.plz-card-add-trigger').length) $panel.append(getAddCardHTML());

    const $leftGroup = $panel.find('.plz-vn-left-group');
    const $focusSlot = $panel.find('.plz-vn-focus-slot');
    const roster = state.activeRoster;

    // Keep focus card valid; default to the last roster entry
    if (!_focusCardId || !roster.includes(_focusCardId)) {
        _focusCardId = roster.length ? roster[roster.length - 1] : null;
    }

    const nonFocusIds = _focusCardId ? roster.filter(id => id !== _focusCardId) : [];

    // ── Left Group ────────────────────────────────────────────────────────────
    if (nonFocusIds.length > 0) {
        $leftGroup.show();
        _patchZone($leftGroup, nonFocusIds);

        if (!$leftGroup.data('bound')) {
            $leftGroup.on('click', '.plz-portrait-card', function (e) {
                if ($(e.target).closest('.plz-card-btn').length) return;
                const id = $(this).data('id');
                if (id) {
                    _focusCardId = id;
                    _renderVnRoster();
                }
            });
            $leftGroup.data('bound', true);
        }
    } else {
        $leftGroup.hide();
        $leftGroup.empty();
    }

    // ── Focus Slot ────────────────────────────────────────────────────────────
    if (_focusCardId) {
        $focusSlot.show();
        _patchZone($focusSlot, [_focusCardId]);

        if (!$focusSlot.data('bound')) {
            $focusSlot.on('click', '.plz-portrait-card', function (e) {
                if ($(e.target).closest('.plz-card-btn').length) return;
                $(this).toggleClass('plz-controls-pinned');
            });
            $focusSlot.on('mouseenter', '.plz-portrait-card', function () {
                $(this).removeClass('plz-controls-pinned');
            });
            $focusSlot.data('bound', true);
        }
    } else {
        $focusSlot.hide();
        $focusSlot.empty();
    }

    // ── Add FAB — always last ─────────────────────────────────────────────────
    $panel.append($panel.find('.plz-card-add-trigger'));

    if (nonFocusIds.length > 0) _applyLayout($leftGroup, nonFocusIds.length);
}

/**
 * Two-phase layout engine. The panel uses justify-content:center + gap so the
 * whole row (left group + gap + focus card) is always centered as a unit.
 *
 * Phase 1 — fits:
 *   Left group = natural card footprint. Everything centers with room to spare.
 *
 * Phase 2 — overflow:
 *[leftNatural + GAP + cardWidth] > panelWidth.
 *   Left group is capped and cards start overlapping each other.
 *
 * @param {jQuery} $group     The .plz-vn-left-group element
 * @param {number} cardCount  Number of non-focus cards in the group
 */
const VN_GAP = 20; // must match the gap value in CSS

function _applyLayout($group, cardCount) {
    if (cardCount === 0) return; // focus card alone — CSS centers it, nothing to do

    const panelHeight  = $(`#${PANEL_ID}`).height() || 300;
    const cardWidth    = panelHeight * (2 / 3); // matches aspect-ratio: 2/3
    const panelWidth   = window.innerWidth;
    const leftNatural  = cardCount * cardWidth;
    const totalNatural = leftNatural + VN_GAP + cardWidth;

    let leftGroupWidth, overlap;

    if (totalNatural <= panelWidth) {
        // Phase 1: everything fits — natural widths, CSS centering does the rest
        leftGroupWidth = leftNatural;
        overlap        = 0;
    } else {
        // Phase 2: cap left group, compute overlap to make it fit
        leftGroupWidth = Math.max(panelWidth - VN_GAP - cardWidth, cardWidth);
        const excess   = leftNatural - leftGroupWidth;
        overlap        = cardCount > 1
            ? Math.min(excess / (cardCount - 1), cardWidth * 0.85)
            : 0;
    }

    $group.css({
        width:           `${Math.round(leftGroupWidth)}px`,
        '--plz-overlap': `${Math.round(overlap)}px`,
    });
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Builds and appends the VN panel elements to the document body (idempotent).
 */
export function injectVnPanel() {
    if (document.getElementById(PANEL_ID)) return;

    $('body').append(`
        <div id="${PANEL_ID}" class="plz-roster-grid">
            <button id="plz-vn-toggle-btn" class="plz-vn-side-btn" title="Disable PersonaLyze" type="button">
                <i class="fa-solid fa-eye-slash"></i>
            </button>
            <button id="${CYCLE_ID}" class="plz-vn-side-btn" title="Cycle portrait size" type="button">½</button>
        </div>
    `);

    // Global roster events
    document.addEventListener('plz:roster-changed',    () => _syncVisibility());
    document.addEventListener('plz:roster-render-req', () => _syncVisibility());

    // Cycle size button
    $(`#${CYCLE_ID}`).on('click', () => {
        _splitIndex = (_splitIndex + 1) % SPLIT_PRESETS.length;
        _applySplit();
    });

    // Disable toggle button
    $(`#plz-vn-toggle-btn`).on('click', () => {
        updateSetting('enabled', false);

        syncVnState();
        document.dispatchEvent(new CustomEvent('plz:roster-changed'));

        import('./badge.js').then(module => {
            if (module.clearAllBadges) module.clearAllBadges();
        });

        if (window.toastr) window.toastr.warning('PersonaLyze disabled.', 'PersonaLyze');
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

    syncVnState();

    log('VnPanel', 'Split-screen shell injected.');
}

/**
 * Syncs VN panel activation state with both the master toggle and VN mode preference.
 * Call this whenever either `enabled` or `plzVnMode` changes.
 */
export function syncVnState() {
    const s = getSettings();
    if (s.enabled && s.plzVnMode) {
        _activate();
    } else {
        _deactivate();
    }
}

/**
 * Activates or deactivates the split-screen character view.
 * Persists the preference but only activates if the extension is also enabled.
 * @param {boolean} enabled
 */
export function setVnPanelEnabled(enabled) {
    updateSetting('plzVnMode', enabled);
    syncVnState();
}

// ─── Activation ──────────────────────────────────────────────────────────────

function _activate() {
    document.body.classList.add(BODY_CLASS);
    _applySheldOverride(SPLIT_PRESETS[_splitIndex].pct);
    _syncVisibility();
}

function _deactivate() {
    document.body.classList.remove(BODY_CLASS);
    _removeSheldOverride();

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