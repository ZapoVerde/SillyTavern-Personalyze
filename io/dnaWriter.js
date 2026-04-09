/**
 * @file data/default-user/extensions/personalyze/io/dnaWriter.js
 * @stamp {"utc":"2026-04-10T19:00:00.000Z"}
 * @architectural-role IO Executor / DNA Chain Writer
 * @description
 * Handles all writes to message.extra.personalyze with integrated concurrency 
 * locking. Implements the Array Pattern for the Layered State Pipeline.
 * 
 * Updated to support AKA alias updates, default ensemble (everyday wear) settings,
 * and ensemble deletion tombstones.
 *
 * @api-declaration
 * lockedWriteCharacterDef(messageId, characterId, anchor, seed)
 * lockedWriteEnsemble(messageId, characterId, key, label, layers)
 * lockedWriteVisualState(messageId, characterId, layers, image)       → recordId (string)
 * lockedPatchVisualStateImage(messageId, characterId, filename, recordId?)
 * lockedWriteRoster(messageId, roster)
 * lockedWriteAka(messageId, characterId, akaList)
 * lockedDeleteEnsemble(messageId, characterId, key)
 * lockedWriteDefaultEnsemble(messageId, characterId, ensembleKey)
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
    if (!message.extra.personalyze || !Array.isArray(message.extra.personalyze)) {
        message.extra.personalyze = [];
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
 * Returns the generated record ID so the caller can patch the exact record later.
 */
export async function lockedWriteVisualState(messageId, characterId, layers, image = null) {
    const recordId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            ensureArray(message);
            message.extra.personalyze.push({
                type: 'visual_state',
                _id: recordId,
                characterId,
                layers: structuredClone(layers),
                image
            });
            await saveChatConditional();
        }
    } finally {
        writeLock.release();
    }
    return recordId;
}

/**
 * Patches the image field of an existing visual state record.
 * If recordId is provided, targets that exact record. Otherwise falls back
 * to the last visual_state for the given characterId (for workshop manual saves).
 */
export async function lockedPatchVisualStateImage(messageId, characterId, filename, recordId = null) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            ensureArray(message);
            const records = message.extra.personalyze;
            for (let i = records.length - 1; i >= 0; i--) {
                const rec = records[i];
                if (rec.type !== 'visual_state' || rec.characterId !== characterId) continue;
                if (recordId && rec._id !== recordId) continue;
                rec.image = filename;
                await saveChatConditional();
                break;
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

/**
 * Writes a character's alias (AKA) list to the DNA chain.
 */
export async function lockedWriteAka(messageId, characterId, akaList) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            ensureArray(message);
            message.extra.personalyze.push({
                type: 'aka_update',
                characterId,
                aka: [...akaList]
            });
            await saveChatConditional();
        }
    } finally {
        writeLock.release();
    }
}

/**
 * Writes an ensemble deletion tombstone to the DNA chain.
 */
export async function lockedDeleteEnsemble(messageId, characterId, key) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            ensureArray(message);
            message.extra.personalyze.push({
                type: 'ensemble_delete',
                characterId,
                key
            });
            await saveChatConditional();
        }
    } finally {
        writeLock.release();
    }
}

/**
 * Marks a specific ensemble as the default (everyday wear) for a character.
 */
export async function lockedWriteDefaultEnsemble(messageId, characterId, ensembleKey) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            ensureArray(message);
            message.extra.personalyze.push({
                type: 'default_ensemble_set',
                characterId,
                key: ensembleKey
            });
            await saveChatConditional();
        }
    } finally {
        writeLock.release();
    }
}