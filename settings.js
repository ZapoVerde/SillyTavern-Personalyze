/**
 * @file data/default-user/extensions/personalyze/settings.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role Stateful Owner (Extension Settings)
 * @description
 * Manages the PersonaLyze profile-based settings lifecycle.
 *
 * Implements the CNZ-style "Active State" architecture:
 * - 'activeState' is the current working copy (the "Working Table").
 * - 'profiles' is a dictionary of saved snapshots (the "Bookshelf").
 * - Character data remains global in registry.js and is NOT part of profiles.
 *
 * Updated to include Hugging Face model configuration.
 *
 * @api-declaration
 * getSettings()             — Returns the activeState (working copy).
 * getMetaSettings()         — Returns the root object (profiles, currentProfileName).
 * updateSetting(key, value) — Updates the working copy and debounces save.
 * initSettings()            — Handles migration and default population.
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { warn, log } from './utils/logger.js';
import {
    DEFAULT_IMAGE_MODEL,
    DEFAULT_HF_IMAGE_MODEL,
    DEFAULT_HF_PROVIDER,
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
    DEFAULT_PLZ_VN_SPLIT,
} from './defaults.js';

const EXT_NAME = 'personalyze';

/** Global defaults for every new profile. */
export const SETTINGS_DEFAULTS = Object.freeze({
    enabled:                true,
    portraitPosition:       'bottom-right',
    plzVnMode:              false,
    plzVnSplitPercent:      DEFAULT_PLZ_VN_SPLIT,
    imageModel:             DEFAULT_IMAGE_MODEL,
    hfProvider:             DEFAULT_HF_PROVIDER,
    hfImageModel:           DEFAULT_HF_IMAGE_MODEL,
    vnStyleSuffix:          DEFAULT_VN_STYLE_SUFFIX,
    devMode:                DEFAULT_DEV_MODE,
    verboseLogging:         DEFAULT_VERBOSE_LOGGING,
    booleanProfileId:       null,
    classifierProfileId:    null,
    describerProfileId:     null,
    detectionHistory:       DEFAULT_DETECTION_HISTORY,
    describerHistory:       DEFAULT_DESCRIBER_HISTORY,
    expressionLabels:       DEFAULT_EXPRESSION_LABELS,
    anchorScanPrompt:           DEFAULT_ANCHOR_SCAN_PROMPT,
    subjectMatchPrompt:         DEFAULT_SUBJECT_MATCH_PROMPT,
    subjectListPrompt:          DEFAULT_SUBJECT_LIST_PROMPT,
    changeCheckPrompt:          DEFAULT_CHANGE_CHECK_PROMPT,
    combinedClassifierPrompt:   DEFAULT_COMBINED_CLASSIFIER_PROMPT,
    outfitDescriberPrompt:      DEFAULT_OUTFIT_DESCRIBER_PROMPT,
    expressionDescriberPrompt:  DEFAULT_EXPRESSION_DESCRIBER_PROMPT,
});

/**
 * Returns the "Working Table" settings.
 * @returns {object}
 */
export function getSettings() {
    return extension_settings[EXT_NAME].activeState;
}

/**
 * Returns the root metadata (profiles list and current name).
 * @returns {object}
 */
export function getMetaSettings() {
    return extension_settings[EXT_NAME];
}

/**
 * Updates a single key in the activeState.
 */
export function updateSetting(key, value) {
    if (!Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULTS, key)) {
        warn('Settings', `Attempted to update unknown key: "${key}"`);
        return;
    }
    extension_settings[EXT_NAME].activeState[key] = value;
    saveSettingsDebounced();
}

/**
 * Initializes the settings structure. 
 * If old flat settings exist, it moves them into a 'Default' profile.
 */
export function initSettings() {
    if (!extension_settings[EXT_NAME]) extension_settings[EXT_NAME] = {};
    const root = extension_settings[EXT_NAME];

    // Migration logic: move old root.settings into profiles.Default
    if (!root.profiles) {
        log('Settings', 'Migrating to profile-based architecture...');
        
        const legacyConfig = root.settings || {};
        const defaultProfile = Object.assign({}, SETTINGS_DEFAULTS, legacyConfig);
        
        root.profiles = { 'Default': defaultProfile };
        root.currentProfileName = 'Default';
        root.activeState = structuredClone(defaultProfile);
        
        // Clean up the old key
        delete root.settings;
    } else {
        // Ensure activeState has all keys from current defaults (safety for updates)
        root.activeState = Object.assign({}, SETTINGS_DEFAULTS, root.activeState);
    }

    saveSettingsDebounced();
}