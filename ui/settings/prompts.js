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

import { callPopup } from '../../../../../script.js';
import { getSettings, updateSetting } from '../../settings.js';
import { smartResize } from '../../utils/dom.js';

/**
 * Opens a modal to edit a specific prompt template.
 * 
 * @param {string} key - The settings key to update.
 * @param {string} title - Human-readable modal title.
 * @param {string} defaultValue - Fallback template for the reset action.
 */
export async function openPromptModal(key, title, defaultValue) {
    const current = getSettings()[key] ?? defaultValue;

    // Standard ST confirmation popup used as a container
    const popupPromise = callPopup(
        `<h3>${title}</h3>
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