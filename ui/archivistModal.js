/**
 * @file data/default-user/extensions/personalyze/ui/archivistModal.js
 * @stamp {"utc":"2026-04-28T00:00:00.000Z"}
 * @architectural-role UI (Archivist Modal)
 * @description
 * Renders the 3-way resolution modal for unknown subjects.
 * Allows users to Create a new character, Alias the name to an existing character,
 * or Ignore the name for the current scene.
 *
 * Updated for Granular Identity Grid Architecture:
 * 1. Accepts raw identity object from LLM scan instead of a flattened string.
 * 2. Renders each trait as a labeled input row (mirrors Workshop Studio grid).
 * 3. Returns a scraped, validated identity map on Create — no 'base' fallback.
 *
 * Migrated from callPopup to self-owned openModal overlay.
 *
 * @api-declaration
 * showArchivistModal(name, identityMap, activeRoster) -> Promise<object|null>
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [openModal, jQuery]
 */

import { openModal } from '../utils/modal.js';
import { escapeHtml, slugify } from '../utils/history.js';
import { BASE_IDENTITY_SLOTS, RESERVED_SLOT_KEYS } from '../defaults.js';

/**
 * Builds the HTML for a single identity trait row.
 */
function buildTraitRowHTML(label, key, val, isDeletable) {
    const deleteBtn = isDeletable
        ? `<i class="fa-solid fa-trash-can plz-arch-delete-trait" data-key="${escapeHtml(key)}"
              style="font-size:0.8em; opacity:0.3; cursor:pointer; margin-left:5px;" title="Remove Feature"></i>`
        : '';

    return `
    <div class="plz-arch-trait-row" data-key="${escapeHtml(key)}">
        <div style="display:flex; align-items:center; margin-bottom:2px;">
            <label style="font-size:0.75em; opacity:0.6; flex:1;">${escapeHtml(label)}</label>
            ${deleteBtn}
        </div>
        <div class="plz-input-wrapper">
            <input class="plz-arch-identity-item text_pole" data-key="${escapeHtml(key)}" type="text"
                   value="${escapeHtml(val || '')}" style="width:100%;" placeholder="Feature description..." />
            <div class="plz-input-clear" title="Clear">✕</div>
        </div>
    </div>`;
}

/**
 * Renders all rows in the identity grid from the merged identity map.
 */
function buildIdentityGridHTML(identityMap) {
    return Object.entries(identityMap).map(([key, val]) => {
        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        const isDeletable = !BASE_IDENTITY_SLOTS.includes(key) && key !== 'base';
        return buildTraitRowHTML(label, key, val, isDeletable);
    }).join('');
}

/**
 * Scrapes every trait row and returns a validated identity map.
 * @param {jQuery} $m - The modal overlay jQuery object
 * @returns {Object}
 */
function scrapeGrid($m) {
    const identity = {};
    $m.find('#plz-arch-identity-grid .plz-arch-identity-item').each(function() {
        const key = $(this).data('key');
        const val = $(this).val().trim();
        if (RESERVED_SLOT_KEYS.includes(key)) return;
        if (BASE_IDENTITY_SLOTS.includes(key) || key === 'base') {
            identity[key] = val;
        } else if (val !== '') {
            identity[key] = val;
        }
    });
    return identity;
}

/**
 * Displays the Archivist resolution modal.
 *
 * @param {string}   name         - The unknown name detected.
 * @param {Object}   identityMap  - The structured physical identity from the Smart Model.
 * @param {string[]} activeRoster - List of canonical IDs for alias linking.
 * @returns {Promise<object|null>} The user's decision or null if closed.
 */
export async function showArchivistModal(name, identityMap, activeRoster) {
    const mergedMap = {};
    for (const slot of BASE_IDENTITY_SLOTS) {
        mergedMap[slot] = identityMap[slot] || '';
    }
    for (const [key, val] of Object.entries(identityMap)) {
        if (!(key in mergedMap)) mergedMap[key] = val;
    }

    const aliasOptions = activeRoster
        .map(id => `<option value="${escapeHtml(id)}">${escapeHtml(id.replace(/_/g, ' '))}</option>`)
        .join('');

    const content = `
    <div id="plz-archivist-modal" style="display:flex; flex-direction:column; gap:12px;">
        <h3 style="margin:0;">Unrecognized Subject: <span style="color:var(--SmartThemeQuoteColor);">${escapeHtml(name)}</span></h3>
        <p style="font-size:0.9em; opacity:0.8; margin:0;">PersonaLyze detected a character not in your roster. How should they be handled?</p>

        <div style="background:rgba(0,0,0,0.2); border-radius:6px; padding:10px; border:1px solid var(--SmartThemeBorderColor);">
            <label style="font-size:0.75em; opacity:0.6; display:block; margin-bottom:8px;">Extracted Physical Identity</label>
            <div id="plz-arch-identity-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:8px;">
                ${buildIdentityGridHTML(mergedMap)}
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
                <input id="plz-arch-new-feature-name" class="text_pole" type="text"
                       placeholder="New feature name..." style="flex:1; font-size:0.85em;" />
                <button id="plz-arch-add-feature" class="menu_button" style="font-size:0.75em; opacity:0.7;">
                    <i class="fa-solid fa-plus"></i> Add
                </button>
            </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
            <div style="display:flex; gap:6px; align-items:center;">
                <i class="fa-solid fa-link" style="opacity:0.6; flex-shrink:0;"></i>
                <select id="plz-arch-alias-target" class="text_pole" style="flex:1;" title="This is a nickname for an existing character.">
                    <option value="">— Link as Alias to existing character —</option>
                    ${aliasOptions}
                </select>
            </div>
        </div>
    </div>`;

    return openModal({
        content,
        width: 'min(560px, 95vw)',
        buttons: [
            {
                label: '<i class="fa-solid fa-user-plus"></i> Create New Character',
                id: 'plz-arch-create',
                onClick: ($m, resolve) => {
                    resolve({ action: 'create', identity: scrapeGrid($m) });
                },
            },
            {
                label: 'Link Alias',
                id: 'plz-arch-alias-submit',
                onClick: ($m, resolve) => {
                    const targetId = $m.find('#plz-arch-alias-target').val();
                    if (!targetId) return;
                    resolve({ action: 'alias', targetId });
                },
            },
            {
                label: '<i class="fa-solid fa-eye-slash"></i> Ignore for now',
                id: 'plz-arch-ignore',
                onClick: ($m, resolve) => resolve({ action: 'ignore' }),
                style: 'muted',
            },
        ],
        onReady: ($m) => {
            // Clear button empties sibling input
            $m.on('click', '#plz-arch-identity-grid .plz-input-clear', function() {
                $(this).siblings('.plz-arch-identity-item').val('');
            });

            // Delete button removes a custom trait row
            $m.on('click', '.plz-arch-delete-trait', function() {
                const key = $(this).data('key');
                if (BASE_IDENTITY_SLOTS.includes(key) || key === 'base') return;
                $(this).closest('.plz-arch-trait-row').remove();
            });

            // Add feature row
            $m.on('click', '#plz-arch-add-feature', function() {
                const nameRaw = $m.find('#plz-arch-new-feature-name').val().trim();
                if (!nameRaw) return;

                const key = slugify(nameRaw);
                if (RESERVED_SLOT_KEYS.includes(key)) {
                    if (window.toastr) window.toastr.warning(`"${nameRaw}" is a reserved system key.`);
                    return;
                }
                if ($m.find(`#plz-arch-identity-grid .plz-arch-identity-item[data-key="${key}"]`).length) {
                    if (window.toastr) window.toastr.warning(`Feature "${nameRaw}" already exists.`);
                    return;
                }

                const label = nameRaw.charAt(0).toUpperCase() + nameRaw.slice(1);
                $m.find('#plz-arch-identity-grid').append(buildTraitRowHTML(label, key, '', true));
                $m.find('#plz-arch-new-feature-name').val('');
            });

            // Enter key submits new feature
            $m.on('keydown', '#plz-arch-new-feature-name', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    $m.find('#plz-arch-add-feature').trigger('click');
                }
            });
        },
    });
}
