/**
 * @file data/default-user/extensions/personalyze/io/dnaWriter.js
 * @stamp {"utc":"2026-04-07T12:00:00.000Z"}
 * @architectural-role IO Executor / DNA Chain Writer
 * @description
 * Handles all writes to message.extra.personalyze with integrated concurrency 
 * locking. Implements the Array Pattern for event storage to allow character 
 * definitions, outfit discoveries, and state transitions to coexist on a single turn.
 * 
 * Includes on-the-fly migration for legacy V1 pointer records.
 *
 * @api-declaration
 * lockedWriteCharacterDef(messageId, characterId, anchor, seed)
 * lockedWriteOutfitDef(messageId, characterId, key, label, desc, provider)
 * lockedWriteExpressionDef(messageId, characterId, key, label, desc)
 * lockedWriteVisualState(messageId, characterId, outfit, expression, image)
 * lockedPatchVisualStateImage(messageId, characterId, filename)
 * lockedWriteRoster(messageId, roster)
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

/**
 * Ensures message.extra.personalyze is a valid array, migrating old V1 flat 
 * objects into the new DNA event format if found.
 * @param {object} message 
 */
function ensureArray(message) {
    message.extra = message.extra ?? {};
    const existing = message.extra.personalyze;

    if (!existing) {
        message.extra.personalyze = [];
    } else if (!Array.isArray(existing)) {
        // Migration: Translate legacy flat pointer into an array of events
        const migrated = [];
        
        // Preserve Roster state if it was recorded here
        if (existing.roster) {
            migrated.push({ type: 'roster', roster: existing.roster });
        }
        
        // Preserve Visual State pointer
        if (existing.characterId) {
            migrated.push({
                type: 'visual_state',
                characterId: existing.characterId,
                outfit: existing.outfit,
                expression: existing.expression,
                image: existing.image ?? null
            });
        }
        
        message.extra.personalyze = migrated;
    }
}

/**
 * Writes a character identity definition (Anchor & Seed) to the DNA chain.
 * @param {number} messageId 
 * @param {string} characterId 
 * @param {string} anchor 
 * @param {number} seed 
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
 * Writes an outfit definition to the DNA chain.
 * @param {number} messageId 
 * @param {string} characterId 
 * @param {string} key 
 * @param {string} label 
 * @param {string} description 
 * @param {string} provider 
 */
export async function lockedWriteOutfitDef(messageId, characterId, key, label, description, provider) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            ensureArray(message);
            message.extra.personalyze.push({
                type: 'outfit_def',
                characterId,
                key,
                label,
                description,
                provider: provider || 'pollinations'
            });
            await saveChatConditional();
        }
    } finally {
        writeLock.release();
    }
}

/**
 * Writes a custom expression definition to the DNA chain.
 * @param {number} messageId 
 * @param {string} characterId 
 * @param {string} key 
 * @param {string} label 
 * @param {string} description 
 */
export async function lockedWriteExpressionDef(messageId, characterId, key, label, description) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            ensureArray(message);
            message.extra.personalyze.push({
                type: 'expression_def',
                characterId,
                key,
                label,
                description
            });
            await saveChatConditional();
        }
    } finally {
        writeLock.release();
    }
}

/**
 * Writes a visual state transition to the DNA chain.
 * Indicates that the character is now wearing a specific outfit and showing an expression.
 * Uses the Two-Write pattern (image is initially null).
 * 
 * @param {number} messageId 
 * @param {string} characterId 
 * @param {string} outfit 
 * @param {string} expression 
 * @param {string|null} image 
 */
export async function lockedWriteVisualState(messageId, characterId, outfit, expression, image = null) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            ensureArray(message);
            message.extra.personalyze.push({
                type: 'visual_state',
                characterId,
                outfit,
                expression,
                image
            });
            await saveChatConditional();
        }
    } finally {
        writeLock.release();
    }
}

/**
 * Patches the image field of an existing visual state record once async generation completes.
 * Scans backwards to find the most recent state for the given character.
 * 
 * @param {number} messageId 
 * @param {string} characterId 
 * @param {string} filename 
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
 * @param {number} messageId 
 * @param {string[]} roster 
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