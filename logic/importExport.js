/**
 * @file data/default-user/extensions/personalyze/logic/importExport.js
 * @stamp {"utc":"2026-04-10T16:20:00.000Z"}
 * @architectural-role Stateful Controller
 * @description
 * Bridges the Global Library and the active Chat DNA for the Layered State architecture.
 * Handles cloning of character identities and ensembles (layer snapshots).
 * 
 * Includes logic to migrate legacy monolithic library templates into the 
 * 5-slot layered format during import.
 *
 * @api-declaration
 * handleImportToChat(characterId)
 * handleExportToLibrary(characterId)
 * handleSyncRoster(characterId, enable)
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
    upsertChatEnsemble,
    setActiveRoster
} from '../state.js';
import { getLibraryCharacter, saveToLibrary } from '../library.js';
import { 
    lockedWriteCharacterDef, 
    lockedWriteEnsemble,
    lockedWriteRoster
} from '../io/dnaWriter.js';
import { log, error } from '../utils/logger.js';

/**
 * Imports a character and their ensembles from the Library into chat DNA.
 * @param {string} characterId 
 */
export async function handleImportToChat(characterId) {
    const template = getLibraryCharacter(characterId);
    if (!template) {
        error('Import', `Unknown library character: ${characterId}`);
        return;
    }

    const context = getContext();
    const lastMsgId = Math.max(0, context.chat.length - 1);
    log('Import', `Importing "${characterId}" to DNA...`);

    try {
        // 1. Identity
        const anchor = template.identityAnchor || template.identity_anchor || '';
        const seed = template.seed ?? 1;
        await lockedWriteCharacterDef(lastMsgId, characterId, anchor, seed);
        upsertChatCharacterDef(characterId, anchor, seed);

        // 2. Ensembles (New Format)
        const ensembles = template.ensembles || {};
        for (const [key, data] of Object.entries(ensembles)) {
            await lockedWriteEnsemble(lastMsgId, characterId, key, data.label, data.layers);
            upsertChatEnsemble(characterId, key, data.label, data.layers);
        }

        // 3. Migration: Handle legacy outfits if found in the template
        if (template.outfits) {
            log('Import', 'Migrating legacy outfits to ensembles...');
            for (const [key, outfit] of Object.entries(template.outfits)) {
                const migratedLayers = {
                    outerwear: null,
                    top: { item: outfit.description || outfit.label, modifier: null },
                    bottom: null,
                    accessories: null,
                    emotion: 'neutral'
                };
                await lockedWriteEnsemble(lastMsgId, characterId, key, outfit.label, migratedLayers);
                upsertChatEnsemble(characterId, key, outfit.label, migratedLayers);
            }
        }

        // 4. Roster Update
        if (!state.activeRoster.includes(characterId)) {
            const newRoster = [...state.activeRoster, characterId];
            await lockedWriteRoster(lastMsgId, newRoster);
            setActiveRoster(newRoster);
        }

        if (window.toastr) window.toastr.success(`"${characterId}" imported to DNA.`, 'Personalyze');
    } catch (err) {
        error('Import', 'Failed to commit import:', err);
    }
}

/**
 * Snapshots the current chat-specific character and ensembles back to the Library.
 * @param {string} characterId 
 */
export async function handleExportToLibrary(characterId) {
    const activeData = state.chatCharacters[characterId];
    if (!activeData) {
        error('Export', `No local DNA found for: ${characterId}`);
        return;
    }

    log('Export', `Exporting "${characterId}" to Library...`);
    saveToLibrary(characterId, activeData);
    if (window.toastr) window.toastr.success(`"${characterId}" saved to Library.`, 'Personalyze');
}

/**
 * Toggles a character's presence in the active roster.
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

    try {
        await lockedWriteRoster(lastMsgId, newRoster);
        setActiveRoster(newRoster);
        document.dispatchEvent(new CustomEvent('plz:roster-changed'));
    } catch (err) {
        error('Roster', 'Failed to update roster:', err);
    }
}