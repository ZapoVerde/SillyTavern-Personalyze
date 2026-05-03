/**
 * @file data/default-user/extensions/personalyze/ui/roster/controls.js
 * @stamp {"utc":"2026-05-01T22:30:00.000Z"}
 * @architectural-role UI Orchestrator
 * @description
 * Manages global event delegation for the character roster UI.
 * Handles card-level interactions including gear menu, removal, and addition.
 *
 * Updated for Smart Refresh:
 * 1. Integrated evaluateLogic into the manual refresh handler.
 * 2. Manual refresh now re-calculates logic probes before generation.
 *
 * @api-declaration
 * bindRosterControls() -> void
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: [state.activeRoster]
 *     external_io: [DOM, state.js, dnaWriter.js, charPicker.js, imageCache.js, logger.js, callLog.js, logicPhase.js]
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
import { generate, deleteFiles, resolveStyle } from '../../imageCache.js';
import { slugify, buildHistoryText } from '../../utils/history.js';
import { getSettings } from '../../settings.js';
import { getContext } from '../../../../../extensions.js';
import { error } from '../../utils/logger.js';
import { startWorkshopTurn } from '../../utils/callLog.js';
import { setWorkshopCharacter } from '../../state.js';
import { openWorkshop } from '../workshop/core.js';
import { evaluateLogic } from '../../logic/pipeline/logicPhase.js';

/**
 * Clamps the controls bar (and gear menu) to the viewport by setting
 * --plz-controls-dx on the card. Resets before measuring so prior offsets
 * don't corrupt the rect calculation.
 * @param {jQuery} $card
 */
function _clampControls($card) {
    const card = $card[0];
    if (!card) return;
    card.style.removeProperty('--plz-controls-dx');
    const el = card.querySelector('.plz-card-controls');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;

    // Measure the right edge of any visible left-side VN buttons (hamburger + toggle)
    // so the controls bar slides past them rather than hiding underneath.
    let leftBoundary = 0;
    document.querySelectorAll('#plz-vn-toggle-btn, .plz-vn-add-wrapper').forEach(btn => {
        if (btn.offsetParent !== null) {
            leftBoundary = Math.max(leftBoundary, btn.getBoundingClientRect().right);
        }
    });

    let dx = 0;
    if (rect.left < leftBoundary) dx = leftBoundary - rect.left;
    else if (rect.right > vw) dx = vw - rect.right;
    if (dx !== 0) card.style.setProperty('--plz-controls-dx', `${Math.round(dx)}px`);
}

/** Closes the gear portal and clears its active character ID. */
function _closePortal() {
    $('#plz-gear-portal').removeClass('plz-gear-open').removeData('portal-char-id');
}

export function bindRosterControls() {
    // Inject the gear portal into <body> once.
    // The portal escapes #plz-vn-panel's fixed-position stacking context so it
    // can render above #sheld (z-index 30) even when the gear menu extends into
    // the chat area at small split sizes or in overlap mode.
    if (!document.getElementById('plz-gear-portal')) {
        $('body').append(`
            <div id="plz-gear-portal">
                <button class="plz-card-btn plz-gear-flip" title="Mirror Portrait"><i class="fa-solid fa-arrows-left-right"></i></button>
                <button class="plz-card-btn plz-gear-edit" title="Edit Appearance"><i class="fa-solid fa-pen"></i></button>
                <button class="plz-card-btn plz-gear-promote" title="Promote to Focus"><i class="fa-solid fa-arrow-up-right-dots"></i></button>
                <button class="plz-card-btn plz-gear-update-apparel" title="Update Apparel"><i class="fa-solid fa-shirt"></i></button>
                <button class="plz-card-btn plz-gear-open-workshop" title="Open Workshop"><i class="fa-solid fa-flask"></i></button>
                <button class="plz-card-btn plz-gear-open-style" title="Open Style Editor"><i class="fa-solid fa-palette"></i></button>
            </div>
        `);
    }

    // Close portal whenever the roster changes (card may have been removed).
    document.addEventListener('plz:roster-changed', _closePortal);

    const $doc = $(document);

    // 0. Viewport clamping — recalculate offset whenever a card is hovered
    $doc.on('mouseenter', '.plz-portrait-card', function() {
        _clampControls($(this));
    });

    // 0b. Click-away — dismiss active controls and open gear menus when clicking outside any card
    $doc.on('click', function(e) {
        if (!$(e.target).closest('.plz-portrait-card, #plz-gear-portal').length) {
            $('.plz-portrait-card').removeClass('plz-controls-active');
            $('.plz-gear-menu').removeClass('plz-gear-open');
            _closePortal();
        }
    });

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
        _closePortal();
        if (!wasActive) {
            $card.addClass('plz-controls-active');
            _clampControls($card);
        }
    });

    // 2. Gear Button — Toggle Sub-menu
    // In VN mode (#plz-vn-panel is a fixed stacking context below #sheld) the
    // in-card .plz-gear-menu would be hidden behind the chat when it extends into
    // the chat area. Use the body-level #plz-gear-portal instead.
    $doc.on('click', '.plz-card-gear', function(e) {
        e.stopPropagation();

        if (document.body.classList.contains('plz-vn-active')) {
            const $portal = $('#plz-gear-portal');
            const charId = $(this).closest('.plz-portrait-card').data('id');
            const wasOpen = $portal.data('portal-char-id') === charId && $portal.hasClass('plz-gear-open');

            $('.plz-gear-menu').removeClass('plz-gear-open');
            _closePortal();

            if (!wasOpen) {
                const rect = this.getBoundingClientRect();
                $portal
                    .data('portal-char-id', charId)
                    .css({ left: rect.left + 'px', top: (rect.bottom + 4) + 'px' })
                    .addClass('plz-gear-open');
            }
        } else {
            const $menu = $(this).closest('.plz-portrait-card').find('.plz-gear-menu');
            const wasOpen = $menu.hasClass('plz-gear-open');
            $('.plz-gear-menu').removeClass('plz-gear-open');
            if (!wasOpen) $menu.addClass('plz-gear-open');
        }
    });

    // Helper: resolve character ID from portal (VN mode) or in-card menu (floating mode).
    function _gearId($el) {
        return $('#plz-gear-portal').data('portal-char-id') || $el.closest('.plz-portrait-card').data('id');
    }

    // 3. Gear Action: Flip
    $doc.on('click', '.plz-gear-flip', function(e) {
        e.stopPropagation();
        const id = _gearId($(this));
        if (id) {
            toggleCharacterFlip(id);
            $(this).closest('.plz-gear-menu').removeClass('plz-gear-open');
            _closePortal();
        }
    });

    // 4. Gear Action: Edit Appearance (opens the character picker pre-selected to this card's char)
    $doc.on('click', '.plz-gear-edit', async function(e) {
        e.stopPropagation();
        const id = _gearId($(this));
        $(this).closest('.plz-gear-menu').removeClass('plz-gear-open');
        _closePortal();
        const { openCharPicker } = await import('../charPicker.js');
        await openCharPicker(null, id || null);
    });

    // 5. Gear Action: Promote to Focus
    // Fires an event; vnPanel.js owns _focusCardId and handles the state update.
    $doc.on('click', '.plz-gear-promote', function(e) {
        e.stopPropagation();
        const id = _gearId($(this));
        if (id) {
            $(this).closest('.plz-gear-menu').removeClass('plz-gear-open');
            $(this).closest('.plz-portrait-card').removeClass('plz-controls-active');
            _closePortal();
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

    // 8. Gear Action: Force Apparel Update
    // Bypasses the Phase 2 Change Gate and runs Phase 3 extraction directly.
    // Fire-and-forget: spinner feedback is delivered via plz:portrait-status events.
    $doc.on('click', '.plz-gear-update-apparel', function(e) {
        e.stopPropagation();
        const id = _gearId($(this));
        if (id) {
            $(this).closest('.plz-gear-menu').removeClass('plz-gear-open');
            _closePortal();
            import('../../logic/pipeline/forceUpdate.js').then(({ forceApparelUpdate }) => {
                forceApparelUpdate(id);
            });
        }
    });

    // 9. Gear Action: Open Workshop for character
    $doc.on('click', '.plz-gear-open-workshop', function(e) {
        e.stopPropagation();
        const id = _gearId($(this));
        if (id) {
            $(this).closest('.plz-gear-menu').removeClass('plz-gear-open');
            _closePortal();
            setWorkshopCharacter(id);
            openWorkshop('studio');
        }
    });

    // 10. Gear Action: Open Style Editor for character
    $doc.on('click', '.plz-gear-open-style', function(e) {
        e.stopPropagation();
        const id = _gearId($(this));
        if (id) {
            $(this).closest('.plz-gear-menu').removeClass('plz-gear-open');
            _closePortal();
            setWorkshopCharacter(id);
            openWorkshop('styles');
        }
    });

    // 11. Refresh / Re-generate (Generation Economy)
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

        // --- SMART REFRESH: Re-evaluate Logic Probes before generating ---
        const history = buildHistoryText(getContext().chat, lastAiIdx, s.detectionHistory ?? 4);
        const message = getContext().chat[lastAiIdx];
        const styleObj = resolveStyle(id);
        await evaluateLogic(id, layers, layers, styleObj, message.mes, history, undefined, char.identity);

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