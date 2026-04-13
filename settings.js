/**
 * @file data/default-user/extensions/personalyze/settings.js
 * @stamp {"utc":"2026-04-16T13:10:00.000Z"}
 * @architectural-role Stateful Owner (Extension Settings)
 * @description
 * Manages the Personalyze profile-based settings lifecycle.
 * Implements the "Working Table" architecture for the Layered State Pipeline.
 *
 * Updated for Runware.ai Integration:
 * 1. Added engineEnableRunware, runwareModel, runwareUseLayerDiffuse, and runwareRemoveBackground to defaults.
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
    SCENE_CHANGE_PROMPT,
    WARDROBE_VALIDITY_PROMPT,
    REDRESS_PROMPT,
    FORCE_COSTUME_PROMPT,
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
    DEFAULT_PIAPI_REMOVE_BG,
    DEFAULT_PIAPI_RMBG_MODEL,
    DEFAULT_MAX_RESOLUTION,
    DEFAULT_DYNAMIC_RESOLUTION,
    DEFAULT_KEEP_CACHE,
    DEFAULT_RUNWARE_MODEL,
    DEFAULT_RUNWARE_USE_LAYER_DIFFUSE,
    DEFAULT_RUNWARE_REMOVE_BG,
} from './defaults.js';

const EXT_NAME = 'personalyze';

/** Global defaults for every new profile. */
export const SETTINGS_DEFAULTS = Object.freeze({
    enabled:                true,
    plzVnMode:              false,
    plzVnSplitPercent:      DEFAULT_PLZ_VN_SPLIT,
    imageModel:             DEFAULT_IMAGE_MODEL,
    falModel:               DEFAULT_FAL_MODEL,
    piapiModel:             DEFAULT_PIAPI_MODEL,
    vnStyleSuffix:          DEFAULT_VN_STYLE_SUFFIX,
    devMode:                DEFAULT_DEV_MODE,
    verboseLogging:         DEFAULT_VERBOSE_LOGGING,
    
    // UI State persistence
    currentStyleName:       'Default',

    // Dual-Model Routing
    fastProfileId:          DEFAULT_FAST_PROFILE_ID,
    smartProfileId:         DEFAULT_SMART_PROFILE_ID,
    
    detectionHistory:       DEFAULT_DETECTION_HISTORY,
    describerHistory:       DEFAULT_DESCRIBER_HISTORY,
    
    // Prompts
    phase1SubjectPrompt:        PHASE_1_SUBJECT_PROMPT,
    phase2ChangePrompt:         PHASE_2_CHANGE_PROMPT,
    phase3LayeredPrompt:        PHASE_3_LAYERED_PROMPT,
    anchorScanPrompt:           ANCHOR_SCAN_PROMPT,
    sceneChangePrompt:          SCENE_CHANGE_PROMPT,
    wardrobeValidityPrompt:     WARDROBE_VALIDITY_PROMPT,
    redressPrompt:              REDRESS_PROMPT,
    forceCostumePrompt:         FORCE_COSTUME_PROMPT,
    forceCostumeHintTemplate:   'KEYWORD GUIDANCE: {{hint}}\nFocus specifically on elements matching this hint.',
    
    testPrompt:             DEFAULT_TEST_PROMPT,
    defaultEngine:          'pollinations',
    engineEnablePollinations: true,
    engineEnableFal:          false,
    engineEnablePiAPI:        false,
    engineEnableRunware:      false,
    showPortraitStatus:       true,

    // Background Removal (PiAPI Image Toolkit)
    piapiRemoveBackground:    DEFAULT_PIAPI_REMOVE_BG,
    piapiRmbgModel:           DEFAULT_PIAPI_RMBG_MODEL,

    // Runware Integration
    runwareModel:             DEFAULT_RUNWARE_MODEL,
    runwareUseLayerDiffuse:   DEFAULT_RUNWARE_USE_LAYER_DIFFUSE,
    runwareRemoveBackground:  DEFAULT_RUNWARE_REMOVE_BG,

    // Generation Economy
    maxResolution:            DEFAULT_MAX_RESOLUTION,
    dynamicResolution:        DEFAULT_DYNAMIC_RESOLUTION,
    keepCache:                DEFAULT_KEEP_CACHE,
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

    // Style Library — global, cross-profile
    if (!root.styleLibrary) {
        root.styleLibrary = { 'Default': DEFAULT_VN_STYLE_SUFFIX };
        root.defaultStyleName = 'Default';
    }
    if (!root.defaultStyleName) {
        root.defaultStyleName = Object.keys(root.styleLibrary)[0] || 'Default';
    }

    saveSettingsDebounced();
}