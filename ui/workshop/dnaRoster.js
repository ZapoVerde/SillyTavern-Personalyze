/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaRoster.js
 * @stamp {"utc":"2026-04-12T11:10:00.000Z"}
 * @architectural-role UI Sub-module (Roster Management)
 * @description
 * Handles navigation and roster-level logic for the DNA tab.
 * Responsible for creating new character "Ghosts" and toggling character
 * visibility in the active chat session.
 * 
 * @api-declaration
 * bindRosterHandlers($overlay)
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [state.activeRoster, state._workshopCharacterId]
 *     external_io: [dnaWriter.js, state.js, core.js, dnaListeners.js]
 */

import { getContext } from '../../../../../extensions.js';
import {
    state, setWorkshopCharacter, setActiveRoster,
    getCleanLayers, _ensureChatChar, updateChainLayers
} from '../../state.js';
import { BASE_SLOTS } from '../../defaults.js';
import { lockedWriteRoster } from '../../io/dnaWriter.js';
import { switchTab } from './core.js';
import { renderDNAView } from './dnaListeners.js';

/**
 * Binds event listeners for character roster interactions.
 * @param {jQuery} $overlay - The workshop modal overlay.
 */
export function bindRosterHandlers($overlay) {
    
    // ─── Create New Character (Ghost Initiation) ───
    $overlay.on('click', '.plz-dna-add-new', function() {
        // Initialize the blank ghost template
        _ensureChatChar('__new__');
        
        // Clean Slate Fix: ensure no inherited clothing
        updateChainLayers('__new__', getCleanLayers(BASE_SLOTS), null);
        
        setWorkshopCharacter('__new__');
        switchTab('studio');
    });

    // ─── DNA Toggle: Active Roster Membership ───
    $overlay.on('click', '.plz-dna-toggle', async function(e) {
        e.stopPropagation();
        const id = $(this).closest('.plz-roster-item').data('id');
        if (!id || id === '__new__') return;

        const isEnabled = state.activeRoster.includes(id);
        const newRoster = isEnabled 
            ? state.activeRoster.filter(x => x !== id) 
            : [...new Set([...state.activeRoster, id])];
        
        // Update in-memory state and UI immediately
        setActiveRoster(newRoster);
        renderDNAView();
        
        // Commit change to chat DNA
        const lastMsgId = Math.max(0, getContext().chat.length - 1);
        await lockedWriteRoster(lastMsgId, newRoster);
    });

    // ─── Edit Character: Studio Navigation ───
    $overlay.on('click', '.plz-dna-edit', function(e) {
        e.stopPropagation();
        const id = $(this).closest('.plz-roster-item').data('id');
        if (!id) return;

        setWorkshopCharacter(id);
        switchTab('studio');
    });
}