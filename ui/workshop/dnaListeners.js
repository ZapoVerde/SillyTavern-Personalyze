/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaListeners.js
 * @stamp {"utc":"2026-04-09T00:00:00.000Z"}
 * @architectural-role UI Controller (Workshop DNA)
 * @description
 * Manages event listeners and rendering for the Chat DNA, Studio, and Add tabs.
 *
 * All interactions here modify the current chat's DNA working copy and
 * persist changes back to the chat history via dnaWriter.js. This is the
 * Stateful Owner for DNA-side workshop interactions.
 *
 * Add Tab: creates a new character definition directly in the active chat's
 * DNA (lockedWriteCharacterDef). This upholds the DNA Chain principle — the
 * chat log remains the only source of truth for narrative character state.
 *
 * Anchor Scan: dispatches a detectAnchorScan LLM call (IO Executor) to
 * extract character name and identity anchor from the current chat transcript.
 * Works in both 'studio' mode (updates existing anchor) and 'add' mode
 * (pre-fills the Add tab form).
 *
 * @api-declaration
 * renderDNAView()  — renders the DNA tab roster.
 * renderStudioView() — renders the Studio tab for the active workshop character.
 * bindDNAHandlers() — binds all DNA, Studio, and Add tab event handlers.
 *
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [state (mutates via setters)]
 *     external_io: [dnaWriter.js, importExport.js, imageCache.js, portrait.js, detector.js]
 */

import { getContext } from '../../../../../extensions.js';
import {
    state,
    setActiveRoster,
    setWorkshopCharacter,
    upsertChatCharacterDef,
    upsertChatOutfitDef,
    upsertChatExpressionDef,
    deleteChatOutfitDef,
    addToFileIndex,
    removeFromFileIndex,
    updateChainEntry
} from '../../state.js';
import { getSettings } from '../../settings.js';
import { slugify, buildDescriberContext } from '../../utils/history.js';
import {
    lockedWriteCharacterDef,
    lockedWriteOutfitDef,
    lockedWriteOutfitDelete,
    lockedWriteExpressionDef,
    lockedWriteRoster,
    lockedPatchVisualStateImage
} from '../../io/dnaWriter.js';
import { detectAnchorScan, detectOutfitGenerator, detectOutfitGeneratorScan } from '../../detector.js';
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
        const previousRoster = [...state.activeRoster];
        const newRoster = isEnabled
            ? state.activeRoster.filter(x => x !== id)
            : [...state.activeRoster, id];

        // Optimistic update — render immediately, persist in the background.
        setActiveRoster(newRoster);
        renderDNAView();

        handleSyncRoster(id, !isEnabled).catch(err => {
            error('Workshop', 'Roster toggle failed, rolling back:', err);
            setActiveRoster(previousRoster);
            renderDNAView();
            if (window.toastr) window.toastr.error(`Roster update failed: ${err.message}`, 'Personalyze');
        });
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

    // ─── Add Outfit / Expression ─────────────────────────────────────────────

    $overlay.on('click', '.plz-add-entry-btn', async function() {
        const id        = state._workshopCharacterId;
        const dimension = $(this).data('dimension');
        if (!id) return;

        const { callPopup } = await import('../../../../../../script.js');
        const label = dimension === 'outfit' ? 'Outfit' : 'Expression';

        const generatorSection = dimension === 'outfit' ? `
            <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--SmartThemeBorderColor,#444);">
                <label style="display:block;margin-bottom:6px;font-size:0.88em;opacity:0.75;">Generate Description</label>
                <input type="text" id="plz-gen-keyword" class="text_pole" placeholder="e.g. summer dress, knight armor..." style="width:100%;margin-bottom:8px;" />
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <label class="checkbox_label" style="font-size:0.85em;cursor:pointer;">
                        <input type="checkbox" id="plz-gen-scan-turn" />
                        <span>Scan current turn</span>
                    </label>
                </div>
                <button id="plz-outfit-gen-btn" class="menu_button" style="width:100%;font-size:0.85em;">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Generate Description
                </button>
            </div>` : '';

        if (dimension === 'outfit') {
            $(document).on('click.plz-outfit-gen', '#plz-outfit-gen-btn', async function () {
                const $btn  = $(this);
                const $icon = $btn.find('i');
                const keyword   = $('#plz-gen-keyword').val().trim();
                const scanTurn  = $('#plz-gen-scan-turn').prop('checked');

                $icon.removeClass('fa-wand-magic-sparkles').addClass('fa-spinner fa-spin');
                $btn.prop('disabled', true);

                try {
                    const s = getSettings();
                    let description = null;

                    if (scanTurn) {
                        const context = getContext();
                        const chat    = context?.chat ?? [];
                        let aiMsg = null, userMsg = null;
                        for (let i = chat.length - 1; i >= 0; i--) {
                            if (!aiMsg && !chat[i].is_user) { aiMsg = chat[i]; continue; }
                            if (aiMsg && chat[i].is_user)  { userMsg = chat[i]; break; }
                        }
                        const turnText = [
                            userMsg ? `${userMsg.name ?? 'User'}: ${userMsg.mes}` : '',
                            aiMsg   ? `${aiMsg.name ?? 'AI'}: ${aiMsg.mes}`       : '',
                        ].filter(Boolean).join('\n\n');
                        const charName = id.replace(/_/g, ' ');

                        startWorkshopTurn('Outfit Generator (Scan)');
                        description = await detectOutfitGeneratorScan(charName, turnText, keyword, s.outfitGeneratorScanPrompt, s.describerProfileId);
                    } else {
                        if (!keyword) {
                            if (window.toastr) window.toastr.warning('Enter a keyword to generate from.', 'Personalyze');
                            return;
                        }
                        startWorkshopTurn('Outfit Generator');
                        description = await detectOutfitGenerator(keyword, s.outfitGeneratorPrompt, s.describerProfileId);
                    }

                    if (description) {
                        const $desc = $('#plz-add-entry-desc');
                        $desc.val(description).trigger('input');
                        smartResize($desc[0]);
                    } else {
                        if (window.toastr) window.toastr.warning('Could not generate a description.', 'Personalyze');
                    }
                } catch (err) {
                    error('Workshop', 'Outfit generation failed:', err);
                    if (window.toastr) window.toastr.error(`Generation failed: ${err.message}`, 'Personalyze');
                } finally {
                    $icon.removeClass('fa-spinner fa-spin').addClass('fa-wand-magic-sparkles');
                    $btn.prop('disabled', false);
                }
            });
        }

        const confirmed = await callPopup(
            `<h3 style="margin-top:0;">Add ${label}</h3>
            <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Label</label>
            <input type="text" id="plz-add-entry-label" class="text_pole" style="width:100%;" />
            <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Key (auto-generated)</label>
            <input type="text" id="plz-add-entry-key" class="text_pole" readonly style="width:100%;opacity:0.6;cursor:not-allowed;" />
            <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Description</label>
            <textarea id="plz-add-entry-desc" class="text_pole plz-auto-textarea" rows="3" style="width:100%;font-family:monospace;font-size:0.9em;overflow:hidden;resize:none;"></textarea>
            ${generatorSection}`,
            'confirm'
        );

        if (dimension === 'outfit') {
            $(document).off('click.plz-outfit-gen');
        }

        if (!confirmed) return;

        const entryLabel = $('#plz-add-entry-label').val().trim();
        const key        = slugify(entryLabel);
        const desc       = $('#plz-add-entry-desc').val().trim();
        if (!entryLabel || !key) {
            if (window.toastr) window.toastr.warning('Label is required.', 'Personalyze');
            return;
        }

        const context   = getContext();
        const lastMsgId = Math.max(0, context.chat.length - 1);

        if (dimension === 'outfit') {
            await lockedWriteOutfitDef(lastMsgId, id, key, entryLabel, desc, 'pollinations');
            upsertChatOutfitDef(id, key, entryLabel, desc, 'pollinations');
        } else {
            await lockedWriteExpressionDef(lastMsgId, id, key, entryLabel, desc);
            upsertChatExpressionDef(id, key, entryLabel, desc);
        }

        renderStudioView();
        if (window.toastr) window.toastr.success(`${label} "${entryLabel}" added to DNA.`, 'Personalyze');
    });

    // ─── Delete Outfit ───────────────────────────────────────────────────────

    $overlay.on('click', '.plz-entry-delete-btn', async function() {
        const id  = state._workshopCharacterId;
        const key = $(this).data('key');
        if (!id || !key) return;

        const outfitLabel = state.chatCharacters[id]?.outfits[key]?.label ?? key;
        if (!confirm(`Delete outfit "${outfitLabel}" from DNA?\n\nThis cannot be undone.`)) return;

        const context   = getContext();
        const lastMsgId = Math.max(0, context.chat.length - 1);
        await lockedWriteOutfitDelete(lastMsgId, id, key);
        deleteChatOutfitDef(id, key);

        renderStudioView();
        if (window.toastr) window.toastr.success(`Outfit "${outfitLabel}" removed from DNA.`, 'Personalyze');
    });

    // ─── Flush Images ────────────────────────────────────────────────────────

    $overlay.on('click', '.plz-flush-images-btn', async function() {
        const id   = state._workshopCharacterId;
        const name = id?.replace(/_/g, ' ') ?? '';
        if (!id) return;
        if (!confirm(`Delete all generated portrait images for "${name}"?\n\nThis cannot be undone.`)) return;

        const $btn  = $(this);
        const $icon = $btn.find('i');
        $icon.removeClass('fa-trash-can').addClass('fa-spinner fa-spin');
        $btn.prop('disabled', true);

        try {
            const deleted = await flushCharacterImages(id);
            removeFromFileIndex(deleted);
            renderStudioView();
            if (window.toastr) window.toastr.success(`Flushed ${deleted.length} image(s) for "${name}".`, 'Personalyze');
        } catch (err) {
            error('Studio', 'Flush images failed:', err);
            if (window.toastr) window.toastr.error(`Flush failed: ${err.message}`, 'Personalyze');
            $icon.removeClass('fa-spinner fa-spin').addClass('fa-trash-can');
            $btn.prop('disabled', false);
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

    // ─── Anchor Scan (Add + Studio) ───────────────────────────────────────────

    $overlay.on('click', '.plz-anchor-scan', async function() {
        const mode  = $(this).data('mode');
        const $btn  = $(this);
        const $icon = $btn.find('i');

        $icon.removeClass('fa-wand-magic-sparkles').addClass('fa-spinner fa-spin');
        $btn.prop('disabled', true);

        try {
            const context = getContext();
            const chat    = context?.chat;
            if (!chat?.length) {
                if (window.toastr) window.toastr.warning('No active chat to scan.', 'Personalyze');
                return;
            }

            const s          = getSettings();
            const lastIdx    = chat.length - 1;
            const transcript = buildDescriberContext(chat, lastIdx, s.describerHistory ?? 3);
            const focusName  = mode === 'studio'
                ? (state._workshopCharacterId?.replace(/_/g, ' ') ?? null)
                : ($('#plz-add-name').val().trim() || null);

            startWorkshopTurn('Anchor Scan');
            const result = await detectAnchorScan(transcript, focusName, s.anchorScanPrompt, s.describerProfileId);

            if (!result) {
                if (window.toastr) window.toastr.warning('Could not extract character details from chat.', 'Personalyze');
                return;
            }

            if (mode === 'add') {
                $('#plz-add-name').val(result.name).trigger('input');
                $('#plz-add-anchor').val(result.anchor).trigger('input');
            } else {
                $('#plz-studio-anchor').val(result.anchor).trigger('input');
            }

            if (window.toastr) window.toastr.success('Character details scanned from chat.', 'Personalyze');
        } catch (err) {
            error('Workshop', 'Anchor scan failed:', err);
            if (window.toastr) window.toastr.error(`Scan failed: ${err.message}`, 'Personalyze');
        } finally {
            $icon.removeClass('fa-spinner fa-spin').addClass('fa-wand-magic-sparkles');
            $btn.prop('disabled', false);
        }
    });

    // ─── Add Tab ──────────────────────────────────────────────────────────────

    $overlay.on('input', '#plz-add-name', function() {
        const key = slugify(this.value);
        $('#plz-add-key-preview').text(key || '—');
    });

    $overlay.on('click', '#plz-add-submit', async function() {
        const name   = $('#plz-add-name').val().trim();
        const anchor = $('#plz-add-anchor').val().trim();
        const key    = slugify(name);

        if (!name || !key || !anchor) {
            if (window.toastr) window.toastr.warning('Name and Identity Anchor are required.', 'Personalyze');
            return;
        }

        if (state.chatCharacters[key]) {
            if (window.toastr) window.toastr.warning(`"${name}" already exists in this chat's DNA.`, 'Personalyze');
            return;
        }

        const context   = getContext();
        const lastMsgId = Math.max(0, context.chat.length - 1);

        await lockedWriteCharacterDef(lastMsgId, key, anchor, 1);
        upsertChatCharacterDef(key, anchor, 1);

        if (!state.activeRoster.includes(key)) {
            const newRoster = [...state.activeRoster, key];
            setActiveRoster(newRoster);
            lockedWriteRoster(lastMsgId, newRoster).catch(() => {});
        }

        $('#plz-add-name').val('');
        $('#plz-add-anchor').val('').trigger('input');
        $('#plz-add-key-preview').text('—');

        setWorkshopCharacter(key);
        switchTab('studio');

        if (window.toastr) window.toastr.success(`"${name}" added to DNA.`, 'Personalyze');
    });
}

/**
 * Combined renderer called by core.js
 */
export function renderDNAViewWithBoundHandlers() {
    renderDNAView();
    renderStudioView();
}