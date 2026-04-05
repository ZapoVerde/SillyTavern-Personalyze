/**
 * @file data/default-user/extensions/personalyze/ui/characterWorkshopModal.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role UI Orchestrator
 * @description
 * High-level coordinator for the PersonaLyze Character Workshop modal.
 *
 * The workshop is a 3-tab modal for managing the Global Character Portfolio:
 *   - Roster  — all registered characters; jump to Studio or delete.
 *   - Studio  — edit a single character's anchor, outfits, and expressions.
 *   - Register — manually seed a new character.
 *
 * Mirrors the structure of localyze's workshopModal.js exactly.
 *
 * @api-declaration
 * openWorkshop(tab)  — primary entry point; injects modal if needed and shows it.
 * renderRoster()     — updates the Roster tab content.
 * renderStudio(id)   — updates the Studio tab for a character.
 * switchTab(name)    — toggles visibility and triggers re-renders.
 * injectWorkshop()   — initializes the modal shell and bindings (idempotent).
 *
 * @contract
 *   assertions:
 *     purity: Stateful UI Shell
 *     state_ownership: []
 *     external_io: [jQuery DOM, templates.js, listeners.js, registry.js, state.js]
 */

import { state, setWorkshopCharacter } from '../state.js';
import { getAllCharacterIds, getCharacter } from '../registry.js';
import { getSettings } from '../settings.js';
import {
    getBaseWorkshopHTML,
    getRosterHTML,
    getStudioHTML,
    getStudioEmptyHTML,
} from './workshop/templates.js';
import { bindWorkshopEvents } from './workshop/listeners.js';

// ─── Tab Renders ──────────────────────────────────────────────────────────────

/**
 * Renders the Roster list into the roster tab panel.
 */
export function renderRoster() {
    const characters = Object.fromEntries(
        getAllCharacterIds().map(id => [id, getCharacter(id)])
    );
    const html = getRosterHTML(characters, state.activeCharacterId);
    $('#plz-tab-roster').html(
        `<p style="margin-top:0;opacity:0.7;font-size:0.9em;flex-shrink:0;">
            Browse registered characters. Click the edit icon to open in Studio.
         </p>
         <div class="plz-roster-list">${html}</div>`
    );
}

/**
 * Renders the Studio tab for the given character.
 * Falls back to empty state if no id provided or character not found.
 * @param {string|null} characterId
 */
export function renderStudio(characterId) {
    const id        = characterId ?? state._workshopCharacterId;
    const character = id ? getCharacter(id) : null;

    if (!id || !character) {
        $('#plz-tab-studio').html(getStudioEmptyHTML()).removeData('rendered-for');
        return;
    }

    // Preserve unsaved textarea edits when re-rendering the same character
    const $panel    = $('#plz-tab-studio');
    const sameChar  = $panel.data('rendered-for') === id;
    let preservedAnchor = null;
    const preservedDescs = {};

    if (sameChar) {
        preservedAnchor = $('#plz-studio-anchor').val() ?? null;
        $panel.find('.plz-entry-description').each(function () {
            preservedDescs[`${$(this).data('dimension')}:${$(this).data('key')}`] = $(this).val();
        });
    }

    setWorkshopCharacter(id);
    const s        = getSettings();
    const lastExpr = state.characterChain[id]?.expression ?? null;
    $panel.html(getStudioHTML(id, character, state.fileIndex, s.expressionLabels ?? [], lastExpr))
          .data('rendered-for', id);

    // Restore any unsaved edits
    if (preservedAnchor !== null) $('#plz-studio-anchor').val(preservedAnchor);
    $panel.find('.plz-entry-description').each(function () {
        const saved = preservedDescs[`${$(this).data('dimension')}:${$(this).data('key')}`];
        if (saved !== undefined) $(this).val(saved);
    });

    // Initialize auto-grow heights for all textareas after render
    $panel.find('.plz-auto-textarea').each(function () {
        this.style.height = 'auto';
        this.style.height = `${this.scrollHeight}px`;
    });
}

// ─── Tab Switcher ─────────────────────────────────────────────────────────────

/**
 * Switches the active tab and triggers the appropriate render.
 * @param {'roster'|'studio'|'register'} tabName
 */
export function switchTab(tabName) {
    $('.plz-tab-btn').removeClass('plz-active');
    $(`.plz-tab-btn[data-tab="${tabName}"]`).addClass('plz-active');

    $('.plz-tab-panel').addClass('plz-hidden');
    $(`#plz-tab-${tabName}`).removeClass('plz-hidden');

    if (tabName === 'roster') renderRoster();
    if (tabName === 'studio') {
        // Only re-render if the active character has changed — preserves unsaved edits on revisit
        const renderedFor = $('#plz-tab-studio').data('rendered-for');
        if (renderedFor !== state._workshopCharacterId) renderStudio(state._workshopCharacterId);
    }
}

// ─── Injection & Entry Point ──────────────────────────────────────────────────

/**
 * Injects the workshop modal shell into the DOM and binds events.
 * Idempotent — safe to call multiple times.
 */
export function injectWorkshop() {
    if ($('#plz-workshop-overlay').length) return;

    $('body').append(getBaseWorkshopHTML());

    bindWorkshopEvents({ switchTab, renderRoster, renderStudio });
}

/**
 * Primary entry point to display the Character Workshop.
 * @param {'roster'|'studio'|'register'} tab  Initial tab. Defaults to 'roster'.
 */
export function openWorkshop(tab = 'roster') {
    injectWorkshop();
    $('#plz-workshop-overlay').removeClass('plz-hidden');
    switchTab(tab);
}
