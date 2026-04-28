/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaIdentity.js
 * @stamp {"utc":"2026-04-17T13:15:00.000Z"}
 * @architectural-role UI Sub-module (Metadata & Identity)
 * @description
 * Handles basic character metadata and granular physical identity in the Studio.
 * Manages Display Name, Physical Traits Grid, Aliases (AKA), and style pinning.
 * 
 * Updated for Granular Identity Architecture:
 * 1. Replaced monolithic anchor listener with debounced Identity Grid handlers.
 * 2. Implemented dynamic Physical Feature (Special_x) addition and deletion.
 * 3. Ensured DNA writes use the structured identity map to prevent data loss.
 * 
 * @api-declaration
 * bindIdentityHandlers($overlay)
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [state.chatCharacters]
 *     external_io: [dnaWriter.js, state.js, imageCache.js, portrait.js, DOM, callPopup]
 */

import { getContext } from '../../../../../extensions.js';
import {
    state, upsertChatCharacterDef, upsertChatCharacterLabel, 
    upsertChatCharacterAka, 
    upsertChatCharacterStyle,
    updateActiveImage, updateChainLayers, removeFromFileIndex,
    ensureChatChar
} from '../../state.js';
import { 
    lockedWriteCharacterDef, lockedWriteLabel, lockedWriteAka,
    lockedWriteCharacterStyle, lockedWriteIdentityUpdate
} from '../../io/dnaWriter.js';
import { deleteFiles, fetchFileIndex } from '../../imageCache.js';
import { clearPortrait } from '../../portrait.js';
import { smartResize } from '../../utils/dom.js';
import { updateSetting } from '../../settings.js';
import { confirmModal, promptModal } from '../../utils/modal.js';
import { slugify, escapeHtml } from '../../utils/history.js';
import { error } from '../../utils/logger.js';
import { syncCharacterToLorebook } from '../../logic/pipeline/lorebookSync.js';
import { BASE_IDENTITY_SLOTS } from '../../defaults.js';
import { renderStudioView } from './dnaListeners.js';

let identitySaveTimeout = null;
let labelSaveTimeout    = null;
let seedSaveTimeout     = null;

/**
 * Scrapes the Physical Identity grid and returns a clean map of strings.
 * @returns {Object}
 */
function getIdentityGridMap() {
    const map = {};
    $('.plz-studio-identity-item').each(function() {
        const key = $(this).data('key');
        map[key] = $(this).val().trim();
    });
    return map;
}

/**
 * Binds event listeners for character identity and metadata.
 * @param {jQuery} $overlay - The workshop modal overlay.
 */
export function bindIdentityHandlers($overlay) {

    // ─── Granular Identity Grid (Physical Traits) ───
    $overlay.on('input', '.plz-studio-identity-item', function() {
        clearTimeout(identitySaveTimeout);
        identitySaveTimeout = setTimeout(async () => {
            const id = state._workshopCharacterId;
            if (!id) return;
            
            const identity = getIdentityGridMap();
            const char = state.chatCharacters[id];

            // Memory Update
            upsertChatCharacterDef(id, identity, char.seed); 
            
            if (id === '__new__') return; // Ghost Guard
            
            const lastMsgId = Math.max(0, getContext().chat.length - 1);
            await lockedWriteIdentityUpdate(lastMsgId, id, identity);

            syncCharacterToLorebook(id, char.label || id, identity, char.aka ?? [])
                .catch(err => error('Identity', 'LB sync failed:', err));
        }, 600);
    });

    // ─── Add/Delete Physical Feature ───
    $overlay.on('click', '#plz-studio-add-feature', async function() {
        const id = state._workshopCharacterId;
        if (!id) return;

        const nameRaw = await promptModal('New Physical Feature');
        const label = (nameRaw ?? '').trim();
        if (!label) return;

        const key = slugify(label);
        const char = state.chatCharacters[id];
        
        if (char.identity[key] !== undefined) {
            if (window.toastr) window.toastr.warning(`Feature "${label}" already exists.`);
            return;
        }

        // Update memory and re-render
        char.identity[key] = '';
        renderStudioView();
    });

    $overlay.on('click', '.plz-studio-delete-identity', async function() {
        const id = state._workshopCharacterId;
        const key = $(this).data('key');
        if (!id || !key) return;

        // Safety: Never delete hardcoded base slots
        if (BASE_IDENTITY_SLOTS.includes(key) || key === 'base') return;

        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        const confirmed = await confirmModal(`Delete physical feature "<b>${escapeHtml(label)}</b>"?`);
        if (!confirmed) return;

        const char = state.chatCharacters[id];
        delete char.identity[key];

        if (id !== '__new__') {
            const lastMsgId = Math.max(0, getContext().chat.length - 1);
            await lockedWriteIdentityUpdate(lastMsgId, id, char.identity);
            syncCharacterToLorebook(id, char.label || id, char.identity, char.aka ?? [])
                .catch(err => error('Identity', 'LB sync failed:', err));
        }

        renderStudioView();
    });

    // ─── Identity Seed ───
    $overlay.on('input', '#plz-studio-seed', function() {
        clearTimeout(seedSaveTimeout);
        seedSaveTimeout = setTimeout(async () => {
            const id = state._workshopCharacterId;
            let seedVal = parseInt($(this).val(), 10);
            if (!id || isNaN(seedVal)) return;

            seedVal = Math.max(-1, Math.min(seedVal, 999));
            $(this).val(seedVal);

            const char = state.chatCharacters[id];
            const currentIdentity = getIdentityGridMap();

            // Memory Update
            upsertChatCharacterDef(id, currentIdentity, seedVal);

            if (id === '__new__') return; // Ghost Guard

            const lastMsgId = Math.max(0, getContext().chat.length - 1);
            // Anchor Trap protection: Pass full identity map
            await lockedWriteCharacterDef(lastMsgId, id, currentIdentity, seedVal);
        }, 600);
    });

    // ─── Seed Increment Preference ───
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
            
            upsertChatCharacterLabel(id, label); 
            
            if (id === '__new__') return; // Ghost Guard
            
            const lastMsgId = Math.max(0, getContext().chat.length - 1);
            await lockedWriteLabel(lastMsgId, id, label);

            const char = state.chatCharacters[id];
            if (char?.identity) {
                syncCharacterToLorebook(id, label, char.identity, char.aka ?? [])
                    .catch(err => error('Identity', 'LB sync failed:', err));
            }
        }, 800);
    });

    // ─── AKA / Alias Management ───
    async function commitAka(id, newList) {
        upsertChatCharacterAka(id, newList); 
        
        const akaTagsHTML = newList.map(alias => `
            <span class="plz-aka-tag" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;background:rgba(255,255,255,0.08);font-size:0.8em;">
                ${escapeHtml(alias)}<i class="fa-solid fa-xmark plz-aka-remove" data-alias="${escapeHtml(alias)}" style="cursor:pointer;opacity:0.6;"></i>
            </span>`).join('');
        $('#plz-studio-aka-tags').html(akaTagsHTML || '<span style="opacity:0.3;font-size:0.8em;">No aliases yet.</span>');

        if (id === '__new__') return; 
        
        const lastMsgId = Math.max(0, getContext().chat.length - 1);
        await lockedWriteAka(lastMsgId, id, newList);

        const char = state.chatCharacters[id];
        if (char?.identity) {
            syncCharacterToLorebook(id, char.label || id, char.identity, newList)
                .catch(err => error('Identity', 'LB sync failed:', err));
        }
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
        
        upsertChatCharacterStyle(id, styleName); 
        
        if (id === '__new__') return; 
        
        const lastMsgId = Math.max(0, getContext().chat.length - 1);
        await lockedWriteCharacterStyle(lastMsgId, id, styleName);
    });

    // ─── Maintenance: Purge Portraits ───
    $overlay.on('click', '#plz-studio-purge', async function() {
        const id = state._workshopCharacterId;
        if (!id || id === '__new__') return; 
        
        const displayName = state.chatCharacters[id]?.label || id.replace(/_/g, ' ');
        const confirmed = await confirmModal(
            `Delete all generated portraits for <b>${escapeHtml(displayName)}</b>?<br><br><small>This will free up disk space but requires re-generating images for all visual states.</small>`
        );
        if (!confirmed) return;

        const { fileIndex } = await fetchFileIndex();
        const prefix = `plz_${id}_`;
        const toDelete = Array.from(fileIndex).filter(f => f.startsWith(prefix));
        
        if (toDelete.length > 0) {
            await deleteFiles(toDelete);
            removeFromFileIndex(toDelete);
        }

        if (state.characterChain[id]) {
            updateChainLayers(id, state.characterChain[id].layers, null);
        }

        if (state.activeCharacterId === id) {
            updateActiveImage(null);
            clearPortrait();
        }

        if (window.toastr) {
            window.toastr.success(`${toDelete.length} portrait${toDelete.length !== 1 ? 's' : ''} deleted for ${displayName}.`);
        }
    });
}