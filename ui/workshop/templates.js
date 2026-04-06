/**
 * @file data/default-user/extensions/personalyze/ui/workshop/templates.js
 * @stamp {"utc":"2026-04-05T00:00:00.000Z"}
 * @architectural-role Pure UI Templates
 * @description
 * Pure functions for generating the PersonaLyze Character Workshop HTML.
 *
 * @api-declaration
 * getBaseWorkshopHTML()                            → string
 * getRosterHTML(characters)                        → string
 * getStudioHTML(characterId, character, fileIndex) → string
 * getRegisterHTML()                                → string
 *
 * @contract
 *   assertions:
 *     purity: pure
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../../utils/history.js';
import { buildFilenamePrefix, findCachedImage } from '../../imageCache.js';

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
 * Roster tab — list of all registered characters with per-chat enable/disable toggles.
 * Enabled characters (in activeRoster) sort to the top; disabled sink to the bottom.
 *
 * @param {object}      characters   { characterId: { identityAnchor, outfits, expressions } }
 * @param {string|null} activeId     Currently active character from runtime state.
 * @param {string[]}    activeRoster IDs of characters enabled for this chat.
 */
export function getRosterHTML(characters, activeId, activeRoster = []) {
    const entries = Object.entries(characters);

    if (entries.length === 0) {
        return `
        <div style="text-align:center;padding:60px;opacity:0.5;">
            <i class="fa-solid fa-user-slash" style="font-size:2.5em;margin-bottom:12px;"></i><br/>
            No characters registered yet.<br/>
            Use the <strong>Register</strong> tab to add one manually,<br/>
            or PLZ will register them automatically during a chat.
        </div>`;
    }

    // Enabled characters first, then disabled — stable within each group.
    const sorted = [...entries].sort(([aId], [bId]) => {
        const aOn = activeRoster.includes(aId);
        const bOn = activeRoster.includes(bId);
        if (aOn === bOn) return 0;
        return aOn ? -1 : 1;
    });

    const enabledCount = activeRoster.filter(id => id in characters).length;
    const hint = enabledCount === 0
        ? `<p style="font-size:0.82em;opacity:0.5;margin:0 0 10px;">
               No characters enabled for this chat. Toggle one on to start.
           </p>`
        : `<p style="font-size:0.82em;opacity:0.5;margin:0 0 10px;">
               ${enabledCount} character${enabledCount !== 1 ? 's' : ''} enabled for this chat.
           </p>`;

    const rows = sorted.map(([id, char]) => {
        const isActive  = id === activeId;
        const isEnabled = activeRoster.includes(id);
        const outfitCount = Object.keys(char.outfits ?? {}).length;
        const exprCount   = Object.keys(char.expressions ?? {}).length;
        const label       = id.replace(/_/g, ' ');

        const toggleIcon  = isEnabled
            ? `<i class="fa-solid fa-toggle-on  plz-roster-toggle" title="Enabled — click to disable"
                  style="font-size:1.3em;color:var(--SmartThemeQuoteColor);cursor:pointer;"></i>`
            : `<i class="fa-solid fa-toggle-off plz-roster-toggle" title="Disabled — click to enable"
                  style="font-size:1.3em;opacity:0.35;cursor:pointer;"></i>`;

        const dimStyle = isEnabled ? '' : 'opacity:0.45;';

        return `
        <div class="plz-roster-item ${isActive ? 'plz-active-char' : ''}" data-id="${escapeHtml(id)}"
             style="${dimStyle}">
            <div class="plz-roster-text">
                <strong>${isActive ? '<i class="fa-solid fa-user"></i> ' : ''}${escapeHtml(label)}</strong>
                <small>${escapeHtml(char.identityAnchor ?? '—')}</small>
                <small style="opacity:0.5;">${outfitCount} outfit(s) · ${exprCount} expression(s)</small>
            </div>
            <div class="plz-roster-actions">
                ${toggleIcon}
                <i class="fa-solid fa-pen-to-square plz-roster-edit"   title="Open in Studio"></i>
                <i class="fa-solid fa-trash          plz-roster-delete" title="Delete character"></i>
            </div>
        </div>`;
    }).join('');

    return hint + rows;
}

/**
 * Studio tab — edit a specific character's anchor, outfits, and expressions.
 * @param {string}   characterId
 * @param {object}   character       { identityAnchor, outfits, expressions }
 * @param {Set<string>} fileIndex    Known image filenames on disk.
 * @param {string[]} expressionLabels  Global expression palette for the portrait picker.
 * @param {string|null} defaultExpression  Pre-selected expression (last-known from chain).
 */
export function getStudioHTML(characterId, character, fileIndex, expressionLabels = [], defaultExpression = null) {
    const label = characterId.replace(/_/g, ' ');

    return `
    <div style="flex-shrink:0;margin-bottom:16px;">
        <strong style="font-size:1.05em;">${escapeHtml(label)}</strong>
        <span style="font-size:0.8em;opacity:0.5;margin-left:8px;">[${escapeHtml(characterId)}]</span>
    </div>

    <!-- Identity Anchor -->
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:5px;">
        <label class="plz-studio-label" style="margin-bottom:0;">Identity Anchor
            <span style="font-size:0.78em;opacity:0.55;margin-left:6px;">permanent appearance used in every generation prompt</span>
        </label>
        <button class="menu_button plz-anchor-scan" data-mode="studio"
                title="Scan recent chat to refresh this anchor"
                style="font-size:0.78em;padding:2px 8px;flex-shrink:0;margin-left:8px;">
            <i class="fa-solid fa-wand-magic-sparkles"></i> Scan Chat
        </button>
    </div>
    <textarea id="plz-studio-anchor" class="text_pole plz-auto-textarea" rows="3"
              style="width:100%;margin-bottom:12px;">${escapeHtml(character.identityAnchor ?? '')}</textarea>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
        <button id="plz-studio-anchor-save" class="menu_button">Save Anchor</button>
        <label style="font-size:0.85em;opacity:0.7;margin:0;">Seed
            <input id="plz-studio-seed" type="number" min="1" max="98" value="${escapeHtml(String(character.seed ?? 1))}"
                   style="width:60px;margin-left:5px;" class="text_pole" />
        </label>
    </div>

    <!-- Outfits -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-shrink:0;">
        <strong>Outfits</strong>
        <button class="menu_button plz-add-entry-btn" data-dimension="outfit" style="font-size:0.8em;padding:2px 8px;">
            <i class="fa-solid fa-plus"></i> Add Outfit
        </button>
    </div>
    <div id="plz-studio-outfits" style="margin-bottom:20px;">
        ${getEntryListHTML(characterId, character.outfits ?? {}, 'outfit', fileIndex, expressionLabels, defaultExpression)}
    </div>

    <!-- Expressions -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-shrink:0;">
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
 * Renders the list of entries (outfits or expressions) for the Studio.
 * @param {string}   characterId
 * @param {object}   entries          { key: { label, description } }
 * @param {'outfit'|'expression'} dimension
 * @param {Set<string>} fileIndex
 * @param {string[]} expressionLabels   Portrait picker labels (outfit entries only).
 * @param {string|null} defaultExpression  Pre-selected expression for the portrait section.
 */
/**
 * Renders the list of entries (outfits or expressions) for the Studio.
 */
export function getEntryListHTML(characterId, entries, dimension, fileIndex, expressionLabels = [], defaultExpression = null) {
    const keys = Object.keys(entries);

    if (keys.length === 0) {
        return `<p style="opacity:0.45;font-size:0.88em;margin:0 0 8px;">None registered.</p>`;
    }

    return keys.map(key => {
        const entry    = entries[key];
        const imgCount = dimension === 'outfit'
            ? [...fileIndex].filter(f => f.startsWith(buildFilenamePrefix(characterId, key, ''))).length
            : [...fileIndex].filter(f => f.includes(`_${key}_`)).length;

        const portraitSection = dimension === 'outfit'
            ? getOutfitPortraitSectionHTML(characterId, key, fileIndex, expressionLabels, defaultExpression)
            : '';

        return `
        <div class="plz-studio-entry" data-key="${escapeHtml(key)}" data-dimension="${dimension}">
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px;">
                <strong style="font-size:0.9em;">${escapeHtml(entry.label)}</strong>
                <span style="font-size:0.75em;opacity:0.45;">[${escapeHtml(key)}]</span>
                <span style="font-size:0.72em;opacity:0.4;margin-left:auto;">${imgCount} image${imgCount !== 1 ? 's' : ''}</span>
            </div>
            <textarea class="text_pole plz-auto-textarea plz-entry-description" 
                      data-key="${escapeHtml(key)}" data-dimension="${dimension}"
                      style="width:100%;font-family:monospace;font-size:0.85em;"
                      spellcheck="false">${escapeHtml(entry.description ?? '')}</textarea>
            <div style="display:flex;gap:6px;margin-top:4px;">
                <button class="menu_button plz-entry-save-btn" data-key="${escapeHtml(key)}" data-dimension="${dimension}"
                        style="font-size:0.78em;padding:2px 8px;">Save</button>
                <button class="menu_button plz-entry-delete-btn" data-key="${escapeHtml(key)}" data-dimension="${dimension}"
                        style="font-size:0.78em;padding:2px 8px;">Delete</button>
            </div>
            ${portraitSection}
        </div>`;
    }).join('');
}


/**
 * Portrait generation sub-section for an outfit entry.
 * Renders expression picker pills and thumbnail/generate buttons.
 * @param {string}   characterId
 * @param {string}   outfitKey
 * @param {Set<string>} fileIndex
 * @param {string[]} expressionLabels
 */
function getOutfitPortraitSectionHTML(characterId, outfitKey, fileIndex, expressionLabels, defaultExpression = null) {
    if (expressionLabels.length === 0) return '';

    // Use defaultExpression only if it's actually in the label list
    const preSelected = expressionLabels.includes(defaultExpression) ? defaultExpression : null;
    const buttonsDisabled = preSelected ? '' : 'disabled';

    const pills = expressionLabels.map(label => {
        const hasImage  = findCachedImage(buildFilenamePrefix(characterId, outfitKey, label), fileIndex) !== null;
        const isSelected = label === preSelected;
        let cls = hasImage ? ' plz-expr-has-image' : '';
        if (isSelected) cls += ' plz-expr-selected';
        const check = hasImage ? '<i class="fa-solid fa-check" style="font-size:0.8em;margin-right:3px;opacity:0.7;"></i>' : '';
        return `<span class="plz-expr-pill${cls}" data-label="${escapeHtml(label)}">${check}${escapeHtml(label)}</span>`;
    }).join('');

    return `
    <div class="plz-portrait-section" data-outfit-key="${escapeHtml(outfitKey)}" data-selected-expr="${escapeHtml(preSelected ?? '')}">
        <div class="plz-portrait-section-label">Generate Portrait — pick an expression:</div>
        <div class="plz-expr-pills">
            ${pills}
            <button class="plz-expr-add-btn" title="Add a custom expression to the global list">+ Add</button>
        </div>
        <div class="plz-portrait-actions">
            <button class="menu_button plz-portrait-preview-btn" data-key="${escapeHtml(outfitKey)}"
                    ${buttonsDisabled} style="font-size:0.78em;padding:2px 8px;">
                <i class="fa-solid fa-eye"></i> Thumbnail
            </button>
            <button class="menu_button plz-portrait-generate-btn" data-key="${escapeHtml(outfitKey)}"
                    ${buttonsDisabled} style="font-size:0.78em;padding:2px 8px;">
                <i class="fa-solid fa-image"></i> Generate &amp; Save
            </button>
        </div>
        <div class="plz-portrait-preview-area plz-hidden">
            <img class="plz-portrait-preview-img" src="" alt="portrait thumbnail" />
            <div class="plz-portrait-preview-label"></div>
        </div>
    </div>`;
}

/**
 * Register tab — form to manually seed a new character.
 */
export function getRegisterHTML() {
    return `
    <div style="margin-bottom:20px;flex-shrink:0;">
        <h4 style="margin:0 0 6px;">Register a Character</h4>
        <p style="opacity:0.7;font-size:0.9em;margin:0 0 16px;">
            Manually add a character to the Global Portfolio.
        </p>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
            <label class="plz-studio-label" style="margin-bottom:0;">Character Name</label>
            <button class="menu_button plz-anchor-scan" data-mode="register"
                    style="font-size:0.78em;padding:2px 8px;">
                <i class="fa-solid fa-wand-magic-sparkles"></i> Scan Chat
            </button>
        </div>
        <input type="text" id="plz-reg-name" class="text_pole" placeholder="e.g. Claire" style="width:100%;margin-bottom:4px;" />
        <div style="font-size:0.8em;opacity:0.5;margin-bottom:14px;">
            Key preview: <code id="plz-reg-key-preview">—</code>
        </div>

        <label class="plz-studio-label">Identity Anchor</label>
        <textarea id="plz-reg-anchor" class="text_pole plz-auto-textarea" rows="4"
                  placeholder="Permanent appearance description..."
                  style="width:100%;margin-bottom:16px;" spellcheck="false"></textarea>
    </div>

    <button id="plz-reg-submit" class="menu_button" style="width:100%;padding:10px;">
        <i class="fa-solid fa-user-plus"></i> Register Character
    </button>
    <div id="plz-reg-status" style="margin-top:10px;font-size:0.85em;opacity:0.7;"></div>`;
}

/**
 * Empty state for the Studio tab when no character is selected.
 */
export function getStudioEmptyHTML() {
    return `
    <div style="text-align:center;padding:60px;opacity:0.5;">
        <i class="fa-solid fa-compass-drafting" style="font-size:3em;margin-bottom:15px;"></i><br/>
        Select a character from the Roster to open them in the Studio.
    </div>`;
}
