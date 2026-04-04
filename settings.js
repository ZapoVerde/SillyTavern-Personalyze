/**
 * @file data/default-user/extensions/personalyze/settings.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role Stateful Owner (Extension Settings)
 * @description
 * Manages the PersonaLyze user-configurable settings lifecycle.
 *
 * Stores global toggles (enabled, portrait position, LLM profile assignments,
 * prompt overrides) separately from character data. Character data lives in
 * registry.js. Settings here control how the pipeline behaves, not what
 * characters look like.
 *
 * Pipeline profile split:
 *   detectionProfileId — used for all cheap boolean/classifier calls
 *                        (subject match, subject list, change check, combined classifier)
 *   describerProfileId — used for outfit describer (more tokens, higher temp)
 *
 * STRICT CONTRACT:
 * 1. This module is the ONLY module permitted to mutate extension_settings.personalyze
 *    settings keys (non-character keys).
 * 2. External modules MUST use updateSetting() for all writes.
 * 3. External modules may READ via getSettings() directly.
 *
 * @api-declaration
 * getSettings()             — Returns the active settings object (Read-Only intent).
 * updateSetting(key, value) — Updates a single settings key and persists.
 * initSettings()            — Merges defaults into existing settings structure.
 *
 * @contract
 *   assertions:
 *     purity: Stateful
 *     state_ownership: [extension_settings.personalyze (settings keys)]
 *     external_io: [saveSettingsDebounced]
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { warn } from './utils/logger.js';
import {
    DEFAULT_IMAGE_MODEL,
    DEFAULT_VN_STYLE_SUFFIX,
    DEFAULT_SUBJECT_MATCH_PROMPT,
    DEFAULT_SUBJECT_LIST_PROMPT,
    DEFAULT_CHANGE_CHECK_PROMPT,
    DEFAULT_COMBINED_CLASSIFIER_PROMPT,
    DEFAULT_ANCHOR_SCAN_PROMPT,
    DEFAULT_OUTFIT_DESCRIBER_PROMPT,
    DEFAULT_EXPRESSION_DESCRIBER_PROMPT,
    DEFAULT_DETECTION_HISTORY,
    DEFAULT_DESCRIBER_HISTORY,
    DEFAULT_DEV_MODE,
    DEFAULT_VERBOSE_LOGGING,
    DEFAULT_EXPRESSION_LABELS,
} from './defaults.js';

const EXT_NAME = 'personalyze';

export const SETTINGS_DEFAULTS = Object.freeze({
    enabled:                true,
    portraitPosition:       'bottom-right',       // 'bottom-right' | 'center-left'
    imageModel:             DEFAULT_IMAGE_MODEL,
    vnStyleSuffix:          DEFAULT_VN_STYLE_SUFFIX,
    devMode:                DEFAULT_DEV_MODE,
    verboseLogging:         DEFAULT_VERBOSE_LOGGING,

    // LLM profile IDs — null means disabled (do not fall back to main connection)
    booleanProfileId:       null,   // Step 1 + 2.9 — Subject Match (YES/NO) + Change Check (YES/NO)
    classifierProfileId:    null,   // Step 2 + 3   — Subject From List + Combined Outfit/Expression
    describerProfileId:     null,   // Step 3a      — Outfit Describer + Anchor Scan

    // History window sizes (turn pairs)
    detectionHistory:       DEFAULT_DETECTION_HISTORY,
    describerHistory:       DEFAULT_DESCRIBER_HISTORY,

    // Expression label palette — editable so unusual characters can have custom entries added.
    expressionLabels:           DEFAULT_EXPRESSION_LABELS,

    // Prompt overrides
    anchorScanPrompt:           DEFAULT_ANCHOR_SCAN_PROMPT,
    subjectMatchPrompt:         DEFAULT_SUBJECT_MATCH_PROMPT,
    subjectListPrompt:          DEFAULT_SUBJECT_LIST_PROMPT,
    changeCheckPrompt:          DEFAULT_CHANGE_CHECK_PROMPT,
    combinedClassifierPrompt:   DEFAULT_COMBINED_CLASSIFIER_PROMPT,
    outfitDescriberPrompt:      DEFAULT_OUTFIT_DESCRIBER_PROMPT,
    expressionDescriberPrompt:  DEFAULT_EXPRESSION_DESCRIBER_PROMPT,
});

/**
 * Returns the settings sub-object from the shared registry.
 * @returns {object}
 */
export function getSettings() {
    return extension_settings[EXT_NAME].settings;
}

/**
 * Updates a single settings key and debounces a persistence write.
 * @param {string} key
 * @param {any} value
 */
export function updateSetting(key, value) {
    if (!Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULTS, key)) {
        warn('Settings', `Attempted to update unknown settings key: "${key}"`);
        return;
    }
    extension_settings[EXT_NAME].settings[key] = value;
    saveSettingsDebounced();
}

/**
 * Ensures the settings sub-object exists and is populated with defaults.
 * Called by registry.js during initRegistry().
 */
export function initSettings() {
    const root = extension_settings[EXT_NAME];
    if (!root.settings) {
        root.settings = {};
    }
    // Merge defaults without overwriting existing user values
    root.settings = Object.assign({}, SETTINGS_DEFAULTS, root.settings);
    saveSettingsDebounced();
}
