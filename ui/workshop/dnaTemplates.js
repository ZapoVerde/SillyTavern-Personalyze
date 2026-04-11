/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaTemplates.js
 * @stamp {"utc":"2026-04-12T10:20:00.000Z"}
 * @architectural-role Pure UI Templates
 * @description
 * Generates the HTML for the Character Workshop Dashboard.
 * 
 * Updated for the "Ghost Studio" architecture:
 * 1. Removed "Add" tab.
 * 2. Prepend unconditional "Create New" button to the DNA roster.
 * 3. Studio template handles the '__new__' ghost state.
 * 
 * @api-declaration
 * getBaseWorkshopHTML()
 * getDnaRosterHTML(characters, activeRoster, activeId)
 * getStudioHTML(characterId, character, layers, enabledEngines, styleLibrary, defaultStyleName)
 * getStudioEmptyHTML()
 * 
 * @contract
 *   assertions:
 *     purity: Pure Function
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../../utils/history.js';
import { BASE_SLOTS } from '../../defaults.js';

/** Main modal shell with DNA, Studio, and Library tabs. */
export function getBaseWorkshopHTML() {
    return `
    <div id="plz-workshop-overlay" class="plz-overlay plz-hidden">
        <div id="plz-workshop-modal" class="plz-modal">
            <div class="plz-workshop-header">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <h3 style="margin:0;"><i class="fa-solid fa-dna"></i> Character Workshop</h3>
                    <button id="plz-workshop-close" class="menu_button" style="padding:2px 10px;">✕</button>
                </div>
                <div class="plz-tab-bar">
                    <button class="plz-tab-btn menu_button" data-tab="dna">DNA</button>
                    <button class="plz-tab-btn menu_button" data-tab="studio">Studio</button>
                    <button class="plz-tab-btn menu_button" data-tab="library">Library</button>
                </div>
            </div>
            <div class="plz-workshop-body">
                <div id="plz-tab-dna"     class="plz-tab-panel plz-hidden"></div>
                <div id="plz-tab-studio"  class="plz-tab-panel plz-hidden"></div>
                <div id="plz-tab-library" class="plz-tab-panel plz-hidden"></div>
            </div>
        </div>

        <datalist id="plz-items-list">
            <option value="Shirt">
            <option value="Pants">
            <option value="Dress">
            <option value="Armor">
            <option value="Coat">
            <option value="Boots">
            <option value="Hat">
            <option value="Cape">
        </datalist>
        <datalist id="plz-mods-list">
            <option value="Red">
            <option value="Black">
            <option value="White">
            <option value="Leather">
            <option value="Silk">
            <option value="Dirty">
            <option value="Torn">
            <option value="Glowing">
        </datalist>
    </div>`;
}

/** Renders the character list currently in the chat's DNA history. */
export function getDnaRosterHTML(characters, activeRoster, activeId) {
    // 1. Unconditional "Create New" entry
    const addNewHtml = `
    <div class="plz-roster-item plz-dna-add-new" style="border: 1px dashed var(--SmartThemeBorderColor); opacity: 0.8; justify-content: center; cursor: pointer; padding: 12px;">
        <div style="display:flex; align-items:center; gap:8px; font-weight:bold;">
            <i class="fa-solid fa-plus"></i> Create New Character
        </div>
    </div>`;

    const entries = Object.entries(characters);
    
    // 2. Roster List
    let rosterHtml = '';
    if (entries.length === 0) {
        rosterHtml = `<div style="text-align:center;padding:40px;opacity:0.5;font-size:0.9em;">
            No character DNA found in this chat.
        </div>`;
    } else {
        rosterHtml = entries.map(([id, char]) => {
            if (id === '__new__') return ''; // Don't show ghost in the list
            const isEnabled = activeRoster.includes(id);
            const isActive = id === activeId;
            const displayName = char.label || id.replace(/_/g, ' ');
            return `
            <div class="plz-roster-item ${isActive ? 'plz-active-char' : ''}" data-id="${escapeHtml(id)}">
                <div class="plz-roster-text">
                    <strong>${isActive ? '<i class="fa-solid fa-user"></i> ' : ''}${escapeHtml(displayName)}</strong>
                    <small>${escapeHtml(char.identityAnchor || '—')}</small>
                </div>
                <div class="plz-roster-actions">
                    <i class="fa-solid ${isEnabled ? 'fa-toggle-on' : 'fa-toggle-off'} plz-dna-toggle" 
                       style="font-size:1.3em; cursor:pointer; color:${isEnabled ? 'var(--SmartThemeQuoteColor)' : 'inherit'};"></i>
                    <i class="fa-solid fa-pen-to-square plz-dna-edit" title="Edit DNA in Studio"></i>
                </div>
            </div>`;
        }).join('');
    }

    return addNewHtml + rosterHtml;
}

const ENGINE_OPTIONS = [
    { value: 'pollinations', label: 'Pollinations',  key: 'engineEnablePollinations' },
    { value: 'fal',          label: 'Fal AI',        key: 'engineEnableFal'          },
    { value: 'piapi',        label: 'PiAPI',         key: 'engineEnablePiAPI'        },
];

/** Renders the Studio dashboard with the Dynamic Layered Grid. */
export function getStudioHTML(characterId, character, layers, enabledEngines = {}, styleLibrary = {}, defaultStyleName = '') {
    const isGhost = characterId === '__new__';
    const displayName = character.label || characterId.replace(/_/g, ' ');
    const akaTagsHTML = (character.aka || []).map(alias => `
        <span class="plz-aka-tag" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;background:rgba(255,255,255,0.08);font-size:0.8em;">
            ${escapeHtml(alias)}<i class="fa-solid fa-xmark plz-aka-remove" data-alias="${escapeHtml(alias)}" style="cursor:pointer;opacity:0.6;"></i>
        </span>`).join('');

    const pinnedEngine = character.engine || '';
    const engineOptionsHTML = ENGINE_OPTIONS
        .filter(e => enabledEngines[e.key])
        .map(e => `<option value="${e.value}" ${pinnedEngine === e.value ? 'selected' : ''}>${escapeHtml(e.label)}</option>`)
        .join('');

    // Generate dynamic rows for clothing slots
    const slots = character.slots || [...BASE_SLOTS];
    const slotsHTML = slots.map(key => {
        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        const isDeletable = !BASE_SLOTS.includes(key);
        return getLayerInputHTML(label, key, layers[key], isDeletable);
    }).join('');

    const idLabel = isGhost 
        ? `<small style="opacity:0.35;"><i>Unsaved Character</i></small>`
        : `<small style="opacity:0.35;">System ID: ${escapeHtml(characterId)}</small>`;

    return `
    <div style="margin-bottom:10px;">
        <input id="plz-studio-label" class="text_pole" type="text" value="${isGhost ? '' : escapeHtml(displayName)}"
               placeholder="Character Name"
               style="width:100%;font-size:1.1em;font-weight:bold;margin-bottom:4px;" />
        <div style="display:flex;justify-content:space-between;align-items:center;">
            ${idLabel}
            <button class="menu_button plz-save-ensemble-btn" style="font-size:0.8em;" ${isGhost ? 'disabled title="Save character first"' : ''}>Save as Ensemble</button>
        </div>
    </div>

    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:5px;">
        <label class="plz-studio-label">Identity Anchor</label>
        <button class="menu_button plz-anchor-scan" data-mode="studio" style="font-size:0.75em;padding:2px 8px;">Scan Chat</button>
    </div>
    <textarea id="plz-studio-anchor" class="text_pole plz-auto-textarea" rows="2"
              placeholder="Permanent physical features (face, hair, build)..."
              style="width:100%;margin-bottom:12px;font-size:0.88em;">${escapeHtml(character.identityAnchor)}</textarea>

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

    <div style="display:grid;grid-template-columns: 1fr 1fr;gap:10px;margin-bottom:12px;">
        ${slotsHTML}
        ${getEmotionInputHTML(layers.emotion)}
        ${getPoseInputHTML(layers.pose)}
    </div>

    <div style="display:flex; gap:6px; margin-bottom:20px;">
        <button id="plz-studio-add-slot" class="menu_button" style="font-size:0.85em;"><i class="fa-solid fa-plus"></i> Add Category</button>
        <div style="flex:1;"></div>
        <input id="plz-studio-hint" type="text" class="text_pole" placeholder="Hint (e.g. 'Formal')" style="width:120px; font-size:0.85em;" />
        <button id="plz-studio-force-costume" class="menu_button" style="font-size:0.85em;">Scan</button>
        ${isGhost ? '<button id="plz-studio-layers-save" class="menu_button" style="padding:0 15px;">Register &amp; Apply</button>' : ''}
    </div>

    <div style="margin-bottom:8px;"><strong>Saved Ensembles</strong> <small style="opacity:0.5; font-weight:normal;">(★ = Everyday Wear)</small></div>
    <div id="plz-studio-ensembles">
        ${getEnsembleListHTML(character.ensembles, character.defaultEnsemble)}
    </div>

    <div style="margin-top:20px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.07);">
        <label class="plz-studio-label" style="display:block;margin-bottom:6px;">Portrait Style</label>
        <select id="plz-studio-style" class="text_pole" style="width:100%;margin-bottom:16px;">
            <option value="" ${!character.styleName ? 'selected' : ''}>Use Default (${escapeHtml(defaultStyleName || 'Default')})</option>
            ${Object.keys(styleLibrary).map(n =>
                `<option value="${escapeHtml(n)}" ${character.styleName === n ? 'selected' : ''}>${escapeHtml(n)}</option>`
            ).join('')}
        </select>

        <label class="plz-studio-label" style="display:block;margin-bottom:6px;">Preferred Image Engine</label>
        <select id="plz-studio-engine" class="text_pole" style="width:100%;margin-bottom:16px;">
            <option value="" ${!pinnedEngine ? 'selected' : ''}>Use Global Default</option>
            ${engineOptionsHTML}
        </select>

        <div style="border:1px solid rgba(var(--SmartThemeErrorColor-rgb, 200,60,60),0.3);border-radius:6px;padding:10px 12px;">
            <div style="font-size:0.8em;opacity:0.6;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Maintenance</div>
            <button id="plz-studio-purge" class="menu_button" style="width:100%;color:var(--SmartThemeErrorColor, #c83c3c);" ${isGhost ? 'disabled' : ''}>
                <i class="fa-solid fa-trash-can"></i> Purge Character Portraits
            </button>
        </div>
    </div>`;
}

function getLayerInputHTML(label, key, val, deletable = false) {
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
        <div style="display:flex;gap:4px;">
            <input class="plz-layer-item text_pole" data-slot="${key}" type="text" placeholder="Item" list="plz-items-list" value="${escapeHtml(item)}" style="flex:2;" />
            <input class="plz-layer-mod text_pole" data-slot="${key}" type="text" placeholder="Mod" list="plz-mods-list" value="${escapeHtml(mod)}" style="flex:1;" />
        </div>
    </div>`;
}

function getEmotionInputHTML(val) {
    return `
    <div class="plz-layer-input">
        <label style="font-size:0.75em;opacity:0.6;display:block;margin-bottom:2px;">Emotion</label>
        <input id="plz-layer-emotion" class="text_pole" type="text" placeholder="Mood/Adjective" value="${escapeHtml(val || '')}" style="width:100%;" />
    </div>`;
}

function getPoseInputHTML(val) {
    return `
    <div class="plz-layer-input">
        <label style="font-size:0.75em;opacity:0.6;display:block;margin-bottom:2px;">Pose</label>
        <input id="plz-layer-pose" class="text_pole" type="text" placeholder="Stance/Position" value="${escapeHtml(val || '')}" style="width:100%;" />
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