/**
 * @file data/default-user/extensions/personalyze/ui/workshop/studioTemplates.js
 * @stamp {"utc":"2026-04-17T14:10:00.000Z"}
 * @architectural-role Pure UI Template (Studio)
 * @description
 * Generates the HTML strings for the Workshop Studio (Character Dashboard).
 * 
 * Updated for Granular Identity Architecture:
 * 1. Replaced monolithic anchor textarea with a granular Identity Grid.
 * 2. Added support for dynamic Physical Feature slots (Special_x).
 * 
 * @api-declaration
 * getStudioHTML(characterId, character, layers, styleLibrary, defaultStyleName, autoIncrementSeed)
 * getStudioEmptyHTML()
 * 
 * @contract
 *   assertions:
 *     purity: Pure Function
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../../utils/history.js';
import { BASE_SLOTS, BASE_IDENTITY_SLOTS } from '../../defaults.js';
import { getDatalistId } from '../../utils/domRegistry.js';

/** 
 * Renders the Studio dashboard with the Granular Identity and Wardrobe Grids. 
 */
export function getStudioHTML(characterId, character, layers, styleLibrary = {}, defaultStyleName = '', autoIncrementSeed = false) {
    const isGhost = characterId === '__new__';
    const displayName = character.label || characterId.replace(/_/g, ' ');
    
    // 1. Identity Grid Construction
    const identityMap = character.identity || {};
    const identityHTML = Object.entries(identityMap).map(([key, val]) => {
        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        const isDeletable = !BASE_IDENTITY_SLOTS.includes(key) && key !== 'base';
        return getIdentityInputHTML(characterId, label, key, val, isDeletable);
    }).join('');

    // 2. Wardrobe Grid Construction
    const slots = (character.slots && character.slots.length > 0) ? character.slots : [...BASE_SLOTS];
    const slotsHTML = slots.map(key => {
        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        const isDeletable = !BASE_SLOTS.includes(key);
        return getLayerInputHTML(characterId, label, key, layers[key], isDeletable);
    }).join('');

    const akaTagsHTML = (character.aka || []).map(alias => `
        <span class="plz-aka-tag" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;background:rgba(255,255,255,0.08);font-size:0.8em;">
            ${escapeHtml(alias)}<i class="fa-solid fa-xmark plz-aka-remove" data-alias="${escapeHtml(alias)}" style="cursor:pointer;opacity:0.6;"></i>
        </span>`).join('');

    const idLabel = isGhost 
        ? `<small style="opacity:0.35;"><i>Unsaved Character</i></small>`
        : `<small style="opacity:0.35;">System ID: ${escapeHtml(characterId)}</small>`;

    const seed = character.seed ?? 1;

    return `
    <div style="margin-bottom:10px;">
        <div class="plz-input-wrapper">
            <input id="plz-studio-label" class="text_pole" type="text" value="${isGhost ? '' : escapeHtml(displayName)}"
                   placeholder="Character Name"
                   style="width:100%;font-size:1.1em;font-weight:bold;margin-bottom:4px;" />
            <div class="plz-input-clear plz-studio-clear" title="Clear Name">✕</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
            ${idLabel}
            <button class="menu_button plz-save-ensemble-btn" style="font-size:0.8em;" ${isGhost ? 'disabled title="Save character first"' : ''}>Save as Ensemble</button>
        </div>
    </div>

    <!-- Section: Physical Identity -->
    <div style="margin-bottom:20px;">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;">
            <div style="font-size:0.8em;opacity:0.6;text-transform:uppercase;letter-spacing:0.05em;font-weight:bold;">Physical Identity</div>
            <button class="menu_button plz-anchor-scan" data-mode="studio" style="font-size:0.75em;padding:2px 8px;">Scan Transcript</button>
        </div>
        
        <div id="plz-identity-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
            ${identityHTML}
        </div>

        <div style="display:flex; justify-content:flex-end;">
            <button id="plz-studio-add-feature" class="menu_button" style="font-size:0.75em; opacity:0.7;">
                <i class="fa-solid fa-plus"></i> Add Physical Feature
            </button>
        </div>
    </div>

    <!-- Section: Metadata -->
    <div style="margin-bottom:12px;">
        <label class="plz-studio-label" style="display:block;margin-bottom:5px;">Aliases (AKAs)</label>
        <div id="plz-studio-aka-tags" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;min-height:20px;">
            ${akaTagsHTML || '<span style="opacity:0.3;font-size:0.8em;">No aliases yet.</span>'}
        </div>
        <div style="display:flex;gap:6px;">
            <input id="plz-studio-aka-input" class="text_pole" type="text" placeholder="Add alias..." style="flex:1;font-size:0.85em;" />
            <button class="menu_button plz-aka-add" style="font-size:0.8em;">Add</button>
        </div>
    </div>

    <!-- Section: Wardrobe -->
    <div style="font-size:0.8em;opacity:0.6;text-transform:uppercase;letter-spacing:0.05em;font-weight:bold;margin-bottom:8px;">Current Wardrobe</div>
    <div class="plz-layered-grid" style="margin-bottom:12px;">
        ${slotsHTML}
        ${getEmotionInputHTML(characterId, layers.emotion)}
        ${getPoseInputHTML(characterId, layers.pose)}
    </div>

    <div style="display:flex; gap:6px; margin-bottom:20px;">
        <button id="plz-studio-add-slot" class="menu_button" style="font-size:0.85em;"><i class="fa-solid fa-plus"></i> Add Wardrobe Category</button>
        <div style="flex:1;"></div>
        <input id="plz-studio-hint" type="text" class="text_pole" placeholder="Wardrobe Hint" style="width:120px; font-size:0.85em;" />
        <button id="plz-studio-force-costume" class="menu_button" style="font-size:0.85em;">Scan</button>
        ${isGhost ? '<button id="plz-studio-layers-save" class="menu_button" style="padding:0 15px;">Register &amp; Apply</button>' : ''}
    </div>

    <!-- Section: Technical Rendering -->
    <div style="margin-top:20px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.07);">
        <div style="display:flex; align-items:center; gap:15px; margin-bottom:12px;">
            <div style="flex:1; display:flex; align-items:center; gap:8px;">
                <label class="plz-studio-label" style="margin:0;">Identity Seed</label>
                <input id="plz-studio-seed" class="text_pole" type="number" min="-1" max="999" value="${seed}" style="width:70px; font-family:monospace;" />
            </div>
            <label class="checkbox_label" style="margin:0; cursor:pointer; font-size:0.85em; opacity:0.8; display:flex; align-items:center; gap:5px;">
                <input id="plz-studio-inc" type="checkbox" ${autoIncrementSeed ? 'checked' : ''} ${seed === -1 ? 'disabled' : ''} />
                <span>Auto-increment on refresh</span>
            </label>
        </div>

        <label class="plz-studio-label" style="display:block;margin-bottom:6px;">Portrait Style</label>
        <select id="plz-studio-style" class="text_pole" style="width:100%;margin-bottom:8px;">
            <option value="" ${!character.styleName ? 'selected' : ''}>Use Default (${escapeHtml(defaultStyleName || 'Default')})</option>
            ${Object.keys(styleLibrary).map(n =>
                `<option value="${escapeHtml(n)}" ${character.styleName === n ? 'selected' : ''}>${escapeHtml(n)}</option>`
            ).join('')}
        </select>
        <p style="font-size:0.75em; opacity:0.5; margin-bottom:16px;">
            <i class="fa-solid fa-circle-info"></i> Rendering technicals (Engine, Model, LoRAs) are determined by the assigned Global Style.
        </p>

        <div style="border:1px solid rgba(var(--SmartThemeErrorColor-rgb, 200,60,60),0.3);border-radius:6px;padding:10px 12px;">
            <div style="font-size:0.8em;opacity:0.6;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Maintenance</div>
            <button id="plz-studio-purge" class="menu_button" style="width:100%;color:var(--SmartThemeErrorColor, #c83c3c);" ${isGhost ? 'disabled' : ''}>
                <i class="fa-solid fa-trash-can"></i> Purge Character Portraits
            </button>
        </div>
    </div>

    <div style="margin-top:20px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.07);">
        <div style="margin-bottom:8px;"><strong>Saved Ensembles</strong> <small style="opacity:0.5; font-weight:normal;">(★ = Everyday Wear)</small></div>
        <div id="plz-studio-ensembles">
            ${getEnsembleListHTML(character.ensembles, character.defaultEnsemble)}
        </div>
    </div>

    <div id="plz-studio-datalists-container"></div>`;
}

/** 
 * Helper for granular physical trait rows (Simple Strings).
 */
function getIdentityInputHTML(charId, label, key, val, deletable = false) {
    const deleteBtn = deletable 
        ? `<i class="fa-solid fa-trash-can plz-studio-delete-identity" data-key="${key}" 
              style="font-size:0.8em; opacity:0.3; cursor:pointer; margin-left:5px;" title="Delete Feature"></i>` 
        : '';

    return `
    <div class="plz-identity-input">
        <div style="display:flex; align-items:center; margin-bottom:2px;">
            <label style="font-size:0.75em;opacity:0.6;flex:1;">${label}</label>
            ${deleteBtn}
        </div>
        <div class="plz-input-wrapper">
            <input class="plz-studio-identity-item text_pole" data-key="${key}" type="text" 
                   value="${escapeHtml(val || '')}" style="width:100%;" placeholder="Feature description..." />
            <div class="plz-input-clear" title="Clear">✕</div>
        </div>
    </div>`;
}

function getLayerInputHTML(charId, label, key, val, deletable = false) {
    const item = val?.item ?? '';
    const mod  = val?.modifier ?? '';
    const deleteBtn = deletable 
        ? `<i class="fa-solid fa-trash-can plz-studio-delete-slot" data-slot="${key}" 
              style="font-size:0.8em; opacity:0.3; cursor:pointer; margin-left:5px;" title="Delete Category"></i>` 
        : '';

    return `
    <div class="plz-layer-input">
        <div style="display:flex; align-items:center; margin-bottom:2px;">
            <label style="font-size:0.75em;opacity:0.6;flex:1;">${label}</label>
            ${deleteBtn}
        </div>
        <div class="plz-layer-row">
            <div class="plz-input-wrapper" style="flex:2;">
                <input class="plz-layer-item text_pole" data-slot="${key}" type="text" placeholder="Item" 
                       list="${getDatalistId(charId, `${key}-item`)}" value="${escapeHtml(item)}" style="width:100%;" />
                <div class="plz-input-clear" title="Clear Item">✕</div>
            </div>
            <div class="plz-input-wrapper" style="flex:1;">
                <input class="plz-layer-mod text_pole" data-slot="${key}" type="text" placeholder="Mod" 
                       list="${getDatalistId(charId, `${key}-mod`)}" value="${escapeHtml(mod)}" style="width:100%;" />
                <div class="plz-input-clear" title="Clear Mod">✕</div>
            </div>
        </div>
    </div>`;
}

function getEmotionInputHTML(charId, val) {
    return `
    <div class="plz-layer-input">
        <label style="font-size:0.75em;opacity:0.6;display:block;margin-bottom:2px;">Emotion</label>
        <div class="plz-input-wrapper">
            <input id="plz-layer-emotion" class="text_pole" type="text" placeholder="Mood/Adjective" 
                   list="${getDatalistId(charId, 'emotion')}" value="${escapeHtml(val || '')}" style="width:100%;" />
            <div class="plz-input-clear" title="Clear Emotion">✕</div>
        </div>
    </div>`;
}

function getPoseInputHTML(charId, val) {
    return `
    <div class="plz-layer-input">
        <label style="font-size:0.75em;opacity:0.6;display:block;margin-bottom:2px;">Pose</label>
        <div class="plz-input-wrapper">
            <input id="plz-layer-pose" class="text_pole" type="text" placeholder="Stance/Position" 
                   list="${getDatalistId(charId, 'pose')}" value="${escapeHtml(val || '')}" style="width:100%;" />
            <div class="plz-input-clear" title="Clear Pose">✕</div>
        </div>
    </div>`;
}

function getEnsembleListHTML(ensembles, defaultKey) {
    const entries = Object.entries(ensembles || {});
    if (entries.length === 0) return `<p style="opacity:0.4;font-size:0.85em;">No saved ensembles.</p>`;
    
    return entries.map(([key, data]) => {
        const isDefault = key === defaultKey;
        return `
        <div class="plz-ensemble-item" data-key="${escapeHtml(key)}" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
            <div style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-star plz-ensemble-star" title="Set as Everyday Wear" 
                   style="cursor:pointer; color:${isDefault ? '#ffc107' : 'rgba(255,255,255,0.1)'};"></i>
                <span style="font-size:0.9em;">${escapeHtml(data.label)}</span>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="menu_button plz-ensemble-load" style="padding:1px 8px;font-size:0.75em;">Load</button>
                <button class="menu_button plz-ensemble-delete" style="padding:1px 8px;font-size:0.75em;color:#e05555;">✕</button>
            </div>
        </div>`;
    }).join('');
}

export function getStudioEmptyHTML() {
    return `<div style="text-align:center;padding:60px;opacity:0.5;">Select a character from DNA tab to open Dashboard.</div>`;
}