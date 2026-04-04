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
    DEFAULT_BOOLEAN_PROMPT,
    DEFAULT_OUTFIT_CLASSIFIER_PROMPT,
    DEFAULT_EXPRESSION_CLASSIFIER_PROMPT,
    DEFAULT_OUTFIT_DESCRIBER_PROMPT,
    DEFAULT_EXPRESSION_DESCRIBER_PROMPT,
    DEFAULT_BOOLEAN_HISTORY,
    DEFAULT_OUTFIT_CLASSIFIER_HISTORY,
    DEFAULT_EXPRESSION_CLASSIFIER_HISTORY,
    DEFAULT_DESCRIBER_HISTORY,
    DEFAULT_DEV_MODE,
    DEFAULT_VERBOSE_LOGGING,
} from './defaults.js';

const EXT_NAME = 'personalyze';

export const SETTINGS_DEFAULTS = Object.freeze({
    enabled:                        true,
    portraitPosition:               'bottom-right',   // 'bottom-right' | 'center-left'
    imageModel:                     DEFAULT_IMAGE_MODEL,
    vnStyleSuffix:                  DEFAULT_VN_STYLE_SUFFIX,
    devMode:                        DEFAULT_DEV_MODE,
    verboseLogging:                 DEFAULT_VERBOSE_LOGGING,
    // LLM profile IDs — null means "use the active ST connection profile"
    booleanProfileId:               null,
    outfitClassifierProfileId:      null,
    expressionClassifierProfileId:  null,
    describerProfileId:             null,
    // History window sizes (turn pairs)
    booleanHistory:                 DEFAULT_BOOLEAN_HISTORY,
    outfitClassifierHistory:        DEFAULT_OUTFIT_CLASSIFIER_HISTORY,
    expressionClassifierHistory:    DEFAULT_EXPRESSION_CLASSIFIER_HISTORY,
    describerHistory:               DEFAULT_DESCRIBER_HISTORY,
    // Prompt overrides
    booleanPrompt:                  DEFAULT_BOOLEAN_PROMPT,
    outfitClassifierPrompt:         DEFAULT_OUTFIT_CLASSIFIER_PROMPT,
    expressionClassifierPrompt:     DEFAULT_EXPRESSION_CLASSIFIER_PROMPT,
    outfitDescriberPrompt:          DEFAULT_OUTFIT_DESCRIBER_PROMPT,
    expressionDescriberPrompt:      DEFAULT_EXPRESSION_DESCRIBER_PROMPT,
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
