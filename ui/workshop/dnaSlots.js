/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaSlots.js
 * @stamp {"utc":"2026-04-17T17:50:00.000Z"}
 * @architectural-role UI Sub-module (Wardrobe Schema)
 * @description
 * Handles wardrobe category (slot) management in the Studio.
 * Allows for adding custom slots and deleting non-base slots.
 * 
 * Updated for Dynamic Variable Architecture:
 * 1. Enforces RESERVED_SLOT_KEYS blacklist to prevent template variable collisions.
 * 
 * @api-declaration
 * bindSlotHandlers($overlay)
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [state.chatCharacters]
 *     external_io: [dnaWriter.js, state.js, dnaListeners.js, DOM]
 */

import { getContext } from '../../../../../extensions.js';
import { confirmModal, promptModal } from '../../utils/modal.js';
import { state, upsertChatSlots } from '../../state.js';
import { lockedWriteSlots } from '../../io/dnaWriter.js';
import { BASE_SLOTS, RESERVED_SLOT_KEYS } from '../../defaults.js';
import { slugify, escapeHtml } from '../../utils/history.js';
import { renderStudioView } from './dnaListeners.js';

/**
 * Binds event listeners for wardrobe category management.
 * @param {jQuery} $overlay - The workshop modal overlay.
 */
export function bindSlotHandlers($overlay) {
    
    // ─── Add Category (Custom Slot) ───
    $overlay.on('click', '#plz-studio-add-slot', async function() {
        const id = state._workshopCharacterId;
        if (!id) return;

        const nameRaw = await promptModal('New Category Name');
        const label = (nameRaw ?? '').trim();
        if (!label) return;

        // INDUSTRIAL FIX: Strict slugification of the technical key
        const key = slugify(label);
        
        // NAMESPACE PROTECTION: Check against system-reserved keys
        if (RESERVED_SLOT_KEYS.includes(key)) {
            if (window.toastr) {
                window.toastr.error(`"${label}" is a reserved system keyword and cannot be used as a category name.`, 'PersonaLyze');
            }
            return;
        }

        const char = state.chatCharacters[id];
        const currentSlots = char.slots || [...BASE_SLOTS];

        if (currentSlots.includes(key)) {
            if (window.toastr) window.toastr.warning(`Category "${label}" already exists.`);
            return;
        }

        const newSlots = [...currentSlots, key];
        
        // 1. Update In-Memory State
        upsertChatSlots(id, newSlots);
        
        // 2. Ghost Guard: Skip DNA write if not promoted
        if (id !== '__new__') {
            const lastMsgId = Math.max(0, getContext().chat.length - 1);
            await lockedWriteSlots(lastMsgId, id, newSlots);
        }

        renderStudioView();
    });

    // ─── Delete Category ───
    $overlay.on('click', '.plz-studio-delete-slot', async function() {
        const id = state._workshopCharacterId;
        const key = $(this).data('slot');
        if (!id || !key) return;

        // Safety: Never delete hardcoded system slots
        if (BASE_SLOTS.includes(key)) return;

        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        const confirmed = await confirmModal(`Delete category "<b>${escapeHtml(label)}</b>"?`);
        if (!confirmed) return;

        const char = state.chatCharacters[id];
        const currentSlots = char.slots || [...BASE_SLOTS];
        const newSlots = currentSlots.filter(s => s !== key);

        // 1. Update In-Memory State
        upsertChatSlots(id, newSlots);

        // 2. Ghost Guard: Skip DNA write if not promoted
        if (id !== '__new__') {
            const lastMsgId = Math.max(0, getContext().chat.length - 1);
            await lockedWriteSlots(lastMsgId, id, newSlots);
        }

        // 3. Clean up session-active state if necessary
        if (state.activeLayers && state.activeLayers[key] !== undefined && state.activeCharacterId === id) {
            state.activeLayers[key] = null;
        }

        renderStudioView();
    });
}