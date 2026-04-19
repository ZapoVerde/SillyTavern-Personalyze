/**
 * @file data/default-user/extensions/personalyze/ui/vn/layout.js
 * @stamp {"utc":"2026-04-19T00:00:00.000Z"}
 * @architectural-role Pure DOM Utility
 * @description
 * DOM diffing and two-phase layout math for the VN split-screen panel.
 * Extracted from vnPanel.js to keep panel.js under the 300 LOC limit.
 *
 * @api-declaration
 * patchZone($zone, expectedIds)              — Diffs a zone's portrait cards in-place.
 * applyLayout($group, cardCount, panelId)   — Applies the two-phase overlap layout.
 *
 * @contract
 *   assertions:
 *     purity: Pure DOM Utility
 *     state_ownership: []
 *     external_io: [DOM, state.js (read-only)]
 */

import { state } from '../../state.js';
import { getPortraitCardHTML, getPortraitImageSrc } from '../roster/templates.js';

/** Must match the gap value in CSS (.plz-vn-panel gap). */
const VN_GAP = 20;

/**
 * Patches a zone element in-place: updates existing cards, inserts new ones,
 * and removes stale ones without wiping the container.
 *
 * @param {jQuery} $zone
 * @param {string[]} expectedIds
 */
export function patchZone($zone, expectedIds) {
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
                        $existingCard.find('.plz-card-frame').append(
                            `<div class="plz-card-loading-hint"><i class="fa-solid fa-spinner fa-spin"></i></div>`
                        );
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
 * Two-phase layout engine for the left group of non-focus cards.
 *
 * Phase 1 — fits: left group uses natural card widths; CSS centering handles the rest.
 * Phase 2 — overflow: left group is capped and cards start overlapping each other.
 *
 * @param {jQuery} $group     The .plz-vn-left-group element.
 * @param {number} cardCount  Number of non-focus cards in the group.
 * @param {string} panelId    The panel's root element ID (used to measure height).
 */
export function applyLayout($group, cardCount, panelId) {
    if (cardCount === 0) return;

    const panelHeight  = $(`#${panelId}`).height() || 300;
    const cardWidth    = panelHeight * (2 / 3); // matches aspect-ratio: 2/3
    const panelWidth   = window.innerWidth;
    const leftNatural  = cardCount * cardWidth;
    const totalNatural = leftNatural + VN_GAP + cardWidth;

    let leftGroupWidth, overlap;

    if (totalNatural <= panelWidth) {
        // Phase 1: everything fits
        leftGroupWidth = leftNatural;
        overlap        = 0;
    } else {
        // Phase 2: cap and overlap
        leftGroupWidth = Math.max(panelWidth - VN_GAP - cardWidth, cardWidth);
        const excess   = leftNatural - leftGroupWidth;
        overlap        = cardCount > 1
            ? Math.min(excess / (cardCount - 1), cardWidth * 0.85)
            : 0;
    }

    $group.css('width', `${Math.round(leftGroupWidth)}px`);
    $group[0].style.setProperty('--plz-overlap', `${Math.round(overlap)}px`);
}
