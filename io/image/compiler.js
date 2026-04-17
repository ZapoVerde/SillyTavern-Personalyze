/**
 * @file data/default-user/extensions/personalyze/io/image/compiler.js
 * @stamp {"utc":"2026-04-17T16:10:00.000Z"}
 * @architectural-role State Derivation (Visual Requirements)
 * @description
 * Handles resolution measurement and prompt synthesis.
 * Determines the target dimensions based on UI footprint or style overrides,
 * and compiles template variables into a final prompt string.
 * 
 * Updated for Dynamic Iterator Pattern:
 * 1. finalizePrompt now accepts raw layers object.
 * 2. Implemented dynamic {{slot}} variable replacement.
 * 3. Implemented smart overflow logic via {{layers_description}}.
 * 4. Added stale placeholder cleanup pass.
 * 
 * @api-declaration
 * resolveDimensions(characterId, styleObj) -> { width: number, height: number }
 * resolveStyle(characterId) -> Object (The expanded Style Package)
 * finalizePrompt(layers, anchor, emotion, pose, template) -> string
 * 
 * @contract
 *   assertions:
 *     purity: State Derivation / Pure DOM Measurement
 *     state_ownership: []
 *     external_io: [DOM (QuerySelector), Settings, State]
 */

import {
    RESOLUTION_TIERS,
    DEV_IMAGE_WIDTH,
    DEV_IMAGE_HEIGHT,
    DEFAULT_VN_STYLE_SUFFIX,
    DEFAULT_STYLE_PACKAGE,
} from '../../defaults.js';
import { getSettings, getMetaSettings } from '../../settings.js';
import { state } from '../../state.js';

/**
 * Resolves the target generation dimensions.
 * Priority: 
 * 1. Style-Specific Override (e.g. "832x1216")
 * 2. Developer Mode (Fixed tiny size)
 * 3. Dynamic Resolution (DOM-measuring capped by Global Max)
 * 4. Global Max Tier
 * 
 * @param {string} characterId 
 * @param {Object} [styleObj] - The resolved style package for the character.
 * @returns {{ width: number, height: number }}
 */
export function resolveDimensions(characterId, styleObj = null) {
    // 1. Style-Specific Resolution Override
    if (styleObj?.resolutionOverride) {
        const parts = String(styleObj.resolutionOverride).split('x');
        if (parts.length === 2) {
            const w = parseInt(parts[0]);
            const h = parseInt(parts[1]);
            if (!isNaN(w) && !isNaN(h)) return { width: w, height: h };
        }
    }

    const s = getSettings();
    
    // 2. Dev Mode
    if (s.devMode) return { width: DEV_IMAGE_WIDTH, height: DEV_IMAGE_HEIGHT };
    
    const tier = RESOLUTION_TIERS[s.maxResolution] || RESOLUTION_TIERS.MAX;
    
    // 3. Global Static Max Resolution
    if (!s.dynamicResolution) return tier;

    // 4. Dynamic Measurement Logic
    const el = document.querySelector(`.plz-portrait-card[data-id="${CSS.escape(characterId)}"]`);
    if (!el || el.clientWidth === 0) return tier; 

    // Snap to multiples of 32 for AI generation safety, clamp between 256x384 and the user's max tier
    const targetW = Math.max(256, Math.min(Math.ceil(el.clientWidth / 32) * 32, tier.width));
    const targetH = Math.max(384, Math.min(Math.ceil(el.clientHeight / 32) * 32, tier.height));
    
    return { width: targetW, height: targetH };
}

/**
 * Retrieves the complete render pipeline configuration (style package) for a character.
 * Priority: Workspace (Live/Dirty) -> Library (Checkpoint/Saved) -> Default Fallback.
 * 
 * @param {string} characterId 
 * @returns {Object} The expanded Style Package including engine, model, and overrides.
 */
export function resolveStyle(characterId) {
    const meta = getMetaSettings();
    const lib = meta.styleLibrary || {};
    const ws  = meta.styleWorkspaces || {};
    
    // Default fallback if library is missing or corrupt
    const fallback = structuredClone(DEFAULT_STYLE_PACKAGE);

    const pin = state.chatCharacters[characterId]?.styleName;
    const styleName = (pin && lib[pin]) 
        ? pin 
        : (meta.defaultStyleName && lib[meta.defaultStyleName]) ? meta.defaultStyleName : null;
    
    if (!styleName) return fallback;

    // ─── Workspace Priority (The Sandbox) ───
    // We check the workspace first so that "dirty" content is functional immediately.
    const style = ws[styleName] || lib[styleName];

    if (style) {
        return {
            template:           style.template           || DEFAULT_VN_STYLE_SUFFIX,
            loras:              style.loras              || [],
            negativePrompt:     style.negativePrompt     || '',
            engine:             style.engine             || DEFAULT_STYLE_PACKAGE.engine,
            model:              style.model              || DEFAULT_STYLE_PACKAGE.model,
            engineParams:       style.engineParams       || {},
            useLayerDiffuse:    !!style.useLayerDiffuse,
            resolutionOverride: style.resolutionOverride || null
        };
    }
    
    return fallback;
}

/**
 * Pure helper to serialize a slot value (object or string) into a prompt fragment.
 * Concatenates modifier and item with a space.
 */
function _serialize(val) {
    if (!val) return '';
    if (typeof val === 'string') return val;
    const item = val.item;
    const mod  = val.modifier;
    if (!item || item === 'None' || item === 'KEEP') return '';
    return (mod && mod !== 'None' && mod !== 'KEEP') ? `${mod} ${item}` : item;
}

/**
 * Compiles visual variables into a final prompt string using the Dynamic Iterator Pattern.
 * Supports template variables: {{identity_anchor}}, {{layers_description}},
 * {{emotion}}, {{pose}}, and any character-specific {{slot_key}}.
 * 
 * @param {object} layers - The character's current visual state (slots).
 * @param {string} anchor - Physical identity features.
 * @param {string} emotion - Current emotion label.
 * @param {string} pose - Current pose description.
 * @param {string} template - The style template string to use.
 * @returns {string}
 */
export function finalizePrompt(layers, anchor = '', emotion = '', pose = '', template = '') {
    let result = template || getSettings().vnStyleSuffix || '';
    const usedKeys = new Set();

    // 1. Replace Core Meta-Variables
    const core = {
        identity_anchor: anchor,
        emotion: emotion,
        pose: pose
    };

    for (const [key, val] of Object.entries(core)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
        if (regex.test(result)) {
            result = result.replace(regex, val || '');
            usedKeys.add(key);
        }
    }

    // 2. Dynamic Slot Replacement (Explicit Consumption)
    // We iterate over every slot defined in the visual state.
    for (const [key, val] of Object.entries(layers || {})) {
        // Skip keys already handled or technically reserved
        if (core.hasOwnProperty(key) || key === 'layers_description') continue;

        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
        if (regex.test(result)) {
            result = result.replace(regex, _serialize(val));
            usedKeys.add(key);
        }
    }

    // 3. Overflow Bucket (The Remaining Wardrobe)
    // Gather all populated slots that were NOT explicitly requested in the template.
    const overflow = [];
    for (const [key, val] of Object.entries(layers || {})) {
        if (core.hasOwnProperty(key) || usedKeys.has(key) || key === 'layers_description') continue;
        
        const fragment = _serialize(val);
        if (fragment) overflow.push(fragment);
    }

    const overflowStr = overflow.join(', ');
    result = result.replace(/\{\{layers_description\}\}/gi, overflowStr);

    // 4. Stale Placeholder Cleanup & Formatting
    // Strip any remaining {{variable}} tags and clean up whitespace/commas.
    return result
        .replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '')
        .replace(/(,\s*)+/g, ', ')
        .trim();
}