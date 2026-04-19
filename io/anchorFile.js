/**
 * @file data/default-user/extensions/personalyze/io/anchorFile.js
 * @stamp {"utc":"2026-04-19T00:00:00.000Z"}
 * @architectural-role IO Utility (Anchor Persistence)
 * @description
 * Reads and writes the per-character PLZ anchor to extension_settings.
 *
 * The anchor bridges across chat file boundaries. It records the UUID of the
 * last active chat for a given ST character card, plus a snapshot of every
 * PLZ character definition and the active roster from that chat.
 *
 * Boot-time usage:
 *   - If a new chat has no chat_uuid DNA → seed state from anchor, then write
 *     the UUID and character_def records into the first AI message.
 *   - If a new chat has a matching UUID   → same chat, update anchor normally.
 *   - If a new chat has a different UUID  → different chat, anchor updates to
 *     reflect the newly active chat; old chat's DNA is self-documenting.
 *
 * @api-declaration
 * readAnchor(avatarKey)                                             → PlzAnchor | null
 * writeAnchor(avatarKey, chatUuid, chatCharacters, activeRoster)   → void
 * clearAnchor(avatarKey)                                           → void
 *
 * @contract
 *   assertions:
 *     purity: IO Utility
 *     state_ownership: [extension_settings.personalyze.chatAnchors]
 *     external_io: [saveSettingsDebounced]
 */

import { extension_settings } from '../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../../script.js';

const EXT_NAME    = 'personalyze';
const ANCHORS_KEY = 'chatAnchors';

/**
 * Returns the chatAnchors map from extension_settings, creating it if absent.
 * @returns {Record<string, PlzAnchor>}
 */
function getAnchorsRoot() {
    const root = extension_settings[EXT_NAME];
    if (!root[ANCHORS_KEY]) root[ANCHORS_KEY] = {};
    return root[ANCHORS_KEY];
}

/**
 * Returns the stored anchor for a character card, or null if none exists.
 *
 * @typedef {{ chatUuid: string, chatCharacters: object, activeRoster: string[], updatedAt: number }} PlzAnchor
 * @param {string} avatarKey - char.avatar filename, e.g. "elara.png"
 * @returns {PlzAnchor | null}
 */
export function readAnchor(avatarKey) {
    if (!avatarKey) return null;
    return getAnchorsRoot()[avatarKey] ?? null;
}

/**
 * Writes (or overwrites) the anchor for a character card.
 * Saves extension_settings immediately via debounce.
 *
 * @param {string}   avatarKey       - char.avatar filename
 * @param {string}   chatUuid        - UUID of the currently active chat
 * @param {object}   chatCharacters  - full state.chatCharacters map to snapshot
 * @param {string[]} activeRoster    - state.activeRoster at time of write
 */
export function writeAnchor(avatarKey, chatUuid, chatCharacters, activeRoster) {
    if (!avatarKey || !chatUuid) return;
    getAnchorsRoot()[avatarKey] = {
        chatUuid,
        chatCharacters: structuredClone(chatCharacters ?? {}),
        activeRoster:   [...(activeRoster ?? [])],
        updatedAt:      Date.now(),
    };
    saveSettingsDebounced();
}

/**
 * Removes the anchor for a character card.
 * Called when the user explicitly starts fresh (future: settings panel button).
 *
 * @param {string} avatarKey
 */
export function clearAnchor(avatarKey) {
    if (!avatarKey) return;
    delete getAnchorsRoot()[avatarKey];
    saveSettingsDebounced();
}
