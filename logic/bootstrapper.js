/**
 * @file data/default-user/extensions/personalyze/logic/bootstrapper.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role Orchestrator / Boot Sequence
 * @description
 * Manages the initialization of the PersonaLyze environment for the active chat.
 *
 * On every chat load or chat change, the bootstrapper:
 *   1. Reads the chat's pointer history via reconstruction.js to derive the last
 *      known visual state (character, outfit, expression, image filename).
 *   2. Fetches the PLZ file index from the server to discover which portrait
 *      images are actually present on disk.
 *   3. Restores the portrait UI if the active image exists on disk, or clears
 *      it if the file is missing to prevent 404 errors.
 *   4. Queues silent regeneration for any missing portrait files referenced by
 *      the registry's known outfit × expression combinations.
 *
 * @api-declaration
 * runBoot() → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO
 *     state_ownership: [state (mutates via setters only)]
 *     external_io: [reconstruction, imageCache, portrait, registry, state]
 */

import { getContext } from '../../../../extensions.js';
import { log, warn, error } from '../utils/logger.js';
import { state, bulkInitState, setFileIndex, addToFileIndex, updateChainEntry } from '../state.js';
import { reconstruct } from '../reconstruction.js';
import { fetchFileIndex, generate } from '../imageCache.js';
import { setPortrait, clearPortrait } from '../portrait.js';
import { getCharacter } from '../registry.js';

/**
 * Executes the full boot sequence for the current chat.
 */
export async function runBoot() {
    log('Boot', 'Starting sequence...');

    const context = getContext();
    if (!context.chatId) {
        log('Boot', 'Abort: No active chatId found.');
        return;
    }

    // 1. Pointer Reconstruction
    // Derive the last known visual state from the chat's pointer history.
    const reconstructed = reconstruct(context.chat);
    bulkInitState(reconstructed);

    log('Boot', 'Reconstruction complete.', {
        characterId:   state.activeCharacterId,
        outfitKey:     state.activeOutfitKey,
        expressionKey: state.activeExpressionKey,
        imageFile:     state.activeImageFile,
    });

    // 2. Filesystem Reconciliation
    // Fetch the actual PLZ image files present on the server.
    const { fileIndex } = await fetchFileIndex();
    setFileIndex(fileIndex);
    log('Boot', `File index: ${state.fileIndex.size} PLZ portrait(s) detected.`);

    // 3. UI Restoration
    const isImageMissing = state.activeImageFile && !state.fileIndex.has(state.activeImageFile);

    if (state.activeImageFile && !isImageMissing) {
        log('Boot', 'Restoring portrait:', state.activeImageFile);
        setPortrait(state.activeImageFile);
    } else {
        if (isImageMissing) {
            warn('Boot', `Active portrait "${state.activeImageFile}" missing from server. Clearing UI.`);
        }
        clearPortrait();
    }

    // 4. Silent Regeneration Queue
    // If the active character has a resolved outfit + expression but the image is
    // missing, regenerate it silently in the background.
    if (
        isImageMissing &&
        state.activeCharacterId &&
        state.activeOutfitKey &&
        state.activeExpressionKey
    ) {
        const character = getCharacter(state.activeCharacterId);
        const outfitDef = character?.outfits[state.activeOutfitKey];

        // expressionKey is now a plain ST expression label (e.g. "joy") — no registry lookup needed.
        if (character && outfitDef) {
            log('Boot', 'Queuing silent regeneration for missing active portrait...');
            generate(
                state.activeCharacterId,
                state.activeOutfitKey,
                state.activeExpressionKey,
                outfitDef.description,
                state.activeExpressionKey,
                character.identityAnchor
            )
                .then(filename => {
                    addToFileIndex(filename);
                    setPortrait(filename);
                    log('Boot', 'Regenerated missing portrait:', filename);
                })
                .catch(err => error('Boot', 'Silent regeneration failed:', err));
        }
    }
}
