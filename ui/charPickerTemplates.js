/**
 * @file data/default-user/extensions/personalyze/ui/charPickerTemplates.js
 * @stamp {"utc":"2026-04-14T23:00:00.000Z"}
 * @architectural-role UI Template (Picker)
 * @description
 * Pure HTML generation for the Character Picker modal. Handles the dynamic 
 * construction of the wardrobe grid.
 * 
 * Updated to use domRegistry for space-safe list attributes.
 * 
 * @api-declaration
 * buildGridHTML(slots, layers, charId) -> string
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
 * @returns {string}
 */
export function buildGridHTML(slots, layers, charId) {
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
                <div class="plz-input-wrapper" style="flex:2;">
                    <input class="plz-cp-item text_pole" data-slot="${key}" type="text" placeholder="Item" 
                           list="${itemListId}" value="${escapeHtml(item)}" style="width:100%;" />
                    <div class="plz-input-clear" title="Clear Item">✕</div>
                </div>
                <div class="plz-input-wrapper" style="flex:1;">
                    <input class="plz-cp-mod text_pole" data-slot="${key}" type="text" placeholder="Mod" 
                           list="${modIdList}" value="${escapeHtml(mod)}" style="width:100%;" />
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
            <div class="plz-input-wrapper">
                <input id="plz-cp-emotion" class="text_pole" type="text" 
                       list="${getDatalistId(charId, 'emotion')}" 
                       value="${escapeHtml(layers.emotion || 'neutral')}" style="width:100%;" />
                <div class="plz-input-clear" title="Clear Emotion">✕</div>
            </div>
        </div>
        <div>
            <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:2px;">Pose</label>
            <div class="plz-input-wrapper">
                <input id="plz-cp-pose" class="text_pole" type="text" 
                       list="${getDatalistId(charId, 'pose')}" 
                       value="${escapeHtml(layers.pose || 'upright')}" style="width:100%;" />
                <div class="plz-input-clear" title="Clear Pose">✕</div>
            </div>
        </div>
    </div>
    <div style="margin-top:10px; display:flex; justify-content:flex-end;">
        <button id="plz-cp-add-slot" class="menu_button" style="font-size:0.75em; opacity:0.7;">
            <i class="fa-solid fa-plus"></i> Add Category
        </button>
    </div>`;
}