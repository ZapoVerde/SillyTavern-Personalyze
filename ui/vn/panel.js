/**
 * @file data/default-user/extensions/personalyze/ui/vn/panel.js
 * @stamp {"utc":"2026-04-19T00:00:00.000Z"}
 * @architectural-role UI Orchestrator (Split-Screen Character View)
 * @description
 * PersonaLyze's split-screen character display mode.
 * Decomposed from the original ui/vnPanel.js to respect the 300 LOC limit;
 * DOM diffing and layout math live in layout.js, HTML templates in templates.js,
 * and the hamburger menu in menu.js.
 *
 * Two-zone layout:
 *   LEFT  — non-focus cards, centered, dynamically overlapping so all fit.
 *   RIGHT — focus card, always full width, controls always visible.
 *
 * @api-declaration
 * injectVnPanel()            — Builds the DOM (idempotent).
 * syncVnState()              — Syncs activation with enabled + plzVnMode settings.
 * setVnPanelEnabled(bool)    — Activates or deactivates split-screen mode.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [_splitIndex, _focusCardId, _leftGroupOrder]
 *     external_io: [DOM, state.js, settings.js]
 */

import { state } from '../../state.js';
import { getSettings, updateSetting } from '../../settings.js';
import { log } from '../../utils/logger.js';
import { getVnPanelShellHTML } from './templates.js';
import { patchZone, applyLayout } from './layout.js';
import { bindMenuHandlers } from './menu.js';

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

let _splitIndex     = 1;    // default: ½
let _focusCardId    = null; // the card currently in the right focus slot
let _leftGroupOrder = [];   // display order for left-group cards (rotated by scroll arrows)

// ─── Rendering ────────────────────────────────────────────────────────────────

function _syncVisibility() {
    if (document.body.classList.contains(BODY_CLASS)) {
        _renderVnRoster();
    }
}

/**
 * Renders the VN panel with two zones.
 * Patches the DOM in place rather than wiping and rebuilding.
 */
function _renderVnRoster() {
    const $panel = $(`#${PANEL_ID}`);

    if (!$panel.find('.plz-vn-left-group').length) $panel.append('<div class="plz-vn-left-group"></div>');
    if (!$panel.find('.plz-vn-focus-slot').length) $panel.append('<div class="plz-vn-focus-slot"></div>');

    const $leftGroup = $panel.find('.plz-vn-left-group');
    const $focusSlot = $panel.find('.plz-vn-focus-slot');
    const roster = state.activeRoster;

    if (!_focusCardId || !roster.includes(_focusCardId)) {
        _focusCardId = roster.length ? roster[roster.length - 1] : null;
    }

    const nonFocusIds = _focusCardId ? roster.filter(id => id !== _focusCardId) : [];

    // ── Left Group ────────────────────────────────────────────────────────────
    if (nonFocusIds.length > 0) {
        $leftGroup.show();

        const existing = _leftGroupOrder.filter(id => nonFocusIds.includes(id));
        const added    = nonFocusIds.filter(id => !_leftGroupOrder.includes(id));
        _leftGroupOrder = [...existing, ...added];

        patchZone($leftGroup, _leftGroupOrder);

        [..._leftGroupOrder].reverse().forEach(id => {
            const $card = $leftGroup.find(`> .plz-portrait-card[data-id="${CSS.escape(id)}"]`);
            if ($card.length) $leftGroup.prepend($card);
        });

        $leftGroup.find('> .plz-portrait-card').each(function(i) {
            $(this).toggleClass('plz-card-stacked', i < _leftGroupOrder.length - 1);
        });
        $leftGroup.find('> .plz-portrait-card.plz-card-stacked').removeClass('plz-controls-active');

        if (!$leftGroup.find('.plz-vn-scroll-btn').length) {
            $leftGroup.append(`
                <button class="plz-vn-scroll-btn plz-vn-scroll-prev" title="Previous" type="button"><i class="fa-solid fa-chevron-left"></i></button>
                <button class="plz-vn-scroll-btn plz-vn-scroll-next" title="Next" type="button"><i class="fa-solid fa-chevron-right"></i></button>
            `);
            $leftGroup.on('click', '.plz-vn-scroll-prev', function(e) {
                e.stopPropagation();
                if (_leftGroupOrder.length > 1) {
                    _leftGroupOrder.unshift(_leftGroupOrder.pop());
                    _renderVnRoster();
                }
            });
            $leftGroup.on('click', '.plz-vn-scroll-next', function(e) {
                e.stopPropagation();
                if (_leftGroupOrder.length > 1) {
                    _leftGroupOrder.push(_leftGroupOrder.shift());
                    _renderVnRoster();
                }
            });
        }
        $leftGroup.find('.plz-vn-scroll-btn').toggle(_leftGroupOrder.length > 1);

    } else {
        $leftGroup.hide();
        $leftGroup.empty();
        _leftGroupOrder = [];
    }

    // ── Focus Slot ────────────────────────────────────────────────────────────
    if (_focusCardId) {
        $focusSlot.show();
        patchZone($focusSlot, [_focusCardId]);
    } else {
        $focusSlot.hide();
        $focusSlot.empty();
    }

    if (nonFocusIds.length > 0) applyLayout($leftGroup, _leftGroupOrder.length, PANEL_ID);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Builds and appends the VN panel elements to the document body (idempotent).
 */
export function injectVnPanel() {
    if (document.getElementById(PANEL_ID)) return;

    $('body').append(getVnPanelShellHTML(PANEL_ID, CYCLE_ID));

    // Global roster events
    document.addEventListener('plz:roster-changed',    () => _syncVisibility());
    document.addEventListener('plz:roster-render-req', () => _syncVisibility());

    // Promote a left-group card into the focus slot (fired by controls.js gear menu)
    document.addEventListener('plz:promote-to-focus', (e) => {
        const id = e.detail?.characterId;
        if (id && state.activeRoster.includes(id)) {
            _focusCardId = id;
            _renderVnRoster();
        }
    });

    // Cycle size button
    $(`#${CYCLE_ID}`).on('click', () => {
        _splitIndex = (_splitIndex + 1) % SPLIT_PRESETS.length;
        _applySplit();
    });

    // Disable/enable toggle button
    $(`#plz-vn-toggle-btn`).on('click', () => {
        const $btn = $(`#plz-vn-toggle-btn`);
        const isEnabled = getSettings().enabled;

        if (isEnabled) {
            updateSetting('enabled', false);
            $('#plz-enabled').prop('checked', false);
            $btn.find('i').removeClass('fa-eye-slash').addClass('fa-eye');
            $btn.attr('title', 'Enable PersonaLyze');
            $btn.addClass('plz-vn-toggle-disabled');
            $btn.detach().appendTo('body');

            syncVnState();
            document.dispatchEvent(new CustomEvent('plz:roster-changed'));

            import('../badge.js').then(module => {
                if (module.clearAllBadges) module.clearAllBadges();
            });

        } else {
            updateSetting('enabled', true);
            $('#plz-enabled').prop('checked', true);
            $btn.find('i').removeClass('fa-eye').addClass('fa-eye-slash');
            $btn.attr('title', 'Disable PersonaLyze');
            $btn.removeClass('plz-vn-toggle-disabled');
            $btn.detach().prependTo(`#${PANEL_ID}`);

            syncVnState();
            document.dispatchEvent(new CustomEvent('plz:roster-changed'));

            if (window.toastr) window.toastr.success('PersonaLyze enabled.', 'PersonaLyze');
        }
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

    // Bind hamburger menu interactions
    bindMenuHandlers();

    syncVnState();

    log('VnPanel', 'Split-screen shell injected.');
}

/**
 * Syncs VN panel activation state with both the master toggle and VN mode preference.
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
