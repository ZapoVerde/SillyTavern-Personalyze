/**
 * @file data/default-user/extensions/personalyze/logic/pointerWriter.js
 * @stamp {"utc":"2026-04-05T00:00:00.000Z"}
 * @architectural-role IO Executor / Pointer Writer
 * @description
 * Handles all writes to message.extra.personalyze with integrated concurrency
 * locking. Ensures that simultaneous async operations (e.g. generation completing
 * while the pipeline is mid-turn) do not corrupt the chat record.
 *
 * A pointer record is a flat object written to message.extra.personalyze:
 * {
 *   "characterId":  "claire_the_knight",
 *   "outfit":       "armor",
 *   "expression":   "smug",
 *   "image":        "plz_claire_the_knight_armor_smug.png"  // null until generated
 * }
 *
 * The Two-Write Pattern is used for new generations: the pointer is written
 * immediately with image: null, then patched once the file is ready.
 *
 * @api-declaration
 * lockedWritePointer(messageId, record)       → Promise<void>
 * lockedPatchPointerImage(messageId, filename) → Promise<void>
 * lockedWriteRoster(messageId, roster)        → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [Mutex Queue]
 *     external_io: [message.extra.personalyze (write), saveChatConditional()]
 */

import { saveChatConditional } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { AsyncLock } from '../utils/lock.js';

/** Singleton mutex for all PLZ chat write operations. */
const writeLock = new AsyncLock();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Writes a pointer record to message.extra.personalyze.
 * Overwrites any existing PLZ record on this message (only one pointer per
 * message is valid in V1).
 *
 * @param {number} messageId
 * @param {object} record  { characterId, outfit, expression, image }
 */
export async function lockedWritePointer(messageId, record) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (!message) return;

        message.extra = message.extra ?? {};
        const existingRoster = message.extra.personalyze?.roster;
        message.extra.personalyze = { ...record };
        if (existingRoster !== undefined) {
            message.extra.personalyze.roster = existingRoster;
        }

        await saveChatConditional();
    } finally {
        writeLock.release();
    }
}

/**
 * Writes or updates the roster field on a message's personalyze record.
 * Merges with any existing pointer data on that message so the character
 * pointer and the roster can coexist on the same turn.
 *
 * @param {number}   messageId
 * @param {string[]} roster  The full enabled character ID list at this point.
 */
export async function lockedWriteRoster(messageId, roster) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (!message) return;

        message.extra = message.extra ?? {};
        message.extra.personalyze = {
            ...(message.extra.personalyze ?? {}),
            roster: [...roster],
        };

        await saveChatConditional();
    } finally {
        writeLock.release();
    }
}

/**
 * Patches the image field of an existing pointer record once async
 * generation has completed.
 *
 * Uses the Two-Write Pattern: the initial write sets image: null,
 * and this call updates it once the file is confirmed on disk.
 *
 * @param {number} messageId
 * @param {string} filename
 */
export async function lockedPatchPointerImage(messageId, filename) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (!message?.extra?.personalyze) return;

        message.extra.personalyze.image = filename;

        await saveChatConditional();
    } finally {
        writeLock.release();
    }
}
