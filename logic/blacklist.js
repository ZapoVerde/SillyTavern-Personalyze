/**
 * @file data/default-user/extensions/personalyze/logic/blacklist.js
 * @stamp {"utc":"2026-04-10T19:30:00.000Z"}
 * @architectural-role Stateful Owner (Session-Only)
 * @description
 * Manages temporary, in-memory blacklists and process guards for character detection.
 * 
 * Includes:
 * 1. Ignored Subjects: Names the user chose to skip (cleared on scene change).
 * 2. Pending Subjects: Names currently being handled by the Archivist modal 
 *    (prevents race conditions during swipes or rapid message delivery).
 *
 * @api-declaration
 * ignore(name)        — Adds a name to the ignored list.
 * isIgnored(name)     — Checks if a name is blacklisted.
 * addPending(name)    — Marks a name as "awaiting resolution".
 * removePending(name) — Clears a name from the "awaiting resolution" list.
 * isPending(name)     — Checks if a modal is already open for this name.
 * clearIgnored()      — Flushes the ignore list (called on scene change).
 *
 * @contract
 *   assertions:
 *     purity: Stateful Owner (Runtime only)
 *     state_ownership: [_ignored, _pending]
 *     external_io: []
 */

/** Set of names explicitly ignored by the user in this scene. */
const _ignored = new Set();

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
 * Blacklists a name for the remainder of the current scene.
 * @param {string} name 
 */
export function ignore(name) {
    if (!name) return;
    _ignored.add(normalize(name));
}

/**
 * Checks if a name is in the ignore blacklist.
 * @param {string} name 
 * @returns {boolean}
 */
export function isIgnored(name) {
    return _ignored.has(normalize(name));
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
 * Clears the temporary ignore blacklist. 
 * Should be called whenever a scene change is detected.
 */
export function clearIgnored() {
    _ignored.clear();
}