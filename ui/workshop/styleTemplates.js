/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleTemplates.js
 * @stamp {"utc":"2026-04-16T23:58:00.000Z"}
 * @architectural-role Pure UI Template (Global Styles)
 * @description
 * Generates the HTML for the Global Styles management tab.
 * Implements a dropdown-first layout for mobile compatibility.
 * 
 * @api-declaration
 * getStylesTabHTML(styleLibrary, defaultName, activeName, styleObj)
 * getVariableLegendHTML()
 * getLoraTagsHTML(loras)
 * 
 * @contract
 *   assertions:
 *     purity: Pure Function
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../../utils/history.js';
import { RUNWARE_LORA_REGISTRY } from '../../defaults.js';

/**
 * Main Styles Tab Layout.
 */
export function getStylesTabHTML(styleLibrary, defaultName, activeName, styleObj) {
    const options = Object.keys(styleLibrary).map(name => {
        const isDefault = name === defaultName;
        return `<option value="${escapeHtml(name)}" ${name === activeName ? 'selected' : ''}>${escapeHtml(name)}${isDefault ? ' ⭐' : ''}</option>`;
    }).join('');

    return `
    <div id="plz-styles-container" style="display:flex; flex-direction:column; gap:12px; padding:5px;">
        <h3 style="margin:0;">Global Portrait Styles</h3>
        
        <!-- Compact Style Selection Row (Restored) -->
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
            <select id="plz-style-selector" class="text_pole" style="flex:1; font-weight:bold;">
                ${options}
            </select>
            <button id="plz-style-set-default" class="menu_button" title="Set as global default">⭐</button>
            <button id="plz-style-new" class="menu_button" title="Create new from current">➕</button>
            <button id="plz-style-delete" class="menu_button" style="color:var(--SmartThemeErrorColor);" title="Delete style">🗑️</button>
        </div>

        <!-- Collapsible Generation Settings -->
        <details class="plz-style-details" style="border: 1px solid var(--SmartThemeBorderColor); border-radius: 6px; padding: 10px;">
            <summary style="cursor:pointer; font-weight:bold; opacity:0.8;">Generation Settings</summary>
            
            <div style="display:flex; flex-direction:column; gap:12px; margin-top:12px;">
                <div style="display:flex; gap:8px;">
                    <button id="plz-style-edit-pipeline" class="menu_button" style="flex:1;">
                        <i class="fa-solid fa-gears"></i> Engine & Model
                    </button>
                    <button id="plz-style-edit-loras" class="menu_button" style="flex:1;">
                        <i class="fa-solid fa-layer-group"></i> Manage LoRAs
                    </button>
                </div>

                <div id="plz-style-lora-tags">
                    ${getLoraTagsHTML(styleObj.loras)}
                </div>

                ${getVariableLegendHTML()}
            </div>
        </details>

        <!-- Positive Prompt -->
        <div style="display:flex; flex-direction:column; gap:5px;">
            <label style="font-size:0.85em; opacity:0.7;">Positive Prompt Template</label>
            <textarea id="plz-style-template" class="text_pole plz-auto-textarea" rows="4" 
                      placeholder="Prompt..." style="width:100%; font-family:monospace; font-size:0.85em;">${escapeHtml(styleObj.template)}</textarea>
        </div>

        <!-- Collapsible Negative Prompt -->
        <details class="plz-style-details" style="opacity:0.9;">
            <summary style="cursor:pointer; font-size:0.85em; opacity:0.7;">Negative Prompt (Optional)</summary>
            <textarea id="plz-style-negative" class="text_pole plz-auto-textarea" rows="2" 
                      placeholder="Exclusions..." style="width:100%; font-family:monospace; font-size:0.85em; margin-top:5px;">${escapeHtml(styleObj.negativePrompt)}</textarea>
        </details>

        <div id="plz-style-dirty-notice" class="plz-hidden" style="padding:10px; background:rgba(var(--SmartThemeQuoteColor-rgb), 0.15); border:1px solid var(--SmartThemeQuoteColor); border-radius:6px; text-align:center;">
            <div style="font-size:0.85em; margin-bottom:8px;">You have unsaved changes to this style.</div>
            <button id="plz-style-save-changes" class="menu_button" style="background:var(--SmartThemeQuoteColor); color:white; width:100%;">Update Style Package</button>
        </div>

        <button id="plz-style-test-render" class="menu_button" style="margin-top:10px;">
            <i class="fa-solid fa-flask"></i> Test Render
        </button>
    </div>`;
}

/**
 * Variable usage helper.
 */
export function getVariableLegendHTML() {
    const vars = [
        { v: '{{identity_anchor}}', d: 'Physical description' },
        { v: '{{layers_description}}', d: 'Current wardrobe' },
        { v: '{{emotion}}', d: 'Expression adjective' },
        { v: '{{pose}}', d: 'Current posture' }
    ];

    return `
    <div style="display:grid; grid-template-columns: 1fr; gap:4px; opacity:0.6; font-size:0.75em;">
        ${vars.map(v => `
            <div style="display:flex; align-items:center; gap:8px;">
                <code style="background:rgba(0,0,0,0.3); padding:1px 4px; border-radius:3px; color:var(--SmartThemeQuoteColor); cursor:pointer;" 
                      onclick="navigator.clipboard.writeText('${v.v}')">${v.v}</code>
                <span>— ${v.d}</span>
            </div>`).join('')}
    </div>`;
}

/**
 * Renders the small colorful tags for active LoRAs.
 */
export function getLoraTagsHTML(loras) {
    if (!loras || loras.length === 0) {
        return `<div style="text-align:center; opacity:0.4; font-size:0.85em; padding:5px;">Clean Style (No LoRAs)</div>`;
    }

    return `
    <div style="display:flex; flex-wrap:wrap; gap:4px;">
        ${loras.map(l => {
            const entry = RUNWARE_LORA_REGISTRY.find(r => r.air === l.air);
            const label = entry ? entry.label : 'Unknown LoRA';
            return `<span style="padding:2px 8px; border-radius:10px; background:var(--SmartThemeQuoteColor); color:white; font-size:0.7em;">${escapeHtml(label)} (${l.weight})</span>`;
        }).join('')}
    </div>`;
}