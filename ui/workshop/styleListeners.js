/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleListeners.js
 * @stamp {"utc":"2026-04-17T00:05:00.000Z"}
 * @architectural-role UI Controller (Global Styles)
 * @description
 * Orchestrates the management and editing of Global Style Render Pipelines.
 * Manages draft state ("dirty" edits), clones/clobbers style packages,
 * and handles connectivity testing for the active configuration.
 * 
 * @api-declaration
 * renderStylesView() -> void
 * bindStyleHandlers() -> void
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [localDraft]
 *     external_io: [settings.js, styleModals.js, imageCache.js, DOM]
 */

import { getSettings, getMetaSettings, updateSetting } from '../../settings.js';
import { saveSettingsDebounced, callPopup } from '../../../../../../script.js';
import { fetchPreviewBlob } from '../../imageCache.js';
import { smartResize } from '../../utils/dom.js';
import { DEFAULT_STYLE_PACKAGE } from '../../defaults.js';
import { getStylesTabHTML, getLoraTagsHTML } from './styleTemplates.js';
import { openPipelineModal, openLoraModal } from './styleModals.js';

/** Temporary store for edits not yet committed to the Global Library. */
let localDraft = null;

/**
 * Renders the Global Styles view into the Workshop panel.
 */
export function renderStylesView() {
    const meta = getMetaSettings();
    const s = getSettings();
    const lib = meta.styleLibrary || {};
    
    const activeName = (s.currentStyleName && lib[s.currentStyleName]) 
        ? s.currentStyleName 
        : (meta.defaultStyleName || Object.keys(lib)[0]);

    // Initialize draft if needed or if switching styles
    if (!localDraft || localDraft._originalName !== activeName) {
        localDraft = { ...structuredClone(lib[activeName] || DEFAULT_STYLE_PACKAGE), _originalName: activeName };
    }

    const html = getStylesTabHTML(lib, meta.defaultStyleName, activeName, localDraft);
    const $panel = $('#plz-tab-styles').html(html);

    $panel.find('.plz-auto-textarea').each(function() { smartResize(this); });
    _updateDirtyUI();
}

/**
 * Compares draft to library to show/hide the save button.
 */
function _updateDirtyUI() {
    const meta = getMetaSettings();
    const original = meta.styleLibrary[localDraft._originalName];
    if (!original) return;

    // Deep compare prompts and technical fields
    const isDirty = (
        localDraft.template !== original.template ||
        localDraft.negativePrompt !== original.negativePrompt ||
        localDraft.engine !== original.engine ||
        localDraft.model !== original.model ||
        localDraft.resolutionOverride !== original.resolutionOverride ||
        localDraft.useLayerDiffuse !== original.useLayerDiffuse ||
        JSON.stringify(localDraft.loras) !== JSON.stringify(original.loras)
    );

    $('#plz-style-dirty-notice').toggleClass('plz-hidden', !isDirty);
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
        localDraft = null; // Force draft reset
        renderStylesView();
    });

    // 2. Prompt Edits
    $overlay.on('input', '#plz-style-template, #plz-style-negative', function() {
        localDraft.template = $('#plz-style-template').val();
        localDraft.negativePrompt = $('#plz-style-negative').val();
        _updateDirtyUI();
    });

    // 3. Technical Popups
    $overlay.on('click', '#plz-style-edit-pipeline', async () => {
        const result = await openPipelineModal(localDraft);
        if (result) {
            Object.assign(localDraft, result);
            _updateDirtyUI();
        }
    });

    $overlay.on('click', '#plz-style-edit-loras', async () => {
        const result = await openLoraModal(localDraft.loras);
        if (result) {
            localDraft.loras = result;
            $('#plz-style-lora-tags').html(getLoraTagsHTML(localDraft.loras));
            _updateDirtyUI();
        }
    });

    // 4. CRUD Operations
    $overlay.on('click', '#plz-style-save-changes', () => {
        const meta = getMetaSettings();
        meta.styleLibrary[localDraft._originalName] = structuredClone(localDraft);
        delete meta.styleLibrary[localDraft._originalName]._originalName;
        saveSettingsDebounced();
        renderStylesView();
        if (window.toastr) window.toastr.success(`Style "${localDraft._originalName}" updated.`);
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
            const resParts = (localDraft.resolutionOverride || '256x384').split('x');
            const url = await fetchPreviewBlob(
                localDraft.engine, localDraft.model, localDraft.template, localDraft.negativePrompt,
                parseInt(resParts[0]), parseInt(resParts[1]), 1, localDraft.loras, localDraft.useLayerDiffuse
            );
            await callPopup(`<h3>Test OK</h3><img src="${url}" style="width:100%; border-radius:6px;" />`, 'text');
        } catch (err) {
            if (window.toastr) window.toastr.error('Test failed: ' + err.message);
        } finally {
            $btn.prop('disabled', false).html(originalHtml);
        }
    });
}