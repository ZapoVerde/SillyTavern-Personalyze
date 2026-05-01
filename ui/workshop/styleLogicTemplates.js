/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleLogicTemplates.js
 * @stamp {"utc":"2026-05-01T12:00:00.000Z"}
 * @architectural-role Pure UI Template (Global Style Logic)
 * @description
 * Generates the HTML for the Reactive Logic Engine configuration drawer.
 * Implements a CRUD-row interface for surgical editing of narrative probes.
 * 
 * Updated for Computational Logic:
 * 1. Added "Computational" output type button.
 * 2. Added Comparison Chip legend for the DSL syntax.
 * 3. Updated conditional visibility for True/False templates.
 * 
 * @api-declaration
 * getLogicDrawerHTML(styleObj, activeProbeKey, isProbeDirty, identitySlots) -> string
 * getProbeSelectorHTML(probes, activeKey, isDirty) -> string
 * getProbeEditorHTML(probeKey, probeObj, identitySlots) -> string
 * 
 * @contract
 *   assertions:
 *     purity: Pure Function (Structural)
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../../utils/history.js';
import { BASE_SLOTS, BASE_IDENTITY_SLOTS } from '../../defaults.js';

/**
 * Main drawer shell for the Logic Probes section.
 */
export function getLogicDrawerHTML(styleObj, activeProbeKey = '', isProbeDirty = false, identitySlots = BASE_IDENTITY_SLOTS) {
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
                ${probeObj ? getProbeEditorHTML(activeProbeKey, probeObj, identitySlots) : '<div style="text-align:center; opacity:0.4; font-size:0.85em; padding:20px;">Select or create a probe to begin.</div>'}
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
export function getProbeEditorHTML(probeKey, probeObj, identitySlots = BASE_IDENTITY_SLOTS) {
    const isComputational = probeObj.type === 'computational';
    const isBoolean       = probeObj.type === 'boolean';
    const isConditional   = isBoolean || isComputational;

    return `
    <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:6px; padding:10px; display:flex; flex-direction:column; gap:10px;">

        <!-- Legend (Click to Copy) -->
        <div style="padding-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.05);">
            <div style="font-size:0.7em; font-weight:bold; text-transform:uppercase; opacity:0.5; margin-bottom:5px;">Available Tokens</div>
            ${getLogicVariableLegendHTML(identitySlots)}
            
            ${isComputational ? `
                <div style="font-size:0.7em; font-weight:bold; text-transform:uppercase; opacity:0.5; margin: 8px 0 5px;">Comparison Syntax</div>
                ${getLogicOperatorLegendHTML()}
            ` : ''}
        </div>

        <div class="${isComputational ? 'plz-hidden' : ''}">
            <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:4px;">Evaluation Engine</label>
            <select id="plz-logic-profile" class="text_pole" style="width:100%;"></select>
        </div>
        <div>
            <label style="display:block; font-size:0.75em; opacity:0.6; margin-bottom:4px;">Output Type</label>
            <div class="plz-logic-output-type">
                <button class="plz-logic-type-btn ${isBoolean ? 'plz-active' : ''}" data-type="boolean">Boolean</button>
                <button class="plz-logic-type-btn ${probeObj.type === 'text' ? 'plz-active' : ''}" data-type="text">Text</button>
                <button class="plz-logic-type-btn ${isComputational ? 'plz-active' : ''}" data-type="computational">Computational</button>
            </div>
        </div>

        <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <label style="font-size:0.75em; opacity:0.6;">${isComputational ? 'Logic Expression' : 'LLM Logic Query'}</label>
                <button id="plz-logic-edit-prompt" class="menu_button" style="font-size:0.72em; padding:1px 8px;">
                    <i class="fa-solid fa-expand"></i> Fullscreen Editor
                </button>
            </div>
            <textarea id="plz-logic-prompt-preview" class="text_pole" readonly rows="2" 
                      style="width:100%; font-family:monospace; font-size:0.85em; opacity:0.7; cursor:default; resize:none;">${escapeHtml(probeObj.prompt || '')}</textarea>
        </div>

        <div id="plz-logic-boolean-templates" class="${isConditional ? '' : 'plz-hidden'}" style="display:flex; flex-direction:column; gap:8px; padding-top:5px; border-top:1px solid rgba(255,255,255,0.05);">
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

        <div id="plz-logic-text-info" class="${probeObj.type === 'text' ? '' : 'plz-hidden'}" style="font-size:0.8em; opacity:0.5; font-style:italic; text-align:center; padding:5px;">
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
function getLogicVariableLegendHTML(identitySlots = BASE_IDENTITY_SLOTS) {
    const tokens = [
        { t: '{{history}}', d: 'Chat context' },
        { t: '{{current_turn}}', d: 'Latest message' },
        { t: '{{character_name}}', d: 'Active ID' }
    ];

    BASE_SLOTS.forEach(s => tokens.push({ t: `{{${s}}}`, d: 'Clothing' }));
    identitySlots.forEach(s => tokens.push({ t: `{{${s}}}`, d: 'Identity' }));

    return `
    <div class="plz-logic-token-legend">
        ${tokens.map(item => `<div class="plz-token-chip" title="${item.d}" onclick="navigator.clipboard.writeText('${item.t}')">${item.t}</div>`).join('')}
    </div>`;
}

/**
 * Builds the click-to-copy comparison chips for Computational logic.
 */
function getLogicOperatorLegendHTML() {
    const ops = [
        { t: 'is',       d: 'Strict whole-word equality' },
        { t: 'in',       d: 'List membership. Format: (a, b, c)' },
        { t: 'contains', d: 'Partial fuzzy match' },
        { t: '!',        d: 'Negation' }
    ];

    return `
    <div class="plz-logic-token-legend">
        ${ops.map(item => `<div class="plz-token-chip" title="${item.d}" onclick="navigator.clipboard.writeText('${item.t}')">${item.t}</div>`).join('')}
    </div>`;
}