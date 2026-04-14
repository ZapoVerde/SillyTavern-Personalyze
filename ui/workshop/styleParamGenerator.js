/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleParamGenerator.js
 * @stamp {"utc":"2026-04-18T16:40:00.000Z"}
 * @architectural-role UI Generator (Dynamic Parameters)
 * @description
 * Generates HTML for model-specific generation parameters based on the 
 * architecture spec. Provides a pure-functional UI builder and a 
 * scraping utility to collect values for generation.
 * 
 * @api-declaration
 * buildParamsHTML(spec, currentValues) -> string
 * scrapeParamValues($container) -> Object
 * 
 * @contract
 *   assertions:
 *     purity: UI Helper / Partial Pure
 *     state_ownership: []
 *     external_io: [DOM (for scraping)]
 */

import { escapeHtml } from '../../utils/history.js';

/**
 * Builds the HTML string for the dynamic parameter inputs.
 * 
 * @param {Object} spec - The architecture specification from engineSpecs.js.
 * @param {Object} currentValues - The engineParams object from the Style Package.
 * @returns {string}
 */
export function buildParamsHTML(spec, currentValues = {}) {
    if (!spec || typeof spec !== 'object') {
        return '<div style="opacity:0.5; font-size:0.85em; padding:10px; text-align:center;">No specific parameters for this model.</div>';
    }

    const html = Object.entries(spec).map(([key, config]) => {
        const value = currentValues[key] ?? config.default;
        const label = config.label || key;

        switch (config.type) {
            case 'slider':
                return `
                <div class="plz-style-param-row" style="margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <label style="font-size:0.8em; opacity:0.7;">${escapeHtml(label)}</label>
                        <span class="plz-param-value" style="font-size:0.8em; font-family:monospace; color:var(--SmartThemeQuoteColor);">${value}</span>
                    </div>
                    <input type="range" class="plz-style-param" data-key="${escapeHtml(key)}" 
                           min="${config.min}" max="${config.max}" step="${config.step || 1}" 
                           value="${value}" style="width:100%; cursor:pointer;" />
                </div>`;

            case 'select':
                const options = (config.options || [])
                    .map(opt => `<option value="${escapeHtml(opt)}" ${opt === value ? 'selected' : ''}>${escapeHtml(opt)}</option>`)
                    .join('');
                return `
                <div class="plz-style-param-row" style="margin-bottom:10px;">
                    <label style="display:block; font-size:0.8em; opacity:0.7; margin-bottom:4px;">${escapeHtml(label)}</label>
                    <select class="plz-style-param text_pole" data-key="${escapeHtml(key)}" style="width:100%;">
                        ${options}
                    </select>
                </div>`;

            case 'checkbox':
                return `
                <div class="plz-style-param-row" style="margin-bottom:10px;">
                    <label class="checkbox_label" style="font-size:0.9em; cursor:pointer;">
                        <input type="checkbox" class="plz-style-param" data-key="${escapeHtml(key)}" ${value ? 'checked' : ''} />
                        <span>${escapeHtml(label)}</span>
                    </label>
                </div>`;

            default:
                return '';
        }
    }).join('');

    return `<div class="plz-dynamic-params-container">${html}</div>`;
}

/**
 * Scrapes all parameter values from the dynamic UI container.
 * 
 * @param {jQuery} $container - The element containing .plz-style-param inputs.
 * @returns {Object} A flat map of keys to values (engineParams).
 */
export function scrapeParamValues($container) {
    const params = {};
    $container.find('.plz-style-param').each(function() {
        const $el = $(this);
        const key = $el.data('key');
        let val;

        if ($el.is(':checkbox')) {
            val = $el.prop('checked');
        } else if ($el.is('select')) {
            val = $el.val();
        } else {
            // Treat as numeric (range/slider)
            val = parseFloat($el.val());
            if (isNaN(val)) val = $el.val();
        }

        params[key] = val;
    });
    return params;
}