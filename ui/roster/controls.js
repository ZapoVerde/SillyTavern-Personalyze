/**
 * @file data/default-user/extensions/personalyze/ui/roster/controls.js
 * @stamp {"utc":"2026-04-18T00:00:00.000Z"}
 * @architectural-role UI Orchestrator
 * @description
 * Manages global event delegation for the character roster UI.
 * Handles card-level interactions including gear menu, removal, and addition.
 *
 * Updated for Surgical Utility UI:
 * 1. Replaced Flip handler with Gear menu system (flip, edit, promote).
 * 2. Added tap-to-toggle control visibility (plz-controls-active class).
 * 3. Promote fires plz:promote-to-focus event; vnPanel.js owns the state update.
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

    // 1. Card Frame — Tap-to-Toggle Controls
    // Tapping anywhere on the frame (not a button) pins/unpins the control HUD.
    // Only one card can be active at a time; stacked (non-top) cards are blocked.
    $doc.on('click', '.plz-card-frame', function(e) {
        if ($(e.target).closest('.plz-card-btn, .plz-gear-menu').length) return;
        const $card = $(this).closest('.plz-portrait-card');
        if ($card.hasClass('plz-card-stacked')) return;
        const wasActive = $card.hasClass('plz-controls-active');
        $('.plz-portrait-card').removeClass('plz-controls-active');
        $('.plz-gear-menu').removeClass('plz-gear-open');
        if (!wasActive) $card.addClass('plz-controls-active');
    });

    // 2. Gear Button — Toggle Sub-menu
    $doc.on('click', '.plz-card-gear', function(e) {
        e.stopPropagation();
        const $menu = $(this).closest('.plz-card-frame').find('.plz-gear-menu');
        const wasOpen = $menu.hasClass('plz-gear-open');
        $('.plz-gear-menu').removeClass('plz-gear-open');
        if (!wasOpen) $menu.addClass('plz-gear-open');
    });

    // 3. Gear Action: Flip
    $doc.on('click', '.plz-gear-flip', function(e) {
        e.stopPropagation();
        const id = $(this).closest('.plz-portrait-card').data('id');
        if (id) {
            toggleCharacterFlip(id);
            $(this).closest('.plz-gear-menu').removeClass('plz-gear-open');
        }
    });

    // 4. Gear Action: Edit Appearance (opens the character picker pre-selected to this card's char)
    $doc.on('click', '.plz-gear-edit', async function(e) {
        e.stopPropagation();
        const id = $(this).closest('.plz-portrait-card').data('id');
        $(this).closest('.plz-gear-menu').removeClass('plz-gear-open');
        const { openCharPicker } = await import('../charPicker.js');
        await openCharPicker(null, id || null);
    });

    // 5. Gear Action: Promote to Focus
    // Fires an event; vnPanel.js owns _focusCardId and handles the state update.
    $doc.on('click', '.plz-gear-promote', function(e) {
        e.stopPropagation();
        const id = $(this).closest('.plz-portrait-card').data('id');
        if (id) {
            $(this).closest('.plz-gear-menu').removeClass('plz-gear-open');
            $(this).closest('.plz-portrait-card').removeClass('plz-controls-active');
            document.dispatchEvent(new CustomEvent('plz:promote-to-focus', { detail: { characterId: id } }));
        }
    });

    // 7. Remove from Roster (Scene Exit)
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

    // 8. Add Character (VN panel chrome button — opens picker with no pre-selection)
    $doc.on('click', '#plz-vn-add-btn', async function(e) {
        e.stopPropagation();
        const { openCharPicker } = await import('../charPicker.js');
        await openCharPicker();
    });

    // 9. Refresh / Re-generate (Generation Economy)
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