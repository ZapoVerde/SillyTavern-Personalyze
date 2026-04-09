/**
 * @file data/default-user/extensions/personalyze/io/dnaWriter.js
 * @stamp {"utc":"2026-04-10T13:00:00.000Z"}
 * @architectural-role IO Executor / DNA Chain Writer
 * @description
 * Handles all writes to message.extra.personalyze with integrated concurrency 
 * locking. Implements the Array Pattern for the Layered State Pipeline.
 * 
 * Supports writing character identities, ensemble snapshots, and 5-slot 
 * visual transitions (outerwear, top, bottom, accessories, emotion).
 *
 * @api-declaration
 * lockedWriteCharacterDef(messageId, characterId, anchor, seed)
 * lockedWriteEnsemble(messageId, characterId, key, label, layers)
 * lockedWriteVisualState(messageId, characterId, layers, image)
 * lockedPatchVisualStateImage(messageId, characterId, filename)
 * lockedWriteRoster(messageId, roster)
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: [Mutex Queue]
 *     external_io: [message.extra.personalyze (write), saveChatConditional()]
 */

import { saveChatConditional } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { AsyncLock } from '../utils/lock.js';

/** Singleton mutex for all PLZ chat write operations. */
const writeLock = new AsyncLock();

/**
 * Ensures message.extra.personalyze is a valid array.
 */
function ensureArray(message) {
    message.extra = message.extra ?? {};
    const existing = message.extra.personalyze;

    if (!existing) {
        message.extra.personalyze = [];
    } else if (!Array.isArray(existing)) {
        // Migration: Translate legacy flat pointer into new DNA array
        const migrated = [];
        if (existing.roster) migrated.push({ type: 'roster', roster: existing.roster });
        if (existing.characterId) {
            migrated.push({
                type: 'visual_state',
                characterId: existing.characterId,
                layers: {
                    outerwear: null,
                    top: { item: existing.outfit || 'clothes', modifier: null },
                    bottom: null,
                    accessories: null,
                    emotion: existing.expression || 'neutral'
                },
                image: existing.image ?? null
            });
        }
        message.extra.personalyze = migrated;
    }
}

/**
 * Writes a character identity definition to the DNA chain.
 */
export async function lockedWriteCharacterDef(messageId, characterId, anchor, seed) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            ensureArray(message);
            message.extra.personalyze.push({
                type: 'character_def',
                characterId,
                anchor,
                seed
            });
            await saveChatConditional();
        }
    } finally {
        writeLock.release();
    }
}

/**
 * Writes an ensemble (layered state snapshot) to the DNA chain.
 */
export async function lockedWriteEnsemble(messageId, characterId, key, label, layers) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            ensureArray(message);
            message.extra.personalyze.push({
                type: 'ensemble_def',
                characterId,
                key,
                label,
                layers: structuredClone(layers)
            });
            await saveChatConditional();
        }
    } finally {
        writeLock.release();
    }
}

/**
 * Writes a layered visual state transition to the DNA chain.
 * Indicates the character's full 5-slot appearance at this turn.
 */
export async function lockedWriteVisualState(messageId, characterId, layers, image = null) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            ensureArray(message);
            message.extra.personalyze.push({
                type: 'visual_state',
                characterId,
                layers: structuredClone(layers),
                image
            });
            await saveChatConditional();
        }
    } finally {
        writeLock.release();
    }
}

/**
 * Patches the image field of an existing visual state record.
 */
export async function lockedPatchVisualStateImage(messageId, characterId, filename) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            ensureArray(message);
            const records = message.extra.personalyze;
            for (let i = records.length - 1; i >= 0; i--) {
                if (records[i].type === 'visual_state' && records[i].characterId === characterId) {
                    records[i].image = filename;
                    await saveChatConditional();
                    break;
                }
            }
        }
    } finally {
        writeLock.release();
    }
}

/**
 * Writes a roster update to the DNA chain.
 */
export async function lockedWriteRoster(messageId, roster) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            ensureArray(message);
            message.extra.personalyze.push({
                type: 'roster',
                roster: [...roster]
            });
            await saveChatConditional();
        }
    } finally {
        writeLock.release();
    }
}