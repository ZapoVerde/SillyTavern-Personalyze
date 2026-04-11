/**
 * @file data/default-user/extensions/personalyze/ui/roster/controls.js
 * @stamp {"utc":"2026-04-14T12:40:00.000Z"}
 * @architectural-role UI Orchestrator
 * @description
 * Manages global event delegation for the character roster UI.
 * Handles card-level interactions including flipping, removal, and addition.
 *
 * @api-declaration
 * bindRosterControls() -> void
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: [state.activeRoster]
 *     external_io: [DOM, state.js, dnaWriter.js, charPicker.js, logger.js]
 */

import { state, setActiveRoster, toggleCharacterFlip } from '../../state.js';
import { lockedWriteRoster } from '../../io/dnaWriter.js';
import { getContext } from '../../../../../extensions.js';
import { error } from '../../utils/logger.js';

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
        // Dynamic import to avoid circular dependency with UI modules
        const { openCharPicker } = await import('../charPicker.js');
        await openCharPicker();
    });
}