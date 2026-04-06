/**
 * @file data/default-user/extensions/personalyze/registry.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role Stateful Owner (Global Registry)
 * @description
 * Single gatekeeper for all reads and writes to extension_settings.personalyze.
 * 
 * Stores the Global Character Portfolio. Character data is keyed by the 
 * character's slugified avatar filename.
 * 
 * Updated to support per-outfit image generation providers (Pollinations/HF).
 *
 * @api-declaration
 * initRegistry()                                    — Initializes or migrates the settings structure.
 * getCharacter(characterId)                         — Returns the full character record or null.
 * getAllCharacterIds()                               — Returns all registered character IDs.
 * upsertCharacter(characterId, anchor)              — Creates or updates an identity anchor.
 * setCharacterSeed(characterId, seed)               — Sets the image generation seed (1–98) for a character.
 * upsertOutfit(characterId, key, label, description, provider) — Adds/updates outfit with provider flag.
 * upsertExpression(characterId, key, label, description) — Adds or updates an expression definition.
 * getOutfit(characterId, outfitKey)                 — Returns a single outfit entry or null.
 * getExpression(characterId, expressionKey)         — Returns a single expression entry or null.
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { log, warn } from './utils/logger.js';
import { initSettings } from './settings.js';

const EXT_NAME = 'personalyze';

/**
 * Returns the root registry object.
 * @returns {object}
 */
function getRoot() {
    return extension_settings[EXT_NAME];
}

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * Ensures the extension_settings.personalyze structure exists and is valid.
 */
export function initRegistry() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = {};
    }

    const root = getRoot();

    if (!root.characters) {
        log('Registry', 'Creating fresh character registry...');
        root.characters = {};
        saveSettingsDebounced();
    }

    initSettings();

    log('Registry', `Initialized. ${Object.keys(root.characters).length} character(s) registered.`);
}

// ─── Getters ──────────────────────────────────────────────────────────────────

/**
 * Returns the full record for a character, or null if not registered.
 * @param {string} characterId
 * @returns {object|null}
 */
export function getCharacter(characterId) {
    return getRoot().characters[characterId] ?? null;
}

/**
 * Returns all registered character IDs.
 * @returns {string[]}
 */
export function getAllCharacterIds() {
    return Object.keys(getRoot().characters);
}

/**
 * Returns a single outfit entry for a character, or null.
 * @param {string} characterId
 * @param {string} outfitKey
 * @returns {object|null}
 */
export function getOutfit(characterId, outfitKey) {
    return getRoot().characters[characterId]?.outfits[outfitKey] ?? null;
}

/**
 * Returns a single expression entry for a character, or null.
 * @param {string} characterId
 * @param {string} expressionKey
 * @returns {object|null}
 */
export function getExpression(characterId, expressionKey) {
    return getRoot().characters[characterId]?.expressions[expressionKey] ?? null;
}

// ─── Setters ──────────────────────────────────────────────────────────────────

/**
 * Creates a character record if one does not exist, or updates the identity anchor.
 * @param {string} characterId  The immutable slug key (avatar filename slug).
 * @param {string} anchor       A natural-language description of the character's permanent appearance.
 */
export function upsertCharacter(characterId, anchor) {
    const root = getRoot();
    if (!root.characters[characterId]) {
        root.characters[characterId] = {
            identityAnchor: anchor,
            seed: 1,
            outfits: {},
            expressions: {},
        };
        log('Registry', `New character registered: "${characterId}"`);
    } else {
        root.characters[characterId].identityAnchor = anchor;
        log('Registry', `Identity anchor updated for: "${characterId}"`);
    }
    saveSettingsDebounced();
}

/**
 * Sets the image generation seed for a character. Clamped to 1–98.
 * @param {string} characterId
 * @param {number} seed
 */
export function setCharacterSeed(characterId, seed) {
    const character = getRoot().characters[characterId];
    if (!character) {
        warn('Registry', `setCharacterSeed called for unknown character: "${characterId}"`);
        return;
    }
    character.seed = Math.max(1, Math.min(98, Math.round(Number(seed)) || 1));
    saveSettingsDebounced();
}

/**
 * Adds or updates an outfit definition in a character's portfolio.
 * The key is immutable — if it already exists only the label, description, and provider are updated.
 * 
 * @param {string} characterId
 * @param {string} key          Immutable slug key (e.g. "red_dress").
 * @param {string} label        Display name shown in the UI.
 * @param {string} description  Visual description (supports <lora:name> tags).
 * @param {'pollinations'|'huggingface'} [provider='pollinations'] The image generation provider.
 */
export function upsertOutfit(characterId, key, label, description, provider = 'pollinations') {
    const character = getRoot().characters[characterId];
    if (!character) {
        warn('Registry', `upsertOutfit called for unknown character: "${characterId}"`);
        return;
    }
    character.outfits[key] = { 
        label, 
        description, 
        provider: provider || 'pollinations' 
    };
    saveSettingsDebounced();
}

/**
 * Adds or updates an expression definition in a character's portfolio.
 * @param {string} characterId
 * @param {string} key
 * @param {string} label
 * @param {string} description
 */
export function upsertExpression(characterId, key, label, description) {
    const character = getRoot().characters[characterId];
    if (!character) {
        warn('Registry', `upsertExpression called for unknown character: "${characterId}"`);
        return;
    }
    character.expressions[key] = { label, description };
    saveSettingsDebounced();
}