/**
 * @file data/default-user/extensions/personalyze/ui/settings/prompts.js
 * @stamp {"utc":"2026-04-07T14:50:00.000Z"}
 * @architectural-role UI Logic (Prompt Editor)
 * @description
 * Orchestrates the multi-line Prompt Editor modal. 
 * Provides unlimited auto-resize for large textareas and manages reset/save 
 * lifecycle for LLM prompt templates.
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

import { callPopup } from '../../../../../../script.js';
import { getSettings, updateSetting } from '../../settings.js';
import { smartResize } from '../../utils/dom.js';

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
    vnStyleSuffix: [],
};

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
    const varBlock = vars.length ? `
        <div style="margin-bottom:10px;">
            ${vars.map((entry, i) => {
                const copyId = `plz-var-copy-${key}-${i}`;
                const onclickJs = `navigator.clipboard.writeText('${entry.v}').then(function(){`
                    + `var el=document.getElementById('${copyId}');`
                    + `el.style.outline='1px solid #4caf50';`
                    + `setTimeout(function(){el.style.outline='';},900);`
                    + `});event.stopPropagation();`;
                return `<div style="display:flex; align-items:baseline; gap:6px; margin-bottom:4px;">
                    <button id="${copyId}" onclick="${onclickJs}"
                            class="menu_button"
                            style="font-size:0.72em; padding:1px 6px; line-height:1.6; flex-shrink:0;"
                            title="Copy to clipboard"><i class="fa-regular fa-copy"></i></button>
                    <code style="font-size:0.82em; color:var(--SmartThemeQuoteColor, #c9a84c);">${entry.v}</code>
                    <span style="font-size:0.80em; opacity:0.6;">— ${entry.d}</span>
                </div>`;
            }).join('')}
        </div>` : '';

    // Standard ST confirmation popup used as a container
    const popupPromise = callPopup(
        `<h3 style="text-align:left; margin-top:0;">${title}</h3>
         ${varBlock}
         <textarea id="plz-prompt-editor" class="text_pole plz-auto-textarea" rows="10"
                   style="width:100%; font-family:monospace; font-size:0.85em; overflow:hidden;"
                   spellcheck="false">${current.replace(/</g, '&lt;')}</textarea>
         <div style="margin-top:8px; display:flex; gap:8px;">
             <button class="menu_button" id="plz-prompt-reset"
                     style="font-size:0.8em;">Reset to Default</button>
         </div>`,
        'confirm',
    );

    // Initial resize trigger after DOM insertion
    const triggerResize = () => {
        const el = document.getElementById('plz-prompt-editor');
        if (el) smartResize(el);
    };
    
    requestAnimationFrame(() => {
        triggerResize();
        setTimeout(triggerResize, 50);
    });

    // Handle live resizing as user types
    $(document).on('input.plz-prompt', '#plz-prompt-editor', function() {
        smartResize(this);
    });

    // Handle reset action
    $(document).on('click.plz-prompt', '#plz-prompt-reset', () => {
        const $editor = $('#plz-prompt-editor');
        $editor.val(defaultValue);
        smartResize($editor[0]);
    });

    const result = await popupPromise;

    // Cleanup global listeners before resolving
    $(document).off('input.plz-prompt');
    $(document).off('click.plz-prompt');

    if (result) {
        const newValue = $('#plz-prompt-editor').val();
        updateSetting(key, newValue);
    }
}