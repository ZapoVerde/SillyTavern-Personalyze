/**
 * @file data/default-user/extensions/personalyze/ui/models/blueprintEditorTemplates.js
 * @stamp {"utc":"2026-04-19T11:00:00.000Z"}
 * @architectural-role UI Template (Visual Blueprint Editor)
 * @description
 * Generates the HTML for the visual, row-based API Blueprint Editor.
 * Features an accordion layout for parameter cards and a Master Utility Bar
 * for JSON Import/Copy bridges.
 * 
 * @api-declaration
 * getBlueprintShellHTML(modelId, baseTemplates) -> string
 * getParameterRowHTML(key, descriptor, isCollapsed) -> string
 * getTypeConfigHTML(type, descriptor) -> string
 * 
 * @contract
 *   assertions:
 *     purity: Pure Function (Structural)
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../../utils/history.js';

/**
 * Main shell for the Blueprint Editor modal.
 */
export function getBlueprintShellHTML(modelId, baseTemplates = {}) {
    const templateOptions = Object.keys(baseTemplates).map(t => 
        `<option value="${escapeHtml(t)}">Reset to ${escapeHtml(t.toUpperCase())} Template</option>`
    ).join('');

    return `
    <div id="plz-bp-editor-container" style="display:flex; flex-direction:column; gap:12px; min-width:min(640px, 92vw);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0;">API Blueprint: <span style="color:var(--SmartThemeQuoteColor);">${escapeHtml(modelId)}</span></h3>
            <div style="display:flex; gap:6px;">
                <button id="plz-bp-copy-json" class="menu_button" title="Copy full blueprint as JSON to clipboard">
                    <i class="fa-solid fa-copy"></i> JSON
                </button>
                <button id="plz-bp-import-json" class="menu_button" title="Import/Paste blueprint from JSON">
                    <i class="fa-solid fa-file-import"></i> Import
                </button>
            </div>
        </div>

        <!-- Master Utility Bar -->
        <div style="display:flex; align-items:center; gap:8px; padding:10px; background:rgba(0,0,0,0.15); border-radius:6px; border:1px solid var(--SmartThemeBorderColor);">
            <select id="plz-bp-template-select" class="text_pole" style="flex:1;">
                <option value="">— Load Base Template —</option>
                ${templateOptions}
            </select>
            <div class="plz-info-icon" title="Resetting will replace all current rows with the selected template."><i class="fa-solid fa-circle-info"></i></div>
        </div>

        <!-- Parameter List (Accordion Container) -->
        <div id="plz-bp-row-list" style="display:flex; flex-direction:column; gap:8px; max-height:450px; overflow-y:auto; padding-right:4px;">
            <!-- Rows injected here via JS -->
        </div>

        <!-- Footer Actions -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05);">
            <button id="plz-bp-add-row" class="menu_button" style="border-color:var(--SmartThemeQuoteColor);">
                <i class="fa-solid fa-plus"></i> Add New Parameter
            </button>
            <p style="font-size:0.75em; opacity:0.5; margin:0; text-align:right;">
                <i class="fa-solid fa-triangle-exclamation"></i> Affects all Styles using this model.
            </p>
        </div>
    </div>`;
}

/**
 * Generates an accordion-style row for a single parameter.
 */
export function getParameterRowHTML(key, descriptor, isCollapsed = true) {
    return `
    <div class="plz-bp-card" data-key="${escapeHtml(key)}" style="border:1px solid var(--SmartThemeBorderColor); border-radius:6px; overflow:hidden; background:rgba(255,255,255,0.02);">
        <!-- Accordion Header -->
        <div class="plz-bp-card-header" style="display:flex; align-items:center; gap:10px; padding:8px 12px; cursor:pointer; background:rgba(255,255,255,0.03);">
            <i class="fa-solid ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down'} plz-bp-toggle" style="width:12px; opacity:0.5;"></i>
            <div style="flex:1; overflow:hidden;">
                <strong class="plz-bp-display-label" style="font-size:0.9em; white-space:nowrap; text-overflow:ellipsis;">${escapeHtml(descriptor.label || key)}</strong>
                <code class="plz-bp-tech-key" style="font-size:0.75em; opacity:0.4; margin-left:8px;">[${escapeHtml(key)}]</code>
            </div>
            <i class="fa-solid fa-trash-can plz-bp-delete-row" style="color:var(--SmartThemeErrorColor); opacity:0.5; cursor:pointer;" title="Delete Parameter"></i>
        </div>

        <!-- Accordion Body -->
        <div class="plz-bp-card-body" style="padding:12px; border-top:1px solid rgba(255,255,255,0.05); ${isCollapsed ? 'display:none;' : ''}">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:12px;">
                <div>
                    <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:4px;">Technical Key (Slug)</label>
                    <input type="text" class="text_pole plz-bp-input-key" value="${escapeHtml(key)}" placeholder="e.g. steps" style="width:100%; font-family:monospace;" />
                </div>
                <div>
                    <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:4px;">Display Label</label>
                    <input type="text" class="text_pole plz-bp-input-label" value="${escapeHtml(descriptor.label || '')}" placeholder="e.g. Sampling Steps" style="width:100%;" />
                </div>
            </div>

            <div style="margin-bottom:12px;">
                <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:4px;">UI Component Type</label>
                <select class="text_pole plz-bp-input-type" style="width:100%;">
                    <option value="slider" ${descriptor.type === 'slider' ? 'selected' : ''}>Range Slider</option>
                    <option value="select" ${descriptor.type === 'select' ? 'selected' : ''}>Dropdown Menu (Select)</option>
                    <option value="checkbox" ${descriptor.type === 'checkbox' ? 'selected' : ''}>Toggle (Checkbox)</option>
                    <option value="text" ${descriptor.type === 'text' ? 'selected' : ''}>Text Input</option>
                    <option value="hidden" ${descriptor.type === 'hidden' ? 'selected' : ''}>Hidden (Fixed Value)</option>
                </select>
            </div>

            <!-- Contextual Config Area -->
            <div class="plz-bp-type-config" style="padding:10px; background:rgba(0,0,0,0.2); border-radius:4px; border:1px solid rgba(255,255,255,0.05);">
                ${getTypeConfigHTML(descriptor.type, descriptor)}
            </div>
        </div>
    </div>`;
}

/**
 * Returns HTML inputs for the specific parameter type.
 */
export function getTypeConfigHTML(type, descriptor) {
    switch (type) {
        case 'slider':
            return `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div>
                    <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:4px;">Minimum</label>
                    <input type="number" class="text_pole plz-bp-conf-min" value="${descriptor.min ?? 1}" style="width:100%;" />
                </div>
                <div>
                    <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:4px;">Maximum</label>
                    <input type="number" class="text_pole plz-bp-conf-max" value="${descriptor.max ?? 50}" style="width:100%;" />
                </div>
                <div>
                    <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:4px;">Step Increment</label>
                    <input type="number" class="text_pole plz-bp-conf-step" value="${descriptor.step ?? 1}" step="0.1" style="width:100%;" />
                </div>
                <div>
                    <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:4px;">Default Value</label>
                    <input type="number" class="text_pole plz-bp-conf-default" value="${descriptor.default ?? 20}" style="width:100%;" />
                </div>
            </div>`;

        case 'select':
            const options = Array.isArray(descriptor.options) ? descriptor.options.join(', ') : '';
            return `
            <div style="display:flex; flex-direction:column; gap:8px;">
                <div>
                    <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:4px;">Menu Options (Comma separated)</label>
                    <input type="text" class="text_pole plz-bp-conf-options" value="${escapeHtml(options)}" placeholder="e.g. Euler A, DPM++ 2M" style="width:100%;" />
                </div>
                <div>
                    <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:4px;">Default Selection</label>
                    <input type="text" class="text_pole plz-bp-conf-default" value="${escapeHtml(descriptor.default ?? '')}" style="width:100%;" />
                </div>
            </div>`;

        case 'checkbox':
            return `
            <label class="checkbox_label" style="cursor:pointer; margin:0;">
                <input type="checkbox" class="plz-bp-conf-default" ${descriptor.default ? 'checked' : ''} />
                <span>Default State (Checked)</span>
            </label>`;

        case 'text':
        case 'hidden':
        default:
            return `
            <div>
                <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:4px;">Default Value</label>
                <input type="text" class="text_pole plz-bp-conf-default" value="${escapeHtml(descriptor.default ?? '')}" style="width:100%;" />
            </div>`;
    }
}