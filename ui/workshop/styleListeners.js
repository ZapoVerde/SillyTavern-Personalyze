/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleListeners.js
 * @stamp {"utc":"2026-05-01T09:10:00.000Z"}
 * @architectural-role UI Controller (Global Styles)
 * @description
 * Orchestrates the management and editing of Global Style Render Pipelines.
 * Implements the "Working Table" (Sandbox vs. Checkpoint) pattern.
 * Edits are applied directly to persistent styleWorkspaces for live testing
 * and multi-device persistence before being committed to the styleLibrary.
 * 
 * Updated for Reactive Logic Engine:
 * 1. Integrated renderLogicDrawer into the style render lifecycle.
 * 2. Integrated bindStyleLogicHandlers into the global workshop binding phase.
 * 
 * @api-declaration
 * renderStylesView() -> void
 * bindStyleHandlers() -> void
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [styleWorkspaces]
 *     external_io: [settings.js, styleModals.js, imageCache.js, models.js, DOM, callLog.js, styleLogicListeners.js]
 */

import { getSettings, getMetaSettings, updateSetting } from '../../settings.js';
import { saveSettingsDebounced } from '../../../../../../script.js';
import { confirmModal, promptModal, openModal } from '../../utils/modal.js';
import { fetchPreviewBlob } from '../../imageCache.js';
import { fetchRunwareModels } from '../panel/models.js';
import { smartResize } from '../../utils/dom.js';
import { getStylesTabHTML } from './styleTemplates.js';
import { openPipelineModal, openLoraModal } from './styleModals.js';
import { startWorkshopTurn } from '../../utils/callLog.js';
import { bindStyleLogicHandlers, renderLogicDrawer } from './styleLogicListeners.js';

/**
 * Checks if the workspace version of a style differs from its checkpoint in the library.
 * @param {string} name - The name of the style.
 * @returns {boolean}
 */
function _isStyleDirty(name) {
    const meta = getMetaSettings();
    const original  = meta.styleLibrary[name];
    const workspace = meta.styleWorkspaces[name];
    if (!original || !workspace) return false;

    // Deep comparison of technical and prompt data
    return JSON.stringify(original) !== JSON.stringify(workspace);
}

/**
 * Updates the UI state (Save/Revert buttons and asterisk) without a full re-render.
 * Prevents losing focus in textareas during typing.
 */
function _syncDirtyUI() {
    const meta = getMetaSettings();
    const activeName = getSettings().currentStyleName;
    const dirty = _isStyleDirty(activeName);
    
    // 1. Update Button States
    $('#plz-style-save, #plz-style-revert').prop('disabled', !dirty);

    // 2. Update Dropdown Label
    const $opt = $(`#plz-style-selector option[value="${CSS.escape(activeName)}"]`);
    if ($opt.length) {
        const isDefault = activeName === meta.defaultStyleName;
        const newLabel = activeName + (isDefault ? ' ⭐' : '') + (dirty ? ' *' : '');
        $opt.text(newLabel);
    }
}

/**
 * Renders the Global Styles view into the Workshop panel.
 * Always pulls data from the Workspace (The Live Sandbox).
 */
export function renderStylesView() {
    // PRERUN DISCOVERY: Fetch latest Runware models in background
    fetchRunwareModels();

    const meta = getMetaSettings();
    const s = getSettings();
    const lib = meta.styleLibrary || {};
    const ws  = meta.styleWorkspaces || {};
    
    // Determine active style name
    const activeName = (s.currentStyleName && ws[s.currentStyleName]) 
        ? s.currentStyleName 
        : (meta.defaultStyleName || Object.keys(ws)[0]);

    // Ensure state is synced
    if (s.currentStyleName !== activeName) {
        updateSetting('currentStyleName', activeName);
    }

    const styleObj = ws[activeName];
    const html = getStylesTabHTML(lib, meta.defaultStyleName, activeName, styleObj, _isStyleDirty(activeName));
    const $panel = $('#plz-tab-styles').html(html);

    // Reactive Logic Engine mount
    renderLogicDrawer();

    $panel.find('.plz-auto-textarea').each(function() { smartResize(this); });
}

/**
 * Binds DOM listeners for the Styles tab.
 */
export function bindStyleHandlers() {
    const $overlay = $('#plz-workshop-overlay');

    // ─── Reactive Logic Engine ────────────────────────────────────────────────
    bindStyleLogicHandlers($overlay);

    // 1. Style Selection
    $overlay.on('change', '#plz-style-selector', function() {
        const newName = $(this).val();
        updateSetting('currentStyleName', newName);
        renderStylesView();
    });

    // 2. Live Workspace Edits (Persistence Layer)
    $overlay.on('input', '#plz-style-template, #plz-style-negative', function() {
        const meta = getMetaSettings();
        const activeName = getSettings().currentStyleName;
        const style = meta.styleWorkspaces[activeName];

        style.template = $('#plz-style-template').val();
        style.negativePrompt = $('#plz-style-negative').val();
        
        _syncDirtyUI();
        saveSettingsDebounced();
    });

    // 3. Technical Popups (Writes directly to Workspace)
    $overlay.on('click', '#plz-style-edit-pipeline', async () => {
        const meta = getMetaSettings();
        const activeName = getSettings().currentStyleName;
        const style = meta.styleWorkspaces[activeName];

        const result = await openPipelineModal(style);
        if (result) {
            Object.assign(style, result);
            saveSettingsDebounced();
            renderStylesView();
        }
    });

    $overlay.on('click', '#plz-style-edit-loras', async () => {
        const meta = getMetaSettings();
        const activeName = getSettings().currentStyleName;
        const style = meta.styleWorkspaces[activeName];

        const result = await openLoraModal(style.loras, style.engine, style.model);
        if (result) {
            style.loras = result;
            saveSettingsDebounced();
            renderStylesView();
        }
    });

    // 4. Action Row (Commit vs Rollback)
    
    // SAVE: Commit Workspace -> Library
    $overlay.on('click', '#plz-style-save', () => {
        const meta = getMetaSettings();
        const activeName = getSettings().currentStyleName;
        
        meta.styleLibrary[activeName] = structuredClone(meta.styleWorkspaces[activeName]);
        saveSettingsDebounced();
        renderStylesView();
        if (window.toastr) window.toastr.success(`Style "${activeName}" checkpoint saved.`);
    });

    // REVERT: Rollback Library -> Workspace
    $overlay.on('click', '#plz-style-revert', async () => {
        const meta = getMetaSettings();
        const activeName = getSettings().currentStyleName;

        const ok = await confirmModal(`Discard all uncommitted changes for "${activeName}"?`);
        if (!ok) return;

        meta.styleWorkspaces[activeName] = structuredClone(meta.styleLibrary[activeName]);
        saveSettingsDebounced();
        renderStylesView();
    });

    $overlay.on('click', '#plz-style-set-default', () => {
        const meta = getMetaSettings();
        meta.defaultStyleName = $('#plz-style-selector').val();
        saveSettingsDebounced();
        renderStylesView();
    });

    // NEW: Create both entries
    $overlay.on('click', '#plz-style-new', async () => {
        const raw = await promptModal('New Style Name');
        const name = (raw ?? '').trim();
        if (!name) return;
        
        const meta = getMetaSettings();
        if (meta.styleLibrary[name]) return window.toastr?.warning('Style name already exists.');

        const activeName = getSettings().currentStyleName;
        const baseStyle = meta.styleWorkspaces[activeName];

        meta.styleLibrary[name] = structuredClone(baseStyle);
        meta.styleWorkspaces[name] = structuredClone(baseStyle);
        
        updateSetting('currentStyleName', name);
        saveSettingsDebounced();
        renderStylesView();
    });

    // DELETE: Remove both entries
    $overlay.on('click', '#plz-style-delete', async function() {
        const meta = getMetaSettings();
        const name = $('#plz-style-selector').val();
        if (Object.keys(meta.styleLibrary).length <= 1) return window.toastr?.warning('Cannot delete the last style.');
        
        const ok = await confirmModal(`Delete style "${name}"?`);
        if (!ok) return;

        delete meta.styleLibrary[name];
        delete meta.styleWorkspaces[name];

        if (meta.defaultStyleName === name) meta.defaultStyleName = Object.keys(meta.styleLibrary)[0];
        updateSetting('currentStyleName', meta.defaultStyleName);
        saveSettingsDebounced();
        renderStylesView();
    });

    // 5. Test Render (Uses Workspace data)
    $overlay.on('click', '#plz-style-test-render', async function() {
        const meta = getMetaSettings();
        const activeName = getSettings().currentStyleName;
        const style = meta.styleWorkspaces[activeName];

        startWorkshopTurn(`Style Test Render: ${activeName}`);

        const $btn = $(this);
        const originalHtml = $btn.html();
        $btn.prop('disabled', true).text('Generating test...');

        try {
            const resParts = (style.resolutionOverride || '512x768').split('x');
            const url = await fetchPreviewBlob(
                style.engine, 
                style.model, 
                style.template, 
                style.negativePrompt,
                parseInt(resParts[0]), 
                parseInt(resParts[1]), 
                1, 
                style.loras, 
                style.useLayerDiffuse,
                style.engineParams
            );
            await openModal({
                content: `<h3 style="margin-top:0;">Test OK</h3><img src="${url}" style="width:100%; border-radius:6px;" />`,
                buttons: [{ label: 'Close', value: null, style: 'muted' }],
            });
        } catch (err) {
            if (window.toastr) window.toastr.error('Test failed: ' + err.message);
        } finally { $btn.prop('disabled', false).html(originalHtml); }
    });
}