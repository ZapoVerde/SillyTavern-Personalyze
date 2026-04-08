/**
 * @file data/default-user/extensions/personalyze/ui/engines/templates.js
 * @stamp {"utc":"2026-04-07T00:00:00.000Z"}
 * @architectural-role Pure UI Templates (Engines Modal)
 * @description
 * Generates the HTML for the Image Engines configuration modal. 
 * 
 * Updated to a "Multi-Engine" architecture including:
 * - Pollinations
 * - Fal AI (New)
 * - Hugging Face (Unified Router/Spaces)
 * 
 * Includes master "Availability" toggles at the top of each tab to control
 * which engines are shown in the Dressing Room and Studio outfit dropdowns.
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

import { POLLINATIONS_MODELS, HF_PROVIDER_MODELS, FAL_MODELS, PIAPI_MODELS } from '../../defaults.js';
import { escapeHtml } from '../../utils/history.js';

/**
 * Helper to build the master availability checkbox for an engine.
 */
function getAvailabilityToggleHTML(id, label, checked) {
    return `
    <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--SmartThemeBorderColor,#444);">
        <label class="checkbox_label" style="font-size:0.9em; cursor:pointer;">
            <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} />
            <span>Enable ${label} in Outfit dropdowns</span>
        </label>
    </div>`;
}

// ─── Tab: Pollinations ────────────────────────────────────────────────────────

function getPollinationsTabHTML(settings) {
    const s = settings;
    const modelOptions = POLLINATIONS_MODELS
        .map(m => `<option value="${escapeHtml(m)}"${m === s.imageModel ? ' selected' : ''}>${escapeHtml(m)}</option>`)
        .join('');

    return `
    <div style="display:flex; flex-direction:column; gap:14px; padding-top:10px;">
        ${getAvailabilityToggleHTML('plz-eng-pol-enabled', 'Pollinations', s.engineEnablePollinations !== false)}

        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">API Key:</label>
            <input type="password" id="plz-eng-pol-key" class="text_pole" placeholder="sk_..." style="flex:1;" />
            <button class="menu_button plz-eng-vault-save" data-secret="api_key_pollinations">Save</button>
        </div>
        <div id="plz-eng-pol-key-status" style="font-size:0.8em; margin-top:-8px;"></div>

        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">Model:</label>
            <select id="plz-eng-pol-model" class="text_pole" style="flex:1;">
                ${modelOptions}
            </select>
        </div>

        <div style="display:flex; gap:8px; margin-top:10px;">
            <button class="menu_button" id="plz-eng-pol-ping" style="flex:1;"><i class="fa-solid fa-signal"></i> Ping</button>
            <button class="menu_button" id="plz-eng-pol-test" style="flex:1;"><i class="fa-solid fa-flask"></i> Test</button>
        </div>
        <div id="plz-eng-pol-status" style="font-size:0.8em; opacity:0.8;"></div>
    </div>`;
}

// ─── Tab: Fal AI (New) ────────────────────────────────────────────────────────

function getFalTabHTML(settings) {
    const s = settings;
    const modelOptions = FAL_MODELS
        .map(m => `<option value="${escapeHtml(m)}"${m === s.falModel ? ' selected' : ''}>${escapeHtml(m)}</option>`)
        .join('');

    return `
    <div style="display:flex; flex-direction:column; gap:14px; padding-top:10px;">
        ${getAvailabilityToggleHTML('plz-eng-fal-enabled', 'Fal AI', !!s.engineEnableFal)}

        <p style="font-size:0.85em; opacity:0.6; margin:0;">
            High-speed, high-quality generation. Requires a Fal AI API key.
        </p>

        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">API Key:</label>
            <input type="password" id="plz-eng-fal-key" class="text_pole" placeholder="Your Fal Key" style="flex:1;" />
            <button class="menu_button plz-eng-vault-save" data-secret="api_key_fal">Save</button>
        </div>
        <div id="plz-eng-fal-key-status" style="font-size:0.8em; margin-top:-8px;"></div>

        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">Model:</label>
            <select id="plz-eng-fal-model" class="text_pole" style="flex:1;">
                ${modelOptions}
            </select>
        </div>

        <div style="display:flex; gap:8px; margin-top:10px;">
            <button class="menu_button" id="plz-eng-fal-ping" style="flex:1;"><i class="fa-solid fa-signal"></i> Ping</button>
            <button class="menu_button" id="plz-eng-fal-test" style="flex:1;"><i class="fa-solid fa-flask"></i> Test</button>
        </div>
        <div id="plz-eng-fal-status" style="font-size:0.8em; opacity:0.8;"></div>
    </div>`;
}

// ─── Tab: PiAPI ───────────────────────────────────────────────────────────────

function getPiAPITabHTML(settings) {
    const s = settings;
    const modelOptions = PIAPI_MODELS
        .map(m => `<option value="${escapeHtml(m)}"${m === s.piapiModel ? ' selected' : ''}>${escapeHtml(m)}</option>`)
        .join('');

    return `
    <div style="display:flex; flex-direction:column; gap:14px; padding-top:10px;">
        ${getAvailabilityToggleHTML('plz-eng-piapi-enabled', 'PiAPI', !!s.engineEnablePiAPI)}

        <p style="font-size:0.85em; opacity:0.6; margin:0;">
            Qubico Z-Image generation via PiAPI. Requires a PiAPI API key.
        </p>

        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">API Key:</label>
            <input type="password" id="plz-eng-piapi-key" class="text_pole" placeholder="Your PiAPI Key" style="flex:1;" />
            <button class="menu_button plz-eng-vault-save" data-secret="api_key_piapi">Save</button>
        </div>
        <div id="plz-eng-piapi-key-status" style="font-size:0.8em; margin-top:-8px;"></div>

        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">Model:</label>
            <select id="plz-eng-piapi-model" class="text_pole" style="flex:1;">
                ${modelOptions}
            </select>
        </div>

        <div style="display:flex; gap:8px; margin-top:10px;">
            <button class="menu_button" id="plz-eng-piapi-ping" style="flex:1;"><i class="fa-solid fa-signal"></i> Ping</button>
            <button class="menu_button" id="plz-eng-piapi-test" style="flex:1;"><i class="fa-solid fa-flask"></i> Test</button>
        </div>
        <div id="plz-eng-piapi-status" style="font-size:0.8em; opacity:0.8;"></div>
    </div>`;
}

// ─── Tab: Hugging Face (Unified) ─────────────────────────────────────────────

function getHuggingFaceTabHTML(settings) {
    const s = settings;
    return `
    <div style="display:flex; flex-direction:column; gap:14px; padding-top:10px;">
        ${getAvailabilityToggleHTML('plz-eng-hf-enabled', 'Hugging Face', !!s.engineEnableHuggingFace)}

        <!-- Shared Key -->
        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">API Key:</label>
            <input type="password" id="plz-eng-hf-key" class="text_pole" placeholder="hf_..." style="flex:1;" />
            <button class="menu_button plz-eng-vault-save" data-secret="api_key_huggingface">Save</button>
        </div>
        <div id="plz-eng-hf-key-status" style="font-size:0.8em; margin-top:-8px;"></div>

        <!-- Mode Switcher -->
        <div style="display:flex; background:rgba(0,0,0,0.25); border-radius:8px; padding:4px; gap:4px;">
            <button class="menu_button plz-eng-mode-btn" data-mode="router" style="flex:1; font-size:0.85em; border:none !important;">
                <i class="fa-solid fa-route"></i> Router
            </button>
            <button class="menu_button plz-eng-mode-btn" data-mode="space" style="flex:1; font-size:0.85em; border:none !important;">
                <i class="fa-solid fa-rocket"></i> Space
            </button>
        </div>

        <!-- Mode-Specific Content -->
        <div id="plz-eng-mode-router-content" class="plz-hidden" style="display:flex; flex-direction:column; gap:12px;">
            ${getRouterConfigHTML(s)}
        </div>

        <div id="plz-eng-mode-space-content" class="plz-hidden" style="display:flex; flex-direction:column; gap:12px;">
            ${getSpaceConfigHTML(s)}
        </div>
    </div>`;
}

function getRouterConfigHTML(s) {
    const providerOptions = Object.entries(HF_PROVIDER_MODELS)
        .map(([id, p]) => `<option value="${escapeHtml(id)}"${id === s.hfProvider ? ' selected' : ''}>${escapeHtml(p.label)}</option>`)
        .join('');

    return `
        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">Provider:</label>
            <select id="plz-eng-hf-provider" class="text_pole" style="flex:1;">
                ${providerOptions}
            </select>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">Model:</label>
            <select id="plz-eng-hf-model" class="text_pole" style="flex:1;"></select>
        </div>
        <div style="display:flex; gap:8px; margin-top:4px;">
            <button class="menu_button" id="plz-eng-hf-ping" style="flex:1;"><i class="fa-solid fa-signal"></i> Ping</button>
            <button class="menu_button" id="plz-eng-hf-test" style="flex:1;"><i class="fa-solid fa-flask"></i> Test</button>
        </div>
        <div id="plz-eng-hf-status" style="font-size:0.8em; opacity:0.8;"></div>
    `;
}

function getSpaceConfigHTML(s) {
    const savedSpaces = s.hfSavedSpaces ?? [];
    return `
        <div style="display:flex; flex-direction:column; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75;">Space ID:</label>
            <div style="position:relative; display:flex; gap:4px;">
                <input type="text" id="plz-eng-space-id" class="text_pole" value="${escapeHtml(s.hfSpaceId ?? '')}" placeholder="owner/space-name" style="flex:1;" />
                <button class="menu_button" id="plz-eng-space-toggle" style="padding:2px 10px;">▾</button>
                <div id="plz-eng-space-dropdown" style="display:none; position:absolute; top:100%; left:0; right:0; z-index:100; background:var(--SmartThemeBlurTintColor,#222); border:1px solid var(--SmartThemeBorderColor,#444); border-radius:4px; max-height:160px; overflow-y:auto; margin-top:2px;">
                    ${buildSavedSpacesList(savedSpaces)}
                </div>
            </div>
        </div>
        <div style="display:flex; gap:6px;">
            <button class="menu_button" id="plz-eng-space-add" style="font-size:0.85em;">+ Save</button>
            <button class="menu_button" id="plz-eng-space-ping" style="flex:1; font-size:0.85em;"><i class="fa-solid fa-signal"></i> Ping</button>
        </div>
        <button class="menu_button" id="plz-eng-space-test"><i class="fa-solid fa-flask"></i> Test Space</button>
        <div id="plz-eng-space-status" style="font-size:0.8em; opacity:0.8;"></div>
    `;
}

function buildSavedSpacesList(savedSpaces) {
    if (!savedSpaces || savedSpaces.length === 0) {
        return `<div style="padding:8px 10px; opacity:0.5; font-size:0.85em;">No saved spaces.</div>`;
    }
    return savedSpaces.map(id => `
    <div class="plz-eng-space-entry" style="cursor:pointer; display:flex; align-items:center; padding:6px 10px; border-bottom:1px solid var(--SmartThemeBorderColor,#333);">
        <span data-space-id="${escapeHtml(id)}" style="flex:1; font-size:0.85em;">${escapeHtml(id)}</span>
        <button class="plz-eng-space-remove menu_button" data-space-id="${escapeHtml(id)}" style="color:#e05555; padding:1px 7px; font-size:0.85em;">×</button>
    </div>`).join('');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getEnginesModalHTML(settings) {
    const s = settings;
    return `
<div id="plz-engines-overlay" class="plz-overlay plz-hidden">
    <div id="plz-engines-modal" class="plz-modal">
        <div class="plz-workshop-header">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h3 style="margin:0;"><i class="fa-solid fa-gear"></i> Image Engines</h3>
                <button id="plz-engines-close" class="menu_button" style="padding:2px 10px;">✕</button>
            </div>
            <div class="plz-tab-bar">
                <button class="plz-tab-btn menu_button" data-tab="pollinations">Pollinations</button>
                <button class="plz-tab-btn menu_button" data-tab="fal">Fal AI</button>
                <button class="plz-tab-btn menu_button" data-tab="piapi">PiAPI</button>
                <button class="plz-tab-btn menu_button" data-tab="huggingface">Hugging Face</button>
            </div>
        </div>

        <div class="plz-workshop-body">
            <div id="plz-eng-tab-pollinations" class="plz-tab-panel plz-hidden">
                ${getPollinationsTabHTML(settings)}
            </div>
            <div id="plz-eng-tab-fal" class="plz-tab-panel plz-hidden">
                ${getFalTabHTML(settings)}
            </div>
            <div id="plz-eng-tab-piapi" class="plz-tab-panel plz-hidden">
                ${getPiAPITabHTML(settings)}
            </div>
            <div id="plz-eng-tab-huggingface" class="plz-tab-panel plz-hidden">
                ${getHuggingFaceTabHTML(settings)}
            </div>

            <!-- Shared Test Prompt Area -->
            <div style="margin-top:20px; padding-top:15px; border-top:1px solid var(--SmartThemeBorderColor,#444);">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                    <label style="font-size:0.85em; opacity:0.75;">Engine Test Prompt:</label>
                    <button id="plz-eng-test-prompt-reset" class="menu_button" style="font-size:0.75em; padding:1px 8px;">Reset</button>
                </div>
                <textarea id="plz-eng-test-prompt" class="text_pole plz-auto-textarea" rows="2" 
                          style="width:100%; font-family:monospace; font-size:0.85em; overflow:hidden; resize:none;"
                          spellcheck="false">${escapeHtml(s.testPrompt ?? '')}</textarea>
            </div>
        </div>
    </div>
</div>`;
}

export function rebuildSpaceDropdown(savedSpaces) {
    return buildSavedSpacesList(savedSpaces);
}