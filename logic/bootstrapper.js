/**
 * @file data/default-user/extensions/personalyze/logic/bootstrapper.js
 * @stamp {"utc":"2026-04-17T16:30:00.000Z"}
 * @architectural-role Orchestrator / Boot Sequence
 * @description
 * Manages the initialization of the PersonaLyze environment for the active chat.
 *
 * Updated for Dynamic Variable Architecture:
 * 1. Removed compilePrompt usage; generate() now handles iterative prompt synthesis.
 *
 * @api-declaration
 * runBoot() → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO
 *     state_ownership: [state (mutates via setters only)]
 *     external_io: [reconstruction, imageCache, state]
 */

import { getContext } from '../../../../extensions.js';
import { log, error } from '../utils/logger.js';
import { state, bulkInitState, setFileIndex, addToFileIndex, updateChainLayers } from '../state.js';
import { reconstruct } from '../reconstruction.js';
import { fetchFileIndex, generate } from '../imageCache.js';
import { lockedPatchVisualStateImage } from '../io/dnaWriter.js';
import { slugify } from '../utils/history.js';

/**
 * Heals a specific character's missing portrait if requirements are met.
 * 
 * @param {string} characterId 
 * @param {number} lastAiIdx 
 */
async function healCharacter(characterId, lastAiIdx) {
    const character = state.chatCharacters[characterId];
    const chain = state.characterChain[characterId];
    if (!character || !chain || !chain.layers) return;

    // Skip if state is missing or explicitly 'KEEP' (ambiguous/legacy)
    if (!chain.layers.emotion || chain.layers.emotion === 'KEEP') return;

    log('Boot', `Healing missing portrait for: ${characterId}`);
    
    try {
        const filename = await generate(
            characterId,
            'layered',
            slugify(chain.layers.emotion),
            chain.layers,
            chain.layers.emotion,
            chain.layers.pose || 'upright',
            character.identityAnchor,
            character.seed
        );

        addToFileIndex(filename);
        updateChainLayers(characterId, chain.layers, filename);
        
        if (lastAiIdx !== -1) {
            await lockedPatchVisualStateImage(lastAiIdx, characterId, filename);
        }
        
        // Notify UI that an image is ready
        document.dispatchEvent(new CustomEvent('plz:roster-render-req'));
        log('Boot', `Healing complete for ${characterId}: ${filename}`);
    } catch (err) {
        error('Boot', `Healing failed for ${characterId}:`, err.message);
    }
}

export async function runBoot() {
    log('Boot', 'Starting Multi-Character DNA reconstruction sequence...');

    const context = getContext();
    if (!context.chatId) {
        log('Boot', 'Abort: No active chatId found.');
        return;
    }

    // 1. DNA Reconstruction
    const reconstructed = reconstruct(context.chat);
    bulkInitState(reconstructed);

    log('Boot', 'DNA Reconstructed.', {
        activeRoster: state.activeRoster,
        activeChar: state.activeCharacterId
    });

    // 2. Filesystem Reconciliation
    const { fileIndex } = await fetchFileIndex();
    setFileIndex(fileIndex);
    log('Boot', `File index: ${state.fileIndex.size} portrait(s) detected.`);

    // 3. UI Sync
    document.dispatchEvent(new CustomEvent('plz:roster-changed'));

    // 4. Requirement-Driven Healing (Multi-Character)
    let lastAiIdx = -1;
    for (let i = context.chat.length - 1; i >= 0; i--) {
        if (!context.chat[i].is_user) { lastAiIdx = i; break; }
    }

    const healingTasks = [];
    for (const id of state.activeRoster) {
        const chain = state.characterChain[id];
        const isImageMissing = chain && (!chain.image || !state.fileIndex.has(chain.image));

        if (isImageMissing) {
            healingTasks.push(healCharacter(id, lastAiIdx));
        }
    }

    if (healingTasks.length > 0) {
        log('Boot', `Triggering ${healingTasks.length} healing task(s)...`);
        await Promise.all(healingTasks);
    }
}