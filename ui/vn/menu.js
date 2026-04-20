/**
 * @file data/default-user/extensions/personalyze/ui/vn/menu.js
 * @stamp {"utc":"2026-04-19T00:00:00.000Z"}
 * @architectural-role UI Orchestrator
 * @description
 * Manages the VN panel hamburger menu and the Highlight-to-Scan feature.
 *
 * Flow for "Scan Highlighted":
 *   1. User highlights a character name in the chat.
 *   2. User presses the hamburger button (mousedown/touchstart fires FIRST, before
 *      the browser shifts focus and clears the selection; we cache the string here).
 *   3. Menu opens on click.
 *   4. User clicks "Scan Highlighted" — uses the cached selection.
 *      a. Empty or too long → falls back to openCharPicker().
 *      b. Known alias → adds to roster (heals portrait if missing).
 *      c. Unknown → runs runArchivistPipeline().
 *
 * @api-declaration
 * bindMenuHandlers() -> void
 *
 * @contract
 *   assertions:
 *     purity: UI Orchestrator
 *     state_ownership: [_cachedSelection (module-local)]
 *     external_io: [DOM, state.js, dnaWriter.js, imageCache.js, archivist.js]
 */

import { getContext } from '../../../../../extensions.js';
import { callPopup } from '../../../../../script.js';

import {
    state,
    resolveAliasToId,
    setActiveRoster,
    addToFileIndex,
    updateChainLayers
} from '../../state.js';
import { lockedWriteRoster, lockedPatchVisualStateImage } from '../../io/dnaWriter.js';
import { generate } from '../../imageCache.js';
import { slugify } from '../../utils/history.js';
import { runArchivistPipeline } from '../../logic/pipeline/archivist.js';
import { error } from '../../utils/logger.js';

/** Text highlighted by the user at the moment the hamburger button was pressed. */
let _cachedSelection = '';

/** @param {string} id - Resolved character ID confirmed not in the active roster. */
async function _addAndHeal(id) {
    const messageId = Math.max(0, getContext().chat.length - 1);
    const newRoster = [...state.activeRoster, id];
    setActiveRoster(newRoster);
    await lockedWriteRoster(messageId, newRoster);
    document.dispatchEvent(new CustomEvent('plz:roster-changed'));

    // Heal missing portrait so the card doesn't stay on a spinner permanently
    const chain = state.characterChain[id];
    const hasImage = chain?.image && state.fileIndex.has(chain.image);
    if (hasImage) return;

    const char  = state.chatCharacters[id];
    const layers = chain?.layers || {};

    document.dispatchEvent(new CustomEvent('plz:portrait-status', {
        detail: { characterId: id, status: 'generating' }
    }));

    try {
        const file = await generate(
            id, 'layered', slugify(layers.emotion || ''),
            layers, layers.emotion, layers.pose,
            char?.identity, char?.seed ?? 1, false
        );
        addToFileIndex(file);
        updateChainLayers(id, layers, file);
        await lockedPatchVisualStateImage(messageId, id, file);
        document.dispatchEvent(new CustomEvent('plz:roster-render-req'));
    } catch (err) {
        error('Menu', `Portrait healing failed for ${id}:`, err.message);
    }
}

/**
 * Binds all event handlers for the hamburger menu.
 * Called once by injectVnPanel() after the panel DOM is created.
 */
export function bindMenuHandlers() {
    const $doc = $(document);

    // ── Selection capture ──────────────────────────────────────────────────────
    // mousedown/touchstart fires before focus shifts to the button, so the
    // browser hasn't cleared the text highlight yet. We cache it here.
    $doc.on('mousedown touchstart', '#plz-vn-add-btn', function () {
        _cachedSelection = window.getSelection()?.toString().trim() ?? '';
    });

    // ── Hamburger toggle ───────────────────────────────────────────────────────
    $doc.on('click', '#plz-vn-add-btn', function (e) {
        e.stopPropagation();
        $('#plz-vn-add-dropdown').toggleClass('plz-dropdown-open');
    });

    // ── Click-away to close ────────────────────────────────────────────────────
    $doc.on('mousedown touchstart', function (e) {
        if (!$(e.target).closest('#plz-vn-add-menu-wrapper').length) {
            $('#plz-vn-add-dropdown').removeClass('plz-dropdown-open');
        }
    });

    // ── "Scan Highlighted" ─────────────────────────────────────────────────────
    $doc.on('click', '#plz-vn-menu-scan', async function (e) {
        e.stopPropagation();
        $('#plz-vn-add-dropdown').removeClass('plz-dropdown-open');

        // Best-effort selection capture: use the hamburger mousedown cache first
        // (most reliable on desktop), fall back to a live read (works when the
        // selection survives to click time), otherwise leave blank for the user to type.
        const captured = _cachedSelection || window.getSelection()?.toString().trim() || '';
        _cachedSelection = '';

        // Show an editable confirmation modal so the user can adjust the name
        // before the scan runs — critical on mobile where selection is often lost.
        const confirmed = await callPopup(
            '<h3>Scan for character</h3><p>Confirm or edit the name to scan for:</p>',
            'input',
            captured
        );

        const text = (confirmed ?? '').trim();
        if (!text) return;

        const words = text.split(/\s+/).filter(Boolean);
        if (text.length > 40 || words.length > 4) {
            window.toastr?.warning('Name is too long to scan — please use a shorter character name.', 'PersonaLyze');
            return;
        }

        // Alias check: is this already a known character?
        const resolvedId = resolveAliasToId(text);

        if (resolvedId) {
            if (state.activeRoster.includes(resolvedId)) {
                window.toastr?.info('Character is already in the scene.', 'PersonaLyze');
                return;
            }
            await _addAndHeal(resolvedId);
        } else {
            // Unknown character — hand off to the Archivist
            const messageId = Math.max(0, getContext().chat.length - 1);
            await runArchivistPipeline(messageId, text);
        }
    });

    // ── "Add Character" (char picker fallback) ─────────────────────────────────
    $doc.on('click', '#plz-vn-menu-picker', async function (e) {
        e.stopPropagation();
        $('#plz-vn-add-dropdown').removeClass('plz-dropdown-open');
        const { openCharPicker } = await import('../charPicker.js');
        await openCharPicker();
    });
}
