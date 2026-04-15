/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleParamGenerator.js
 * @stamp {"utc":"2026-04-19T09:10:00.000Z"}
 * @architectural-role UI Generator (Dynamic Parameters)
 * @description
 * Generates HTML for model-specific generation parameters based on the 
 * Technical Blueprint. Provides a pure-functional UI builder and a 
 * scraping utility to collect values for generation.
 * 
 * Updated for Dynamic Blueprint Architecture:
 * 1. buildParamsHTML now supports 'text' and 'hidden' types.
 * 2. Uses Blueprint descriptors (label, min, max, default) for rendering.
 * 
 * @api-declaration
 * buildParamsHTML(blueprint, currentValues) -> string
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
 * Builds the HTML string for the dynamic parameter inputs based on a Blueprint.
 * 
 * @param {Object} blueprint - The technical blueprint object (from ModelRegistry).
 * @param {Object} currentValues - Flat map of current user selections (engineParams).
 * @returns {string}
 */
export function buildParamsHTML(blueprint, currentValues = {}) {
    if (!blueprint || typeof blueprint !== 'object') {
        return '<div style="opacity:0.5; font-size:0.85em; padding:10px; text-align:center;">No technical parameters defined for this model.</div>';
    }

    const html = Object.entries(blueprint).map(([key, config]) => {
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
                           min="${config.min ?? 0}" max="${config.max ?? 100}" step="${config.step || 1}" 
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

            case 'text':
                return `
                <div class="plz-style-param-row" style="margin-bottom:10px;">
                    <label style="display:block; font-size:0.8em; opacity:0.7; margin-bottom:4px;">${escapeHtml(label)}</label>
                    <input type="text" class="plz-style-param text_pole" data-key="${escapeHtml(key)}" 
                           value="${escapeHtml(value ?? '')}" style="width:100%;" />
                </div>`;

            case 'hidden':
                // Hidden parameters are not rendered but persist in the blueprint logic
                return '';

            default:
                console.warn(`[PLZ:UI] Unknown parameter type "${config.type}" for key "${key}"`);
                return '';
        }
    }).join('');

    return `<div class="plz-dynamic-params-container">${html}</div>`;
}

/**
 * Scrapes all parameter values from the dynamic UI container.
 * 
 * @param {jQuery} $container - The element containing .plz-style-param inputs.
 * @returns {Object} A flat map of keys to values (userValues).
 */
export function scrapeParamValues($container) {
    const params = {};
    $container.find('.plz-style-param').each(function() {
        const $el = $(this);
        const key = $el.data('key');
        let val;

        if ($el.is(':checkbox')) {
            val = $el.prop('checked');
        } else if ($el.is('select') || $el.is('input[type="text"]')) {
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