/**
 * @file data/default-user/extensions/personalyze/ui/roster/renderer.js
 * @stamp {"utc":"2026-04-14T13:30:00.000Z"}
 * @architectural-role IO Executor / UI Hub
 * @description
 * Orchestrates the rendering of character portrait cards into the UI.
 * Handles Multi-Character layouts by populating Flexbox containers and 
 * routing individual generation progress updates to the correct card.
 *
 * Updated to move listeners into an explicit initRenderer() function.
 *
 * @api-declaration
 * initRenderer() -> void
 * renderRoster(containerSelector) -> void
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: [state]
 *     external_io: [DOM, templates.js]
 */

import { state } from '../../state.js';
import { getPortraitCardHTML, getAddCardHTML } from './templates.js';

const STATUS_PCT = { pending: 15, starting: 35, processing: 65, retry: 65, removing_bg: 85, success: 100, failed: 100 };
const STATUS_LABEL = { generating: 'generating…', pending: 'pending…', starting: 'starting…', processing: 'rendering…', retry: 'retrying…', removing_bg: 'removing bg…', success: 'done', failed: 'failed' };

/**
 * Updates the status bar for a specific character across all rendered containers.
 * 
 * @param {string} characterId 
 * @param {object} detail - { status, error, poll, max }
 */
function _updateCardStatus(characterId, { status, error, poll, max }) {
    const $cards = $(`.plz-portrait-card[data-id="${CSS.escape(characterId)}"]`);
    if (!$cards.length) return;

    $cards.each(function() {
        const $card = $(this);
        const $bar   = $card.find('.plz-card-status');
        const $fill  = $card.find('.plz-card-status-fill');
        const $label = $card.find('.plz-card-status-label');

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
        } else if (status === 'success') {
            // success is reachable now via imageCache dispatching final status
            $bar.fadeOut(200);
            return;
        } else {
            $fill.css('width', `${STATUS_PCT[status] ?? 20}%`);
        }

        const pollSuffix = (poll != null && max != null) ? ` (${poll}/${max})` : '';
        $label.text((STATUS_LABEL[status] ?? status) + pollSuffix);
        $bar.show();
    });
}

/**
 * Initializes global listeners for the roster UI.
 * Called once at extension startup.
 */
export function initRenderer() {
    // Progress bar updates
    document.addEventListener('plz:portrait-status', (e) => {
        if (e.detail?.characterId) {
            _updateCardStatus(e.detail.characterId, e.detail);
        }
    });
}

/**
 * Renders the full active roster into the specified container.
 * 
 * @param {string} containerSelector - JQuery selector for the target container.
 */
export function renderRoster(containerSelector) {
    const $container = $(containerSelector);
    if (!$container.length) return;

    $container.empty();

    // 1. Render Character Cards
    state.activeRoster.forEach(id => {
        const char = state.chatCharacters[id];
        if (!char) return;

        const chain = state.characterChain[id];
        const ui = state.uiState[id] || { flipped: false };

        const html = getPortraitCardHTML(
            id, 
            char.label || id.replace(/_/g, ' '), 
            chain?.image || null, 
            ui.flipped
        );
        $container.append(html);
    });

    // 2. Append "Add" Trigger Card
    $container.append(getAddCardHTML());
}