/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleLogicTemplates.js
 * @stamp {"utc":"2026-05-01T08:15:00.000Z"}
 * @architectural-role Pure UI Template (Global Style Logic)
 * @description
 * Generates the HTML for the Reactive Logic Engine configuration drawer.
 * Implements a CRUD-row interface for surgical editing of narrative probes.
 * 
 * @api-declaration
 * getLogicDrawerHTML(styleObj, activeProbeKey, isProbeDirty) -> string
 * getProbeSelectorHTML(probes, activeKey, isDirty) -> string
 * getProbeEditorHTML(probeKey, probeObj) -> string
 * 
 * @contract
 *   assertions:
 *     purity: Pure Function (Structural)
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../../utils/history.js';
import { BASE_SLOTS } from '../../defaults.js';

/**
 * Main drawer shell for the Logic Probes section.
 */
export function getLogicDrawerHTML(styleObj, activeProbeKey = '', isProbeDirty = false) {
    const probes = styleObj?.logicProbes || {};
    const probeObj = probes[activeProbeKey] || null;

    return `
    <details id="plz-logic-details" class="plz-style-details" style="border: 1px solid var(--SmartThemeBorderColor); border-radius: 6px; padding: 10px; margin-top: 10px;">
        <summary style="cursor:pointer; font-weight:bold; opacity:0.8;">
            <i class="fa-solid fa-brain" style="margin-right:5px; font-size:0.9em;"></i> Logic Probes
        </summary>
        
        <div id="plz-logic-config-container" style="display:flex; flex-direction:column; gap:12px; margin-top:12px;">
            <!-- CRUD Row -->
            <div id="plz-logic-selector-container">
                ${getProbeSelectorHTML(probes, activeProbeKey, isProbeDirty)}
            </div>

            <!-- Active Editor Area -->
            <div id="plz-logic-editor-container">
                ${probeObj ? getProbeEditorHTML(activeProbeKey, probeObj) : '<div style="text-align:center; opacity:0.4; font-size:0.85em; padding:20px;">Select or create a probe to begin.</div>'}
            </div>
        </div>
    </details>`;
}

/**
 * Renders the Logic Probe selector and action buttons.
 */
export function getProbeSelectorHTML(probes, activeKey = '', isDirty = false) {
    const options = Object.keys(probes).map(key => {
        const label = key + (key === activeKey && isDirty ? ' *' : '');
        return `<option value="${escapeHtml(key)}" ${key === activeKey ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

    return `
    <div style="display:flex; align-items:center; gap:5px;">
        <select id="plz-logic-selector" class="text_pole" style="flex:1; font-weight:bold;">
            <option value="">— Select Logic Probe —</option>
            ${options}
            <option value="__new__">[ + New Probe ]</option>
        </select>
        <button id="plz-logic-save" class="menu_button" title="Save probe changes" ${!isDirty ? 'disabled' : ''}>💾</button>
        <button id="plz-logic-revert" class="menu_button" title="Revert to saved" ${!isDirty ? 'disabled' : ''}>↺</button>
        <button id="plz-logic-clone" class="menu_button" title="Clone current probe" ${!activeKey ? 'disabled' : ''}>➕</button>
        <button id="plz-logic-delete" class="menu_button" style="color:var(--SmartThemeErrorColor);" title="Delete probe" ${!activeKey ? 'disabled' : ''}>🗑️</button>
    </div>`;
}

/**
 * Renders the detailed configuration fields for an active probe.
 */
export function getProbeEditorHTML(probeKey, probeObj) {
    const isBoolean = probeObj.type === 'boolean';

    return `
    <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:6px; padding:10px; display:flex; flex-direction:column; gap:10px;">
        
        <!-- Legend (Click to Copy) -->
        <div style="padding-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.05);">
            <div style="font-size:0.7em; font-weight:bold; text-transform:uppercase; opacity:0.5; margin-bottom:5px;">Available Tokens</div>
            ${getLogicVariableLegendHTML()}
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; align-items:end;">
            <div>
                <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:4px;">Evaluation Engine</label>
                <select id="plz-logic-profile" class="text_pole" style="width:100%;"></select>
            </div>
            <div>
                <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:4px;">Output Type</label>
                <div style="display:flex; border:1px solid var(--SmartThemeBorderColor); border-radius:4px; overflow:hidden;">
                    <button class="plz-logic-type-btn ${isBoolean ? 'plz-active' : ''}" data-type="boolean" style="flex:1; padding:4px; border:none; font-size:0.8em; cursor:pointer;">Boolean</button>
                    <button class="plz-logic-type-btn ${!isBoolean ? 'plz-active' : ''}" data-type="text" style="flex:1; padding:4px; border:none; font-size:0.8em; cursor:pointer;">Text</button>
                </div>
            </div>
        </div>

        <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <label style="font-size:0.75em; opacity:0.6;">LLM Logic Query</label>
                <button id="plz-logic-edit-prompt" class="menu_button" style="font-size:0.72em; padding:1px 8px;">
                    <i class="fa-solid fa-expand"></i> Fullscreen Prompt
                </button>
            </div>
            <textarea id="plz-logic-prompt-preview" class="text_pole" readonly rows="2" 
                      style="width:100%; font-family:monospace; font-size:0.85em; opacity:0.7; cursor:default; resize:none;">${escapeHtml(probeObj.prompt || '')}</textarea>
        </div>

        <div id="plz-logic-boolean-templates" class="${isBoolean ? '' : 'plz-hidden'}" style="display:flex; flex-direction:column; gap:8px; padding-top:5px; border-top:1px solid rgba(255,255,255,0.05);">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div>
                    <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:4px; color:var(--SmartThemeQuoteColor);">If True (Yes)</label>
                    <textarea id="plz-logic-true" class="text_pole" rows="2" placeholder="Text to inject..." style="width:100%; font-size:0.85em; resize:none;">${escapeHtml(probeObj.trueTemplate || '')}</textarea>
                </div>
                <div>
                    <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:4px; color:var(--SmartThemeErrorColor);">If False (No)</label>
                    <textarea id="plz-logic-false" class="text_pole" rows="2" placeholder="Optional fallback..." style="width:100%; font-size:0.85em; resize:none;">${escapeHtml(probeObj.falseTemplate || '')}</textarea>
                </div>
            </div>
        </div>

        <div id="plz-logic-text-info" class="${!isBoolean ? '' : 'plz-hidden'}" style="font-size:0.8em; opacity:0.5; font-style:italic; text-align:center; padding:5px;">
            The raw response from the AI will be injected into {{${probeKey}}}.
        </div>

        <button id="plz-logic-test-probe" class="menu_button" style="margin-top:5px;">
            <i class="fa-solid fa-vial"></i> Test This Probe
        </button>
    </div>`;
}

/**
 * Builds the click-to-copy token legend for the logic prompt.
 */
function getLogicVariableLegendHTML() {
    const tokens = [
        { t: '{{history}}', d: 'Chat context' },
        { t: '{{current_turn}}', d: 'Latest message' },
        { t: '{{character_name}}', d: 'Active ID' }
    ];

    // Add Wardrobe slots
    BASE_SLOTS.forEach(s => tokens.push({ t: `{{${s}}}`, d: 'Clothing' }));

    return `
    <div style="display:flex; flex-wrap:wrap; gap:4px; max-height: 60px; overflow-y: auto; padding:2px;">
        ${tokens.map(item => `
            <code class="plz-logic-token-chip" 
                  title="Click to copy: ${item.d}"
                  style="cursor:pointer; font-size:0.8em; background:rgba(0,0,0,0.3); padding:1px 5px; border-radius:3px; color:var(--SmartThemeEmColor);">
                ${item.t}
            </code>
        `).join('')}
    </div>`;
}