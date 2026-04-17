/**
 * @file data/default-user/extensions/personalyze/logic/pipeline/archivist.js
 * @stamp {"utc":"2026-04-17T15:30:00.000Z"}
 * @architectural-role Orchestrator (Phase 1.5)
 * @description
 * Manages the resolution of unrecognized characters detected in the narrative.
 * Orchestrates the "Archivist" flow:
 * 1. Extraction of physical identity via Smart Model.
 * 2. User resolution via a 3-way modal (Create, Alias, or Ignore).
 * 3. DNA commitment based on the choice.
 *
 * Updated for Granular Identity Architecture:
 * 1. Consumes structured identity map from detectAnchorScan.
 * 2. Passes compiled identity string to modal for user review.
 * 3. Commits granular identity map to character DNA.
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
import { formatIdentityDisplay } from '../../logic/parsers.js';
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
        // Format as Key: Value pairs so the user can review individual traits
        const identityStr = formatIdentityDisplay(scanResult.identity);
        const resolution = await showArchivistModal(detectedName, identityStr, state.activeRoster);

        if (!resolution) {
            log('Archivist', 'Resolution cancelled by user.');
            removePending(detectedName);
            return;
        }

        // 4. Action Execution
        switch (resolution.action) {
            case 'create': {
                const newId = slugify(detectedName);
                
                // If user edited the text in the modal, we treat it as the 'base' physical slot.
                // If they didn't touch it, we keep the granular map from the LLM.
                const finalIdentity = (resolution.anchor && resolution.anchor !== identityStr)
                    ? { base: resolution.anchor }
                    : scanResult.identity;

                await lockedWriteCharacterDef(messageId, newId, finalIdentity, 1);
                await lockedWriteLabel(messageId, newId, detectedName);
                upsertChatCharacterDef(newId, finalIdentity, 1);
                upsertChatCharacterLabel(newId, detectedName);

                // Ensure they start with a clean wardrobe
                updateChainLayers(newId, getCleanLayers(), null);
                
                const newRoster = [...new Set([...state.activeRoster, newId])];
                await lockedWriteRoster(messageId, newRoster);
                setActiveRoster(newRoster);
                
                document.dispatchEvent(new CustomEvent('plz:roster-changed'));

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