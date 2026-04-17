/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleTemplates.js
 * @stamp {"utc":"2026-04-17T14:15:00.000Z"}
 * @architectural-role Pure UI Template (Global Styles)
 * @description
 * Generates the HTML for the Global Styles management tab.
 * Implements the "Working Table" pattern with Save/Revert actions and dirty indicators.
 * 
 * Updated for Granular Identity Architecture:
 * 1. Implemented dynamic variable legend that reflects character physical traits.
 * 2. Added support for granular tokens ({{hair}}, {{face}}, etc.) in the UI guide.
 * 
 * @api-declaration
 * getStylesTabHTML(styleLibrary, defaultName, activeName, styleObj, isDirty) -> string
 * getVariableLegendHTML() -> string
 * getLoraTagsHTML(loras) -> string
 * 
 * @contract
 *   assertions:
 *     purity: Partial Pure (Reads State for Dynamic Legend)
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../../utils/history.js';
import { RUNWARE_LORA_REGISTRY, BASE_SLOTS } from '../../defaults.js';
import { state } from '../../state.js';

/**
 * Main Styles Tab Layout.
 */
export function getStylesTabHTML(styleLibrary, defaultName, activeName, styleObj, isDirty) {
    const options = Object.keys(styleLibrary).map(name => {
        const isDefault = name === defaultName;
        const isActive = name === activeName;
        const label = name + (isDefault ? ' ⭐' : '') + (isActive && isDirty ? ' *' : '');
        return `<option value="${escapeHtml(name)}" ${isActive ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

    return `
    <div id="plz-styles-container" style="display:flex; flex-direction:column; gap:12px; padding:5px;">
        <h3 style="margin:0;">Global Portrait Styles</h3>
        
        <!-- Style Selection & Action Row -->
        <div style="display:flex; align-items:center; gap:5px; margin-bottom:4px;">
            <select id="plz-style-selector" class="text_pole" style="flex:1; font-weight:bold;">
                ${options}
            </select>
            <button id="plz-style-set-default" class="menu_button" title="Set as global default">⭐</button>
            <button id="plz-style-save" class="menu_button" title="Save changes" ${!isDirty ? 'disabled' : ''}>💾</button>
            <button id="plz-style-revert" class="menu_button" title="Revert to saved" ${!isDirty ? 'disabled' : ''}>↺</button>
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

        <button id="plz-style-test-render" class="menu_button" style="margin-top:10px;">
            <i class="fa-solid fa-flask"></i> Test Render
        </button>
    </div>`;
}

/**
 * Variable reference panel for the styles editor.
 * Groups variables into three sections with overflow/aggregate interaction explained.
 */
export function getVariableLegendHTML() {
    const activeId = state._workshopCharacterId || state.activeCharacterId;
    const char = state.chatCharacters[activeId];

    const identityKeys = char?.identity ? Object.keys(char.identity) : [];
    const wardrobeKeys = char?.slots || [...BASE_SLOTS];

    function chip(token) {
        return `<code style="background:rgba(0,0,0,0.35); padding:1px 5px; border-radius:3px; color:var(--SmartThemeQuoteColor); cursor:pointer; white-space:nowrap;" title="Click to copy" onclick="navigator.clipboard.writeText('${token}')">${token}</code>`;
    }

    function row(token, desc) {
        return `<div style="display:flex; align-items:baseline; gap:8px; padding:2px 0;">
            ${chip(token)}
            <span style="opacity:0.7; font-size:0.9em;">${desc}</span>
        </div>`;
    }

    function section(title, color, body) {
        return `<div style="margin-bottom:10px;">
            <div style="font-size:0.7em; font-weight:bold; text-transform:uppercase; letter-spacing:0.08em; color:${color}; margin-bottom:4px;">${title}</div>
            ${body}
        </div>`;
    }

    // ── Section 1: Core ──────────────────────────────────────────────────────
    const coreHTML = [
        row('{{emotion}}', 'The current expression adjective (e.g. <i>contemplative</i>). Always set by the pipeline.'),
        row('{{pose}}',    'The current pose description (e.g. <i>leaning forward</i>). Always set by the pipeline.'),
    ].join('');

    // ── Section 2: Physical Identity ─────────────────────────────────────────
    const identityIndividualRows = identityKeys.length
        ? identityKeys.map(k => row(`{{${k}}}`, `Physical trait — outputs the raw value for <b>${k.replace(/_/g, ' ')}</b> only.`)).join('')
        : `<div style="opacity:0.4; font-size:0.85em;">Scan or fill the Physical Identity grid to unlock individual trait tokens.</div>`;

    const identityHTML = [
        row('{{identity_anchor}}',
            'Aggregate of <b>all unconsumed</b> physical traits. Format: <i>Hair: …, Eyes: …, Face: …</i> — any trait you place individually above is excluded from this bucket.'),
        `<div style="margin:4px 0 4px 12px; border-left:2px solid rgba(255,255,255,0.1); padding-left:8px;">`,
        identityIndividualRows,
        `</div>`,
    ].join('');

    // ── Section 4: LoRA Registry ──────────────────────────────────────────────
    const loraHTML = RUNWARE_LORA_REGISTRY
        .filter(l => l.air)
        .map(l => `<div style="display:flex; align-items:baseline; gap:8px; padding:2px 0;">
            <span style="opacity:0.9; min-width:0;">${escapeHtml(l.label)}</span>
            <code style="opacity:0.45; font-size:0.85em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(l.air)}</code>
            <span style="opacity:0.5; white-space:nowrap;">default&nbsp;${l.defaultWeight ?? '—'}</span>
        </div>`)
        .join('');

    // ── Section 3: Wardrobe ───────────────────────────────────────────────────
    const wardrobeIndividualRows = wardrobeKeys
        .map(k => row(`{{${k}}}`, `Wardrobe slot — outputs <i>item (modifier)</i> for <b>${k.replace(/_/g, ' ')}</b> only.`))
        .join('');

    const wardrobeHTML = [
        row('{{layers_description}}',
            'Aggregate of <b>all unconsumed</b> wardrobe slots. Format: <i>Top: grey tunic (close-fitting), Bottom: …</i> — any slot you place individually above is excluded from this bucket.'),
        `<div style="margin:4px 0 4px 12px; border-left:2px solid rgba(255,255,255,0.1); padding-left:8px;">`,
        wardrobeIndividualRows,
        `</div>`,
    ].join('');

    return `
    <div style="font-size:0.78em; max-height:260px; overflow-y:auto; padding-right:6px;">
        <div style="opacity:0.5; font-size:0.9em; margin-bottom:8px; line-height:1.4;">
            Place a token in your template to inject that value. Anything you don't place individually flows into the matching aggregate (<code style="font-size:0.9em;">{{identity_anchor}}</code> or <code style="font-size:0.9em;">{{layers_description}}</code>). Omit an aggregate entirely to drop those values from the prompt.
        </div>
        ${section('Core', 'var(--SmartThemeEmColor)',        coreHTML)}
        ${section('Physical Identity', 'var(--SmartThemeQuoteColor)', identityHTML)}
        ${section('Wardrobe', '#7eb8c9', wardrobeHTML)}
        ${section('Available LoRAs', '#a78bda', loraHTML)}
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