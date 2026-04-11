/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaEnsembles.js
 * @stamp {"utc":"2026-04-12T11:40:00.000Z"}
 * @architectural-role UI Sub-module (Wardrobe Snapshots)
 * @description
 * Handles Ensemble management in the Studio. 
 * Allows saving, loading, deleting, and starring (defaulting) wardrobe snapshots.
 * 
 * Implements the Ghost Guard Policy: Blocks DNA writes for '__new__'.
 * 
 * @api-declaration
 * bindEnsembleHandlers($overlay)
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [state.chatCharacters]
 *     external_io: [dnaWriter.js, state.js, dnaListeners.js, DOM]
 */

import { getContext } from '../../../../../extensions.js';
import { callPopup } from '../../../../../../script.js';
import { 
    state, upsertChatEnsemble, deleteChatEnsemble, upsertChatDefaultEnsemble 
} from '../../state.js';
import { 
    lockedWriteEnsemble, lockedDeleteEnsemble, lockedWriteDefaultEnsemble 
} from '../../io/dnaWriter.js';
import { META_SLOTS } from '../../defaults.js';
import { slugify } from '../../utils/history.js';
import { getGridLayers, renderStudioView } from './dnaListeners.js';

/**
 * Binds event listeners for Ensemble (wardrobe snapshot) management.
 * @param {jQuery} $overlay - The workshop modal overlay.
 */
export function bindEnsembleHandlers($overlay) {

    // ─── Save Current Grid as Ensemble ───
    $overlay.on('click', '.plz-save-ensemble-btn', async function() {
        const id = state._workshopCharacterId;
        if (!id || id === '__new__') return; // Ghost Guard

        const name = await callPopup('Save current layers as Ensemble:', 'input', '');
        if (!name) return;

        const layers = getGridLayers();
        const key = slugify(name);
        
        // 1. Update In-Memory State
        upsertChatEnsemble(id, key, name, layers);
        
        // 2. Commit to Chat DNA
        const lastMsgId = Math.max(0, getContext().chat.length - 1);
        await lockedWriteEnsemble(lastMsgId, id, key, name, layers);
        
        renderStudioView();
    });

    // ─── Load Ensemble into Grid ───
    $overlay.on('click', '.plz-ensemble-load', function() {
        const id = state._workshopCharacterId;
        const key = $(this).closest('.plz-ensemble-item').data('key');
        if (!id || !key) return;

        const ensemble = state.chatCharacters[id].ensembles[key];
        if (!ensemble) return;

        const layers = ensemble.layers;
        
        // Populate meta-slots
        $('#plz-layer-emotion').val(layers.emotion || '').trigger('input');
        $('#plz-layer-pose').val(layers.pose || '').trigger('input');

        // Populate clothing slots
        Object.entries(layers).forEach(([slot, val]) => {
            if (META_SLOTS.includes(slot)) return;
            $(`.plz-layer-item[data-slot="${slot}"]`).val(val?.item || '').trigger('input');
            $(`.plz-layer-mod[data-slot="${slot}"]`).val(val?.modifier || '').trigger('input');
        });
    });

    // ─── Delete Ensemble ───
    $overlay.on('click', '.plz-ensemble-delete', async function() {
        const id = state._workshopCharacterId;
        const key = $(this).closest('.plz-ensemble-item').data('key');
        if (!id || !key) return;

        if (id !== '__new__') {
            const lastMsgId = Math.max(0, getContext().chat.length - 1);
            await lockedDeleteEnsemble(lastMsgId, id, key);
        }

        deleteChatEnsemble(id, key); // Memory update
        renderStudioView();
    });

    // ─── Set Default (Everyday Wear) ───
    $overlay.on('click', '.plz-ensemble-star', async function() {
        const id = state._workshopCharacterId;
        const key = $(this).closest('.plz-ensemble-item').data('key');
        if (!id || !key) return;

        upsertChatDefaultEnsemble(id, key); // Memory update

        if (id !== '__new__') {
            const lastMsgId = Math.max(0, getContext().chat.length - 1);
            await lockedWriteDefaultEnsemble(lastMsgId, id, key);
        }
        
        renderStudioView();
    });
}