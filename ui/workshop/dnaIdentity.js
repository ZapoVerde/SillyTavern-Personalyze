/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaIdentity.js
 * @stamp {"utc":"2026-04-19T22:35:00.000Z"}
 * @architectural-role UI Sub-module (Metadata & Identity)
 * @description
 * Handles basic character metadata and identity management in the Studio.
 * Manages Display Name, Identity Anchor, Aliases (AKA), and style pinning.
 * 
 * Updated for Explicit Seed Architecture (Bug Fixes):
 * 1. Added listener for #plz-studio-inc to sync global autoIncrementSeed (Fixes Bug 1).
 * 2. Implemented strict clamping (-1 to 999) for the seed input.
 * 3. Standardized on parseInt(..., 10) for safe conversion.
 * 
 * @api-declaration
 * bindIdentityHandlers($overlay)
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [state.chatCharacters]
 *     external_io: [dnaWriter.js, state.js, imageCache.js, portrait.js, DOM]
 */

import { getContext } from '../../../../../extensions.js';
import {
    state, upsertChatCharacterDef, upsertChatCharacterLabel, 
    upsertChatCharacterAka, 
    upsertChatCharacterStyle,
    updateActiveImage, updateChainLayers, removeFromFileIndex
} from '../../state.js';
import { 
    lockedWriteCharacterDef, lockedWriteLabel, lockedWriteAka,
    lockedWriteCharacterStyle
} from '../../io/dnaWriter.js';
import { deleteFiles, fetchFileIndex } from '../../imageCache.js';
import { clearPortrait } from '../../portrait.js';
import { smartResize } from '../../utils/dom.js';
import { updateSetting } from '../../settings.js';

let anchorSaveTimeout = null;
let labelSaveTimeout  = null;
let seedSaveTimeout   = null;

/**
 * Binds event listeners for character identity and metadata.
 * @param {jQuery} $overlay - The workshop modal overlay.
 */
export function bindIdentityHandlers($overlay) {

    // ─── Identity Anchor (Physical Bio) ───
    $overlay.on('input', '#plz-studio-anchor', function() {
        smartResize(this);
        clearTimeout(anchorSaveTimeout);
        anchorSaveTimeout = setTimeout(async () => {
            const id = state._workshopCharacterId;
            const anchor = $('#plz-studio-anchor').val().trim();
            if (!id) return;
            
            const char = state.chatCharacters[id];
            // Memory Update
            upsertChatCharacterDef(id, anchor, char.seed); 
            
            if (id === '__new__') return; // Ghost Guard
            
            const lastMsgId = Math.max(0, getContext().chat.length - 1);
            await lockedWriteCharacterDef(lastMsgId, id, anchor, char.seed);
        }, 600);
    });

    // ─── Identity Seed ───
    $overlay.on('input', '#plz-studio-seed', function() {
        clearTimeout(seedSaveTimeout);
        seedSaveTimeout = setTimeout(async () => {
            const id = state._workshopCharacterId;
            let seedVal = parseInt($(this).val(), 10);
            if (!id || isNaN(seedVal)) return;

            // Strict 3-Digit Clamping
            seedVal = Math.max(-1, Math.min(seedVal, 999));
            
            // Sync UI to clamped value
            $(this).val(seedVal);

            const char = state.chatCharacters[id];
            const currentAnchor = char.identityAnchor || '';

            // Memory Update
            upsertChatCharacterDef(id, currentAnchor, seedVal);

            if (id === '__new__') return; // Ghost Guard

            const lastMsgId = Math.max(0, getContext().chat.length - 1);
            // Anchor Trap protection: passing the currentAnchor ensures the bio 
            // is not wiped during the seed update.
            await lockedWriteCharacterDef(lastMsgId, id, currentAnchor, seedVal);
        }, 600);
    });

    // ─── Seed Increment Preference (Fixes Bug 1) ───
    $overlay.on('change', '#plz-studio-inc', function() {
        const checked = $(this).prop('checked');
        updateSetting('autoIncrementSeed', checked);
    });

    // ─── Display Name (Label) ───
    $overlay.on('input', '#plz-studio-label', function() {
        clearTimeout(labelSaveTimeout);
        labelSaveTimeout = setTimeout(async () => {
            const id = state._workshopCharacterId;
            const label = $('#plz-studio-label').val().trim();
            if (!id || !label) return;
            
            upsertChatCharacterLabel(id, label); // Memory update
            
            if (id === '__new__') return; // Ghost Guard
            
            const lastMsgId = Math.max(0, getContext().chat.length - 1);
            await lockedWriteLabel(lastMsgId, id, label);
        }, 800);
    });

    // ─── AKA / Alias Management ───
    async function commitAka(id, newList) {
        upsertChatCharacterAka(id, newList); // Memory update
        
        // Refresh tag UI
        const akaTagsHTML = newList.map(alias => `
            <span class="plz-aka-tag" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;background:rgba(255,255,255,0.08);font-size:0.8em;">
                ${$('<div>').text(alias).html()}<i class="fa-solid fa-xmark plz-aka-remove" data-alias="${$('<div>').text(alias).html()}" style="cursor:pointer;opacity:0.6;"></i>
            </span>`).join('');
        $('#plz-studio-aka-tags').html(akaTagsHTML || '<span style="opacity:0.3;font-size:0.8em;">No aliases yet.</span>');

        if (id === '__new__') return; // Ghost Guard
        
        const lastMsgId = Math.max(0, getContext().chat.length - 1);
        await lockedWriteAka(lastMsgId, id, newList);
    }

    $overlay.on('click', '.plz-aka-add', async function() {
        const id = state._workshopCharacterId;
        if (!id) return;
        const input = $('#plz-studio-aka-input');
        const alias = input.val().trim();
        if (!alias) return;
        const current = state.chatCharacters[id]?.aka || [];
        if (current.includes(alias)) { input.val(''); return; }
        await commitAka(id, [...current, alias]);
        input.val('');
    });

    $overlay.on('keydown', '#plz-studio-aka-input', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            $overlay.find('.plz-aka-add').trigger('click');
        }
    });

    $overlay.on('click', '.plz-aka-remove', async function() {
        const id = state._workshopCharacterId;
        const alias = $(this).data('alias');
        if (!id || !alias) return;
        const current = state.chatCharacters[id]?.aka || [];
        await commitAka(id, current.filter(a => a !== alias));
    });

    // ─── Style Pinning ───
    $overlay.on('change', '#plz-studio-style', async function() {
        const id = state._workshopCharacterId;
        if (!id) return;
        const styleName = $(this).val() || null;
        
        upsertChatCharacterStyle(id, styleName); // Memory update
        
        if (id === '__new__') return; // Ghost Guard
        
        const lastMsgId = Math.max(0, getContext().chat.length - 1);
        await lockedWriteCharacterStyle(lastMsgId, id, styleName);
    });

    // ─── Maintenance: Purge Portraits ───
    $overlay.on('click', '#plz-studio-purge', async function() {
        const id = state._workshopCharacterId;
        if (!id || id === '__new__') return; // Ghost Guard
        
        const displayName = state.chatCharacters[id]?.label || id.replace(/_/g, ' ');
        const confirmed = await callPopup(
            `Delete all generated portraits for <b>${$('<div>').text(displayName).html()}</b>?<br><br><small>This will free up disk space but requires re-generating images for all visual states.</small>`,
            `confirm`
        );
        if (!confirmed) return;

        // Scour index for this character's files
        const { fileIndex } = await fetchFileIndex();
        const prefix = `plz_${id}_`;
        const toDelete = Array.from(fileIndex).filter(f => f.startsWith(prefix));
        
        if (toDelete.length > 0) {
            await deleteFiles(toDelete);
            removeFromFileIndex(toDelete);
        }

        // Clear the chain image pointer
        if (state.characterChain[id]) {
            updateChainLayers(id, state.characterChain[id].layers, null);
        }

        // Clear active portrait if this is the current character
        if (state.activeCharacterId === id) {
            updateActiveImage(null);
            clearPortrait();
        }

        if (window.toastr) {
            window.toastr.success(`${toDelete.length} portrait${toDelete.length !== 1 ? 's' : ''} deleted for ${displayName}.`);
        }
    });
}