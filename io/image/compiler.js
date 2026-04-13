/**
 * @file data/default-user/extensions/personalyze/io/image/compiler.js
 * @stamp {"utc":"2026-04-16T18:50:00.000Z"}
 * @architectural-role State Derivation (Visual Requirements)
 * @description
 * Handles resolution measurement and prompt synthesis.
 * Determines the target dimensions based on UI footprint and compiles 
 * template variables into a final prompt string for image engines.
 * 
 * Updated for Style-Specific Negative Prompts:
 * 1. resolveStyle now returns the complete Style Package including negativePrompt.
 * 
 * @api-declaration
 * resolveDimensions(characterId) -> { width: number, height: number }
 * resolveStyle(characterId) -> { template: string, loras: Array, negativePrompt: string }
 * finalizePrompt(subjectPrompt, anchor, emotion, pose, template) -> string
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
} from '../../defaults.js';
import { getSettings, getMetaSettings } from '../../settings.js';
import { state } from '../../state.js';

/**
 * Resolves the target generation dimensions.
 * Respects devMode, user-selected max tiers, and Dynamic Resolution DOM-measuring.
 * 
 * @param {string} characterId 
 * @returns {{ width: number, height: number }}
 */
export function resolveDimensions(characterId) {
    const s = getSettings();
    if (s.devMode) return { width: DEV_IMAGE_WIDTH, height: DEV_IMAGE_HEIGHT };
    
    const tier = RESOLUTION_TIERS[s.maxResolution] || RESOLUTION_TIERS.MAX;
    if (!s.dynamicResolution) return tier;

    // Measurement logic: find the card in the DOM to see its current display footprint
    const el = document.querySelector(`.plz-portrait-card[data-id="${CSS.escape(characterId)}"]`);
    if (!el || el.clientWidth === 0) return tier; 

    // Snap to multiples of 32 for AI generation safety, clamp between 256x384 and the user's max tier
    const targetW = Math.max(256, Math.min(Math.ceil(el.clientWidth / 32) * 32, tier.width));
    const targetH = Math.max(384, Math.min(Math.ceil(el.clientHeight / 32) * 32, tier.height));
    
    return { width: targetW, height: targetH };
}

/**
 * Retrieves the style package for a character.
 * Checks for character-pinned styles, then the global default style.
 * 
 * @param {string} characterId 
 * @returns {{ template: string, loras: Array, negativePrompt: string }}
 */
export function resolveStyle(characterId) {
    const meta = getMetaSettings();
    const lib = meta.styleLibrary;
    
    const fallback = { 
        template: getSettings().vnStyleSuffix || DEFAULT_VN_STYLE_SUFFIX, 
        loras: [],
        negativePrompt: ''
    };

    if (lib) {
        const pin = state.chatCharacters[characterId]?.styleName;
        const style = (pin && lib[pin]) ? lib[pin] : (meta.defaultStyleName && lib[meta.defaultStyleName]) ? lib[meta.defaultStyleName] : null;
        
        if (style) {
            return {
                template: style.template,
                loras: style.loras || [],
                negativePrompt: style.negativePrompt || ''
            };
        }
    }
    
    return fallback;
}

/**
 * Compiles visual variables into a final prompt string.
 * Supports template variables: {{identity_anchor}}, {{layers_description}},
 * {{emotion}}, {{pose}}.
 * 
 * Uses 'gi' regex flags to ensure case-insensitive replacement.
 * 
 * @param {string} subjectPrompt - The layered description (outfit).
 * @param {string} anchor - Physical identity features.
 * @param {string} emotion - Current emotion label.
 * @param {string} pose - Current pose description.
 * @param {string} template - The style template string to use.
 * @returns {string}
 */
export function finalizePrompt(subjectPrompt, anchor = '', emotion = '', pose = '', template = '') {
    const effectiveStyle = template || getSettings().vnStyleSuffix || '';

    if (effectiveStyle.includes('{{')) {
        return effectiveStyle
            .replace(/\{\{identity_anchor\}\}/gi, anchor)
            .replace(/\{\{layers_description\}\}/gi, subjectPrompt)
            .replace(/\{\{emotion\}\}/gi, emotion)
            .replace(/\{\{pose\}\}/gi, pose)
            .replace(/(,\s*)+/g, ', ')
            .trim();
    }

    // Fallback for legacy static styles
    return `${subjectPrompt}, ${effectiveStyle}`.replace(/(,\s*)+/g, ', ').trim();
}