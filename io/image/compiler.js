/**
 * @file data/default-user/extensions/personalyze/io/image/compiler.js
 * @stamp {"utc":"2026-05-01T22:05:00.000Z"}
 * @architectural-role State Derivation (Visual Requirements)
 * @description
 * Handles resolution measurement and prompt synthesis.
 * Determines the target dimensions based on UI footprint or style overrides,
 * and compiles template variables into a final prompt string.
 * 
 * Updated for Reactive Logic Engine:
 * 1. Added Phase 3.5 to finalizePrompt to inject resolved logic probe values.
 * 
 * Updated with Forensic Tracing:
 * 1. Added console groups for prompt compilation observability.
 * 2. Added explicit logging for Logic Probe injection and template source.
 * 
 * @api-declaration
 * resolveDimensions(characterId, styleObj) -> { width: number, height: number }
 * resolveStyle(characterId) -> Object (The expanded Style Package)
 * finalizePrompt(layers, identityMap, emotion, pose, template) -> string
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
            resolutionOverride: style.resolutionOverride || null,
            logicProbes:        style.logicProbes        || {}
        };
    }
    
    return fallback;
}

/**
 * Serializes a wardrobe slot value into a prompt fragment.
 * Format: "item (modifier)" or just "item" if no modifier.
 */
function _serialize(val) {
    if (!val) return '';
    if (typeof val === 'string') return val;
    const item = val.item;
    const mod  = val.modifier;
    if (!item || item === 'None' || item === 'KEEP') return '';
    return (mod && mod !== 'None' && mod !== 'KEEP') ? `${item} (${mod})` : item;
}

/**
 * Compiles visual variables into a final prompt string.
 *
 * Supports:
 *   {{emotion}}, {{pose}}                     — core meta
 *   {{hair}}, {{eyes}}, {{face}}, etc.        — individual identity fields (just the value)
 *   {{top}}, {{bottom}}, {{outerwear}}, etc.  — individual wardrobe slots ("item (modifier)")
 *   {{is_wet}}, {{holding_weapon}}, etc.      — reactive logic probes (resolved strings)
 *   {{identity_anchor}}                        — overflow of unconsumed identity fields ("Label: value, ...")
 *   {{layers_description}}                     — overflow of unconsumed wardrobe slots ("Label: item (modifier), ...")
 *
 * @param {object} layers     - The character's current visual state (wardrobe slots + emotion/pose).
 * @param {object} identityMap - Granular physical identity map { hair, eyes, face, body, skin, ... }.
 * @param {string} emotion    - Current emotion label.
 * @param {string} pose       - Current pose description.
 * @param {string} template   - The style template string to use.
 * @returns {string}
 */
export function finalizePrompt(layers, identityMap, emotion = '', pose = '', template = '') {
    let result = template || getSettings().vnStyleSuffix || '';
    
    console.group(`[PLZ:Compiler] Finalizing Prompt`);
    console.log("Source Template:", result);

    const usedIdentityKeys = new Set();
    const usedLayerKeys    = new Set();

    // Phase 1: Core meta-variables
    result = result.replace(/\{\{emotion\}\}/gi, emotion || '');
    result = result.replace(/\{\{pose\}\}/gi,    pose    || '');

    // Phase 2: Individual identity field replacement  (e.g. {{hair}}, {{eyes}})
    for (const [key, val] of Object.entries(identityMap || {})) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
        if (regex.test(result)) {
            result = result.replace(regex, (typeof val === 'string' ? val.trim() : '') || '');
            usedIdentityKeys.add(key);
        }
    }

    // Phase 3: Individual wardrobe slot replacement  (e.g. {{top}}, {{bottom}})
    for (const [key, val] of Object.entries(layers || {})) {
        if (key === 'emotion' || key === 'pose' || key === 'identity_anchor' || key === 'layers_description' || key === 'logic') continue;
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
        if (regex.test(result)) {
            result = result.replace(regex, _serialize(val));
            usedLayerKeys.add(key);
        }
    }

    // Phase 3.5: Reactive Logic Probes
    // Injects resolved probe results (strings) into the template.
    const logicMap = layers?.logic || {};
    const logicSummary = [];
    for (const [key, val] of Object.entries(logicMap)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
        if (regex.test(result)) {
            const replacement = String(val ?? '').trim();
            result = result.replace(regex, replacement);
            logicSummary.push({ Token: `{{${key}}}`, Value: replacement });
        }
    }
    
    if (logicSummary.length > 0) {
        console.log("Logic Probes Injected into Template:");
        console.table(logicSummary);
    } else {
        console.log("No Logic Probes tokens found in template.");
    }

    // Phase 4: {{identity_anchor}} — aggregate of unconsumed identity fields
    // Format: "Label: value, Label: value, ..."
    const identityParts = [];
    for (const [key, val] of Object.entries(identityMap || {})) {
        if (usedIdentityKeys.has(key)) continue;
        if (!val || typeof val !== 'string' || !val.trim()) continue;
        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        identityParts.push(`${label}: ${val.trim()}`);
    }
    result = result.replace(/\{\{identity_anchor\}\}/gi, identityParts.join(', '));

    // Phase 5: {{layers_description}} — aggregate of unconsumed wardrobe slots
    // Format: "Label: item (modifier), ..."
    const layerParts = [];
    for (const [key, val] of Object.entries(layers || {})) {
        if (key === 'emotion' || key === 'pose' || key === 'identity_anchor' || key === 'layers_description' || key === 'logic') continue;
        if (usedLayerKeys.has(key) || !val) continue;
        const item = val.item;
        const mod  = val.modifier;
        if (!item || item === 'None' || item === 'KEEP') continue;
        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        layerParts.push((mod && mod !== 'None' && mod !== 'KEEP')
            ? `${label}: ${item} (${mod})`
            : `${label}: ${item}`);
    }
    result = result.replace(/\{\{layers_description\}\}/gi, layerParts.join(', '));

    // Phase 6: Stale placeholder cleanup
    const finalPrompt = result
        .replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '')
        .replace(/(,\s*)+/g, ', ')
        .trim();

    console.log("Final Prompt Sent to API:", finalPrompt);
    console.groupEnd();

    return finalPrompt;
}