/**
 * @file data/default-user/extensions/personalyze/logic/importExport.js
 * @stamp {"utc":"2026-04-07T13:10:00.000Z"}
 * @architectural-role Stateful Controller
 * @description
 * Bridges the Global Library and the active Chat DNA.
 * 
 * Handles the cloning of character definitions between the chat log and 
 * the extension settings. All imports are written to the chat log as DNA 
 * events to ensure branch safety and chat portability.
 *
 * @api-declaration
 * handleImportToChat(characterId)  — Clones a library template into chat DNA.
 * handleExportToLibrary(characterId) — Snapshots active chat DNA to global settings.
 * handleSyncRoster(characterId, enable) — Updates the local roster and DNA chain.
 *
 * @contract
 *   assertions:
 *     purity: Stateful Controller
 *     state_ownership: [state (via setters)]
 *     external_io: [library.js, dnaWriter.js, getContext]
 */

import { getContext } from '../../../../extensions.js';
import { 
    state, 
    upsertChatCharacterDef, 
    upsertChatOutfitDef, 
    upsertChatExpressionDef,
    setActiveRoster
} from '../state.js';
import { getLibraryCharacter, saveToLibrary } from '../library.js';
import { 
    lockedWriteCharacterDef, 
    lockedWriteOutfitDef, 
    lockedWriteExpressionDef,
    lockedWriteRoster
} from '../io/dnaWriter.js';
import { log, error } from '../utils/logger.js';

/**
 * Imports a character from the Global Library into the current chat's DNA.
 * Writes the full identity and wardrobe as a chain of events on the last turn.
 * 
 * @param {string} characterId 
 */
export async function handleImportToChat(characterId) {
    const template = getLibraryCharacter(characterId);
    if (!template) {
        error('Import', `Attempted to import unknown character: ${characterId}`);
        return;
    }

    const context = getContext();
    const lastMsgId = Math.max(0, context.chat.length - 1);

    log('Import', `Importing "${characterId}" to chat DNA at turn ${lastMsgId}...`);

    try {
        // 1. Write Identity & Seed
        await lockedWriteCharacterDef(lastMsgId, characterId, template.identityAnchor, template.seed);
        upsertChatCharacterDef(characterId, template.identityAnchor, template.seed);

        // 2. Write all Outfits
        for (const [key, outfit] of Object.entries(template.outfits ?? {})) {
            await lockedWriteOutfitDef(lastMsgId, characterId, key, outfit.label, outfit.description, outfit.provider);
            upsertChatOutfitDef(characterId, key, outfit.label, outfit.description, outfit.provider);
        }

        // 3. Write all Expressions
        for (const [key, expr] of Object.entries(template.expressions ?? {})) {
            await lockedWriteExpressionDef(lastMsgId, characterId, key, expr.label, expr.description);
            upsertChatExpressionDef(characterId, key, expr.label, expr.description);
        }

        // 4. Auto-enable in roster if not already there
        if (!state.activeRoster.includes(characterId)) {
            const newRoster = [...state.activeRoster, characterId];
            await lockedWriteRoster(lastMsgId, newRoster);
            setActiveRoster(newRoster);
        }

        if (window.toastr) window.toastr.success(`"${characterId}" imported to chat DNA.`, 'Personalyze');
    } catch (err) {
        error('Import', 'Failed to commit import to DNA:', err);
    }
}

/**
 * Snapshots the current chat-specific character definition back to the Global Library.
 * Used to "save" changes made during a specific roleplay for future use in other chats.
 * 
 * @param {string} characterId 
 */
export async function handleExportToLibrary(characterId) {
    const activeData = state.chatCharacters[characterId];
    if (!activeData) {
        error('Export', `No local DNA found for character: ${characterId}`);
        return;
    }

    log('Export', `Exporting chat DNA for "${characterId}" to Global Library...`);
    
    saveToLibrary(characterId, activeData);
    
    if (window.toastr) window.toastr.success(`"${characterId}" saved to Global Library.`, 'Personalyze');
}

/**
 * Toggles a character's presence in the active roster for this chat.
 * Persists the change to the DNA chain.
 * 
 * @param {string} characterId 
 * @param {boolean} enable 
 */
export async function handleSyncRoster(characterId, enable) {
    const context = getContext();
    const lastMsgId = Math.max(0, context.chat.length - 1);
    
    let newRoster;
    if (enable) {
        newRoster = [...new Set([...state.activeRoster, characterId])];
    } else {
        newRoster = state.activeRoster.filter(id => id !== characterId);
    }

    log('Roster', `Updating roster in DNA: ${enable ? '+' : '-'}${characterId}`);

    try {
        await lockedWriteRoster(lastMsgId, newRoster);
        setActiveRoster(newRoster);
        document.dispatchEvent(new CustomEvent('plz:roster-changed'));
    } catch (err) {
        error('Roster', 'Failed to update roster in DNA:', err);
    }
}