/**
 * @file data/default-user/extensions/personalyze/ui/workshop/libraryTemplates.js
 * @stamp {"utc":"2026-04-07T14:10:00.000Z"}
 * @architectural-role Pure UI Templates
 * @description
 * Generates the HTML strings for the Personalyze Workshop Library view.
 * 
 * Handles the display of the Global Portfolio (Template Gallery) and 
 * the "Import to Chat" interface.
 *
 * @api-declaration
 * getLibraryListHTML(libraryCharacters, dnaIds) — Library tab list
 * getLibraryEmptyHTML() — Library placeholder
 */

import { escapeHtml } from '../../utils/history.js';

/**
 * Library Tab — list of character templates stored in Global Settings.
 * 
 * @param {Object} characters - Map of library character data.
 * @param {string[]} dnaIds - List of character IDs already existing in chat DNA.
 */
export function getLibraryListHTML(characters, dnaIds = []) {
    const entries = Object.entries(characters);

    if (entries.length === 0) {
        return getLibraryEmptyHTML();
    }

    // Sort: Characters NOT in the chat first
    const sorted = [...entries].sort(([aId], [bId]) => {
        const aInDna = dnaIds.includes(aId);
        const bInDna = dnaIds.includes(bId);
        if (aInDna === bInDna) return 0;
        return aInDna ? 1 : -1;
    });

    const rows = sorted.map(([id, char]) => {
        const inDna = dnaIds.includes(id);
        const label = id.replace(/_/g, ' ');

        const importIcon = inDna
            ? `<i class="fa-solid fa-check-double" title="Already in Chat DNA" style="opacity:0.4; cursor:default;"></i>`
            : `<i class="fa-solid fa-file-import plz-lib-import" title="Import to Chat DNA" style="color:var(--SmartThemeQuoteColor); cursor:pointer;"></i>`;

        return `
        <div class="plz-roster-item" data-id="${escapeHtml(id)}" style="${inDna ? 'opacity:0.5;' : ''}">
            <div class="plz-roster-text">
                <strong style="display:flex; align-items:center; gap:6px;">
                    ${escapeHtml(label)}
                    ${inDna ? '<span style="font-size:0.7em; font-weight:normal; opacity:0.6;">(Active DNA)</span>' : ''}
                </strong>
                <small>${escapeHtml(char.identityAnchor || '—')}</small>
                <div style="font-size:0.72em; opacity:0.5; margin-top:2px;">
                    ${Object.keys(char.outfits ?? {}).length} Outfits · 
                    ${Object.keys(char.expressions ?? {}).length} Expressions
                </div>
            </div>
            <div class="plz-roster-actions">
                ${importIcon}
                <i class="fa-solid fa-trash-can plz-lib-delete" title="Delete Template from Global Library" style="color:#e05555; opacity:0.7; cursor:pointer;"></i>
            </div>
        </div>`;
    }).join('');

    return `
    <div style="display:flex; flex-direction:column; gap:12px;">
        <p style="margin-top:0; opacity:0.7; font-size:0.9em; flex-shrink:0;">
            Browse your Global Library templates. Import a character to add their identity and wardrobe to this chat's DNA.
        </p>
        <div class="plz-library-list">
            ${rows}
        </div>
    </div>`;
}

/**
 * Placeholder for when the Global Library is empty.
 */
export function getLibraryEmptyHTML() {
    return `
    <div style="text-align:center; padding:60px; opacity:0.5;">
        <i class="fa-solid fa-book-open" style="font-size:2.5em; margin-bottom:12px;"></i><br/>
        Your Global Library is empty.<br/>
        Export character DNA from a chat to save templates here.
    </div>`;
}