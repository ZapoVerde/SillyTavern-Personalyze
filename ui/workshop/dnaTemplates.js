/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaTemplates.js
 * @stamp {"utc":"2026-04-09T00:00:00.000Z"}
 * @architectural-role Pure UI Templates
 * @description
 * Generates the HTML strings for the Personalyze Workshop DNA views.
 *
 * Pure functions: take data in, return HTML strings out. No DOM reads,
 * no state mutations, no IO calls. All dynamic rendering is triggered
 * by dnaListeners.js and core.js after they obtain the necessary data.
 *
 * @api-declaration
 * getBaseWorkshopHTML() — main modal shell (DNA / Studio / Library / Add tabs)
 * getDnaRosterHTML(characters, activeRoster, activeId) — DNA tab roster list
 * getStudioHTML(characterId, character, fileIndex, expressionLabels, lastExpr) — Studio tab
 * getStudioEmptyHTML() — Studio placeholder when no character is selected
 * getAddCharacterHTML() — Add tab form for creating a new character in chat DNA
 *
 * @contract
 *   assertions:
 *     purity: Pure
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../../utils/history.js';
import { buildFilenamePrefix, findCachedImage } from '../../imageCache.js';
import { getSettings } from '../../settings.js';

/**
 * Builds the provider dropdown options based on master availability toggles.
 */
function getProviderOptionsHTML(selectedProvider) {
    const s = getSettings();
    const options = [];
    if (s.engineEnablePollinations !== false) options.push(['pollinations', 'Pol']);
    if (s.engineEnableFal) options.push(['fal', 'Fal']);
    if (s.engineEnablePiAPI) options.push(['piapi', 'PiAPI']);
    if (s.engineEnableHuggingFace) options.push(['huggingface', 'HF']);
    if (options.length === 0) options.push(['pollinations', 'Pol']);

    return options.map(([val, label]) => 
        `<option value="${val}" ${val === selectedProvider ? 'selected' : ''}>${label}</option>`
    ).join('');
}

/**
 * Main modal shell.
 */
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
                    <button class="plz-tab-btn menu_button" data-tab="add">Add</button>
                </div>
            </div>
            <div class="plz-workshop-body">
                <div id="plz-tab-dna"     class="plz-tab-panel plz-hidden"></div>
                <div id="plz-tab-studio"  class="plz-tab-panel plz-hidden"></div>
                <div id="plz-tab-library" class="plz-tab-panel plz-hidden"></div>
                <div id="plz-tab-add"     class="plz-tab-panel plz-hidden"></div>
            </div>
        </div>
    </div>`;
}

/**
 * DNA Tab — list of characters currently defined in the chat history.
 */
export function getDnaRosterHTML(characters, activeRoster, activeId) {
    const entries = Object.entries(characters);
    if (entries.length === 0) {
        return `<div style="text-align:center;padding:60px;opacity:0.5;">
            <i class="fa-solid fa-ghost" style="font-size:2.5em;margin-bottom:12px;"></i><br/>
            No character DNA found in this chat.<br/>Use the <strong>Library</strong> tab to import one.
        </div>`;
    }

    return entries.map(([id, char]) => {
        const isEnabled = activeRoster.includes(id);
        const isActive = id === activeId;
        const toggleIcon = isEnabled
            ? `<i class="fa-solid fa-toggle-on plz-dna-toggle" style="font-size:1.3em;color:var(--SmartThemeQuoteColor);cursor:pointer;"></i>`
            : `<i class="fa-solid fa-toggle-off plz-dna-toggle" style="font-size:1.3em;opacity:0.35;cursor:pointer;"></i>`;

        return `
        <div class="plz-roster-item ${isActive ? 'plz-active-char' : ''}" data-id="${escapeHtml(id)}" style="${isEnabled ? '' : 'opacity:0.6;'}">
            <div class="plz-roster-text">
                <strong>${isActive ? '<i class="fa-solid fa-user"></i> ' : ''}${escapeHtml(id.replace(/_/g, ' '))}</strong>
                <small>${escapeHtml(char.identityAnchor || '—')}</small>
            </div>
            <div class="plz-roster-actions">
                ${toggleIcon}
                <i class="fa-solid fa-pen-to-square plz-dna-edit" title="Edit DNA in Studio"></i>
                <i class="fa-solid fa-floppy-disk plz-dna-export" title="Export to Global Library"></i>
            </div>
        </div>`;
    }).join('');
}

/**
 * Studio Tab — detailed editing for a character's local DNA.
 */
export function getStudioHTML(characterId, character, fileIndex, expressionLabels, lastExpr) {
    const label = characterId.replace(/_/g, ' ');
    return `
    <div style="flex-shrink:0;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
        <div>
            <strong style="font-size:1.05em;">${escapeHtml(label)}</strong>
            <span style="font-size:0.8em;opacity:0.5;margin-left:8px;">[DNA Working Copy]</span>
        </div>
        <button class="menu_button plz-flush-images-btn" style="font-size:0.8em;padding:2px 8px;"><i class="fa-solid fa-trash-can"></i> Flush Images</button>
    </div>
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:5px;">
        <label class="plz-studio-label" style="margin-bottom:0;">Identity Anchor</label>
        <button class="menu_button plz-anchor-scan" data-mode="studio" style="font-size:0.78em;padding:2px 8px;">
            <i class="fa-solid fa-wand-magic-sparkles"></i> Scan Chat
        </button>
    </div>
    <textarea id="plz-studio-anchor" class="text_pole plz-auto-textarea" rows="3" style="width:100%;margin-bottom:12px;overflow:hidden;resize:none;">${escapeHtml(character.identityAnchor)}</textarea>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
        <button id="plz-studio-anchor-save" class="menu_button">Commit Anchor to DNA</button>
        <label style="font-size:0.85em;opacity:0.7;">Seed
            <input id="plz-studio-seed" type="number" min="1" max="98" value="${character.seed}" style="width:60px;margin-left:5px;" class="text_pole" />
        </label>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <strong>Outfits</strong>
        <button class="menu_button plz-add-entry-btn" data-dimension="outfit" style="font-size:0.8em;padding:2px 8px;"><i class="fa-solid fa-plus"></i> Add Outfit</button>
    </div>
    <div id="plz-studio-outfits" style="margin-bottom:20px;">
        ${getEntryListHTML(characterId, character.outfits, 'outfit', fileIndex, expressionLabels, lastExpr)}
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <strong>Expressions</strong>
        <button class="menu_button plz-add-entry-btn" data-dimension="expression" style="font-size:0.8em;padding:2px 8px;"><i class="fa-solid fa-plus"></i> Add Custom</button>
    </div>
    <div id="plz-studio-expressions">${getEntryListHTML(characterId, character.expressions, 'expression', fileIndex, [])}</div>`;
}

function getEntryListHTML(characterId, entries, dimension, fileIndex, exprLabels, lastExpr) {
    const keys = Object.keys(entries);
    if (keys.length === 0 && dimension === 'outfit') return `<p style="opacity:0.45;font-size:0.88em;">No outfits defined in DNA.</p>`;
    if (keys.length === 0 && dimension === 'expression') return `<p style="opacity:0.45;font-size:0.88em;">Using standard emotion labels.</p>`;

    return keys.map(key => {
        const entry = entries[key];
        const imgCount = dimension === 'outfit'
            ? [...fileIndex].filter(f => f.startsWith(buildFilenamePrefix(characterId, key, ''))).length
            : [...fileIndex].filter(f => f.includes(`_${key}_`)).length;

        const engineSelector = dimension === 'outfit' ? `
            <div style="display:flex;align-items:center;gap:5px;margin-left:auto;">
                <select class="plz-entry-provider text_pole" style="font-size:0.75em;padding:1px 4px;">${getProviderOptionsHTML(entry.provider)}</select>
            </div>` : '';

        return `
        <div class="plz-studio-entry" data-key="${escapeHtml(key)}" data-dimension="${dimension}">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <strong style="font-size:0.9em;">${escapeHtml(entry.label)}</strong>
                ${engineSelector}
                <span style="font-size:0.72em;opacity:0.4;">${imgCount} img</span>
            </div>
            <textarea class="text_pole plz-auto-textarea plz-entry-description" data-key="${escapeHtml(key)}" data-dimension="${dimension}" style="width:100%;font-family:monospace;font-size:0.85em;overflow:hidden;resize:none;">${escapeHtml(entry.description)}</textarea>
            <div style="display:flex;gap:6px;margin-top:4px;">
                <button class="menu_button plz-entry-save-btn" data-key="${escapeHtml(key)}" data-dimension="${dimension}" style="font-size:0.78em;padding:2px 8px;">Commit to DNA</button>
            </div>
            ${dimension === 'outfit' ? getOutfitPortraitSectionHTML(characterId, key, fileIndex, exprLabels, lastExpr) : ''}
        </div>`;
    }).join('');
}

function getOutfitPortraitSectionHTML(characterId, outfitKey, fileIndex, exprLabels, lastExpr) {
    if (exprLabels.length === 0) return '';
    const preSelected = exprLabels.includes(lastExpr) ? lastExpr : null;
    const pills = exprLabels.map(label => {
        const hasImage = findCachedImage(buildFilenamePrefix(characterId, outfitKey, label), fileIndex) !== null;
        let cls = hasImage ? ' plz-expr-has-image' : '';
        if (label === preSelected) cls += ' plz-expr-selected';
        return `<span class="plz-expr-pill${cls}" data-label="${escapeHtml(label)}">${hasImage ? '✓ ' : ''}${escapeHtml(label)}</span>`;
    }).join('');

    return `
    <div class="plz-portrait-section" data-outfit-key="${escapeHtml(outfitKey)}" data-selected-expr="${escapeHtml(preSelected || '')}">
        <div class="plz-expr-pills">${pills}</div>
        <div class="plz-portrait-actions">
            <button class="menu_button plz-portrait-preview-btn" ${preSelected ? '' : 'disabled'} style="font-size:0.78em;padding:2px 8px;"><i class="fa-solid fa-eye"></i> Preview</button>
            <button class="menu_button plz-portrait-generate-btn" ${preSelected ? '' : 'disabled'} style="font-size:0.78em;padding:2px 8px;"><i class="fa-solid fa-image"></i> Gen</button>
        </div>
        <div class="plz-portrait-preview-area plz-hidden"><img class="plz-portrait-preview-img" src="" /><div class="plz-portrait-preview-label"></div></div>
    </div>`;
}

export function getStudioEmptyHTML() {
    return `<div style="text-align:center;padding:60px;opacity:0.5;">
        <i class="fa-solid fa-compass-drafting" style="font-size:3em;margin-bottom:15px;"></i><br/>
        Select a character from the DNA tab to edit their local working copy.
    </div>`;
}

/**
 * Add Tab — form to manually create a new character and inject them into chat DNA.
 */
export function getAddCharacterHTML() {
    return `
    <div style="margin-bottom:20px;flex-shrink:0;">
        <h4 style="margin:0 0 6px;">Add a Character</h4>
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:5px;">
            <label class="plz-studio-label" style="margin-bottom:0;">Character Name</label>
            <button class="menu_button plz-anchor-scan" data-mode="add" style="font-size:0.78em;padding:2px 8px;">
                <i class="fa-solid fa-wand-magic-sparkles"></i> Scan Chat
            </button>
        </div>
        <input type="text" id="plz-add-name" class="text_pole" placeholder="e.g. Alice" style="width:100%;margin-bottom:4px;" />
        <div style="font-size:0.8em;opacity:0.5;margin-bottom:10px;">Key: <span id="plz-add-key-preview">—</span></div>
        <label class="plz-studio-label">Identity Anchor</label>
        <textarea id="plz-add-anchor" class="text_pole plz-auto-textarea" rows="4"
                  style="width:100%;margin-bottom:16px;overflow:hidden;resize:none;" spellcheck="false"></textarea>
    </div>
    <button id="plz-add-submit" class="menu_button" style="width:100%;padding:10px;">
        <i class="fa-solid fa-user-plus"></i> Add to DNA
    </button>`;
}