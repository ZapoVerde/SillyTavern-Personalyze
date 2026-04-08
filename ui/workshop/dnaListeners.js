/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaListeners.js
 * @stamp {"utc":"2026-04-07T14:00:00.000Z"}
 * @architectural-role UI Controller (Workshop DNA)
 * @description
 * Manages event listeners and rendering for the Chat DNA and Studio tabs.
 * 
 * All interactions here modify the current chat's DNA working copy and 
 * persist changes back to the chat history via dnaWriter.js.
 *
 * @api-declaration
 * renderDNAView() — renders the DNA roster.
 * bindDNAHandlers() — binds all DNA and Studio events.
 *
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [state (mutates local copy)]
 *     external_io: [dnaWriter.js, importExport.js, imageCache.js, portrait.js]
 */

import { getContext } from '../../../../../extensions.js';
import { 
    state, 
    setWorkshopCharacter, 
    upsertChatCharacterDef, 
    upsertChatOutfitDef,
    addToFileIndex,
    removeFromFileIndex,
    updateChainEntry
} from '../../state.js';
import { getSettings } from '../../settings.js';
import { 
    lockedWriteCharacterDef, 
    lockedWriteOutfitDef, 
    lockedPatchVisualStateImage 
} from '../../io/dnaWriter.js';
import { handleSyncRoster, handleExportToLibrary } from '../../logic/importExport.js';
import { buildPortraitPrompt, fetchPreviewBlob, generate, flushCharacterImages } from '../../imageCache.js';
import { getDnaRosterHTML, getStudioHTML, getStudioEmptyHTML } from './dnaTemplates.js';
import { switchTab } from './core.js';
import { smartResize } from '../../utils/dom.js';
import { setPortrait } from '../../portrait.js';
import { log, error } from '../../utils/logger.js';
import { startWorkshopTurn } from '../../utils/callLog.js';

/**
 * Renders the DNA roster into the active panel.
 */
export function renderDNAView() {
    const html = getDnaRosterHTML(state.chatCharacters, state.activeRoster, state.activeCharacterId);
    $('#plz-tab-dna').html(html);
}

/**
 * Renders the Studio for the active workshop character.
 */
export function renderStudioView() {
    const id = state._workshopCharacterId;
    const char = id ? state.chatCharacters[id] : null;
    const $panel = $('#plz-tab-studio');

    if (!id || !char) {
        $panel.html(getStudioEmptyHTML());
        return;
    }

    const s = getSettings();
    const lastExpr = state.characterChain[id]?.expression ?? null;
    $panel.html(getStudioHTML(id, char, state.fileIndex, s.expressionLabels, lastExpr));

    // Multi-pass resize trigger
    const triggerAllResizes = () => {
        $panel.find('.plz-auto-textarea').each(function () { smartResize(this); });
    };
    requestAnimationFrame(() => {
        triggerAllResizes();
        setTimeout(triggerAllResizes, 50);
    });
}

/**
 * Binds all DNA-related events to the workshop overlay.
 * Called once during injection via core.js.
 */
export function bindDNAHandlers() {
    const $overlay = $('#plz-workshop-overlay');

    // ─── DNA Tab Events ──────────────────────────────────────────────────────

    $overlay.on('click', '.plz-dna-toggle', async function(e) {
        e.stopPropagation();
        const id = $(this).closest('.plz-roster-item').data('id');
        const isEnabled = state.activeRoster.includes(id);
        await handleSyncRoster(id, !isEnabled);
        renderDNAView();
    });

    $overlay.on('click', '.plz-dna-edit', function(e) {
        e.stopPropagation();
        const id = $(this).closest('.plz-roster-item').data('id');
        setWorkshopCharacter(id);
        switchTab('studio');
    });

    $overlay.on('click', '.plz-dna-export', async function(e) {
        e.stopPropagation();
        const id = $(this).closest('.plz-roster-item').data('id');
        await handleExportToLibrary(id);
    });

    // ─── Studio Tab Events ───────────────────────────────────────────────────

    $overlay.on('click', '#plz-studio-anchor-save', async function() {
        const id = state._workshopCharacterId;
        const anchor = $('#plz-studio-anchor').val().trim();
        const seed = parseInt($('#plz-studio-seed').val(), 10);
        if (!id || !anchor) return;

        const context = getContext();
        const lastMsgId = Math.max(0, context.chat.length - 1);

        log('Studio', `Committing anchor for "${id}" to DNA...`);
        await lockedWriteCharacterDef(lastMsgId, id, anchor, seed);
        upsertChatCharacterDef(id, anchor, seed);
        
        if (window.toastr) window.toastr.success('Anchor committed to DNA.', 'Personalyze');
    });

    $overlay.on('click', '.plz-entry-save-btn', async function() {
        const id = state._workshopCharacterId;
        const key = $(this).data('key');
        const dim = $(this).data('dimension');
        const $entry = $(this).closest('.plz-studio-entry');
        const desc = $entry.find('.plz-entry-description').val().trim();
        const provider = $entry.find('.plz-entry-provider').val() || 'pollinations';
        const char = state.chatCharacters[id];

        if (!id || !char || dim !== 'outfit') return;

        const context = getContext();
        const lastMsgId = Math.max(0, context.chat.length - 1);
        const label = char.outfits[key]?.label ?? key;

        await lockedWriteOutfitDef(lastMsgId, id, key, label, desc, provider);
        upsertChatOutfitDef(id, key, label, desc, provider);
        
        if (window.toastr) window.toastr.success('Outfit committed to DNA.', 'Personalyze');
    });

    // Portrait Controls
    $overlay.on('click', '.plz-expr-pill', function() {
        const $pill = $(this);
        const $section = $pill.closest('.plz-portrait-section');
        $section.find('.plz-expr-pill').removeClass('plz-expr-selected');
        $pill.addClass('plz-expr-selected');
        $section.attr('data-selected-expr', $pill.data('label'));
        $section.find('button').prop('disabled', false);
    });

    $overlay.on('click', '.plz-portrait-preview-btn', async function() {
        const id = state._workshopCharacterId;
        const outfitKey = $(this).closest('.plz-portrait-section').data('outfit-key');
        const exprLabel = $(this).closest('.plz-portrait-section').attr('data-selected-expr');
        const $entry = $(this).closest('.plz-studio-entry');
        const provider = $entry.find('.plz-entry-provider').val() || 'pollinations';
        const char = state.chatCharacters[id];

        if (!char || !exprLabel) return;
        const $btn = $(this);
        const $icon = $btn.find('i');
        $icon.removeClass('fa-eye').addClass('fa-spinner fa-spin');

        try {
            startWorkshopTurn('Preview');
            const prompt = buildPortraitPrompt(char.identityAnchor, char.outfits[outfitKey].description, exprLabel, provider);
            const blobUrl = await fetchPreviewBlob(prompt, id, provider, char.seed);
            const $area = $(this).closest('.plz-portrait-section').find('.plz-portrait-preview-area');
            $area.find('.plz-portrait-preview-img').attr('src', blobUrl);
            $area.find('.plz-portrait-preview-label').text(`${exprLabel} Preview`);
            $area.removeClass('plz-hidden');
        } catch (err) {
            error('Studio', 'Preview failed:', err);
        } finally {
            $icon.removeClass('fa-spinner fa-spin').addClass('fa-eye');
        }
    });

    $overlay.on('click', '.plz-portrait-generate-btn', async function() {
        const id = state._workshopCharacterId;
        const outfitKey = $(this).closest('.plz-portrait-section').data('outfit-key');
        const exprLabel = $(this).closest('.plz-portrait-section').attr('data-selected-expr');
        const $entry = $(this).closest('.plz-studio-entry');
        const provider = $entry.find('.plz-entry-provider').val() || 'pollinations';
        const char = state.chatCharacters[id];

        if (!char || !exprLabel) return;
        const $btn = $(this);
        $btn.prop('disabled', true);

        try {
            startWorkshopTurn('Generate');
            const filename = await generate(id, outfitKey, exprLabel, char.outfits[outfitKey].description, exprLabel, char.identityAnchor, char.seed, provider);
            addToFileIndex(filename);
            updateChainEntry(id, outfitKey, exprLabel, filename);
            setPortrait(filename);

            const context = getContext();
            let lastAiIdx = -1;
            for (let i = context.chat.length - 1; i >= 0; i--) { if (!context.chat[i].is_user) { lastAiIdx = i; break; } }
            if (lastAiIdx !== -1) await lockedPatchVisualStateImage(lastAiIdx, id, filename);

            renderStudioView();
        } catch (err) {
            error('Studio', 'Generation failed:', err);
        } finally {
            $btn.prop('disabled', false);
        }
    });
}

/**
 * Combined renderer called by core.js
 */
export function renderDNAViewWithBoundHandlers() {
    renderDNAView();
    renderStudioView();
}