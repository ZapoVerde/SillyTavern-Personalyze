/**
 * @file data/default-user/extensions/personalyze/ui/roster/templates.js
 * @stamp {"utc":"2026-04-15T11:10:00.000Z"}
 * @architectural-role Pure UI Template
 * @description
 * Generates the HTML for individual portrait cards within the roster grid.
 * 
 * Updated for Generation Economy:
 * 1. Added Refresh button (fa-rotate) to trigger on-demand re-generation.
 *
 * @api-declaration
 * getPortraitCardHTML(characterId, label, imageUrl, isFlipped) -> string
 * getAddCardHTML() -> string
 * 
 * @contract
 *   assertions:
 *     purity: Pure Function
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../../utils/history.js';
import { PLZ_IMAGE_FOLDER } from '../../defaults.js';

/**
 * Builds the HTML for a single character portrait card.
 * 
 * @param {string} characterId
 * @param {string} label
 * @param {string|null} filename
 * @param {boolean} isFlipped
 * @returns {string}
 */
export function getPortraitCardHTML(characterId, label, filename, isFlipped = false) {
    const src = filename 
        ? `user/images/${PLZ_IMAGE_FOLDER}/${encodeURIComponent(filename)}?v=${Date.now()}`
        : '';

    const flipStyle = isFlipped ? 'transform: scaleX(-1);' : '';
    const imgStyle  = src ? `opacity: 1; ${flipStyle}` : `opacity: 0; ${flipStyle}`;

    return `
    <div class="plz-portrait-card" data-id="${escapeHtml(characterId)}">
        <div class="plz-card-frame">
            <img class="plz-card-img" src="${src}" alt="${escapeHtml(label)}" draggable="false" style="${imgStyle}" />
            
            <div class="plz-card-controls">
                <button class="plz-card-btn plz-card-flip" title="Mirror Portrait">
                    <i class="fa-solid fa-arrows-left-right"></i>
                </button>
                <div style="flex:1;"></div>
                <button class="plz-card-btn plz-card-refresh" title="Refresh / Re-generate Image">
                    <i class="fa-solid fa-rotate"></i>
                </button>
                <div style="flex:1;"></div>
                <button class="plz-card-btn plz-card-close" title="Remove from Scene">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <div class="plz-card-footer">
                <span class="plz-card-label">${escapeHtml(label)}</span>
            </div>

            <div class="plz-card-status" style="display:none;">
                <div class="plz-card-status-track">
                    <div class="plz-card-status-fill"></div>
                </div>
                <span class="plz-card-status-label"></span>
            </div>
            
            ${!src ? `
            <div class="plz-card-loading-hint">
                <i class="fa-solid fa-spinner fa-spin"></i>
            </div>` : ''}
        </div>
    </div>`;
}

/**
 * Builds the HTML for the "Add Character" Floating Action Button.
 * @returns {string}
 */
export function getAddCardHTML() {
    return `
    <div class="plz-card-add-trigger" title="Add Character to Scene">
        <i class="fa-solid fa-plus"></i>
    </div>`;
}