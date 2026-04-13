/**
 * @file data/default-user/extensions/personalyze/ui/settings/prompts.js
 * @stamp {"utc":"2026-04-16T16:40:00.000Z"}
 * @architectural-role UI Logic (Prompt & Style Editor)
 * @description
 * Orchestrates the multi-line Prompt Editor and Style Package Editor modals.
 * 
 * Updated for Visual Presets:
 * 1. overhauled openStyleModal to manage Style Packages (Template + LoRAs).
 * 2. Added dynamic LoRA stack editor with weight sliders and Civitai links.
 * 3. Implemented Case-Insensitive variable descriptions.
 *
 * @api-declaration
 * openPromptModal(key, title, defaultValue) -> Promise<void>
 * openStyleModal(styleName) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO / Side-effect
 *     state_ownership: []
 *     external_io: [callPopup, smartResize, settings.js, jQuery]
 */

import { callPopup, saveSettingsDebounced } from '../../../../../../script.js';
import { getSettings, getMetaSettings, updateSetting } from '../../settings.js';
import { smartResize } from '../../utils/dom.js';
import { DEFAULT_VN_STYLE_SUFFIX, RUNWARE_LORA_REGISTRY } from '../../defaults.js';
import { escapeHtml } from '../../utils/history.js';

/** Variables available in each prompt template, with descriptions. */
const PROMPT_VARIABLES = {
    phase1SubjectPrompt: [
        { v: '{{active_roster}}',  d: 'Newline-separated list of known character IDs in this chat' },
        { v: '{{history}}',        d: 'Recent turns before the latest message' },
        { v: '{{message}}',        d: 'The latest AI message being processed' },
    ],
    phase2ChangePrompt: [
        { v: '{{character_name}}', d: 'Name of the character being evaluated' },
        { v: '{{current_layers}}', d: 'Serialised current visual state (5 slots)' },
        { v: '{{history}}',        d: 'Recent turns before the latest message' },
        { v: '{{message}}',        d: 'The latest AI message being processed' },
    ],
    phase3LayeredPrompt: [
        { v: '{{character_name}}',  d: 'Name of the character being extracted' },
        { v: '{{identity_anchor}}', d: 'Permanent physical description of the character' },
        { v: '{{current_state}}',   d: 'Serialised current visual state (5 slots)' },
        { v: '{{history}}',         d: 'Recent turns before the latest message' },
        { v: '{{message}}',         d: 'The latest AI message being processed' },
    ],
    anchorScanPrompt: [
        { v: '{{character_focus}}', d: 'Optional focus block — name + instruction to ignore others' },
        { v: '{{context}}',         d: 'Formatted transcript chunk used for the scan' },
    ],
    sceneChangePrompt: [
        { v: '{{current_location}}', d: 'The last known location name (or "Unknown")' },
        { v: '{{history}}',          d: 'Recent turns before the latest message' },
        { v: '{{current_turn}}',     d: 'The latest AI message being processed' },
    ],
    wardrobeValidityPrompt: [
        { v: '{{character_names}}', d: 'Bullet list of active roster character names' },
        { v: '{{current_layers}}',  d: 'Each character\'s current outfit state, one per line' },
        { v: '{{history}}',         d: 'Recent turns before the scene transition' },
        { v: '{{current_turn}}',    d: 'The scene transition message' },
    ],
    redressPrompt: [
        { v: '{{character_name}}', d: 'Name of the character being redressed' },
        { v: '{{history}}',        d: 'Recent turns before the scene transition' },
        { v: '{{current_turn}}',   d: 'The scene transition message' },
    ],
    forceCostumePrompt: [
        { v: '{{character_name}}', d: 'Name of the character being scanned' },
        { v: '{{hint_block}}',     d: 'Rendered hint block (empty string if no hint provided)' },
        { v: '{{history}}',        d: 'Recent turns before the target message' },
        { v: '{{current_turn}}',   d: 'The specific turn being scanned' },
    ],
    forceCostumeHintTemplate: [
        { v: '{{hint}}',           d: 'The raw keyword hint typed by the user in the Workshop' },
    ],
    vnStyleSuffix: [
        { v: '{{identity_anchor}}',   d: 'Permanent physical description of the character' },
        { v: '{{layers_description}}', d: 'Compiled outfit string built from the 5 visual slots' },
        { v: '{{emotion}}',            d: 'Current emotion label (e.g. "curious", "tense")' },
        { v: '{{pose}}',               d: 'Current pose description (e.g. "sitting cross-legged")' },
    ],
};

// ─── Shared Helpers ───────────────────────────────────────────────────────────

function initTextareaAutoResize() {
    const selector = '#plz-prompt-editor';
    $(document).on('input.plz-prompt keyup.plz-prompt change.plz-prompt', selector, function() {
        smartResize(this);
    });
    const triggerResize = () => {
        const el = document.querySelector(selector);
        if (el) smartResize(el);
    };
    requestAnimationFrame(triggerResize);
    setTimeout(triggerResize, 200);
}

function cleanupPromptListeners() {
    $(document).off('.plz-prompt');
}

/**
 * Parses a Civitai AIR into a clickable URL.
 */
function getCivitaiUrl(air) {
    if (!air || !air.startsWith('civitai:')) return null;
    const match = air.match(/civitai:(\d+)(?:@(\d+))?/);
    if (!match) return null;
    const modelId = match[1];
    const versionId = match[2];
    let url = `https://civitai.com/models/${modelId}`;
    if (versionId) url += `?modelVersionId=${versionId}`;
    return url;
}

// ─── Style Editor ──────────────────────────────────────────────────────────────

/**
 * Renders the LoRA stack list for the Style Modal.
 */
function renderLoraList(loras) {
    const registryOptions = RUNWARE_LORA_REGISTRY.map(l => 
        `<option value="${escapeHtml(l.air)}">${escapeHtml(l.label)}</option>`
    ).join('');

    if (!loras || loras.length === 0) {
        return `<p style="opacity:0.4; font-size:0.85em; margin:10px 0;">No LoRAs added to this style yet.</p>`;
    }

    return loras.map((lora, idx) => {
        const civitaiUrl = getCivitaiUrl(lora.air);
        const linkHtml = civitaiUrl 
            ? `<a href="${civitaiUrl}" target="_blank" class="menu_button" style="padding:4px 8px; font-size:0.8em;" title="View on Civitai">
                 <i class="fa-solid fa-external-link"></i>
               </a>`
            : `<button class="menu_button" disabled style="padding:4px 8px; font-size:0.8em; opacity:0.3;"><i class="fa-solid fa-link-slash"></i></button>`;

        return `
        <div class="plz-lora-row" data-idx="${idx}" style="display:flex; align-items:center; gap:8px; margin-bottom:8px; padding:6px; background:rgba(255,255,255,0.03); border-radius:4px;">
            <select class="plz-lora-air text_pole" style="flex:2; font-size:0.85em;">
                <option value="">— Select LoRA —</option>
                ${registryOptions.replace(`value="${escapeHtml(lora.air)}"`, `value="${escapeHtml(lora.air)}" selected`)}
            </select>
            <div style="display:flex; align-items:center; gap:6px; flex:1;">
                <input type="number" class="plz-lora-weight text_pole" step="0.1" value="${lora.weight ?? 0.8}" style="width:50px; font-size:0.85em;" />
                <span style="font-size:0.7em; opacity:0.5;">W</span>
            </div>
            ${linkHtml}
            <button class="plz-lora-remove menu_button" style="color:var(--SmartThemeErrorColor); padding:4px 8px;"><i class="fa-solid fa-trash-can"></i></button>
        </div>`;
    }).join('');
}

/**
 * Updates the read-only summary of LoRAs displayed above the prompt.
 */
function updateStyleBreadcrumb(loras) {
    const $bread = $('#plz-style-breadcrumb');
    if (!$bread.length) return;

    if (!loras || loras.length === 0) {
        $bread.html('<span style="opacity:0.4;">Clean Style (No LoRAs)</span>');
        return;
    }

    const tags = loras.map(l => {
        const regEntry = RUNWARE_LORA_REGISTRY.find(r => r.air === l.air);
        const label = regEntry ? regEntry.label : 'Unknown';
        return `<span style="display:inline-block; padding:2px 8px; border-radius:10px; background:var(--SmartThemeQuoteColor); color:white; font-size:0.75em; margin-right:4px;">${escapeHtml(label)} (${l.weight})</span>`;
    }).join('');

    $bread.html(`<strong>Active technical style:</strong> ${tags}`);
}

/**
 * Opens the Style Package Editor.
 */
export async function openStyleModal(styleName) {
    const meta = getMetaSettings();
    const styleObj = structuredClone(meta.styleLibrary?.[styleName] ?? { template: DEFAULT_VN_STYLE_SUFFIX, loras: [] });

    const popupPromise = callPopup(
        `<h3 class="plz-modal-title">Edit Style: ${escapeHtml(styleName)}</h3>
         
         <div style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.1);">
             <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                 <label style="font-size:0.85em; opacity:0.7;">LoRA Stack (Runware/Fal)</label>
                 <button id="plz-lora-add" class="menu_button" style="font-size:0.75em; padding:2px 10px;"><i class="fa-solid fa-plus"></i> Add LoRA</button>
             </div>
             <div id="plz-lora-container">${renderLoraList(styleObj.loras)}</div>
         </div>

         <div id="plz-style-breadcrumb" style="font-size:0.8em; margin-bottom:10px; min-height:1.5em;"></div>

         <div class="plz-var-list" style="margin-bottom:10px;">
             ${PROMPT_VARIABLES.vnStyleSuffix.map((e, i) => `
                <div class="plz-var-row">
                    <button class="menu_button plz-var-copy-btn" onclick="navigator.clipboard.writeText('${e.v}'); event.stopPropagation();"><i class="fa-regular fa-copy"></i></button>
                    <code class="plz-var-code">${e.v}</code>
                    <span class="plz-var-desc">— ${e.d}</span>
                </div>`).join('')}
         </div>

         <textarea id="plz-prompt-editor" class="text_pole plz-auto-textarea" rows="4"
                   style="width:100%; font-family:monospace; font-size:0.85em; overflow:hidden; min-height:120px;"
                   spellcheck="false">${escapeHtml(styleObj.template)}</textarea>
         
         <div class="plz-modal-actions">
             <button class="menu_button" id="plz-prompt-save" style="background-color:rgba(76,175,80,0.15);">Save Style Package</button>
             <button class="menu_button" id="plz-prompt-reset">Reset Text Only</button>
         </div>`,
        'confirm'
    );

    initTextareaAutoResize();
    updateStyleBreadcrumb(styleObj.loras);

    // --- LoRA List Listeners ---

    $(document).on('click.plz-prompt', '#plz-lora-add', () => {
        styleObj.loras.push({ air: '', weight: 0.8 });
        $('#plz-lora-container').html(renderLoraList(styleObj.loras));
        updateStyleBreadcrumb(styleObj.loras);
    });

    $(document).on('click.plz-prompt', '.plz-lora-remove', function() {
        const idx = $(this).closest('.plz-lora-row').data('idx');
        styleObj.loras.splice(idx, 1);
        $('#plz-lora-container').html(renderLoraList(styleObj.loras));
        updateStyleBreadcrumb(styleObj.loras);
    });

    $(document).on('change.plz-prompt', '.plz-lora-air', function() {
        const idx = $(this).closest('.plz-lora-row').data('idx');
        styleObj.loras[idx].air = $(this).val();
        $('#plz-lora-container').html(renderLoraList(styleObj.loras));
        updateStyleBreadcrumb(styleObj.loras);
    });

    $(document).on('input.plz-prompt', '.plz-lora-weight', function() {
        const idx = $(this).closest('.plz-lora-row').data('idx');
        styleObj.loras[idx].weight = parseFloat($(this).val()) || 0.0;
        updateStyleBreadcrumb(styleObj.loras);
    });

    // --- Prompt Listeners ---

    $(document).on('click.plz-prompt', '#plz-prompt-reset', () => {
        const $editor = $('#plz-prompt-editor');
        $editor.val(DEFAULT_VN_STYLE_SUFFIX);
        smartResize($editor[0]);
    });

    $(document).on('click.plz-prompt', '#plz-prompt-save', () => {
        $('#dialogue_popup_ok').trigger('click');
    });

    const result = await popupPromise;
    cleanupPromptListeners();

    if (result) {
        styleObj.template = $('#plz-prompt-editor').val();
        meta.styleLibrary[styleName] = styleObj;
        saveSettingsDebounced();
        if (window.toastr) window.toastr.success(`Visual Preset "${styleName}" updated.`, 'PersonaLyze');
    }
}

// ─── Generic Prompt Editor ───────────────────────────────────────────────────

export async function openPromptModal(key, title, defaultValue) {
    const current = getSettings()[key] ?? defaultValue;
    const vars = PROMPT_VARIABLES[key] ?? [];

    const popupPromise = callPopup(
        `<h3 class="plz-modal-title">${title}</h3>
         <div class="plz-var-list">
             ${vars.map((e, i) => `
                <div class="plz-var-row">
                    <button class="menu_button plz-var-copy-btn" onclick="navigator.clipboard.writeText('${e.v}'); event.stopPropagation();"><i class="fa-regular fa-copy"></i></button>
                    <code class="plz-var-code">${e.v}</code>
                    <span class="plz-var-desc">— ${e.d}</span>
                </div>`).join('')}
         </div>
         <textarea id="plz-prompt-editor" class="text_pole plz-auto-textarea" rows="4"
                   style="width:100%; font-family:monospace; font-size:0.85em; overflow:hidden; min-height:120px;"
                   spellcheck="false">${escapeHtml(current)}</textarea>
         <div class="plz-modal-actions">
             <button class="menu_button" id="plz-prompt-save" style="background-color:rgba(76,175,80,0.15);">Save Template</button>
             <button class="menu_button" id="plz-prompt-reset">Reset to Default</button>
         </div>`,
        'confirm'
    );

    initTextareaAutoResize();

    $(document).on('click.plz-prompt', '#plz-prompt-reset', () => {
        const $editor = $('#plz-prompt-editor');
        $editor.val(defaultValue);
        smartResize($editor[0]);
    });

    $(document).on('click.plz-prompt', '#plz-prompt-save', () => {
        $('#dialogue_popup_ok').trigger('click');
    });

    const result = await popupPromise;
    cleanupPromptListeners();

    if (result) {
        updateSetting(key, $('#plz-prompt-editor').val());
        if (window.toastr) window.toastr.success('Template updated.', 'PersonaLyze');
    }
}