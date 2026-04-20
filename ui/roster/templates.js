/**
 * @file data/default-user/extensions/personalyze/ui/roster/templates.js
 * @stamp {"utc":"2026-04-18T00:00:00.000Z"}
 * @architectural-role Pure UI Template
 * @description
 * Generates the HTML for individual portrait cards within the roster grid.
 *
 * Updated for Surgical Utility UI:
 * 1. Replaced the Flip button with a Gear button that opens a sub-menu.
 * 2. Gear menu contains: Flip, Edit Appearance, Promote to Focus.
 *
 * @api-declaration
 * getPortraitCardHTML(characterId, label, imageUrl, isFlipped) -> string
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
export function getPortraitImageSrc(filename) {
    return filename
        ? `user/images/${PLZ_IMAGE_FOLDER}/${encodeURIComponent(filename)}?v=${Date.now()}`
        : '';
}

export function getPortraitCardHTML(characterId, label, filename, isFlipped = false) {
    const src = getPortraitImageSrc(filename);

    const flipStyle = isFlipped ? 'transform: scaleX(-1);' : '';
    const imgStyle  = src ? `opacity: 1; ${flipStyle}` : `opacity: 0; ${flipStyle}`;

    return `
    <div class="plz-portrait-card" data-id="${escapeHtml(characterId)}">
        <div class="plz-card-frame">
            <img class="plz-card-img" src="${src}" alt="${escapeHtml(label)}" draggable="false" style="${imgStyle}" />

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

        <div class="plz-card-controls">
            <button class="plz-card-btn plz-card-gear" title="Options">
                <i class="fa-solid fa-gear"></i>
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

        <div class="plz-gear-menu">
            <button class="plz-card-btn plz-gear-flip" title="Mirror Portrait">
                <i class="fa-solid fa-arrows-left-right"></i>
            </button>
            <button class="plz-card-btn plz-gear-edit" title="Edit Appearance">
                <i class="fa-solid fa-pen"></i>
            </button>
            <button class="plz-card-btn plz-gear-promote" title="Promote to Focus">
                <i class="fa-solid fa-arrow-up-right-dots"></i>
            </button>
            <button class="plz-card-btn plz-gear-update-apparel" title="Update Apparel">
                <i class="fa-solid fa-shirt"></i>
            </button>
            <button class="plz-card-btn plz-gear-open-workshop" title="Open Workshop">
                <i class="fa-solid fa-flask"></i>
            </button>
            <button class="plz-card-btn plz-gear-open-style" title="Open Style Editor">
                <i class="fa-solid fa-palette"></i>
            </button>
        </div>
    </div>`;
}

