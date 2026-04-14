/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaTemplates.js
 * @stamp {"utc":"2026-04-16T23:56:00.000Z"}
 * @architectural-role Pure UI Templates
 * @description
 * Generates the HTML for the Workshop shell and DNA character roster.
 * 
 * Updated for Style-Specific Render Pipeline:
 * 1. Added "Global Styles" tab button to the Workshop header.
 * 2. Added plz-tab-styles container to the body.
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
                    <button class="plz-tab-btn menu_button" data-tab="dna">DNA</button>
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
 * Renders the character list currently in the chat's DNA history.
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

    const entries = Object.entries(characters);
    
    let rosterHtml = '';
    if (entries.length === 0) {
        rosterHtml = `<div style="text-align:center;padding:40px;opacity:0.5;font-size:0.9em;">
            No character DNA found in this chat.
        </div>`;
    } else {
        rosterHtml = entries.map(([id, char]) => {
            if (id === '__new__') return ''; 
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