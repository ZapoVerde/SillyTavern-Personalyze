/**
 * @file data/default-user/extensions/personalyze/ui/roster/controls.js
 * @stamp {"utc":"2026-04-17T17:20:00.000Z"}
 * @architectural-role UI Orchestrator
 * @description
 * Manages global event delegation for the character roster UI.
 * Handles card-level interactions including flipping, removal, and addition.
 * 
 * Updated for Dynamic Variable Architecture:
 * 1. Removed compilePrompt usage; generate() now handles iterative prompt synthesis.
 *
 * @api-declaration
 * bindRosterControls() -> void
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: [state.activeRoster]
 *     external_io: [DOM, state.js, dnaWriter.js, charPicker.js, imageCache.js, logger.js, callLog.js]
 */

import { 
    state, 
    setActiveRoster, 
    toggleCharacterFlip, 
    addToFileIndex, 
    updateChainLayers, 
    removeFromFileIndex,
    upsertChatCharacterDef
} from '../../state.js';
import { 
    lockedWriteRoster, 
    lockedPatchVisualStateImage,
    lockedWriteCharacterDef
} from '../../io/dnaWriter.js';
import { generate, deleteFiles } from '../../imageCache.js';
import { slugify } from '../../utils/history.js';
import { getSettings } from '../../settings.js';
import { getContext } from '../../../../../extensions.js';
import { error } from '../../utils/logger.js';
import { startWorkshopTurn } from '../../utils/callLog.js';

/**
 * Binds delegated click handlers to the document for roster card interactions.
 * Ensures controls work regardless of whether the card is in the floating 
 * overlay or the VN panel.
 */
export function bindRosterControls() {
    const $doc = $(document);

    // 1. Mirror / Flip Portrait
    $doc.on('click', '.plz-card-flip', function(e) {
        e.stopPropagation();
        const id = $(this).closest('.plz-portrait-card').data('id');
        if (id) {
            toggleCharacterFlip(id);
        }
    });

    // 2. Remove from Roster (Scene Exit)
    $doc.on('click', '.plz-card-close', async function(e) {
        e.stopPropagation();
        const id = $(this).closest('.plz-portrait-card').data('id');
        if (!id) return;

        const newRoster = state.activeRoster.filter(rid => rid !== id);
        const lastAiIdx = Math.max(0, getContext().chat.length - 1);
        
        try {
            await lockedWriteRoster(lastAiIdx, newRoster);
            setActiveRoster(newRoster);
            document.dispatchEvent(new CustomEvent('plz:roster-changed'));
        } catch (err) {
            error('Controls', 'Failed to update roster on removal:', err);
        }
    });

    // 3. Add to Roster (Open Picker)
    $doc.on('click', '.plz-card-add-trigger', async function(e) {
        e.stopPropagation();
        const { openCharPicker } = await import('../charPicker.js');
        await openCharPicker();
    });

    // 4. Refresh / Re-generate (Generation Economy)
    $doc.on('click', '.plz-card-refresh', async function(e) {
        e.stopPropagation();
        const id = $(this).closest('.plz-portrait-card').data('id');
        if (!id) return;

        const char = state.chatCharacters[id];
        const chain = state.characterChain[id];
        if (!char) return;

        const layers = chain?.layers || state.activeLayers;
        const lastAiIdx = getContext().chat.findLastIndex(m => !m.is_user);
        if (lastAiIdx === -1) return;

        const s = getSettings();
        
        // Seed Determination Logic
        let apiSeed = char.seed ?? 1;

        if (s.autoIncrementSeed && apiSeed > -1) {
            // 3-Digit Loop Logic (1-999)
            apiSeed = (apiSeed % 999) + 1;
            
            // Permanent DNA Commitment: update seed in memory and chat history
            // We MUST include the existing anchor to prevent it being overwritten with undefined
            upsertChatCharacterDef(id, char.identity, apiSeed);
            await lockedWriteCharacterDef(lastAiIdx, id, char.identity, apiSeed);
        }

        const emotionSlug = slugify(layers.emotion);

        // Forensic Logging: Open a Workshop turn so the generation is filed correctly
        startWorkshopTurn(`Manual Refresh: ${char.label || id}`);

        try {
            // Trigger generation with cache-bust to force fresh image while keeping (or incrementing) seed
            const newFile = await generate(
                id,
                'layered',
                emotionSlug,
                layers,
                layers.emotion,
                layers.pose,
                char.identity,
                apiSeed,
                null
            );

            // Asset update
            addToFileIndex(newFile);
            updateChainLayers(id, layers, newFile);
            
            // Patch existing DNA record with the new file pointer
            await lockedPatchVisualStateImage(lastAiIdx, id, newFile);

            // Ephemeral Cleanup
            if (!s.keepCache) {
                const charPrefix = `plz_${id}_`;
                const staleFiles = Array.from(state.fileIndex).filter(f => 
                    f.startsWith(charPrefix) && f !== newFile
                );
                
                if (staleFiles.length > 0) {
                    await deleteFiles(staleFiles);
                    removeFromFileIndex(staleFiles);
                }
            }

            // Sync UI
            document.dispatchEvent(new CustomEvent('plz:roster-render-req'));

        } catch (err) {
            error('Controls', `Refresh failed for ${id}:`, err);
        }
    });
}