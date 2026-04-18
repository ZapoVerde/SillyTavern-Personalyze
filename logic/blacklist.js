/**
 * @file data/default-user/extensions/personalyze/logic/blacklist.js
 * @stamp {"utc":"2026-04-18T00:00:00.000Z"}
 * @architectural-role Stateful Owner (Session-Only)
 * @description
 * Manages temporary, in-memory blacklists and process guards for character detection.
 *
 * Includes:
 * 1. Ignored Subjects: Names the user chose to skip (cleared on scene change).
 *    - Permanent ignores (Archivist "Ignore" action) use Infinity as expiry.
 *    - Snoozed subjects use a numeric message ID as expiry — ignored until that turn.
 * 2. Pending Subjects: Names currently being handled by the Archivist modal
 *    (prevents race conditions during swipes or rapid message delivery).
 *
 * @api-declaration
 * ignore(name)                      — Permanently ignores a name for this scene.
 * snooze(name, expiryMessageId)     — Ignores a name until a specific turn ID.
 * isIgnored(name, currentMessageId) — Checks if a name is currently blacklisted.
 * addPending(name)                  — Marks a name as "awaiting resolution".
 * removePending(name)               — Clears a name from the "awaiting resolution" list.
 * isPending(name)                   — Checks if a modal is already open for this name.
 * clearIgnored()                    — Flushes the ignore list (called on scene change).
 *
 * @contract
 *   assertions:
 *     purity: Stateful Owner (Runtime only)
 *     state_ownership: [_ignored, _pending]
 *     external_io: []
 */

/** Map of normalized name/id → expiry messageId. Infinity = permanent for this scene. */
const _ignored = new Map();

/** Set of names currently being processed by an open Archivist modal. */
const _pending = new Set();

/**
 * Normalizes names for case-insensitive comparison.
 * @param {string} name
 * @returns {string}
 */
function normalize(name) {
    return (name ?? '').trim().toLowerCase();
}

/**
 * Permanently blacklists a name for the remainder of the current scene.
 * Called by the Archivist when the user selects "Ignore".
 * @param {string} name
 */
export function ignore(name) {
    if (!name) return;
    _ignored.set(normalize(name), Infinity);
}

/**
 * Temporarily blacklists a name until a specific message turn.
 * Called when the user selects "Snooze" in the Heuristic Approval Modal.
 * @param {string} name - The character label or ID to snooze.
 * @param {number} expiryMessageId - The turn at which the snooze expires (exclusive).
 */
export function snooze(name, expiryMessageId) {
    if (!name) return;
    _ignored.set(normalize(name), expiryMessageId);
}

/**
 * Checks if a name is currently blacklisted.
 * A snoozed entry is ignored as long as currentMessageId < expiryMessageId.
 * A permanently ignored entry (Infinity) is always ignored until scene change.
 * @param {string} name
 * @param {number} [currentMessageId] - The current turn's message index.
 * @returns {boolean}
 */
export function isIgnored(name, currentMessageId = Infinity) {
    const expiry = _ignored.get(normalize(name));
    if (expiry === undefined) return false;
    return currentMessageId < expiry;
}

/**
 * Marks a name as currently pending user resolution in a modal.
 * Used to prevent duplicate Archivist popups for the same unknown subject.
 * @param {string} name
 */
export function addPending(name) {
    if (!name) return;
    _pending.add(normalize(name));
}

/**
 * Unmarks a name as pending. Called when the Archivist modal resolves.
 * @param {string} name
 */
export function removePending(name) {
    _pending.delete(normalize(name));
}

/**
 * Checks if a name is already awaiting resolution.
 * @param {string} name
 * @returns {boolean}
 */
export function isPending(name) {
    return _pending.has(normalize(name));
}

/**
 * Clears the temporary ignore blacklist including all snooze timers.
 * Should be called whenever a scene change is detected.
 */
export function clearIgnored() {
    _ignored.clear();
}
