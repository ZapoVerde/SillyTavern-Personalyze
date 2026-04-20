/**
 * @file data/default-user/extensions/personalyze/ui/charPickerTemplates.js
 * @stamp {"utc":"2026-04-19T21:20:00.000Z"}
 * @architectural-role UI Template (Picker)
 * @description
 * Pure HTML generation for the Character Picker modal. Handles the dynamic 
 * construction of the wardrobe grid and generation controls.
 * 
 * Updated for Explicit Seed Architecture:
 * 1. buildGridHTML now accepts seed and autoIncrement parameters.
 * 2. Added a Generation Options row containing the seed input and auto-increment checkbox.
 * 3. constrained seed input between -1 and 999 to support the requested 3-digit loop.
 * 
 * @api-declaration
 * buildGridHTML(slots, layers, charId, seed, autoIncrement) -> string
 * 
 * @contract
 *   assertions:
 *     purity: Pure Function (Structural)
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../utils/history.js';
import { BASE_SLOTS } from '../defaults.js';
import { getDatalistId } from '../utils/domRegistry.js';

/**
 * Builds the HTML for the dynamic layered grid inside the picker.
 * 
 * @param {string[]} slots 
 * @param {object} layers 
 * @param {string} charId 
 * @param {number} seed - The character's current DNA seed.
 * @param {boolean} autoIncrement - Whether to bump seed on refresh.
 * @returns {string}
 */
export function buildGridHTML(slots, layers, charId, seed = 1, autoIncrement = false) {
    const effectiveSlots = slots && slots.length > 0 ? slots : BASE_SLOTS;

    const clothingHtml = effectiveSlots.map(key => {
        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        const item = layers[key]?.item ?? '';
        const mod  = layers[key]?.modifier ?? '';

        // Technical Links
        const itemListId = getDatalistId(charId, `${key}-item`);
        const modIdList  = getDatalistId(charId, `${key}-mod`);

        return `
        <div style="margin-bottom:10px;">
            <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:2px;">${escapeHtml(label)}</label>
            <div class="plz-layer-row">
                <div class="plz-input-wrapper plz-has-history-btn" style="flex:2;">
                    <input class="plz-cp-item text_pole" data-slot="${key}" type="text" placeholder="Item"
                           list="${itemListId}" value="${escapeHtml(item)}" style="width:100%;" />
                    <div class="plz-history-btn" data-list="${itemListId}" title="History">▾</div>
                    <div class="plz-input-clear" title="Clear Item">✕</div>
                </div>
                <div class="plz-input-wrapper plz-has-history-btn" style="flex:1;">
                    <input class="plz-cp-mod text_pole" data-slot="${key}" type="text" placeholder="Mod"
                           list="${modIdList}" value="${escapeHtml(mod)}" style="width:100%;" />
                    <div class="plz-history-btn" data-list="${modIdList}" title="History">▾</div>
                    <div class="plz-input-clear" title="Clear Mod">✕</div>
                </div>
            </div>
        </div>`;
    }).join('');

    return `
    <div class="plz-layered-grid">
        ${clothingHtml}
        <div>
            <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:2px;">Emotion</label>
            <div class="plz-input-wrapper plz-has-history-btn">
                <input id="plz-cp-emotion" class="text_pole" type="text"
                       list="${getDatalistId(charId, 'emotion')}"
                       value="${escapeHtml(layers.emotion || 'neutral')}" style="width:100%;" />
                <div class="plz-history-btn" data-list="${getDatalistId(charId, 'emotion')}" title="History">▾</div>
                <div class="plz-input-clear" title="Clear Emotion">✕</div>
            </div>
        </div>
        <div>
            <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:2px;">Pose</label>
            <div class="plz-input-wrapper plz-has-history-btn">
                <input id="plz-cp-pose" class="text_pole" type="text"
                       list="${getDatalistId(charId, 'pose')}"
                       value="${escapeHtml(layers.pose || 'upright')}" style="width:100%;" />
                <div class="plz-history-btn" data-list="${getDatalistId(charId, 'pose')}" title="History">▾</div>
                <div class="plz-input-clear" title="Clear Pose">✕</div>
            </div>
        </div>
    </div>
    
    <!-- Generation Options Row -->
    <div class="plz-cp-seed-row" style="display:flex; align-items:center; gap:10px; margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05);">
        <div style="flex:1; display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.8em; opacity:0.6;">Seed:</label>
            <input id="plz-cp-seed" class="text_pole" type="number" min="-1" max="999" value="${seed}" style="width:70px;" />
        </div>
        <label class="checkbox_label" style="margin:0; cursor:pointer; font-size:0.85em; opacity:0.8; display:flex; align-items:center; gap:5px;">
            <input id="plz-cp-inc" type="checkbox" ${autoIncrement ? 'checked' : ''} ${seed === -1 ? 'disabled' : ''} />
            <span>Auto-increment</span>
        </label>
    </div>

    <div style="margin-top:10px; display:flex; justify-content:flex-end;">
        <button id="plz-cp-add-slot" class="menu_button" style="font-size:0.75em; opacity:0.7;">
            <i class="fa-solid fa-plus"></i> Add Category
        </button>
    </div>`;
}