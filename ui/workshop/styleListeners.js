/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleListeners.js
 * @stamp {"utc":"2026-04-18T19:00:00.000Z"}
 * @architectural-role UI Controller (Global Styles)
 * @description
 * Orchestrates the management and editing of Global Style Render Pipelines.
 * Implements the "Working Table" pattern for style editing.
 * Updated to support Schema-Driven engineParams during test generation.
 * 
 * @api-declaration
 * renderStylesView() -> void
 * bindStyleHandlers() -> void
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [localDraft]
 *     external_io: [settings.js, styleModals.js, imageCache.js, models.js, DOM]
 */

import { getSettings, getMetaSettings, updateSetting } from '../../settings.js';
import { saveSettingsDebounced, callPopup } from '../../../../../../script.js';
import { fetchPreviewBlob } from '../../imageCache.js';
import { fetchRunwareModels } from '../panel/models.js';
import { smartResize } from '../../utils/dom.js';
import { DEFAULT_STYLE_PACKAGE } from '../../defaults.js';
import { getStylesTabHTML } from './styleTemplates.js';
import { openPipelineModal, openLoraModal } from './styleModals.js';

/** Temporary store for edits not yet committed to the Global Library. */
let localDraft = null;

/**
 * Checks if the current draft differs from the saved version in the library.
 * @returns {boolean}
 */
function _isDraftDirty() {
    if (!localDraft) return false;
    const meta = getMetaSettings();
    const original = meta.styleLibrary[localDraft._originalName];
    if (!original) return false;

    return (
        localDraft.template !== original.template ||
        localDraft.negativePrompt !== (original.negativePrompt || '') ||
        localDraft.engine !== (original.engine || DEFAULT_STYLE_PACKAGE.engine) ||
        localDraft.model !== (original.model || DEFAULT_STYLE_PACKAGE.model) ||
        localDraft.resolutionOverride !== (original.resolutionOverride || null) ||
        localDraft.useLayerDiffuse !== !!original.useLayerDiffuse ||
        JSON.stringify(localDraft.loras || []) !== JSON.stringify(original.loras || []) ||
        JSON.stringify(localDraft.engineParams || {}) !== JSON.stringify(original.engineParams || {})
    );
}

/**
 * Updates the UI state (Save/Revert buttons and asterisk) without a full re-render.
 * Prevents losing focus in textareas during typing.
 */
function _syncDirtyUI() {
    const dirty = _isDraftDirty();
    const meta = getMetaSettings();
    
    // 1. Update Button States
    $('#plz-style-save, #plz-style-revert').prop('disabled', !dirty);

    // 2. Update Dropdown Label
    const name = localDraft._originalName;
    const $opt = $(`#plz-style-selector option[value="${CSS.escape(name)}"]`);
    if ($opt.length) {
        const isDefault = name === meta.defaultStyleName;
        const newLabel = name + (isDefault ? ' ⭐' : '') + (dirty ? ' *' : '');
        $opt.text(newLabel);
    }
}

/**
 * Renders the Global Styles view into the Workshop panel.
 */
export function renderStylesView() {
    // PRERUN DISCOVERY: Fetch latest Runware models in background
    fetchRunwareModels();

    const meta = getMetaSettings();
    const s = getSettings();
    const lib = meta.styleLibrary || {};
    
    const activeName = (s.currentStyleName && lib[s.currentStyleName]) 
        ? s.currentStyleName 
        : (meta.defaultStyleName || Object.keys(lib)[0]);

    // Initialize draft from library if name changed or draft is empty
    if (!localDraft || localDraft._originalName !== activeName) {
        localDraft = { 
            ...structuredClone(DEFAULT_STYLE_PACKAGE), 
            ...structuredClone(lib[activeName] || {}), 
            _originalName: activeName 
        };
    }

    const html = getStylesTabHTML(lib, meta.defaultStyleName, activeName, localDraft, _isDraftDirty());
    const $panel = $('#plz-tab-styles').html(html);

    $panel.find('.plz-auto-textarea').each(function() { smartResize(this); });
}

/**
 * Binds DOM listeners for the Styles tab.
 */
export function bindStyleHandlers() {
    const $overlay = $('#plz-workshop-overlay');

    // 1. Style Selection
    $overlay.on('change', '#plz-style-selector', function() {
        const newName = $(this).val();
        updateSetting('currentStyleName', newName);
        localDraft = null; // Clear draft to force reload from lib on next render
        renderStylesView();
    });

    // 2. Live Draft Edits
    $overlay.on('input', '#plz-style-template, #plz-style-negative', function() {
        localDraft.template = $('#plz-style-template').val();
        localDraft.negativePrompt = $('#plz-style-negative').val();
        _syncDirtyUI();
    });

    // 3. Technical Popups (Forces re-render on return)
    $overlay.on('click', '#plz-style-edit-pipeline', async () => {
        const result = await openPipelineModal(localDraft);
        if (result) {
            Object.assign(localDraft, result);
            renderStylesView();
        }
    });

    $overlay.on('click', '#plz-style-edit-loras', async () => {
        const result = await openLoraModal(localDraft.loras, localDraft.engine, localDraft.model);
        if (result) {
            localDraft.loras = result;
            renderStylesView();
        }
    });

    // 4. Action Row (CRUD & Working Table)
    $overlay.on('click', '#plz-style-save', () => {
        const meta = getMetaSettings();
        const name = localDraft._originalName;
        const saveObj = structuredClone(localDraft);
        delete saveObj._originalName;
        
        meta.styleLibrary[name] = saveObj;
        saveSettingsDebounced();
        renderStylesView();
        if (window.toastr) window.toastr.success(`Style "${name}" saved.`);
    });

    $overlay.on('click', '#plz-style-revert', async () => {
        const ok = await callPopup('Discard unsaved changes?', 'confirm');
        if (!ok) return;
        localDraft = null; // Reset draft
        renderStylesView();
    });

    $overlay.on('click', '#plz-style-set-default', () => {
        const meta = getMetaSettings();
        meta.defaultStyleName = $('#plz-style-selector').val();
        saveSettingsDebounced();
        renderStylesView();
    });

    $overlay.on('click', '#plz-style-new', async () => {
        const raw = await callPopup('<h3>New Style Name</h3>', 'input', '');
        const name = (raw ?? '').trim();
        if (!name) return;
        const meta = getMetaSettings();
        if (meta.styleLibrary[name]) return window.toastr?.warning('Style name already exists.');

        const clone = structuredClone(localDraft);
        delete clone._originalName;
        meta.styleLibrary[name] = clone;
        updateSetting('currentStyleName', name);
        saveSettingsDebounced();
        localDraft = null;
        renderStylesView();
    });

    $overlay.on('click', '#plz-style-delete', async () => {
        const meta = getMetaSettings();
        const name = $('#plz-style-selector').val();
        if (Object.keys(meta.styleLibrary).length <= 1) return window.toastr?.warning('Cannot delete the last style.');
        
        const ok = await callPopup(`Delete style "${name}"?`, 'confirm');
        if (!ok) return;

        delete meta.styleLibrary[name];
        if (meta.defaultStyleName === name) meta.defaultStyleName = Object.keys(meta.styleLibrary)[0];
        updateSetting('currentStyleName', meta.defaultStyleName);
        saveSettingsDebounced();
        localDraft = null;
        renderStylesView();
    });

    // 5. Test Render
    $overlay.on('click', '#plz-style-test-render', async function() {
        const $btn = $(this);
        const originalHtml = $btn.html();
        $btn.prop('disabled', true).text('Generating test...');

        try {
            const resParts = (localDraft.resolutionOverride || '512x768').split('x');
            const url = await fetchPreviewBlob(
                localDraft.engine, 
                localDraft.model, 
                localDraft.template, 
                localDraft.negativePrompt,
                parseInt(resParts[0]), 
                parseInt(resParts[1]), 
                1, 
                localDraft.loras, 
                localDraft.useLayerDiffuse,
                localDraft.engineParams // Pass dynamic parameters to test render
            );
            await callPopup(`<h3>Test OK</h3><img src="${url}" style="width:100%; border-radius:6px;" />`, 'text');
        } catch (err) {
            if (window.toastr) window.toastr.error('Test failed: ' + err.message);
        } finally { $btn.prop('disabled', false).html(originalHtml); }
    });
}