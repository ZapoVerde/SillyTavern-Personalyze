/**
 * @file data/default-user/extensions/personalyze/ui/engines/templates.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role Pure UI Templates (Engines Modal)
 * @description
 * Generates HTML for the 3-tab Engines configuration modal.
 * Tabs: Pollinations | HF Router | HF Spaces
 *
 * @api-declaration
 * getEnginesModalHTML(settings) → string
 * rebuildSpaceDropdown(savedSpaces) → string
 *
 * @contract
 *   assertions:
 *     purity: Pure (Structural)
 *     state_ownership: []
 *     external_io: []
 */

import { POLLINATIONS_MODELS, HF_PROVIDER_MODELS } from '../../defaults.js';
import { escapeHtml } from '../../utils/history.js';

// ─── Tab: Pollinations ────────────────────────────────────────────────────────

function getPollinationsTabHTML(settings) {
    const s = settings;
    const modelOptions = POLLINATIONS_MODELS
        .map(m => `<option value="${escapeHtml(m)}"${m === s.imageModel ? ' selected' : ''}>${escapeHtml(m)}</option>`)
        .join('');

    return `
    <div style="padding:16px; display:flex; flex-direction:column; gap:12px;">

        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">API Key:</label>
            <input type="password" id="plz-eng-pol-key" class="text_pole" placeholder="sk_..." style="flex:1; min-width:0;" />
            <button class="menu_button plz-eng-vault-save" data-secret="api_key_pollinations" style="white-space:nowrap; padding:2px 10px;">Save</button>
        </div>
        <div id="plz-eng-pol-key-status" style="font-size:0.8em; margin-top:-6px;"></div>

        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">Model:</label>
            <select id="plz-eng-pol-model" class="text_pole" style="flex:1;">
                ${modelOptions}
            </select>
        </div>

        <div style="display:flex; align-items:center; gap:8px;">
            <button class="menu_button" id="plz-eng-pol-ping" style="flex:1;">Ping</button>
            <button class="menu_button" id="plz-eng-pol-test" style="flex:1;">Test — generates image</button>
        </div>
        <div id="plz-eng-pol-status" style="font-size:0.8em; opacity:0.8;"></div>

        <p style="font-size:0.78em; opacity:0.55; margin:0;">Enter key in field to ping. Test burns Pollinations credit.</p>
    </div>`;
}

// ─── Tab: HF Router ───────────────────────────────────────────────────────────

function getHFRouterTabHTML(settings) {
    const s = settings;
    const providerOptions = Object.entries(HF_PROVIDER_MODELS)
        .map(([id, p]) => `<option value="${escapeHtml(id)}"${id === s.hfProvider ? ' selected' : ''}>${escapeHtml(p.label)}</option>`)
        .join('');

    const currentModels = HF_PROVIDER_MODELS[s.hfProvider]?.models ?? [];
    const modelOptions = currentModels
        .map(m => `<option value="${escapeHtml(m)}"${m === s.hfImageModel ? ' selected' : ''}>${escapeHtml(m)}</option>`)
        .join('');

    return `
    <div style="padding:16px; display:flex; flex-direction:column; gap:12px;">

        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">API Key:</label>
            <input type="password" id="plz-eng-hf-key" class="text_pole" placeholder="hf_..." style="flex:1; min-width:0;" />
            <button class="menu_button plz-eng-vault-save" data-secret="api_key_huggingface" style="white-space:nowrap; padding:2px 10px;">Save</button>
        </div>
        <div id="plz-eng-hf-key-status" style="font-size:0.8em; margin-top:-6px;"></div>

        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">Provider:</label>
            <select id="plz-eng-hf-provider" class="text_pole" style="flex:1;">
                ${providerOptions}
            </select>
        </div>

        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">Model:</label>
            <select id="plz-eng-hf-model" class="text_pole" style="flex:1;">
                ${modelOptions}
            </select>
        </div>

        <div style="display:flex; align-items:center; gap:8px;">
            <button class="menu_button" id="plz-eng-hf-ping" style="flex:1;">Ping</button>
            <button class="menu_button" id="plz-eng-hf-test" style="flex:1;">Test — generates image</button>
        </div>
        <div id="plz-eng-hf-status" style="font-size:0.8em; opacity:0.8;"></div>

        <p style="font-size:0.78em; opacity:0.55; margin:0;">Ping validates your HF key. Test bills your HF account via the selected provider.</p>
    </div>`;
}

// ─── Tab: HF Spaces ───────────────────────────────────────────────────────────

function buildSavedSpacesList(savedSpaces) {
    if (!savedSpaces || savedSpaces.length === 0) {
        return `<div style="padding:8px 10px; opacity:0.5; font-size:0.85em;">No saved spaces yet.</div>`;
    }
    return savedSpaces.map(id => `
    <div class="plz-eng-space-entry" style="cursor:pointer; display:flex; align-items:center; padding:6px 10px; border-bottom:1px solid var(--SmartThemeBorderColor,#333);">
        <span data-space-id="${escapeHtml(id)}" style="flex:1; font-size:0.85em;">${escapeHtml(id)}</span>
        <button class="plz-eng-space-remove menu_button" data-space-id="${escapeHtml(id)}" style="color:#e05555; padding:1px 7px; font-size:0.85em;">×</button>
    </div>`).join('');
}

function getHFSpaceTabHTML(settings) {
    const s = settings;
    const savedSpaces = s.hfSavedSpaces ?? [];

    return `
    <div style="padding:16px; display:flex; flex-direction:column; gap:12px;">

        <p style="font-size:0.78em; opacity:0.55; margin:0;">Uses your HuggingFace key. ZeroGPU spaces are free up to your daily quota.</p>
        <div id="plz-eng-space-hf-status" style="font-size:0.8em;"></div>

        <div>
            <label style="font-size:0.85em; opacity:0.75; display:block; margin-bottom:6px;">Space ID:</label>
            <div style="position:relative;">
                <div style="display:flex; gap:6px;">
                    <input type="text" id="plz-eng-space-id" class="text_pole"
                           value="${escapeHtml(s.hfSpaceId ?? '')}"
                           placeholder="owner/space-name"
                           style="flex:1;" />
                    <button class="menu_button" id="plz-eng-space-toggle" style="padding:2px 10px;">▾</button>
                </div>
                <div id="plz-eng-space-dropdown"
                     style="display:none; position:absolute; top:100%; left:0; right:0; z-index:100;
                            background:var(--SmartThemeBlurTintColor,#222); border:1px solid var(--SmartThemeBorderColor,#444);
                            border-radius:4px; max-height:200px; overflow-y:auto; margin-top:2px;">
                    ${buildSavedSpacesList(savedSpaces)}
                </div>
            </div>
        </div>

        <button class="menu_button" id="plz-eng-space-add" style="align-self:flex-start; font-size:0.85em;">＋ Add to List</button>

        <div style="display:flex; align-items:center; gap:8px;">
            <button class="menu_button" id="plz-eng-space-ping" style="flex:1;">Ping</button>
            <button class="menu_button" id="plz-eng-space-test" style="flex:1;">Test — generates image</button>
        </div>
        <div id="plz-eng-space-status" style="font-size:0.8em; opacity:0.8;"></div>

        <p style="font-size:0.78em; opacity:0.55; margin:0;">Enter space ID to ping. Test runs a full Gradio generation.</p>
    </div>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns full engines modal HTML.
 * @param {object} settings - The current settings activeState.
 * @returns {string}
 */
export function getEnginesModalHTML(settings) {
    return `
<div id="plz-engines-overlay" class="plz-overlay plz-hidden">
    <div id="plz-engines-modal" class="plz-modal">
        <div class="plz-workshop-header" style="display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--SmartThemeBorderColor,#444);">
            <strong style="font-size:1.05em;">⚙ Image Engines</strong>
            <button id="plz-engines-close" class="menu_button" style="padding:2px 10px; font-size:0.9em;">✕</button>
        </div>

        <div class="plz-tab-bar" style="display:flex; border-bottom:1px solid var(--SmartThemeBorderColor,#444);">
            <button class="plz-tab-btn plz-eng-tab" data-tab="pollinations" style="flex:1; padding:8px; font-size:0.88em;">Pollinations</button>
            <button class="plz-tab-btn plz-eng-tab" data-tab="hf-router" style="flex:1; padding:8px; font-size:0.88em;">HF Router</button>
            <button class="plz-tab-btn plz-eng-tab" data-tab="hf-space" style="flex:1; padding:8px; font-size:0.88em;">HF Spaces</button>
        </div>

        <div class="plz-workshop-body">
            <div id="plz-eng-tab-pollinations" class="plz-tab-panel plz-hidden">
                ${getPollinationsTabHTML(settings)}
            </div>
            <div id="plz-eng-tab-hf-router" class="plz-tab-panel plz-hidden">
                ${getHFRouterTabHTML(settings)}
            </div>
            <div id="plz-eng-tab-hf-space" class="plz-tab-panel plz-hidden">
                ${getHFSpaceTabHTML(settings)}
            </div>
        </div>
    </div>
</div>`;
}

/**
 * Returns the inner HTML for #plz-eng-space-dropdown (called when list changes).
 * @param {string[]} savedSpaces
 * @returns {string}
 */
export function rebuildSpaceDropdown(savedSpaces) {
    return buildSavedSpacesList(savedSpaces);
}
