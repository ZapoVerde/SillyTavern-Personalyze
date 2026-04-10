/**
 * @file data/default-user/extensions/personalyze/ui/settings/prompts.js
 * @stamp {"utc":"2026-04-11T19:00:00.000Z"}
 * @architectural-role UI Logic (Prompt Editor)
 * @description
 * Orchestrates the multi-line Prompt Editor modal. 
 * Provides unlimited auto-resize for large textareas and manages reset/save 
 * lifecycle for LLM prompt templates.
 *
 * Updated with robust auto-expansion logic for mobile and high-frequency input.
 *
 * @api-declaration
 * openPromptModal(key, title, defaultValue) -> Promise<void>
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
import { DEFAULT_VN_STYLE_SUFFIX } from '../../defaults.js';

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

/**
 * Handles initialization and event binding for the dynamic textarea in the prompt modals.
 */
function initTextareaAutoResize() {
    const selector = '#plz-prompt-editor';
    
    // Robust listener for input changes (works for mobile keyboards, autocomplete, and paste)
    $(document).on('input.plz-prompt keyup.plz-prompt change.plz-prompt', selector, function() {
        smartResize(this);
    });

    // Handle initial sizing after SillyTavern injects the modal into the DOM
    const triggerResize = () => {
        const el = document.querySelector(selector);
        if (el) smartResize(el);
    };

    // Multiple attempts to ensure height is calculated after layout is settled
    requestAnimationFrame(triggerResize);
    setTimeout(triggerResize, 50);
    setTimeout(triggerResize, 200);
}

/**
 * Cleanup function for shared prompt modal listeners.
 */
function cleanupPromptListeners() {
    $(document).off('.plz-prompt');
}

/**
 * Opens a modal to edit a style library entry.
 * Reads from and writes directly to meta.styleLibrary[styleName].
 *
 * @param {string} styleName - Key in meta.styleLibrary to edit.
 */
export async function openStyleModal(styleName) {
    const meta = getMetaSettings();
    const current = meta.styleLibrary?.[styleName] ?? DEFAULT_VN_STYLE_SUFFIX;

    const vars = PROMPT_VARIABLES['vnStyleSuffix'] ?? [];
    const varBlock = vars.length
        ? `<div class="plz-var-list">
               ${vars.map((entry, i) => {
                   const copyId = `plz-var-copy-style-${i}`;
                   const onclickJs = `navigator.clipboard.writeText('${entry.v}').then(function(){`
                       + `var el=document.getElementById('${copyId}');`
                       + `el.style.outline='1px solid #4caf50';`
                       + `setTimeout(function(){el.style.outline='';},900);`
                       + `});event.stopPropagation();`;
                   return `<div class="plz-var-row">
                       <button id="${copyId}" onclick="${onclickJs}" class="menu_button plz-var-copy-btn"
                               title="Copy to clipboard"><i class="fa-regular fa-copy"></i></button>
                       <code class="plz-var-code">${entry.v}</code>
                       <span class="plz-var-desc">— ${entry.d}</span>
                   </div>`;
               }).join('')}
           </div>`
        : '';

    const popupPromise = callPopup(
        `<h3 class="plz-modal-title">Portrait Style — ${styleName}</h3>
         ${varBlock}
         <textarea id="plz-prompt-editor" class="text_pole plz-auto-textarea" rows="1"
                   style="width:100%; font-family:monospace; font-size:0.85em; overflow:hidden; min-height:100px;"
                   spellcheck="false">${current.replace(/</g, '&lt;')}</textarea>
         <div class="plz-modal-actions">
             <button class="menu_button" id="plz-prompt-save" style="background-color:rgba(76,175,80,0.15);">Save Style</button>
             <button class="menu_button" id="plz-prompt-reset">Reset to Default</button>
         </div>`,
        'confirm',
    );

    initTextareaAutoResize();

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
        const newValue = $('#plz-prompt-editor').val();
        if (!meta.styleLibrary) meta.styleLibrary = {};
        meta.styleLibrary[styleName] = newValue;
        saveSettingsDebounced();
        if (window.toastr) window.toastr.success(`Style "${styleName}" updated.`, 'PersonaLyze');
    }
}

/**
 * Opens a modal to edit a specific prompt template.
 *
 * @param {string} key - The settings key to update.
 * @param {string} title - Human-readable modal title.
 * @param {string} defaultValue - Fallback template for the reset action.
 */
export async function openPromptModal(key, title, defaultValue) {
    const current = getSettings()[key] ?? defaultValue;

    const vars = PROMPT_VARIABLES[key] ?? [];
    const varBlock = vars.length
        ? `<div class="plz-var-list">
               ${vars.map((entry, i) => {
                   const copyId = `plz-var-copy-${key}-${i}`;
                   const onclickJs = `navigator.clipboard.writeText('${entry.v}').then(function(){`
                       + `var el=document.getElementById('${copyId}');`
                       + `el.style.outline='1px solid #4caf50';`
                       + `setTimeout(function(){el.style.outline='';},900);`
                       + `});event.stopPropagation();`;
                   return `<div class="plz-var-row">
                       <button id="${copyId}" onclick="${onclickJs}" class="menu_button plz-var-copy-btn"
                               title="Copy to clipboard"><i class="fa-regular fa-copy"></i></button>
                       <code class="plz-var-code">${entry.v}</code>
                       <span class="plz-var-desc">— ${entry.d}</span>
                   </div>`;
               }).join('')}
           </div>`
        : `<p class="plz-var-none">No template variables — this value is used as-is.</p>`;

    const popupPromise = callPopup(
        `<h3 class="plz-modal-title">${title}</h3>
         ${varBlock}
         <textarea id="plz-prompt-editor" class="text_pole plz-auto-textarea" rows="1"
                   style="width:100%; font-family:monospace; font-size:0.85em; overflow:hidden; min-height:100px;"
                   spellcheck="false">${current.replace(/</g, '&lt;')}</textarea>
         <div class="plz-modal-actions">
             <button class="menu_button" id="plz-prompt-save" style="background-color:rgba(76,175,80,0.15);">Save Template</button>
             <button class="menu_button" id="plz-prompt-reset">Reset to Default</button>
         </div>`,
        'confirm',
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
        const newValue = $('#plz-prompt-editor').val();
        updateSetting(key, newValue);
        if (window.toastr) window.toastr.success('Template updated.', 'PersonaLyze');
    }
}