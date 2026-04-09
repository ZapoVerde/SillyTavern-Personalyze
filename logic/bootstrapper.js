/**
 * @file data/default-user/extensions/personalyze/logic/bootstrapper.js
 * @stamp {"utc":"2026-04-10T16:00:00.000Z"}
 * @architectural-role Orchestrator / Boot Sequence
 * @description
 * Manages the initialization of the PersonaLyze environment for the active chat.
 *
 * Updated for the Layered State architecture:
 *   1. Reconstructs chat DNA to derive local ensembles and current layers.
 *   2. Reconciles with filesystem.
 *   3. Requirement-Driven Healing: Regenerates the active portrait if the DNA 
 *      requires it but the file is missing, using the new promptCompiler.
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
import { compilePrompt } from './promptCompiler.js';
import { slugify } from '../utils/history.js';
import { getSettings } from '../settings.js';

export async function runBoot() {
    log('Boot', 'Starting Layered DNA reconstruction sequence...');

    const context = getContext();
    if (!context.chatId) {
        log('Boot', 'Abort: No active chatId found.');
        return;
    }

    // 1. DNA Reconstruction
    const reconstructed = reconstruct(context.chat);
    bulkInitState(reconstructed);

    log('Boot', 'DNA Reconstructed.', {
        charactersFound: Object.keys(state.chatCharacters).length,
        activeChar: state.activeCharacterId,
        activeEmotion: state.activeLayers?.emotion
    });

    // 2. Filesystem Reconciliation
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
    if (
        isImageMissing &&
        state.activeCharacterId &&
        state.activeLayers &&
        state.activeLayers.emotion !== 'KEEP'
    ) {
        const character = state.chatCharacters[state.activeCharacterId];

        if (character) {
            log('Boot', 'Healing missing active portrait...');
            
            let lastAiIdx = -1;
            for (let i = context.chat.length - 1; i >= 0; i--) {
                if (!context.chat[i].is_user) { lastAiIdx = i; break; }
            }

            const prompt = compilePrompt(character.identityAnchor, state.activeLayers);

            generate(
                state.activeCharacterId,
                'layered',
                slugify(state.activeLayers.emotion),
                prompt,
                state.activeLayers.emotion,
                character.identityAnchor,
                character.seed,
                getSettings().defaultEngine || 'pollinations'
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