/**
 * @file data/default-user/extensions/personalyze/ui/archivistModal.js
 * @stamp {"utc":"2026-04-10T23:00:00.000Z"}
 * @architectural-role UI (Archivist Modal)
 * @description
 * Renders the 3-way resolution modal for unknown subjects.
 * Allows users to Create a new character, Alias the name to an existing character,
 * or Ignore the name for the current scene.
 *
 * @api-declaration
 * showArchivistModal(name, anchor, activeRoster) -> Promise<object|null>
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [callPopup, jQuery]
 */

import { callPopup } from '../../../../../script.js';
import { escapeHtml } from '../utils/history.js';
import { smartResize } from '../utils/dom.js';

/**
 * Displays the Archivist resolution modal.
 * 
 * @param {string} name - The unknown name detected.
 * @param {string} anchor - The physical identity extracted by the Smart Model.
 * @param {string[]} activeRoster - List of canonical IDs for alias linking.
 * @returns {Promise<object|null>} The user's decision or null if closed.
 */
export async function showArchivistModal(name, anchor, activeRoster) {
    const aliasOptions = activeRoster
        .map(id => `<option value="${escapeHtml(id)}">${escapeHtml(id.replace(/_/g, ' '))}</option>`)
        .join('');

    const html = `
    <div id="plz-archivist-modal" style="display:flex; flex-direction:column; gap:12px;">
        <h3 style="margin:0;">Unrecognized Subject: <span style="color:var(--SmartThemeQuoteColor);">${escapeHtml(name)}</span></h3>
        <p style="font-size:0.9em; opacity:0.8; margin:0;">PersonaLyze detected a character not in your roster. How should they be handled?</p>
        
        <div style="background:rgba(0,0,0,0.2); border-radius:6px; padding:10px; border:1px solid var(--SmartThemeBorderColor);">
            <label style="font-size:0.75em; opacity:0.6; display:block; margin-bottom:4px;">Extracted Physical Identity</label>
            <textarea id="plz-arch-anchor" class="text_pole plz-auto-textarea" rows="3" 
                      style="width:100%; font-size:0.88em; background:transparent; border:none; resize:none;">${escapeHtml(anchor)}</textarea>
        </div>

        <div style="display:grid; grid-template-columns: 1fr; gap:8px; margin-top:8px;">
            <!-- Option 1: Create -->
            <button id="plz-arch-create" class="menu_button" style="text-align:left; padding:10px; display:flex; flex-direction:column; gap:2px;">
                <strong><i class="fa-solid fa-user-plus"></i> Create New Character</strong>
                <span style="font-size:0.75em; opacity:0.6;">Register them in the DNA and generate a portrait.</span>
            </button>

            <!-- Option 2: Alias -->
            <div style="border:1px solid var(--SmartThemeBorderColor); border-radius:6px; padding:8px; display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <strong><i class="fa-solid fa-link"></i> Link as Alias</strong>
                    <span style="font-size:0.75em; opacity:0.6;">This is a nickname for an existing character.</span>
                </div>
                <div style="display:flex; gap:6px;">
                    <select id="plz-arch-alias-target" class="text_pole" style="flex:1;">
                        <option value="">— Select Character —</option>
                        ${aliasOptions}
                    </select>
                    <button id="plz-arch-alias-submit" class="menu_button">Link</button>
                </div>
            </div>

            <!-- Option 3: Ignore -->
            <button id="plz-arch-ignore" class="menu_button" style="text-align:left; padding:10px; display:flex; flex-direction:column; gap:2px;">
                <strong><i class="fa-solid fa-eye-slash"></i> Ignore for now</strong>
                <span style="font-size:0.75em; opacity:0.6;">Skip this person until the next scene change.</span>
            </button>
        </div>
    </div>`;

    let resolution = null;

    // We use a jQuery delegated listener on the document since callPopup appends to body
    return new Promise((resolve) => {
        // If the popup itself fails to open (e.g. another modal blocks it), resolve null
        // immediately so the archivist's finally block can clear the pending guard.
        callPopup(html, 'text').catch(() => {
            $(document).off('click.plzArch');
            resolve(null);
        });

        // Initial resize for the textarea
        requestAnimationFrame(() => {
            const el = document.getElementById('plz-arch-anchor');
            if (el) smartResize(el);
        });

        const cleanup = () => {
            $(document).off('click.plzArch');
            $('#dialogue_popup_ok').trigger('click'); // Close ST popup
        };

        $(document).on('click.plzArch', '#plz-arch-create', () => {
            const finalAnchor = $('#plz-arch-anchor').val().trim();
            resolution = { action: 'create', anchor: finalAnchor };
            cleanup();
            resolve(resolution);
        });

        $(document).on('click.plzArch', '#plz-arch-alias-submit', () => {
            const targetId = $('#plz-arch-alias-target').val();
            if (!targetId) return;
            resolution = { action: 'alias', targetId };
            cleanup();
            resolve(resolution);
        });

        $(document).on('click.plzArch', '#plz-arch-ignore', () => {
            resolution = { action: 'ignore' };
            cleanup();
            resolve(resolution);
        });

        // Handle the user just closing the modal without a choice
        $(document).on('click.plzArch', '#dialogue_popup_ok, #dialogue_popup_cancel', () => {
            $(document).off('click.plzArch');
            resolve(null);
        });
    });
}
