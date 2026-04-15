/**
 * @file data/default-user/extensions/personalyze/ui/models/blueprintEditor.js
 * @stamp {"utc":"2026-04-19T09:30:00.000Z"}
 * @architectural-role UI Executor (Technical Editor)
 * @description
 * Provides a dedicated modal for editing raw JSON Technical Blueprints.
 * Features real-time validation, template swapping, and auto-sizing.
 * 
 * @api-declaration
 * openBlueprintEditor(modelId) -> Promise<boolean>
 * 
 * @contract
 *   assertions:
 *     purity: IO Executor / Stateful UI
 *     state_ownership: []
 *     external_io: [callPopup, modelRegistry.js, blueprintProcessor.js, smartResize]
 */

import { callPopup } from '../../../../../script.js';
import { getModelBlueprint, saveModelBlueprint, getBaseTemplates } from '../../modelRegistry.js';
import { isValidBlueprint } from '../../logic/blueprintProcessor.js';
import { smartResize } from '../../utils/dom.js';
import { escapeHtml } from '../../utils/history.js';

/**
 * Opens the JSON Blueprint Editor for a specific model.
 * 
 * @param {string} modelId - The technical ID of the model being edited.
 * @returns {Promise<boolean>} Resolves to true if saved, false otherwise.
 */
export async function openBlueprintEditor(modelId) {
    const currentBlueprint = getModelBlueprint(modelId);
    const baseTemplates = getBaseTemplates();
    
    const templateOptions = Object.keys(baseTemplates).map(t => 
        `<option value="${escapeHtml(t)}">Apply ${escapeHtml(t.toUpperCase())} Template</option>`
    ).join('');

    const html = `
    <div id="plz-blueprint-editor-modal" style="display:flex; flex-direction:column; gap:12px; min-width:min(600px, 90vw);">
        <h3 style="margin:0;">API Blueprint: <span style="color:var(--SmartThemeQuoteColor);">${escapeHtml(modelId)}</span></h3>
        
        <div style="display:flex; align-items:center; gap:8px;">
            <select id="plz-bp-template-select" class="text_pole" style="flex:1;">
                <option value="">— Select Base Template —</option>
                ${templateOptions}
            </select>
            <div class="plz-info-icon" title="Resetting to a template will overwrite your current edits."><i class="fa-solid fa-circle-info"></i></div>
        </div>

        <div style="position:relative;">
            <textarea id="plz-bp-json-area" class="text_pole plz-auto-textarea" rows="12" 
                      style="width:100%; font-family:monospace; font-size:0.82em; min-height:350px; white-space:pre; tab-size: 2;" 
                      spellcheck="false">${JSON.stringify(currentBlueprint, null, 2)}</textarea>
            <div id="plz-bp-status-indicator" style="position:absolute; top:8px; right:8px; font-size:0.7em; padding:2px 6px; border-radius:4px; pointer-events:none;"></div>
        </div>

        <div id="plz-bp-error-msg" style="font-size:0.75em; color:var(--SmartThemeErrorColor); min-height:1.2em; white-space:pre-wrap;"></div>

        <p style="font-size:0.75em; opacity:0.6; margin:0;">
            <i class="fa-solid fa-triangle-exclamation"></i> Modifications here will affect all Global Styles using this specific model.
        </p>
    </div>`;

    let validationTimer = null;
    let validatedData = null;

    return new Promise((resolve) => {
        callPopup(html, 'confirm').then(ok => {
            if (ok && validatedData) {
                saveModelBlueprint(modelId, validatedData);
                resolve(true);
            } else {
                resolve(false);
            }
            $(document).off('.plzBP');
        }).catch(() => {
            $(document).off('.plzBP');
            resolve(false);
        });

        const $area = $('#plz-bp-json-area');
        const $error = $('#plz-bp-error-msg');
        const $status = $('#plz-bp-status-indicator');
        const $okBtn = $('#dialogue_popup_ok');

        /**
         * Validates the current textarea content.
         */
        const validate = () => {
            const raw = $area.val();
            const result = isValidBlueprint(raw);

            if (result.valid) {
                validatedData = result.data;
                $area.css('border-color', '');
                $error.text('');
                $status.text('✓ VALID').css({'background': 'rgba(40,167,69,0.2)', 'color': '#28a745'});
                $okBtn.prop('disabled', false).css('opacity', '1');
            } else {
                validatedData = null;
                $area.css('border-color', 'var(--SmartThemeErrorColor)');
                $error.text(result.error);
                $status.text('✗ INVALID').css({'background': 'rgba(224,85,85,0.2)', 'color': '#e05555'});
                $okBtn.prop('disabled', true).css('opacity', '0.5');
            }
        };

        // Initialize state
        smartResize($area[0]);
        validate();

        // 1. Debounced Input Validation
        $(document).on('input.plzBP', '#plz-bp-json-area', function() {
            smartResize(this);
            clearTimeout(validationTimer);
            validationTimer = setTimeout(validate, 500);
        });

        // 2. Template Swapping
        $(document).on('change.plzBP', '#plz-bp-template-select', function() {
            const templateKey = $(this).val();
            if (!templateKey || !baseTemplates[templateKey]) return;

            $area.val(JSON.stringify(baseTemplates[templateKey], null, 2));
            smartResize($area[0]);
            validate();
        });
    });
}