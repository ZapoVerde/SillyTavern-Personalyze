/**
 * @file data/default-user/extensions/personalyze/logic/bootstrapper.js
 * @stamp {"utc":"2026-04-07T12:40:00.000Z"}
 * @architectural-role Orchestrator / Boot Sequence
 * @description
 * Manages the initialization of the PersonaLyze environment for the active chat.
 *
 * On every chat load or chat change, the bootstrapper:
 *   1. Reads the chat's DNA history via reconstruction.js to derive the local 
 *      wardrobe (chatCharacters) and the last known visual state.
 *   2. Fetches the PLZ file index from the server to reconcile DNA pointers 
 *      with actual files on disk.
 *   3. Restores the portrait UI if the active image exists.
 *   4. Requirement-Driven Healing: Regenerates the active portrait if the DNA 
 *      requires it for display but the file is missing.
 *
 * @api-declaration
 * runBoot() → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO
 *     state_ownership: [state (mutates via setters only)]
 *     external_io: [reconstruction, imageCache, portrait, state]
 */

import { getContext } from '../../../../extensions.js';
import { log, warn, error } from '../utils/logger.js';
import { state, bulkInitState, setFileIndex, addToFileIndex } from '../state.js';
import { reconstruct } from '../reconstruction.js';
import { fetchFileIndex, generate } from '../imageCache.js';
import { setPortrait, clearPortrait } from '../portrait.js';
import { lockedPatchVisualStateImage } from '../io/dnaWriter.js';

/**
 * Executes the full boot sequence for the current chat.
 */
export async function runBoot() {
    log('Boot', 'Starting DNA reconstruction sequence...');

    const context = getContext();
    if (!context.chatId) {
        log('Boot', 'Abort: No active chatId found.');
        return;
    }

    // 1. DNA Reconstruction
    // Derive the local chat wardrobe and the last active visual state.
    const reconstructed = reconstruct(context.chat);
    bulkInitState(reconstructed);

    log('Boot', 'DNA Reconstructed.', {
        charactersFound: Object.keys(state.chatCharacters).length,
        activeChar: state.activeCharacterId,
        activeOutfit: state.activeOutfitKey
    });

    // 2. Filesystem Reconciliation
    // Fetch the actual PLZ image files present on the server.
    const { fileIndex } = await fetchFileIndex();
    setFileIndex(fileIndex);
    log('Boot', `File index: ${state.fileIndex.size} portrait(s) detected.`);

    // 3. UI Restoration
    const isImageMissing = state.activeImageFile && !state.fileIndex.has(state.activeImageFile);

    if (state.activeImageFile && !isImageMissing) {
        log('Boot', 'Restoring active portrait:', state.activeImageFile);
        setPortrait(state.activeImageFile);
    } else {
        if (isImageMissing) {
            warn('Boot', `Active portrait "${state.activeImageFile}" missing from disk. Clearing UI.`);
        }
        clearPortrait();
    }

    // 4. Requirement-Driven Healing
    // Principle 7: We only heal a missing file if it is required for display.
    if (
        isImageMissing &&
        state.activeCharacterId &&
        state.activeOutfitKey &&
        state.activeExpressionKey
    ) {
        const character = state.chatCharacters[state.activeCharacterId];
        const outfitDef = character?.outfits[state.activeOutfitKey];

        if (character && outfitDef) {
            log('Boot', 'Healing missing active portrait...');
            
            // Find the last AI message index to patch the DNA record once generated
            let lastAiIdx = -1;
            for (let i = context.chat.length - 1; i >= 0; i--) {
                if (!context.chat[i].is_user) { lastAiIdx = i; break; }
            }

            generate(
                state.activeCharacterId,
                state.activeOutfitKey,
                state.activeExpressionKey,
                outfitDef.description,
                state.activeExpressionKey, // Current expression label
                character.identityAnchor,
                character.seed,
                outfitDef.provider
            )
                .then(async filename => {
                    addToFileIndex(filename);
                    setPortrait(filename);
                    
                    if (lastAiIdx !== -1) {
                        await lockedPatchVisualStateImage(lastAiIdx, state.activeCharacterId, filename);
                    }
                    
                    log('Boot', 'Requirement-driven healing complete:', filename);
                })
                .catch(err => error('Boot', 'Active portrait healing failed:', err));
        }
    }
}