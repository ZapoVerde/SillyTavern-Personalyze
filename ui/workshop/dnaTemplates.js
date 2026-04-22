/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaTemplates.js
 * @stamp {"utc":"2026-04-18T00:00:00.000Z"}
 * @architectural-role Pure UI Templates
 * @description
 * Generates the HTML for the Workshop shell and DNA character roster.
 *
 * Updated for Style-Specific Render Pipeline:
 * 1. Added "Global Styles" tab button to the Workshop header.
 * 2. Added plz-tab-styles container to the body.
 *
 * Updated for Archive Feature:
 * 1. Fixed identityAnchor bug — now uses buildIdentityPreview(char.identity).
 * 2. Added archive visual treatment (opacity, strikethrough, archive icon).
 * 3. Added archive toggle button per row.
 * 4. Disabled On-Screen toggle when archived.
 * 5. Sort: active first, archived last.
 *
 * @api-declaration
 * getBaseWorkshopHTML()
 * getDnaRosterHTML(characters, activeRoster, activeId)
 *
 * @contract
 *   assertions:
 *     purity: Pure Function
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../../utils/history.js';

// Re-export Studio templates for consumption by dnaListeners
export { getStudioHTML, getStudioEmptyHTML } from './studioTemplates.js';

/** Main modal shell with DNA, Studio, Styles, and Library tabs. */
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
                    <button class="plz-tab-btn menu_button" data-tab="dna">Characters</button>
                    <button class="plz-tab-btn menu_button" data-tab="studio">Studio</button>
                    <button class="plz-tab-btn menu_button" data-tab="styles">Global Styles</button>
                    <button class="plz-tab-btn menu_button" data-tab="library">Library</button>
                </div>
            </div>
            <div class="plz-workshop-body">
                <div id="plz-tab-dna"     class="plz-tab-panel plz-hidden"></div>
                <div id="plz-tab-studio"  class="plz-tab-panel plz-hidden"></div>
                <div id="plz-tab-styles"  class="plz-tab-panel plz-hidden"></div>
                <div id="plz-tab-library" class="plz-tab-panel plz-hidden"></div>
            </div>
        </div>
    </div>`;
}

/**
 * Builds a short identity preview from the granular identity map.
 * @param {object} identity
 * @returns {string}
 */
function buildIdentityPreview(identity) {
    if (!identity || typeof identity !== 'object') return '—';
    const values = Object.values(identity).filter(Boolean);
    if (values.length === 0) return '—';
    const preview = values.slice(0, 3).join(', ');
    return preview.length > 80 ? preview.slice(0, 77) + '...' : preview;
}

/**
 * Renders the character list currently in the chat's DNA history.
 * Active characters float to the top; archived characters sink to the bottom.
 *
 * @param {object} characters
 * @param {string[]} activeRoster
 * @param {string|null} activeId
 * @returns {string}
 */
export function getDnaRosterHTML(characters, activeRoster, activeId) {
    const addNewHtml = `
    <div class="plz-roster-item plz-dna-add-new" style="border: 1px dashed var(--SmartThemeBorderColor); opacity: 0.8; justify-content: center; cursor: pointer; padding: 12px;">
        <div style="display:flex; align-items:center; gap:8px; font-weight:bold;">
            <i class="fa-solid fa-plus"></i> Create New Character
        </div>
    </div>`;

    const entries = Object.entries(characters).filter(([id]) => id !== '__new__');

    let rosterHtml = '';
    if (entries.length === 0) {
        rosterHtml = `<div style="text-align:center;padding:40px;opacity:0.5;font-size:0.9em;">
            No characters found in this chat.
        </div>`;
    } else {
        // Sort: non-archived first, archived last
        entries.sort(([, a], [, b]) => {
            if (!!a.isArchived === !!b.isArchived) return 0;
            return a.isArchived ? 1 : -1;
        });

        rosterHtml = entries.map(([id, char]) => {
            const isEnabled = activeRoster.includes(id);
            const isActive = id === activeId;
            const isArchived = char.isArchived === true;
            const displayName = char.label || id.replace(/_/g, ' ');
            const preview = buildIdentityPreview(char.identity);

            const toggleStyle = isArchived
                ? 'pointer-events:none; opacity:0.3;'
                : 'cursor:pointer;';
            const toggleColor = isEnabled && !isArchived
                ? 'color:var(--SmartThemeQuoteColor);'
                : '';
            const toggleTitle = isArchived
                ? 'Un-archive to enable'
                : (isEnabled ? 'Remove from scene' : 'Add to scene');

            const archiveIcon = isArchived ? 'fa-box-open' : 'fa-box-archive';
            const archiveTitle = isArchived ? 'Restore character' : 'Archive character';

            return `
            <div class="plz-roster-item ${isActive ? 'plz-active-char' : ''}"
                 data-id="${escapeHtml(id)}"
                 style="${isArchived ? 'opacity:0.45;' : ''}">
                <div class="plz-roster-text">
                    <strong style="${isArchived ? 'text-decoration:line-through;' : ''}">
                        ${isActive ? '<i class="fa-solid fa-user"></i> ' : ''}${isArchived ? '<i class="fa-solid fa-box-archive" style="font-size:0.8em; opacity:0.7; margin-right:2px;"></i>' : ''}${escapeHtml(displayName)}
                    </strong>
                    <small>${escapeHtml(preview)}</small>
                </div>
                <div class="plz-roster-actions">
                    <i class="fa-solid ${isEnabled && !isArchived ? 'fa-toggle-on' : 'fa-toggle-off'} plz-dna-toggle"
                       style="font-size:1.3em; ${toggleStyle} ${toggleColor}"
                       title="${toggleTitle}"></i>
                    <i class="fa-solid ${archiveIcon} plz-dna-archive"
                       title="${archiveTitle}"
                       style="cursor:pointer; font-size:1em;"></i>
                    <i class="fa-solid fa-pen-to-square plz-dna-edit" title="Edit in Studio"></i>
                </div>
            </div>`;
        }).join('');
    }

    return addNewHtml + rosterHtml;
}
