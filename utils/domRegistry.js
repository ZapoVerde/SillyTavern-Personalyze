/**
 * @file data/default-user/extensions/personalyze/utils/domRegistry.js
 * @stamp {"utc":"2026-04-14T22:40:00.000Z"}
 * @architectural-role Pure Logic / DOM ID Provider
 * @description
 * Single Source of Truth for generating technical DOM identifiers.
 * Prevents "broken linkage" in the UI by ensuring IDs are sanitized (slugified)
 * and deterministic across all modules.
 * 
 * @api-declaration
 * getDatalistId(charId, slotKey) -> string
 * 
 * @contract
 *   assertions:
 *     purity: Pure Function
 *     state_ownership: []
 *     external_io: []
 */

import { slugify } from './history.js';

/**
 * Generates a web-safe, deterministic ID for a character-specific slot datalist.
 * Strips spaces and special characters from character names and slot keys to
 * ensure valid HTML 'id' and 'list' attribute connections.
 * 
 * @param {string} charId - The canonical ID or display label of the character.
 * @param {string} slotKey - The technical key for the category (e.g., 'top', 'emotion').
 * @returns {string} - A sanitized string (e.g., "plz-list-sylvanas_windrunner-top").
 */
export function getDatalistId(charId, slotKey) {
    const safeChar = slugify(charId);
    const safeSlot = slugify(slotKey);
    return `plz-list-${safeChar}-${safeSlot}`;
}