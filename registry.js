/**
 * @file data/default-user/extensions/personalyze/registry.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role Stateful Owner (Global Registry)
 * @description
 * Single gatekeeper for all reads and writes to extension_settings.personalyze.
 *
 * Stores the Global Character Portfolio: the identity anchors, outfit definitions,
 * and expression definitions that persist across all chats. Character data is keyed
 * by the character's slugified avatar filename.
 *
 * STRICT CONTRACT:
 * 1. This module is the ONLY module permitted to mutate 'extension_settings.personalyze'.
 * 2. External modules MUST use the provided Setter API for all updates.
 * 3. External modules may READ via the getter functions.
 * 4. Dictionary keys (outfit keys, expression keys) are immutable once created.
 *    Only the 'label' field on an entry may be updated post-creation.
 *
 * @api-declaration
 * initRegistry()                                    — Initializes or migrates the settings structure.
 * getCharacter(characterId)                         — Returns the full character record or null.
 * getAllCharacterIds()                               — Returns all registered character IDs.
 * upsertCharacter(characterId, anchor)              — Creates or updates an identity anchor.
 * setCharacterSeed(characterId, seed)               — Sets the image generation seed (1–98) for a character.
 * upsertOutfit(characterId, key, label, description) — Adds or updates an outfit definition.
 * upsertExpression(characterId, key, label, description) — Adds or updates an expression definition.
 * getOutfit(characterId, outfitKey)                 — Returns a single outfit entry or null.
 * getExpression(characterId, expressionKey)         — Returns a single expression entry or null.
 *
 * @contract
 *   assertions:
 *     purity: Stateful
 *     state_ownership: [extension_settings.personalyze]
 *     external_io: [saveSettingsDebounced]
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
 * Safe to call on every load; performs no destructive migrations.
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
 * The key is immutable — if it already exists only the label and description are updated.
 * @param {string} characterId
 * @param {string} key          Immutable slug key (e.g. "red_dress").
 * @param {string} label        Display name shown in the UI (e.g. "Red Evening Dress").
 * @param {string} description  Visual description used in image generation prompts.
 */
export function upsertOutfit(characterId, key, label, description) {
    const character = getRoot().characters[characterId];
    if (!character) {
        warn('Registry', `upsertOutfit called for unknown character: "${characterId}"`);
        return;
    }
    character.outfits[key] = { label, description };
    saveSettingsDebounced();
}

/**
 * Adds or updates an expression definition in a character's portfolio.
 * The key is immutable — if it already exists only the label and description are updated.
 * @param {string} characterId
 * @param {string} key          Immutable slug key (e.g. "tearful_smile").
 * @param {string} label        Display name shown in the UI (e.g. "Tearful Smile").
 * @param {string} description  Visual description used in image generation prompts.
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
