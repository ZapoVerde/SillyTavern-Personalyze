/**
 * @file data/default-user/extensions/personalyze/logic/pipeline/archivist.js
 * @stamp {"utc":"2026-04-19T00:00:00.000Z"}
 * @architectural-role Orchestrator (Phase 1.5)
 * @description
 * Manages the resolution of unrecognized characters detected in the narrative.
 * Orchestrates the "Archivist" flow:
 * 1. Extraction of physical identity via Smart Model.
 * 2. User resolution via a 3-way modal (Create, Alias, or Ignore).
 * 3. DNA commitment based on the choice.
 *
 * Updated for Granular Identity Grid Architecture:
 * 1. Passes raw identity object directly to modal (no string flattening).
 * 2. Modal returns a validated identity map; no 'base' fallback required.
 * 3. Commits structured map directly to character DNA.
 *
 * @api-declaration
 * runArchivistPipeline(messageId, detectedName) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful Orchestrator
 *     state_ownership: [blacklist (pendingSubjects)]
 *     external_io: [LLM, Archivist Modal, dnaWriter.js, state.js]
 */

import { getContext } from '../../../../../extensions.js';
import { getSettings } from '../../settings.js';
import { log, error } from '../../utils/logger.js';
import { buildDescriberContext, slugify } from '../../utils/history.js';
import { addPending, removePending, ignore } from '../blacklist.js';
import { detectAnchorScan } from '../../io/llm/workshop.js';
import { showArchivistModal } from '../../ui/archivistModal.js';
import { processKnownSubject } from './turn.js';
import { syncCharacterToLorebook } from './lorebookSync.js';
import {
    lockedWriteCharacterDef,
    lockedWriteLabel,
    lockedWriteAka,
    lockedWriteRoster
} from '../../io/dnaWriter.js';
import {
    state,
    upsertChatCharacterDef,
    upsertChatCharacterLabel,
    upsertChatCharacterAka,
    setActiveRoster,
    updateChainLayers,
    getCleanLayers
} from '../../state.js';

/**
 * Handles the logic for an unknown subject.
 * 
 * @param {number} messageId - The trigger message.
 * @param {string} detectedName - The unrecognized name string from Phase 1.
 */
export async function runArchivistPipeline(messageId, detectedName) {
    const context = getContext();
    const s = getSettings();

    // 1. Guard against race conditions
    addPending(detectedName);

    try {
        log('Archivist', `Analyzing unknown subject: ${detectedName}`);

        // 2. Automated physical identity extraction
        const historyContext = buildDescriberContext(context.chat, messageId, s.describerHistory);
        const scanResult = await detectAnchorScan(
            historyContext, 
            detectedName, 
            s.describerProfileId || s.smartProfileId
        );

        if (!scanResult || !scanResult.identity) {
            log('Archivist', 'Failed to extract physical identity. Subject may be too minor.');
            removePending(detectedName);
            return;
        }

        // 3. User Resolution Modal
        // Pass the raw structured identity object — the modal renders it as a grid.
        // Pass all known chat characters as alias candidates, not just the active
        // roster — the roster is often empty when a new character is first detected.
        const resolution = await showArchivistModal(detectedName, scanResult.identity, Object.keys(state.chatCharacters));

        if (!resolution) {
            log('Archivist', 'Resolution cancelled by user.');
            removePending(detectedName);
            return;
        }

        // 4. Action Execution
        switch (resolution.action) {
            case 'create': {
                const newId = slugify(detectedName);

                // The modal scrapes and validates the grid; commit it directly.
                await lockedWriteCharacterDef(messageId, newId, resolution.identity, 1);
                await lockedWriteLabel(messageId, newId, detectedName);
                upsertChatCharacterDef(newId, resolution.identity, 1);
                upsertChatCharacterLabel(newId, detectedName);

                // Ensure they start with a clean wardrobe
                updateChainLayers(newId, getCleanLayers(), null);
                
                const newRoster = [...new Set([...state.activeRoster, newId])];
                await lockedWriteRoster(messageId, newRoster);
                setActiveRoster(newRoster);
                
                document.dispatchEvent(new CustomEvent('plz:roster-changed'));

                syncCharacterToLorebook(newId, detectedName, resolution.identity)
                    .catch(err => error('Archivist', 'LB sync failed:', err));

                // Immediately process their visual state and generate image
                await processKnownSubject(messageId, newId, context.chat[messageId].mes, historyContext, s);
                break;
            }


            case 'alias': {
                const targetId = resolution.targetId;
                const char = state.chatCharacters[targetId];
                if (!char) break;

                const newAkaList = [...new Set([...(char.aka || []), detectedName])];
                await lockedWriteAka(messageId, targetId, newAkaList);
                upsertChatCharacterAka(targetId, newAkaList);

                // Immediately process their visual state using the new linked ID
                await processKnownSubject(messageId, targetId, context.chat[messageId].mes, historyContext, s);
                break;
            }

            case 'ignore': {
                log('Archivist', `Adding "${detectedName}" to scene blacklist.`);
                ignore(detectedName);
                break;
            }
        }

    } catch (err) {
        error('Archivist', 'Failed to resolve unknown subject:', err.message);
    } finally {
        // Clear the pending guard
        removePending(detectedName);
    }
}