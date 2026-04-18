/**
 * @file data/default-user/extensions/personalyze/ui/models/blueprintEditor.js
 * @stamp {"utc":"2026-04-19T11:20:00.000Z"}
 * @architectural-role UI Executor (Technical Editor)
 * @description
 * Implements the visual, row-based API Blueprint Editor.
 * Features an accordion layout for vertical space management and a bridge 
 * for JSON Import/Copy to ensure portability and reality-first auditing.
 * 
 * @api-declaration
 * openBlueprintEditor(modelId) -> Promise<boolean>
 * 
 * @contract
 *   assertions:
 *     purity: IO Executor / Stateful UI
 *     state_ownership: []
 *     external_io: [callPopup, modelRegistry.js, blueprintProcessor.js, blueprintEditorTemplates.js]
 */

import { getModelBlueprint, saveModelBlueprint, getBaseTemplates } from '../../modelRegistry.js';
import { isValidBlueprint, sanitizeBlueprintObject } from '../../logic/blueprintProcessor.js';
import {
    getBlueprintShellHTML,
    getParameterRowHTML,
    getTypeConfigHTML
} from './blueprintEditorTemplates.js';
import { escapeHtml } from '../../utils/history.js';
import { openTextModal } from '../../utils/textModal.js';

/**
 * Scrapes the Visual UI rows and assembles a raw Blueprint Object.
 * @returns {Object}
 */
function scrapeBlueprintFromUI() {
    const data = {};
    $('.plz-bp-card').each(function() {
        const $card = $(this);
        const key = $card.find('.plz-bp-input-key').val().trim();
        if (!key) return;

        const type = $card.find('.plz-bp-input-type').val();
        const descriptor = {
            type,
            label: $card.find('.plz-bp-input-label').val().trim()
        };

        // Type-specific field collection
        switch (type) {
            case 'slider':
                descriptor.min = parseFloat($card.find('.plz-bp-conf-min').val());
                descriptor.max = parseFloat($card.find('.plz-bp-conf-max').val());
                descriptor.step = parseFloat($card.find('.plz-bp-conf-step').val());
                descriptor.default = parseFloat($card.find('.plz-bp-conf-default').val());
                break;
            case 'select':
                descriptor.options = $card.find('.plz-bp-conf-options').val().split(',').map(s => s.trim()).filter(Boolean);
                descriptor.default = $card.find('.plz-bp-conf-default').val().trim();
                break;
            case 'checkbox':
                descriptor.default = $card.find('.plz-bp-conf-default').prop('checked');
                break;
            default:
                descriptor.default = $card.find('.plz-bp-conf-default').val().trim();
                break;
        }

        data[key] = descriptor;
    });
    return data;
}

/**
 * Renders a list of parameter cards into the container.
 * @param {Object} blueprint 
 */
function renderRowList(blueprint) {
    const $list = $('#plz-bp-row-list');
    $list.empty();
    Object.entries(blueprint).forEach(([key, descriptor]) => {
        $list.append(getParameterRowHTML(key, descriptor, true));
    });
}

/**
 * Opens the Visual Blueprint Editor as a self-contained fullscreen overlay.
 */
export async function openBlueprintEditor(modelId) {
    const currentBlueprint = getModelBlueprint(modelId) || {};
    const baseTemplates = getBaseTemplates();

    const $overlay = $(getBlueprintShellHTML(modelId, baseTemplates));
    $('body').append($overlay);

    return new Promise((resolve) => {
        const teardown = (saved) => {
            $(document).off('.plzBP');
            $overlay.remove();
            resolve(saved);
        };

        // Initial Render
        renderRowList(currentBlueprint);

        // Save FAB
        $overlay.find('#plz-bp-save-fab').on('click', () => {
            const raw = scrapeBlueprintFromUI();
            const clean = sanitizeBlueprintObject(raw);
            saveModelBlueprint(modelId, clean);
            teardown(true);
        });

        // Cancel button
        $overlay.find('#plz-bp-cancel').on('click', () => teardown(false));

        // Backdrop click
        $overlay.on('mousedown', (e) => {
            if (e.target === $overlay[0]) teardown(false);
        });
        $overlay.find('.plz-modal').on('mousedown', (e) => e.stopPropagation());

        // Escape key
        $(document).on('keydown.plzBP', (e) => {
            if (e.key === 'Escape') teardown(false);
        });

        // 1. Accordion Toggle
        $(document).on('click.plzBP', '.plz-bp-card-header', function(e) {
            if ($(e.target).hasClass('plz-bp-delete-row')) return;
            const $card = $(this).closest('.plz-bp-card');
            const $body = $card.find('.plz-bp-card-body');
            const $icon = $card.find('.plz-bp-toggle');

            const isVisible = $body.is(':visible');
            $body.slideToggle(150);
            $icon.toggleClass('fa-chevron-right', isVisible).toggleClass('fa-chevron-down', !isVisible);
        });

        // 2. Type Switching (Reactive)
        $(document).on('change.plzBP', '.plz-bp-input-type', function() {
            const $card = $(this).closest('.plz-bp-card');
            const newType = $(this).val();
            const dummyDescriptor = { type: newType };
            $card.find('.plz-bp-type-config').html(getTypeConfigHTML(newType, dummyDescriptor));
        });

        // 3. Header Sync (Label & Key)
        $(document).on('input.plzBP', '.plz-bp-input-label', function() {
            $(this).closest('.plz-bp-card').find('.plz-bp-display-label').text($(this).val() || 'Unnamed Parameter');
        });
        $(document).on('input.plzBP', '.plz-bp-input-key', function() {
            $(this).closest('.plz-bp-card').find('.plz-bp-tech-key').text(`[${$(this).val()}]`);
        });

        // 4. Add Row
        $(document).on('click.plzBP', '#plz-bp-add-row', function() {
            const $list = $('#plz-bp-row-list');
            const newKey = `param_${Date.now().toString().slice(-4)}`;
            const $newRow = $(getParameterRowHTML(newKey, { type: 'text', label: 'New Parameter' }, false));
            $list.append($newRow);
            $newRow[0].scrollIntoView({ behavior: 'smooth', block: 'end' });
        });

        // 5. Delete Row
        $(document).on('click.plzBP', '.plz-bp-delete-row', function() {
            $(this).closest('.plz-bp-card').remove();
        });

        // 6. Template Loading
        $(document).on('change.plzBP', '#plz-bp-template-select', function() {
            const templateKey = $(this).val();
            if (!templateKey || !baseTemplates[templateKey]) return;

            const confirmed = window.confirm(`Replace all current parameters with the "${templateKey.toUpperCase()}" template?`);
            if (confirmed) {
                renderRowList(baseTemplates[templateKey]);
                $(this).val('');
            }
        });

        // 7. Bridge: Copy JSON
        $(document).on('click.plzBP', '#plz-bp-copy-json', function() {
            const raw = scrapeBlueprintFromUI();
            const clean = sanitizeBlueprintObject(raw);
            const json = JSON.stringify(clean, null, 2);

            navigator.clipboard.writeText(json).then(() => {
                if (window.toastr) window.toastr.success('Blueprint JSON copied to clipboard.');
            });
        });

        // 8. Bridge: Import JSON
        $(document).on('click.plzBP', '#plz-bp-import-json', async function() {
            const rawJson = await openTextModal({
                title: 'Import Blueprint JSON',
                initialValue: '',
            });
            if (rawJson !== null) {
                const result = isValidBlueprint(rawJson);
                if (result.valid) {
                    renderRowList(result.data);
                } else {
                    if (window.toastr) window.toastr.error(`Import failed: ${result.error}`);
                }
            }
        });
    });
}