/**
 * @file data/default-user/extensions/personalyze/io/image/compiler.js
 * @stamp {"utc":"2026-04-17T13:55:00.000Z"}
 * @architectural-role State Derivation (Visual Requirements)
 * @description
 * Handles resolution measurement and prompt synthesis.
 * Determines the target dimensions based on UI footprint or style overrides,
 * and compiles template variables into a final prompt string.
 * 
 * Updated for Granular Identity Architecture:
 * 1. Updated finalizePrompt to accept the identity map.
 * 2. Implemented dynamic variable injection for every key in the identity map.
 * 3. Maintained {{identity_anchor}} as a joined fallback for backward compatibility.
 * 
 * @api-declaration
 * resolveDimensions(characterId, styleObj) -> { width: number, height: number }
 * resolveStyle(characterId) -> Object (The expanded Style Package)
 * finalizePrompt(subjectPrompt, identity, emotion, pose, template) -> string
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
import { compileIdentityString } from '../../logic/parsers.js';

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
 * Compiles visual variables into a final prompt string.
 * Supports template variables: {{hair}}, {{face}}, {{identity_anchor}}, 
 * {{layers_description}}, {{emotion}}, {{pose}}.
 * 
 * Uses 'gi' regex flags for case-insensitive replacement.
 * 
 * @param {string} subjectPrompt - The layered description (outfit).
 * @param {Object|string} identity - Granular physical traits map or legacy anchor string.
 * @param {string} emotion - Current emotion label.
 * @param {string} pose - Current pose description.
 * @param {string} template - The style template string to use.
 * @returns {string}
 */
export function finalizePrompt(subjectPrompt, identity, emotion = '', pose = '', template = '') {
    const effectiveStyle = template || getSettings().vnStyleSuffix || '';
    
    let result = effectiveStyle;

    // 1. Physical Identity Logic
    if (identity && typeof identity === 'object') {
        // Granular Injection: Replace {{hair}}, {{face}}, etc.
        for (const [key, val] of Object.entries(identity)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
            result = result.replace(regex, val || '');
        }
        
        // Joined Fallback: Replace {{identity_anchor}} with compiled string
        const joinedAnchor = compileIdentityString(identity);
        result = result.replace(/\{\{identity_anchor\}\}/gi, joinedAnchor);
    } else {
        // Legacy Fallback if passed a string
        result = result.replace(/\{\{identity_anchor\}\}/gi, identity || '');
    }

    // 2. Narrative Variable Injection
    return result
        .replace(/\{\{layers_description\}\}/gi, subjectPrompt)
        .replace(/\{\{emotion\}\}/gi, emotion)
        .replace(/\{\{pose\}\}/gi, pose)
        .replace(/(,\s*)+/g, ', ')
        .trim();
}