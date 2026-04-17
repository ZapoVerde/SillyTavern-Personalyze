/**
 * @file data/default-user/extensions/personalyze/ui/settings/prompts.js
 * @stamp {"utc":"2026-04-16T23:55:00.000Z"}
 * @architectural-role UI Logic (Prompt Editor)
 * @description
 * Orchestrates the multi-line Prompt Editor for system-level templates.
 * 
 * Updated for Style-Specific Render Pipeline:
 * 1. Deleted openStyleModal (Styles are now managed in the Workshop).
 * 2. Pruned LoRA-related UI helpers.
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

import { getSettings, updateSetting } from '../../settings.js';
import { smartResize } from '../../utils/dom.js';
import { openTextModal } from '../../utils/textModal.js';
import {
    PHASE_1_SUBJECT_PROMPT,
    PHASE_2_CHANGE_PROMPT,
    PHASE_3_LAYERED_PROMPT,
    ANCHOR_SCAN_PROMPT,
    SCENE_CHANGE_PROMPT,
    WARDROBE_VALIDITY_PROMPT,
    REDRESS_PROMPT,
    FORCE_COSTUME_PROMPT,
} from '../../logic/prompts.js';
import { DEFAULT_VN_STYLE_SUFFIX } from '../../defaults.js';

/** Default values for each prompt key — used by the Reset to Default button. */
const PROMPT_DEFAULTS = {
    phase1SubjectPrompt:      PHASE_1_SUBJECT_PROMPT,
    phase2ChangePrompt:       PHASE_2_CHANGE_PROMPT,
    phase3LayeredPrompt:      PHASE_3_LAYERED_PROMPT,
    anchorScanPrompt:         ANCHOR_SCAN_PROMPT,
    sceneChangePrompt:        SCENE_CHANGE_PROMPT,
    wardrobeValidityPrompt:   WARDROBE_VALIDITY_PROMPT,
    redressPrompt:            REDRESS_PROMPT,
    forceCostumePrompt:       FORCE_COSTUME_PROMPT,
    forceCostumeHintTemplate: 'KEYWORD GUIDANCE: {{hint}}\nFocus specifically on elements matching this hint.',
    vnStyleSuffix:            DEFAULT_VN_STYLE_SUFFIX,
};

/** Variables available in each prompt template, with descriptions. */
const PROMPT_VARIABLES = {
    phase1SubjectPrompt: [
        { v: '{{active_roster}}',  d: 'Newline-separated list of known character IDs in this chat' },
        { v: '{{history}}',        d: 'Recent turns before the latest message' },
        { v: '{{message}}',        d: 'The latest AI message being processed' },
    ],
    phase2ChangePrompt: [
        { v: '{{character_name}}', d: 'Name of the character being evaluated' },
        { v: '{{current_layers}}', d: 'Serialised current visual state (wardrobe + emotion + pose)' },
        { v: '{{history}}',        d: 'Recent turns before the latest message' },
        { v: '{{message}}',        d: 'The latest AI message being processed' },
    ],
    phase3LayeredPrompt: [
        { v: '{{character_name}}',          d: 'Name of the character being extracted' },
        { v: '{{identity_anchor}}',         d: 'Compiled physical description (joined identity traits)' },
        { v: '{{current_state}}',           d: 'Serialised current visual state (wardrobe + emotion + pose)' },
        { v: '{{slot_format_instructions}}', d: 'Auto-generated format lines for wardrobe + identity slots — REQUIRED' },
        { v: '{{history}}',                 d: 'Recent turns before the latest message' },
        { v: '{{message}}',                 d: 'The latest AI message being processed' },
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
        { v: '{{character_name}}',           d: 'Name of the character being redressed' },
        { v: '{{slot_format_instructions}}',  d: 'Auto-generated format lines for wardrobe slots — REQUIRED' },
        { v: '{{history}}',                  d: 'Recent turns before the scene transition' },
        { v: '{{current_turn}}',             d: 'The scene transition message' },
    ],
    forceCostumePrompt: [
        { v: '{{character_name}}',           d: 'Name of the character being scanned' },
        { v: '{{hint_block}}',               d: 'Rendered hint block (empty string if no hint provided)' },
        { v: '{{slot_format_instructions}}',  d: 'Auto-generated format lines for wardrobe slots — REQUIRED' },
        { v: '{{history}}',                  d: 'Recent turns before the target message' },
        { v: '{{current_turn}}',             d: 'The specific turn being scanned' },
    ],
    forceCostumeHintTemplate: [
        { v: '{{hint}}',           d: 'The raw keyword hint typed by the user in the Workshop' },
    ],
    vnStyleSuffix: [
        { v: '{{identity_anchor}}',   d: 'Permanent physical description of the character' },
        { v: '{{layers_description}}', d: 'Compiled outfit string built from all wardrobe slots' },
        { v: '{{emotion}}',            d: 'Current emotion label (e.g. "curious", "tense")' },
        { v: '{{pose}}',               d: 'Current pose description (e.g. "sitting cross-legged")' },
    ],
};

// ─── Generic Prompt Editor ───────────────────────────────────────────────────

/**
 * Opens the generic system prompt template editor.
 */
export async function openPromptModal(key, title, defaultValue) {
    const resolvedDefault = PROMPT_DEFAULTS[key] ?? defaultValue;
    const current = getSettings()[key] ?? resolvedDefault;
    const vars = PROMPT_VARIABLES[key] ?? [];

    const result = await openTextModal({
        title,
        initialValue: current,
        variables: vars,
        extraButtons: [
            {
                label: 'Reset to Default',
                id: 'plz-prompt-reset',
                onClick: ($ta) => { $ta.val(resolvedDefault); smartResize($ta[0]); }
            }
        ]
    });

    if (result !== null) {
        updateSetting(key, result);
        if (window.toastr) window.toastr.success('Template updated.', 'PersonaLyze');
    }
}