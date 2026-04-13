/**
 * @file data/default-user/extensions/personalyze/ui/engines/templates.js
 * @stamp {"utc":"2026-04-16T17:10:00.000Z"}
 * @architectural-role Pure UI Templates (Engines Modal)
 * @description
 * Generates the HTML for the Image Engines configuration modal. 
 * 
 * Updated for Runware.ai Integration:
 * 1. Added Runware tab with AIR model selection.
 * 2. Added toggles for LayerDiffuse (native alpha) and standalone RMBG.
 * 3. Added Runware RMBG model selection dropdown.
 *
 * @api-declaration
 * getEnginesModalHTML(settings) → string
 *
 * @contract
 *   assertions:
 *     purity: Pure (Structural)
 *     state_ownership: []
 *     external_io: []
 */

import { 
    POLLINATIONS_MODELS, 
    FAL_MODELS, 
    PIAPI_MODELS, 
    PIAPI_RMBG_MODELS,
    RUNWARE_MODELS,
    RUNWARE_RMBG_MODELS
} from '../../defaults.js';
import { escapeHtml } from '../../utils/history.js';

/**
 * Helper to build the "Set as Default" radio-style button for an engine.
 */
function getDefaultEngineButtonHTML(engineId, isDefault) {
    return `
    <div style="margin-bottom:10px;">
        <button class="menu_button plz-eng-set-default${isDefault ? ' plz-active' : ''}"
                data-engine="${engineId}"
                style="width:100%; font-size:0.85em;">
            <i class="fa-${isDefault ? 'solid' : 'regular'} fa-star"></i>
            ${isDefault ? 'Default Engine' : 'Set as Default'}
        </button>
    </div>`;
}

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
        ${getDefaultEngineButtonHTML('pollinations', (s.defaultEngine || 'pollinations') === 'pollinations')}
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

// ─── Tab: Fal AI ──────────────────────────────────────────────────────────────

function getFalTabHTML(settings) {
    const s = settings;
    const modelOptions = FAL_MODELS
        .map(m => `<option value="${escapeHtml(m)}"${m === s.falModel ? ' selected' : ''}>${escapeHtml(m)}</option>`)
        .join('');

    return `
    <div style="display:flex; flex-direction:column; gap:14px; padding-top:10px;">
        ${getDefaultEngineButtonHTML('fal', s.defaultEngine === 'fal')}
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
    const rmbgModelOptions = PIAPI_RMBG_MODELS
        .map(m => `<option value="${escapeHtml(m)}"${m === s.piapiRmbgModel ? ' selected' : ''}>${escapeHtml(m)}</option>`)
        .join('');

    return `
    <div style="display:flex; flex-direction:column; gap:14px; padding-top:10px;">
        ${getDefaultEngineButtonHTML('piapi', s.defaultEngine === 'piapi')}
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

        <div style="padding:10px; border:1px solid var(--SmartThemeBorderColor,#444); border-radius:6px; display:flex; flex-direction:column; gap:10px;">
            <label class="checkbox_label" style="font-size:0.9em; cursor:pointer;">
                <input type="checkbox" id="plz-eng-piapi-rmbg" ${s.piapiRemoveBackground ? 'checked' : ''} />
                <span>Remove Background <span style="opacity:0.55; font-size:0.88em;">($0.001/img, PiAPI engine only)</span></span>
            </label>
            <div style="display:flex; align-items:center; gap:8px;">
                <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">RMBG Model:</label>
                <select id="plz-eng-piapi-rmbg-model" class="text_pole" style="flex:1;" ${s.piapiRemoveBackground ? '' : 'disabled'}>
                    ${rmbgModelOptions}
                </select>
            </div>
            <p style="font-size:0.78em; opacity:0.5; margin:0;">Works with all engines (converts output to base64 for background removal).</p>
        </div>

        <div style="display:flex; gap:8px; margin-top:10px;">
            <button class="menu_button" id="plz-eng-piapi-ping" style="flex:1;"><i class="fa-solid fa-signal"></i> Ping</button>
            <button class="menu_button" id="plz-eng-piapi-test" style="flex:1;"><i class="fa-solid fa-flask"></i> Test</button>
        </div>
        <div id="plz-eng-piapi-status" style="font-size:0.8em; opacity:0.8;"></div>
    </div>`;
}

// ─── Tab: Runware ─────────────────────────────────────────────────────────────

function getRunwareTabHTML(settings) {
    const s = settings;
    const modelOptions = RUNWARE_MODELS
        .map(m => `<option value="${escapeHtml(m.air)}"${m.air === s.runwareModel ? ' selected' : ''}>${escapeHtml(m.label)}</option>`)
        .join('');
    const rmbgModelOptions = RUNWARE_RMBG_MODELS
        .map(m => `<option value="${escapeHtml(m.air)}"${m.air === s.runwareRmbgModel ? ' selected' : ''}>${escapeHtml(m.label)}</option>`)
        .join('');

    return `
    <div style="display:flex; flex-direction:column; gap:14px; padding-top:10px;">
        ${getDefaultEngineButtonHTML('runware', s.defaultEngine === 'runware')}
        ${getAvailabilityToggleHTML('plz-eng-runware-enabled', 'Runware', !!s.engineEnableRunware)}

        <p style="font-size:0.85em; opacity:0.6; margin:0;">
            Fast generation with native transparency support. Requires a Runware API key.
        </p>

        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">API Key:</label>
            <input type="password" id="plz-eng-runware-key" class="text_pole" placeholder="Your Runware Key" style="flex:1;" />
            <button class="menu_button plz-eng-vault-save" data-secret="api_key_runware">Save</button>
        </div>
        <div id="plz-eng-runware-key-status" style="font-size:0.8em; margin-top:-8px;"></div>

        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">Model:</label>
            <select id="plz-eng-runware-model" class="text_pole" style="flex:1;">
                ${modelOptions}
            </select>
        </div>

        <div style="padding:10px; border:1px solid var(--SmartThemeBorderColor,#444); border-radius:6px; display:flex; flex-direction:column; gap:10px;">
            <label class="checkbox_label" style="font-size:0.9em; cursor:pointer;" title="Generate transparency in a single pass.">
                <input type="checkbox" id="plz-eng-runware-layerdiffuse" ${s.runwareUseLayerDiffuse ? 'checked' : ''} />
                <span>Use LayerDiffuse <span style="opacity:0.55; font-size:0.88em;">(Native PNG Alpha)</span></span>
            </label>
            <label class="checkbox_label" style="font-size:0.9em; cursor:pointer;" title="Use Runware to remove background from any generated image.">
                <input type="checkbox" id="plz-eng-runware-rmbg" ${s.runwareRemoveBackground ? 'checked' : ''} />
                <span>Post-Process RMBG <span style="opacity:0.55; font-size:0.88em;">(Works with all engines)</span></span>
            </label>
            <div style="display:flex; align-items:center; gap:8px;">
                <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:85px;">RMBG Model:</label>
                <select id="plz-eng-runware-rmbg-model" class="text_pole" style="flex:1;" ${s.runwareRemoveBackground ? '' : 'disabled'}>
                    ${rmbgModelOptions}
                </select>
            </div>
        </div>

        <div style="display:flex; gap:8px; margin-top:10px;">
            <button class="menu_button" id="plz-eng-runware-ping" style="flex:1;"><i class="fa-solid fa-signal"></i> Ping</button>
            <button class="menu_button" id="plz-eng-runware-test" style="flex:1;"><i class="fa-solid fa-flask"></i> Test</button>
        </div>
        <div id="plz-eng-runware-status" style="font-size:0.8em; opacity:0.8;"></div>
    </div>`;
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
                <button class="plz-tab-btn menu_button" data-tab="runware">Runware</button>
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
            <div id="plz-eng-tab-runware" class="plz-tab-panel plz-hidden">
                ${getRunwareTabHTML(settings)}
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