/**
 * @file data/default-user/extensions/personalyze/ui/panel/profiles.js
 * @stamp {"utc":"2026-04-05T00:00:00.000Z"}
 * @architectural-role UI Logic (Profiles)
 * @description
 * Implements the profile-switching and "Working Table" architecture.
 * Manages the synchronization between activeState and the saved profile bookshelf.
 * Handles the "dirty" indicator logic for unsaved changes.
 *
 * @api-declaration
 * bindProfileHandlers($panel, refreshUI) -> void
 * refreshProfileDropdown() -> void
 * updateDirtyIndicator() -> void
 *
 * @contract
 *   assertions:
 *     purity: Stateful UI Logic
 *     state_ownership: [extension_settings.personalyze.activeState]
 *     external_io: [saveSettingsDebounced, callPopup, DOM (.plz-profile-select)]
 */

import { saveSettingsDebounced } from '../../../../../../script.js';
import { confirmModal, promptModal } from '../../utils/modal.js';
import { getSettings, getMetaSettings } from '../../settings.js';

/**
 * Returns true if the working table (activeState) differs from the saved profile.
 */
function isStateDirty() {
    const meta = getMetaSettings();
    const saved = meta.profiles[meta.currentProfileName];
    if (!saved) return false;
    return JSON.stringify(meta.activeState) !== JSON.stringify(saved);
}

/**
 * Updates the dropdown labels to show which profile is currently "dirty".
 */
export function updateDirtyIndicator() {
    const meta = getMetaSettings();
    const $sel = $('#plz-profile-select');
    if (!$sel.length) return;

    const label = meta.currentProfileName + (isStateDirty() ? ' *' : '');
    $sel.find(`option[value="${CSS.escape(meta.currentProfileName)}"]`).text(label);
    $sel.val(meta.currentProfileName);
}

/**
 * Rebuilds the profile dropdown options from the meta.profiles keys.
 */
export function refreshProfileDropdown() {
    const meta = getMetaSettings();
    const $sel = $('#plz-profile-select');
    if (!$sel.length) return;

    $sel.empty();
    for (const name of Object.keys(meta.profiles)) {
        $sel.append($('<option>').val(name).text(name));
    }
    updateDirtyIndicator();
}

/**
 * Binds the 5 profile management actions.
 * @param {jQuery} $panel 
 * @param {Function} refreshUI — Callback to re-populate all inputs in the panel.
 */
export function bindProfileHandlers($panel, refreshUI) {
    const meta = getMetaSettings();

    // 1. Switch Profile
    $panel.on('change', '#plz-profile-select', function () {
        const newName = $(this).val();
        if (!meta.profiles[newName]) return;

        meta.currentProfileName = newName;
        meta.activeState = structuredClone(meta.profiles[newName]);
        
        saveSettingsDebounced();
        refreshUI();
    });

    // 2. Save Profile (Bookshelf ← Working Table)
    $panel.on('click', '#plz-profile-save', function () {
        meta.profiles[meta.currentProfileName] = structuredClone(meta.activeState);
        saveSettingsDebounced();
        updateDirtyIndicator();
        if (window.toastr) window.toastr.success(`Profile "${meta.currentProfileName}" saved.`, 'PersonaLyze');
    });

    // 3. Add Profile (Clones existing Working Table)
    $panel.on('click', '#plz-profile-add', async function () {
        const rawName = await promptModal('New profile name');
        const name = (rawName ?? '').trim();
        if (!name) return;

        if (meta.profiles[name]) {
            if (window.toastr) window.toastr.warning(`Profile "${name}" already exists.`);
            return;
        }

        // The "Clone" Logic: Use activeState, not defaults.
        meta.profiles[name] = structuredClone(meta.activeState);
        meta.currentProfileName = name;
        
        saveSettingsDebounced();
        refreshProfileDropdown();
    });

    // 4. Rename Profile
    $panel.on('click', '#plz-profile-rename', async function () {
        const rawName = await promptModal('Rename profile', meta.currentProfileName);
        const newName = (rawName ?? '').trim();
        if (!newName || newName === meta.currentProfileName) return;

        if (meta.profiles[newName]) {
            if (window.toastr) window.toastr.warning(`Profile "${newName}" already exists.`);
            return;
        }

        meta.profiles[newName] = meta.profiles[meta.currentProfileName];
        delete meta.profiles[meta.currentProfileName];
        meta.currentProfileName = newName;

        saveSettingsDebounced();
        refreshProfileDropdown();
    });

    // 5. Delete Profile
    $panel.on('click', '#plz-profile-delete', async function () {
        if (Object.keys(meta.profiles).length <= 1) {
            if (window.toastr) window.toastr.warning('Cannot delete the only profile.');
            return;
        }

        const confirmed = await confirmModal(
            `<b>Delete profile "${meta.currentProfileName}"?</b><br>This cannot be undone.`
        );
        if (!confirmed) return;

        delete meta.profiles[meta.currentProfileName];
        meta.currentProfileName = Object.keys(meta.profiles)[0];
        meta.activeState = structuredClone(meta.profiles[meta.currentProfileName]);

        saveSettingsDebounced();
        refreshProfileDropdown();
        refreshUI();
    });
}