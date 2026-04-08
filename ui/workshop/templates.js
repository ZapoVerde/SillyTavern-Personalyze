/**
 * @file data/default-user/extensions/personalyze/ui/workshop/templates.js
 * @stamp {"utc":"2026-04-07T00:00:00.000Z"}
 * @architectural-role Pure UI Templates
 * @description
 * Generates the HTML strings for the PersonaLyze Character Workshop.
 * 
 * Updated to support the Multi-Engine architecture. The provider selection
 * for outfits now dynamically filters based on master availability toggles
 * in the extension settings.
 *
 * @api-declaration
 * getBaseWorkshopHTML()                            → string
 * getRosterHTML(characters, activeId, activeRoster)→ string
 * getStudioHTML(characterId, character, fileIndex) → string
 * getRegisterHTML()                                → string
 * getStudioEmptyHTML()                             → string
 */

import { escapeHtml } from '../../utils/history.js';
import { buildFilenamePrefix, findCachedImage } from '../../imageCache.js';
import { getSettings } from '../../settings.js';

/**
 * Builds the provider dropdown options based on master availability toggles.
 * @param {string} selectedProvider 
 * @returns {string}
 */
function getProviderOptionsHTML(selectedProvider) {
    const s = getSettings();
    const options = [];

    if (s.engineEnablePollinations !== false) {
        options.push(['pollinations', 'Pol']);
    }
    if (s.engineEnableFal) {
        options.push(['fal', 'Fal']);
    }
    if (s.engineEnablePiAPI) {
        options.push(['piapi', 'PiAPI']);
    }
    if (s.engineEnableHuggingFace) {
        options.push(['huggingface', 'HF']);
    }

    // Fallback if no engines enabled
    if (options.length === 0) {
        options.push(['pollinations', 'Pol']);
    }

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
                    <h3 style="margin:0;"><i class="fa-solid fa-user"></i> Character Workshop</h3>
                    <button id="plz-workshop-close" class="menu_button" style="padding:2px 10px;">✕</button>
                </div>
                <div class="plz-tab-bar">
                    <button class="plz-tab-btn menu_button" data-tab="roster">Roster</button>
                    <button class="plz-tab-btn menu_button" data-tab="studio">Studio</button>
                    <button class="plz-tab-btn menu_button" data-tab="register">Register</button>
                </div>
            </div>

            <div class="plz-workshop-body">
                <div id="plz-tab-roster"   class="plz-tab-panel plz-hidden"></div>
                <div id="plz-tab-studio"   class="plz-tab-panel plz-hidden"></div>
                <div id="plz-tab-register" class="plz-tab-panel plz-hidden">
                    ${getRegisterHTML()}
                </div>
            </div>

        </div>
    </div>`;
}

/**
 * Roster tab — list of all registered characters.
 */
export function getRosterHTML(characters, activeId, activeRoster = []) {
    const entries = Object.entries(characters);

    if (entries.length === 0) {
        return `
        <div style="text-align:center;padding:60px;opacity:0.5;">
            <i class="fa-solid fa-user-slash" style="font-size:2.5em;margin-bottom:12px;"></i><br/>
            No characters registered yet.<br/>
            Use the <strong>Register</strong> tab to add one manually.
        </div>`;
    }

    const sorted = [...entries].sort(([aId], [bId]) => {
        const aOn = activeRoster.includes(aId);
        const bOn = activeRoster.includes(bId);
        if (aOn === bOn) return 0;
        return aOn ? -1 : 1;
    });

    const enabledCount = activeRoster.filter(id => id in characters).length;
    const hint = enabledCount === 0
        ? `<p style="font-size:0.82em;opacity:0.5;margin:0 0 10px;">No characters enabled for this chat.</p>`
        : `<p style="font-size:0.82em;opacity:0.5;margin:0 0 10px;">${enabledCount} character${enabledCount !== 1 ? 's' : ''} enabled.</p>`;

    const rows = sorted.map(([id, char]) => {
        const isActive  = id === activeId;
        const isEnabled = activeRoster.includes(id);
        const label       = id.replace(/_/g, ' ');

        const toggleIcon  = isEnabled
            ? `<i class="fa-solid fa-toggle-on plz-roster-toggle" style="font-size:1.3em;color:var(--SmartThemeQuoteColor);cursor:pointer;"></i>`
            : `<i class="fa-solid fa-toggle-off plz-roster-toggle" style="font-size:1.3em;opacity:0.35;cursor:pointer;"></i>`;

        return `
        <div class="plz-roster-item ${isActive ? 'plz-active-char' : ''}" data-id="${escapeHtml(id)}" style="${isEnabled ? '' : 'opacity:0.45;'}">
            <div class="plz-roster-text">
                <strong>${isActive ? '<i class="fa-solid fa-user"></i> ' : ''}${escapeHtml(label)}</strong>
                <small>${escapeHtml(char.identityAnchor ?? '—')}</small>
            </div>
            <div class="plz-roster-actions">
                ${toggleIcon}
                <i class="fa-solid fa-pen-to-square plz-roster-edit" title="Open in Studio"></i>
                <i class="fa-solid fa-trash plz-roster-delete" title="Delete character"></i>
            </div>
        </div>`;
    }).join('');

    return hint + rows;
}

/**
 * Studio tab content.
 */
export function getStudioHTML(characterId, character, fileIndex, expressionLabels = [], defaultExpression = null) {
    const label = characterId.replace(/_/g, ' ');

    return `
    <div style="flex-shrink:0;margin-bottom:16px;">
        <strong style="font-size:1.05em;">${escapeHtml(label)}</strong>
        <span style="font-size:0.8em;opacity:0.5;margin-left:8px;">[${escapeHtml(characterId)}]</span>
    </div>

    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:5px;">
        <label class="plz-studio-label" style="margin-bottom:0;">Identity Anchor</label>
        <button class="menu_button plz-anchor-scan" data-mode="studio" style="font-size:0.78em;padding:2px 8px;">
            <i class="fa-solid fa-wand-magic-sparkles"></i> Scan Chat
        </button>
    </div>
    <textarea id="plz-studio-anchor" class="text_pole plz-auto-textarea" rows="3"
              style="width:100%;margin-bottom:12px;overflow:hidden;resize:none;">${escapeHtml(character.identityAnchor ?? '')}</textarea>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
        <button id="plz-studio-anchor-save" class="menu_button">Save Anchor</button>
        <label style="font-size:0.85em;opacity:0.7;margin:0;">Seed
            <input id="plz-studio-seed" type="number" min="1" max="98" value="${escapeHtml(String(character.seed ?? 1))}"
                   style="width:60px;margin-left:5px;" class="text_pole" />
        </label>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <strong>Outfits</strong>
        <div style="display:flex;gap:6px;">
            <button class="menu_button plz-flush-images-btn" style="font-size:0.8em;padding:2px 8px;">
                <i class="fa-solid fa-trash-can"></i> Flush Images
            </button>
            <button class="menu_button plz-add-entry-btn" data-dimension="outfit" style="font-size:0.8em;padding:2px 8px;">
                <i class="fa-solid fa-plus"></i> Add Outfit
            </button>
        </div>
    </div>
    <div id="plz-studio-outfits" style="margin-bottom:20px;">
        ${getEntryListHTML(characterId, character.outfits ?? {}, 'outfit', fileIndex, expressionLabels, defaultExpression)}
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <strong>Expressions</strong>
        <button class="menu_button plz-add-entry-btn" data-dimension="expression" style="font-size:0.8em;padding:2px 8px;">
            <i class="fa-solid fa-plus"></i> Add Expression
        </button>
    </div>
    <div id="plz-studio-expressions">
        ${getEntryListHTML(characterId, character.expressions ?? {}, 'expression', fileIndex, [])}
    </div>`;
}

/**
 * Entry list for outfits and expressions.
 */
export function getEntryListHTML(characterId, entries, dimension, fileIndex, expressionLabels = [], defaultExpression = null) {
    const keys = Object.keys(entries);
    if (keys.length === 0) return `<p style="opacity:0.45;font-size:0.88em;">None registered.</p>`;

    return keys.map(key => {
        const entry = entries[key];
        const provider = entry.provider ?? 'pollinations';
        const imgCount = dimension === 'outfit'
            ? [...fileIndex].filter(f => f.startsWith(buildFilenamePrefix(characterId, key, ''))).length
            : [...fileIndex].filter(f => f.includes(`_${key}_`)).length;

        const portraitSection = dimension === 'outfit'
            ? getOutfitPortraitSectionHTML(characterId, key, fileIndex, expressionLabels, defaultExpression)
            : '';

        const engineSelector = dimension === 'outfit' ? `
            <div style="display:flex; align-items:center; gap:5px; margin-left:auto;">
                <span style="font-size:0.7em; opacity:0.5; text-transform:uppercase;">Engine</span>
                <select class="plz-entry-provider text_pole" style="font-size:0.75em; padding:1px 4px; height:auto; width:auto;">
                    ${getProviderOptionsHTML(provider)}
                </select>
                ${provider !== 'pollinations' ? '<i class="fa-solid fa-cloud" title="External Engine" style="font-size:0.8em; color:var(--SmartThemeQuoteColor); margin-left:5px;"></i>' : ''}
            </div>` : '';

        return `
        <div class="plz-studio-entry" data-key="${escapeHtml(key)}" data-dimension="${dimension}">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <strong style="font-size:0.9em;">${escapeHtml(entry.label)}</strong>
                <span style="font-size:0.75em;opacity:0.45;">[${escapeHtml(key)}]</span>
                ${engineSelector}
                <span style="font-size:0.72em;opacity:0.4;margin-left:8px;">${imgCount} image${imgCount !== 1 ? 's' : ''}</span>
            </div>
            <textarea class="text_pole plz-auto-textarea plz-entry-description" 
                      data-key="${escapeHtml(key)}" data-dimension="${dimension}"
                      style="width:100%;font-family:monospace;font-size:0.85em;overflow:hidden;resize:none;"
                      spellcheck="false">${escapeHtml(entry.description ?? '')}</textarea>
            <div style="display:flex;gap:6px;margin-top:4px;">
                <button class="menu_button plz-entry-save-btn" data-key="${escapeHtml(key)}" data-dimension="${dimension}" style="font-size:0.78em;padding:2px 8px;">Save</button>
                <button class="menu_button plz-entry-delete-btn" data-key="${escapeHtml(key)}" data-dimension="${dimension}" style="font-size:0.78em;padding:2px 8px;">Delete</button>
            </div>
            ${portraitSection}
        </div>`;
    }).join('');
}

/**
 * Outfit portrait generation section.
 */
function getOutfitPortraitSectionHTML(characterId, outfitKey, fileIndex, expressionLabels, defaultExpression = null) {
    if (expressionLabels.length === 0) return '';
    const preSelected = expressionLabels.includes(defaultExpression) ? defaultExpression : null;

    const pills = expressionLabels.map(label => {
        const hasImage = findCachedImage(buildFilenamePrefix(characterId, outfitKey, label), fileIndex) !== null;
        const isSelected = label === preSelected;
        let cls = hasImage ? ' plz-expr-has-image' : '';
        if (isSelected) cls += ' plz-expr-selected';
        const check = hasImage ? '<i class="fa-solid fa-check" style="font-size:0.8em;margin-right:3px;opacity:0.7;"></i>' : '';
        return `<span class="plz-expr-pill${cls}" data-label="${escapeHtml(label)}">${check}${escapeHtml(label)}</span>`;
    }).join('');

    return `
    <div class="plz-portrait-section" data-outfit-key="${escapeHtml(outfitKey)}" data-selected-expr="${escapeHtml(preSelected ?? '')}">
        <div class="plz-portrait-section-label">Generate Portrait — pick an expression:</div>
        <div class="plz-expr-pills">${pills}</div>
        <div class="plz-portrait-actions">
            <button class="menu_button plz-portrait-preview-btn" data-key="${escapeHtml(outfitKey)}" ${preSelected ? '' : 'disabled'} style="font-size:0.78em;padding:2px 8px;"><i class="fa-solid fa-eye"></i> Thumbnail</button>
            <button class="menu_button plz-portrait-generate-btn" data-key="${escapeHtml(outfitKey)}" ${preSelected ? '' : 'disabled'} style="font-size:0.78em;padding:2px 8px;"><i class="fa-solid fa-image"></i> Generate &amp; Save</button>
        </div>
        <div class="plz-portrait-preview-area plz-hidden">
            <img class="plz-portrait-preview-img" src="" alt="preview" />
            <div class="plz-portrait-preview-label"></div>
        </div>
    </div>`;
}

/**
 * Register tab content.
 */
export function getRegisterHTML() {
    return `
    <div style="margin-bottom:20px;flex-shrink:0;">
        <h4 style="margin:0 0 6px;">Register a Character</h4>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
            <label class="plz-studio-label" style="margin-bottom:0;">Character Name</label>
            <button class="menu_button plz-anchor-scan" data-mode="register" style="font-size:0.78em;padding:2px 8px;">
                <i class="fa-solid fa-wand-magic-sparkles"></i> Scan Chat
            </button>
        </div>
        <input type="text" id="plz-reg-name" class="text_pole" style="width:100%;margin-bottom:4px;" />
        <label class="plz-studio-label">Identity Anchor</label>
        <textarea id="plz-reg-anchor" class="text_pole plz-auto-textarea" rows="4" style="width:100%;margin-bottom:16px;overflow:hidden;resize:none;" spellcheck="false"></textarea>
    </div>
    <button id="plz-reg-submit" class="menu_button" style="width:100%;padding:10px;"><i class="fa-solid fa-user-plus"></i> Register Character</button>`;
}

/**
 * Empty Studio placeholder.
 */
export function getStudioEmptyHTML() {
    return `
    <div style="text-align:center;padding:60px;opacity:0.5;">
        <i class="fa-solid fa-compass-drafting" style="font-size:3em;margin-bottom:15px;"></i><br/>
        Select a character from the Roster to open the Studio.
    </div>`;
}