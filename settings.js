/**
 * @file data/default-user/extensions/personalyze/settings.js
 * @stamp {"utc":"2026-04-18T20:00:00.000Z"}
 * @architectural-role Stateful Owner (Extension Settings)
 * @description
 * Manages the Personalyze profile-based settings lifecycle.
 * Implements the "Working Table" (Sandbox vs. Checkpoint) architecture.
 * 
 * Added:
 * 1. styleWorkspaces: Persistent storage for uncommitted "Dirty" style experiments.
 * 2. Enhanced migration to synchronize Library and Workspace on boot.
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
    DEFAULT_RUNWARE_RMBG_MODEL,
    DEFAULT_STYLE_PACKAGE,
} from './defaults.js';

const EXT_NAME = 'personalyze';

/** Default Dynamic Schema for Model Parameters */
const DEFAULT_PARAMETER_SCHEMA = {
    "flux": {
        "steps": { "type": "slider", "min": 1, "max": 50, "default": 20, "label": "Steps" },
        "guidance": { "type": "slider", "min": 1, "max": 20, "default": 3.5, "step": 0.1, "label": "Guidance" }
    },
    "sdxl": {
        "steps": { "type": "slider", "min": 1, "max": 100, "default": 30, "label": "Steps" },
        "cfgScale": { "type": "slider", "min": 1, "max": 30, "default": 7, "step": 0.5, "label": "CFG Scale" },
        "scheduler": { "type": "select", "options": ["Euler A", "DPM++ 2M Karras", "UniPC"], "default": "Euler A", "label": "Scheduler" }
    },
    "sd15": {
        "steps": { "type": "slider", "min": 1, "max": 100, "default": 20, "label": "Steps" },
        "cfgScale": { "type": "slider", "min": 1, "max": 30, "default": 7, "step": 0.5, "label": "CFG Scale" }
    }
};

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
    runwareRmbgModel:         DEFAULT_RUNWARE_RMBG_MODEL,
    runwareModels:            [], // Persistent storage for manual checkpoints
    runwareLoras:             [], // Persistent storage for fetched/manual LoRAs

    // Generation Economy
    maxResolution:            DEFAULT_MAX_RESOLUTION,
    dynamicResolution:        DEFAULT_DYNAMIC_RESOLUTION,
    keepCache:                DEFAULT_KEEP_CACHE,

    // Dynamic Parameter Schema
    modelParameterSchema:     JSON.stringify(DEFAULT_PARAMETER_SCHEMA, null, 4),
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

    // --- Style Library & Package Migration ---
    if (!root.styleLibrary) {
        root.styleLibrary = { 'Default': structuredClone(DEFAULT_STYLE_PACKAGE) };
        root.defaultStyleName = 'Default';
    }

    // --- Sandbox vs Checkpoint Initialization ---
    if (!root.styleWorkspaces) {
        root.styleWorkspaces = {};
    }

    let migrated = false;

    // Helper to ensure schema compliance for a style object
    const ensureSchema = (val) => {
        let changed = false;
        if (typeof val === 'string') {
            return { ...DEFAULT_STYLE_PACKAGE, template: val, _migrated: true };
        }
        if (val.engine === undefined) {
            Object.assign(val, {
                engine: DEFAULT_STYLE_PACKAGE.engine,
                model: DEFAULT_STYLE_PACKAGE.model,
                useLayerDiffuse: DEFAULT_STYLE_PACKAGE.useLayerDiffuse,
                resolutionOverride: DEFAULT_STYLE_PACKAGE.resolutionOverride
            });
            changed = true;
        }
        if (val.negativePrompt === undefined) {
            val.negativePrompt = '';
            changed = true;
        }
        if (val.engineParams === undefined) {
            val.engineParams = {};
            changed = true;
        }
        if (changed) val._migrated = true;
        return val;
    };

    // 1. Process Library (Checkpoints)
    for (const key of Object.keys(root.styleLibrary)) {
        const processed = ensureSchema(root.styleLibrary[key]);
        if (processed._migrated) {
            delete processed._migrated;
            root.styleLibrary[key] = processed;
            migrated = true;
        }

        // 2. Synchronize Workspaces (Sandboxes)
        // If workspace doesn't exist for a library entry, clone the checkpoint into it
        if (!root.styleWorkspaces[key]) {
            root.styleWorkspaces[key] = structuredClone(root.styleLibrary[key]);
            migrated = true;
        } else {
            // Ensure the existing workspace also meets the schema requirements
            const processedWs = ensureSchema(root.styleWorkspaces[key]);
            if (processedWs._migrated) {
                delete processedWs._migrated;
                root.styleWorkspaces[key] = processedWs;
                migrated = true;
            }
        }
    }

    // 3. Orphan Cleanup
    // If a workspace exists for a style that no longer exists in the library, delete it
    for (const key of Object.keys(root.styleWorkspaces)) {
        if (!root.styleLibrary[key]) {
            delete root.styleWorkspaces[key];
            migrated = true;
        }
    }

    if (!root.defaultStyleName) {
        root.defaultStyleName = Object.keys(root.styleLibrary)[0] || 'Default';
    }

    if (migrated) saveSettingsDebounced();
}