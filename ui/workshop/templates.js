/**
 * @file data/default-user/extensions/personalyze/ui/workshop/templates.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
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
import { buildFilename } from '../../imageCache.js';

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
 * @param {object} characters  { characterId: { identityAnchor, outfits, expressions } }
 * @param {string|null} activeId  Currently active character from runtime state.
 */
export function getRosterHTML(characters, activeId) {
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

    return entries.map(([id, char]) => {
        const isActive  = id === activeId;
        const outfitCount = Object.keys(char.outfits ?? {}).length;
        const exprCount   = Object.keys(char.expressions ?? {}).length;
        const label       = id.replace(/_/g, ' ');

        return `
        <div class="plz-roster-item ${isActive ? 'plz-active-char' : ''}" data-id="${escapeHtml(id)}">
            <div class="plz-roster-text">
                <strong>${isActive ? '<i class="fa-solid fa-user"></i> ' : ''}${escapeHtml(label)}</strong>
                <small>${escapeHtml(char.identityAnchor ?? '—')}</small>
                <small style="opacity:0.5;">${outfitCount} outfit(s) · ${exprCount} expression(s)</small>
            </div>
            <div class="plz-roster-actions">
                <i class="fa-solid fa-pen-to-square plz-roster-edit"   title="Open in Studio"></i>
                <i class="fa-solid fa-trash          plz-roster-delete" title="Delete character"></i>
            </div>
        </div>`;
    }).join('');
}

/**
 * Studio tab — edit a specific character's anchor, outfits, and expressions.
 * @param {string} characterId
 * @param {object} character  { identityAnchor, outfits, expressions }
 * @param {Set<string>} fileIndex  Known image filenames on disk.
 */
export function getStudioHTML(characterId, character, fileIndex) {
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
    <textarea id="plz-studio-anchor" class="text_pole" rows="3"
              style="width:100%;resize:vertical;margin-bottom:16px;">${escapeHtml(character.identityAnchor ?? '')}</textarea>
    <button id="plz-studio-anchor-save" class="menu_button" style="margin-bottom:20px;">Save Anchor</button>

    <!-- Outfits -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-shrink:0;">
        <strong>Outfits</strong>
        <button class="menu_button plz-add-entry-btn" data-dimension="outfit" style="font-size:0.8em;padding:2px 8px;">
            <i class="fa-solid fa-plus"></i> Add Outfit
        </button>
    </div>
    <div id="plz-studio-outfits" style="margin-bottom:20px;">
        ${getEntryListHTML(characterId, character.outfits ?? {}, 'outfit', fileIndex)}
    </div>

    <!-- Expressions -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-shrink:0;">
        <strong>Expressions</strong>
        <button class="menu_button plz-add-entry-btn" data-dimension="expression" style="font-size:0.8em;padding:2px 8px;">
            <i class="fa-solid fa-plus"></i> Add Expression
        </button>
    </div>
    <div id="plz-studio-expressions">
        ${getEntryListHTML(characterId, character.expressions ?? {}, 'expression', fileIndex)}
    </div>`;
}

/**
 * Renders the list of entries (outfits or expressions) for the Studio.
 * @param {string} characterId
 * @param {object} entries     { key: { label, description } }
 * @param {'outfit'|'expression'} dimension
 * @param {Set<string>} fileIndex
 */
export function getEntryListHTML(characterId, entries, dimension, fileIndex) {
    const keys = Object.keys(entries);

    if (keys.length === 0) {
        return `<p style="opacity:0.45;font-size:0.88em;margin:0 0 8px;">None registered.</p>`;
    }

    return keys.map(key => {
        const entry    = entries[key];
        // Count generated images that use this entry
        const imgCount = dimension === 'outfit'
            ? [...fileIndex].filter(f => f.startsWith(`plz_${characterId}_${key}_`)).length
            : [...fileIndex].filter(f => f.includes(`_${key}.png`)).length;

        return `
        <div class="plz-studio-entry" data-key="${escapeHtml(key)}" data-dimension="${dimension}">
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px;">
                <strong style="font-size:0.9em;">${escapeHtml(entry.label)}</strong>
                <span style="font-size:0.75em;opacity:0.45;">[${escapeHtml(key)}]</span>
                <span style="font-size:0.72em;opacity:0.4;margin-left:auto;">${imgCount} image${imgCount !== 1 ? 's' : ''}</span>
            </div>
            <textarea class="text_pole plz-entry-description" rows="2"
                      data-key="${escapeHtml(key)}" data-dimension="${dimension}"
                      style="width:100%;resize:vertical;font-family:monospace;font-size:0.85em;">${escapeHtml(entry.description ?? '')}</textarea>
            <div style="display:flex;gap:6px;margin-top:4px;">
                <button class="menu_button plz-entry-save-btn" data-key="${escapeHtml(key)}" data-dimension="${dimension}"
                        style="font-size:0.78em;padding:2px 8px;">Save</button>
                <button class="menu_button plz-entry-delete-btn" data-key="${escapeHtml(key)}" data-dimension="${dimension}"
                        style="font-size:0.78em;padding:2px 8px;">Delete</button>
            </div>
        </div>`;
    }).join('');
}

/**
 * Register tab — form to manually seed a new character.
 */
export function getRegisterHTML() {
    return `
    <div style="margin-bottom:20px;flex-shrink:0;">
        <h4 style="margin:0 0 6px;">Register a Character</h4>
        <p style="opacity:0.7;font-size:0.9em;margin:0 0 16px;">
            Manually add a character to the Global Portfolio. PLZ will also register characters
            automatically the first time the pipeline encounters them, but you can pre-seed them
            here to define their Identity Anchor before that happens.
        </p>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
            <label class="plz-studio-label" style="margin-bottom:0;">Character Name
                <span style="font-size:0.78em;opacity:0.55;margin-left:6px;">must match the name used in chat</span>
            </label>
            <button class="menu_button plz-anchor-scan" data-mode="register"
                    title="Scan recent chat to identify character name and appearance"
                    style="font-size:0.78em;padding:2px 8px;flex-shrink:0;margin-left:8px;">
                <i class="fa-solid fa-wand-magic-sparkles"></i> Scan Chat
            </button>
        </div>
        <input type="text" id="plz-reg-name" class="text_pole" placeholder="e.g. Claire" style="width:100%;margin-bottom:4px;" />
        <div style="font-size:0.8em;opacity:0.5;margin-bottom:14px;">
            Key preview: <code id="plz-reg-key-preview">—</code>
        </div>

        <label class="plz-studio-label">Identity Anchor
            <span style="font-size:0.78em;opacity:0.55;margin-left:6px;">permanent appearance used in every portrait prompt</span>
        </label>
        <textarea id="plz-reg-anchor" class="text_pole" rows="4"
                  placeholder="e.g. A 25-year-old athletic woman with silver hair in a ponytail and blue eyes."
                  style="width:100%;resize:vertical;margin-bottom:16px;"></textarea>
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
