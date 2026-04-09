/**
 * @file data/default-user/extensions/personalyze/settings.js
 * @stamp {"utc":"2026-04-10T17:00:00.000Z"}
 * @architectural-role Stateful Owner (Extension Settings)
 * @description
 * Manages the Personalyze profile-based settings lifecycle.
 * Implements the "Working Table" architecture for the Layered State Pipeline.
 *
 * @api-declaration
 * getSettings()             — Returns the activeState (working copy).
 * getMetaSettings()         — Returns root metadata.
 * updateSetting(key, value) — Updates working copy and debounces save.
 * initSettings()            — Handles migration and default population.
 * 
 * @contract
 *   assertions:
 *     purity: Stateful Owner
 *     state_ownership: [extension_settings.personalyze]
 *     external_io: [saveSettingsDebounced]
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { warn, log } from './utils/logger.js';
import {
    PHASE_1_SUBJECT_PROMPT,
    PHASE_2_CHANGE_PROMPT,
    PHASE_3_LAYERED_PROMPT,
    ANCHOR_SCAN_PROMPT,
    OUTFIT_GENERATOR_PROMPT
} from './logic/prompts.js';
import {
    DEFAULT_IMAGE_MODEL,
    DEFAULT_FAST_PROFILE_ID,
    DEFAULT_SMART_PROFILE_ID,
    DEFAULT_VN_STYLE_SUFFIX,
    DEFAULT_DETECTION_HISTORY,
    DEFAULT_DESCRIBER_HISTORY,
    DEFAULT_DEV_MODE,
    DEFAULT_VERBOSE_LOGGING,
    DEFAULT_PLZ_VN_SPLIT,
    DEFAULT_TEST_PROMPT,
    DEFAULT_FAL_MODEL,
    DEFAULT_PIAPI_MODEL,
} from './defaults.js';

const EXT_NAME = 'personalyze';

/** Global defaults for every new profile. */
export const SETTINGS_DEFAULTS = Object.freeze({
    enabled:                true,
    portraitPosition:       'bottom-right',
    plzVnMode:              false,
    plzVnSplitPercent:      DEFAULT_PLZ_VN_SPLIT,
    imageModel:             DEFAULT_IMAGE_MODEL,
    falModel:               DEFAULT_FAL_MODEL,
    piapiModel:             DEFAULT_PIAPI_MODEL,
    vnStyleSuffix:          DEFAULT_VN_STYLE_SUFFIX,
    devMode:                DEFAULT_DEV_MODE,
    verboseLogging:         DEFAULT_VERBOSE_LOGGING,
    
    // Dual-Model Routing
    fastProfileId:          DEFAULT_FAST_PROFILE_ID,
    smartProfileId:         DEFAULT_SMART_PROFILE_ID,
    
    detectionHistory:       DEFAULT_DETECTION_HISTORY,
    describerHistory:       DEFAULT_DESCRIBER_HISTORY,
    
    // Prompts
    phase1SubjectPrompt:    PHASE_1_SUBJECT_PROMPT,
    phase2ChangePrompt:     PHASE_2_CHANGE_PROMPT,
    phase3LayeredPrompt:    PHASE_3_LAYERED_PROMPT,
    anchorScanPrompt:       ANCHOR_SCAN_PROMPT,
    outfitGeneratorPrompt:  OUTFIT_GENERATOR_PROMPT,
    
    testPrompt:             DEFAULT_TEST_PROMPT,
    defaultEngine:          'pollinations',
    engineEnablePollinations: true,
    engineEnableFal:          false,
    engineEnablePiAPI:        false,
    engineEnableHuggingFace:  true,
});

/** Returns the active working copy. */
export function getSettings() {
    return extension_settings[EXT_NAME].activeState;
}

/** Returns the root metadata. */
export function getMetaSettings() {
    return extension_settings[EXT_NAME];
}

/** Updates a single key and saves. */
export function updateSetting(key, value) {
    if (!Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULTS, key)) {
        warn('Settings', `Unknown key: "${key}"`);
        return;
    }
    extension_settings[EXT_NAME].activeState[key] = value;
    saveSettingsDebounced();
}

/** Initializes settings and handles key migration. */
export function initSettings() {
    if (!extension_settings[EXT_NAME]) extension_settings[EXT_NAME] = {};
    const root = extension_settings[EXT_NAME];

    if (!root.profiles) {
        log('Settings', 'Initializing profile-based architecture...');
        const defaultProfile = Object.assign({}, SETTINGS_DEFAULTS);
        root.profiles = { 'Default': defaultProfile };
        root.currentProfileName = 'Default';
        root.activeState = structuredClone(defaultProfile);
    } else {
        // Ensure activeState has all new keys from the Layered architecture
        root.activeState = Object.assign({}, SETTINGS_DEFAULTS, root.activeState);
        
        // Migration: Map old boolean/classifier/describer keys to new fast/smart keys if necessary
        if (root.activeState.booleanProfileId && !root.activeState.fastProfileId) {
            root.activeState.fastProfileId = root.activeState.booleanProfileId;
        }
        if (root.activeState.describerProfileId && !root.activeState.smartProfileId) {
            root.activeState.smartProfileId = root.activeState.describerProfileId;
        }
        if (root.activeState.classifierProfileId && !root.activeState.smartProfileId) {
            root.activeState.smartProfileId = root.activeState.classifierProfileId;
        }
    }

    saveSettingsDebounced();
}