/**
 * @file data/default-user/extensions/personalyze/ui/workshop/listeners.js
 * @stamp {"utc":"2026-04-05T00:00:00.000Z"}
 * @architectural-role UI Controller (Workshop)
 * @description
 * Event orchestrator for the Character Workshop modal. Binds user interactions
 * for roster management, character registration, and the Studio's image 
 * generation and anchor scanning features.
 *
 * @api-declaration
 * bindWorkshopEvents(handlers) -> void
 *
 * @contract
 *   assertions:
 *     purity: Stateful Controller
 *     state_ownership: [state (mutates via setters)]
 *     external_io: [jQuery DOM Events, Registry Setters, LLM (Anchor Scan), Image Generation]
 */

import { getContext } from '../../../../../extensions.js';
import { state, setWorkshopCharacter, setActiveRoster, addToFileIndex, removeFromFileIndex, updateChainEntry } from '../../state.js';
import { lockedWriteRoster } from '../../logic/pointerWriter.js';
import {
    getAllCharacterIds,
    getCharacter,
    upsertCharacter,
    setCharacterSeed,
    upsertOutfit,
    upsertExpression
} from '../../registry.js';
import { getSettings, updateSetting } from '../../settings.js';
import { slugify, buildDescriberContext } from '../../utils/history.js';
import { detectAnchorScan } from '../../detector.js';
import { buildPortraitPrompt, fetchPreviewBlob, generate, flushCharacterImages } from '../../imageCache.js';
import { startTurn } from '../../utils/callLog.js';
import { error } from '../../utils/logger.js';
import { smartResize } from '../../utils/dom.js';

/**
 * Binds all event listeners for the Character Workshop modal.
 * @param {object} handlers  { switchTab, renderRoster, renderStudio }
 */
export function bindWorkshopEvents({ switchTab, renderRoster, renderStudio }) {
    const $overlay = $('#plz-workshop-overlay');


    // ─── Auto-grow Textareas ──────────────────────────────────────────────────
    $overlay.on('input', '.plz-auto-textarea', function () {
        smartResize(this);
    });

    // Add this to handle phone rotation/window resizing
    window.addEventListener('resize', () => {
        $('.plz-modal .plz-auto-textarea').each(function() {
            smartResize(this);
        });
    });

    // ─── Structural ───────────────────────────────────────────────────────────

    $overlay.on('click', '.plz-tab-btn', function () {
        switchTab($(this).data('tab'));
    });

    $overlay.on('click', '#plz-workshop-close', () => {
        $overlay.addClass('plz-hidden');
    });

    // Close on backdrop click
    $overlay.on('click', function (e) {
        if (e.target === this) $overlay.addClass('plz-hidden');
    });

    // ─── Roster Tab ───────────────────────────────────────────────────────────

    // Toggle character enabled/disabled for this chat
    $overlay.on('click', '.plz-roster-toggle', async function (e) {
        e.stopPropagation();
        const id      = $(this).closest('.plz-roster-item').data('id');
        const context = getContext();

        // Roster changes must be anchored to an AI message so reconstruction
        // can restore them. Require at least one AI turn before allowing changes.
        let lastAiIdx = -1;
        for (let i = context.chat.length - 1; i >= 0; i--) {
            if (!context.chat[i].is_user) { lastAiIdx = i; break; }
        }

        if (lastAiIdx === -1) {
            if (window.toastr) window.toastr.warning(
                'No AI message to attach roster change to — start the conversation first.',
                'PersonaLyze'
            );
            return;
        }

        const isEnabled = state.activeRoster.includes(id);
        const newRoster = isEnabled
            ? state.activeRoster.filter(x => x !== id)
            : [...state.activeRoster, id];

        try {
            await lockedWriteRoster(lastAiIdx, newRoster);
            setActiveRoster(newRoster);
            document.dispatchEvent(new CustomEvent('plz:roster-changed'));
            renderRoster();

            const name = id.replace(/_/g, ' ');
            if (window.toastr) window.toastr.success(
                isEnabled ? `"${name}" disabled for this chat.` : `"${name}" enabled for this chat.`,
                'PersonaLyze'
            );
        } catch (err) {
            error('Workshop', 'Roster toggle failed:', err);
            if (window.toastr) window.toastr.error(`Roster update failed: ${err.message}`, 'PersonaLyze');
        }
    });

    // Open in Studio
    $overlay.on('click', '.plz-roster-edit', function (e) {
        e.stopPropagation();
        const id = $(this).closest('.plz-roster-item').data('id');
        setWorkshopCharacter(id);
        switchTab('studio');
    });

    // Delete character
    $overlay.on('click', '.plz-roster-delete', function (e) {
        e.stopPropagation();
        const id   = $(this).closest('.plz-roster-item').data('id');
        const name = id.replace(/_/g, ' ');

        if (!confirm(`Remove "${name}" from the Global Portfolio?\n\nGenerated portrait files will remain on disk but all registry data will be lost.`)) return;

        // Delete from registry
        const root = window.extension_settings?.personalyze;
        if (root?.characters) {
            delete root.characters[id];
            const { saveSettingsDebounced } = window.SillyTavern?.getContext?.() ?? {};
            // Fallback: let ST's debounced save pick it up naturally on next action
        }

        if (state._workshopCharacterId === id) setWorkshopCharacter(null);
        renderRoster();

        if (window.toastr) window.toastr.success(`"${name}" removed from portfolio.`, 'PersonaLyze');
    });

    // ─── Studio Tab ───────────────────────────────────────────────────────────

    // Save identity anchor (and seed)
    $overlay.on('click', '#plz-studio-anchor-save', function () {
        const id     = state._workshopCharacterId;
        const anchor = $('#plz-studio-anchor').val().trim();
        if (!id || !anchor) return;

        upsertCharacter(id, anchor);

        const seedVal = parseInt($('#plz-studio-seed').val(), 10);
        if (!isNaN(seedVal)) setCharacterSeed(id, seedVal);

        if (window.toastr) window.toastr.success('Identity Anchor saved.', 'PersonaLyze');
    });

    // Save an outfit or expression description
    $overlay.on('click', '.plz-entry-save-btn', function () {
        const id        = state._workshopCharacterId;
        const key       = $(this).data('key');
        const dimension = $(this).data('dimension');
        const $entry    = $(this).closest('.plz-studio-entry');
        const desc      = $entry.find('.plz-entry-description').val().trim();
        const character = getCharacter(id);
        if (!id || !character) return;

        const existingLabel = dimension === 'outfit'
            ? character.outfits[key]?.label
            : character.expressions[key]?.label;

        if (dimension === 'outfit') {
            upsertOutfit(id, key, existingLabel ?? key, desc);
        } else {
            upsertExpression(id, key, existingLabel ?? key, desc);
        }

        if (window.toastr) window.toastr.success('Saved.', 'PersonaLyze');
    });

    // Delete an outfit or expression
    $overlay.on('click', '.plz-entry-delete-btn', function () {
        const id        = state._workshopCharacterId;
        const key       = $(this).data('key');
        const dimension = $(this).data('dimension');
        const character = getCharacter(id);
        if (!id || !character) return;

        const label = dimension === 'outfit'
            ? character.outfits[key]?.label
            : character.expressions[key]?.label;

        if (!confirm(`Remove ${dimension} "${label ?? key}"?\n\nExisting portrait images for this entry will remain on disk.`)) return;

        if (dimension === 'outfit') {
            delete character.outfits[key];
        } else {
            delete character.expressions[key];
        }

        // Trigger debounced save via upsertCharacter (re-saves the whole record)
        upsertCharacter(id, character.identityAnchor ?? '');

        renderStudio(id);
        if (window.toastr) window.toastr.success(`${dimension} "${label ?? key}" removed.`, 'PersonaLyze');
    });

    // Flush all portrait images for this character
    $overlay.on('click', '.plz-flush-images-btn', async function () {
        const id = state._workshopCharacterId;
        if (!id) return;

        const name = id.replace(/_/g, ' ');
        if (!confirm(`Delete all generated portrait images for "${name}"?\n\nThis cannot be undone.`)) return;

        const $btn  = $(this);
        const $icon = $btn.find('i');
        $icon.removeClass('fa-trash-can').addClass('fa-spinner fa-spin');
        $btn.prop('disabled', true);

        try {
            const deleted = await flushCharacterImages(id);
            removeFromFileIndex(deleted);
            renderStudio(id);
            if (window.toastr) window.toastr.success(`Flushed ${deleted.length} image(s) for "${name}".`, 'PersonaLyze');
        } catch (err) {
            error('Studio', 'Flush images failed:', err);
            if (window.toastr) window.toastr.error(`Flush failed: ${err.message}`, 'PersonaLyze');
            $icon.removeClass('fa-spinner fa-spin').addClass('fa-trash-can');
            $btn.prop('disabled', false);
        }
    });

    // Add a new outfit or expression
    $overlay.on('click', '.plz-add-entry-btn', async function () {
        const id        = state._workshopCharacterId;
        const dimension = $(this).data('dimension');
        if (!id) return;

        const { callPopup } = await import('../../../../../../script.js');
        const { slugify }   = await import('../../utils/history.js');
        const { escapeHtml } = await import('../../utils/history.js');

        const popupPromise = callPopup(
            `<h3>Add ${dimension === 'outfit' ? 'Outfit' : 'Expression'}</h3>

            <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Label</label>
            <input type="text" id="plz-add-entry-label" class="text_pole" style="width:100%;" />

            <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Key (auto-generated)</label>
            <input type="text" id="plz-add-entry-key" class="text_pole" readonly
                   style="width:100%;opacity:0.6;cursor:not-allowed;" />

            <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Description (image prompt)</label>
            <textarea id="plz-add-entry-desc" class="text_pole plz-auto-textarea" rows="3"
                      style="width:100%;font-family:monospace;font-size:0.9em;overflow:hidden;resize:none;"></textarea>`,
            'confirm'
        );

        // Immediate resize trigger for the popup
        requestAnimationFrame(() => {
            const el = document.getElementById('plz-add-entry-desc');
            if (el) smartResize(el);
        });

        $('#plz-add-entry-label').on('input', function () {
            $('#plz-add-entry-key').val(slugify(this.value));
        });
        
        $(document).on('input', '#plz-add-entry-desc', function() {
            smartResize(this);
        });

        const confirmed = await popupPromise;
        $(document).off('input', '#plz-add-entry-desc');
        
        if (!confirmed) return;

        const label = $('#plz-add-entry-label').val().trim();
        const key   = $('#plz-add-entry-key').val().trim() || slugify(label);
        const desc  = $('#plz-add-entry-desc').val().trim();

        if (!label || !key) {
            if (window.toastr) window.toastr.warning('Label is required.', 'PersonaLyze');
            return;
        }

        if (dimension === 'outfit') {
            upsertOutfit(id, key, label, desc);
        } else {
            upsertExpression(id, key, label, desc);
        }

        renderStudio(id);
        if (window.toastr) window.toastr.success(`${dimension} "${label}" added.`, 'PersonaLyze');
    });

    // ─── Anchor Scan (Register + Studio) ─────────────────────────────────────

    $overlay.on('click', '.plz-anchor-scan', async function () {
        const mode   = $(this).data('mode');   // 'register' or 'studio'
        const $btn   = $(this);
        const $icon  = $btn.find('i');

        // Spinner feedback
        $icon.removeClass('fa-wand-magic-sparkles').addClass('fa-spinner fa-spin');
        $btn.prop('disabled', true);

        try {
            const context  = getContext();
            const chat     = context?.chat;
            if (!chat?.length) {
                if (window.toastr) window.toastr.warning('No active chat to scan.', 'PersonaLyze');
                return;
            }

            const s           = getSettings();
            const lastIdx     = chat.length - 1;
            const transcript  = buildDescriberContext(chat, lastIdx, s.describerHistory ?? 3);

            // For studio, focus on the character already in the slot.
            // For register, use whatever name is already typed (may be empty).
            const focusName = mode === 'studio'
                ? (state._workshopCharacterId?.replace(/_/g, ' ') ?? null)
                : ($('#plz-reg-name').val().trim() || null);

            startTurn('Anchor Scan');
            const result = await detectAnchorScan(
                transcript,
                focusName,
                s.anchorScanPrompt,
                s.describerProfileId,
            );

            if (!result) {
                if (window.toastr) window.toastr.warning('Could not extract character details from chat.', 'PersonaLyze');
                return;
            }

            if (mode === 'register') {
                $('#plz-reg-name').val(result.name).trigger('input');
                // Trigger input to force smartResize update
                $('#plz-reg-anchor').val(result.anchor).trigger('input');
            } else {
                // Studio — only update the anchor textarea, leave name alone.
                $('#plz-studio-anchor').val(result.anchor).trigger('input');
            }

            if (window.toastr) window.toastr.success('Character details scanned from chat.', 'PersonaLyze');

        } catch (err) {
            error('Workshop', 'Anchor scan failed:', err);
            if (window.toastr) window.toastr.error(`Scan failed: ${err.message}`, 'PersonaLyze');
        } finally {
            $icon.removeClass('fa-spinner fa-spin').addClass('fa-wand-magic-sparkles');
            $btn.prop('disabled', false);
        }
    });

    // ─── Register Tab ─────────────────────────────────────────────────────────

    // ─── Portrait Generation (Studio — outfit entries) ────────────────────────

    // Select an expression pill → enable buttons
    $overlay.on('click', '.plz-expr-pill', function () {
        const $pill    = $(this);
        const $section = $pill.closest('.plz-portrait-section');

        $section.find('.plz-expr-pill').removeClass('plz-expr-selected');
        $pill.addClass('plz-expr-selected');
        $section.attr('data-selected-expr', $pill.data('label'));

        $section.find('.plz-portrait-preview-btn, .plz-portrait-generate-btn').prop('disabled', false);
    });

    // Add a custom expression label to the global palette
    $overlay.on('click', '.plz-expr-add-btn', async function () {
        const { callPopup } = await import('../../../../../../script.js');

        const confirmed = await callPopup(
            `<h3>Add Expression</h3>
            <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Label (e.g. embarrassed)</label>
            <input type="text" id="plz-custom-expr-input" class="text_pole" style="width:100%;" />`,
            'confirm'
        );
        if (!confirmed) return;

        const label = ($('#plz-custom-expr-input').val() ?? '').trim().toLowerCase();
        if (!label) return;

        const s = getSettings();
        if (s.expressionLabels.includes(label)) {
            if (window.toastr) window.toastr.info(`"${label}" is already in the list.`, 'PersonaLyze');
            return;
        }

        updateSetting('expressionLabels', [...s.expressionLabels, label]);
        renderStudio(state._workshopCharacterId);
        if (window.toastr) window.toastr.success(`Expression "${label}" added to global list.`, 'PersonaLyze');
    });

    // Thumbnail preview — small fast image to check the look
    $overlay.on('click', '.plz-portrait-preview-btn', async function () {
        const $btn      = $(this);
        const outfitKey = $btn.data('key');
        const $section  = $btn.closest('.plz-portrait-section');
        const exprLabel = $section.attr('data-selected-expr');
        const id        = state._workshopCharacterId;
        if (!id || !exprLabel) return;

        const character = getCharacter(id);
        const outfitDef = character?.outfits[outfitKey];
        if (!outfitDef) return;

        const $icon = $btn.find('i');
        $icon.removeClass('fa-eye').addClass('fa-spinner fa-spin');
        $btn.prop('disabled', true);

        try {
            const prompt  = buildPortraitPrompt(character.identityAnchor, outfitDef.description, exprLabel);
            const blobUrl = await fetchPreviewBlob(prompt, id);

            const $area = $section.find('.plz-portrait-preview-area');
            $area.find('.plz-portrait-preview-img').attr('src', blobUrl);
            $area.find('.plz-portrait-preview-label').text(`${outfitDef.label} × ${exprLabel}`);
            $area.removeClass('plz-hidden');
        } catch (err) {
            error('Studio', 'Thumbnail preview failed:', err);
            if (window.toastr) window.toastr.error(`Preview failed: ${err.message}`, 'PersonaLyze');
        } finally {
            $icon.removeClass('fa-spinner fa-spin').addClass('fa-eye');
            $btn.prop('disabled', false);
        }
    });

    // Generate full-resolution portrait and save to server
    $overlay.on('click', '.plz-portrait-generate-btn', async function () {
        const $btn      = $(this);
        const outfitKey = $btn.data('key');
        const $section  = $btn.closest('.plz-portrait-section');
        const exprLabel = $section.attr('data-selected-expr');
        const id        = state._workshopCharacterId;
        if (!id || !exprLabel) return;

        const character = getCharacter(id);
        const outfitDef = character?.outfits[outfitKey];
        if (!outfitDef) return;

        const $icon = $btn.find('i');
        $icon.removeClass('fa-image').addClass('fa-spinner fa-spin');
        $btn.prop('disabled', true);
        $section.find('.plz-portrait-preview-btn').prop('disabled', true);

        try {
            const newFile = await generate(
                id, outfitKey, exprLabel,
                outfitDef.description, exprLabel,
                character.identityAnchor,
            );
            addToFileIndex(newFile);
            updateChainEntry(id, outfitKey, exprLabel, newFile);

            if (window.toastr) window.toastr.success(`Saved: ${newFile}`, 'PersonaLyze');
            // Add checkmark to the pill without a full re-render (which would wipe unsaved edits)
            $section.find('.plz-expr-pill').each(function () {
                if ($(this).data('label') === exprLabel) {
                    $(this).addClass('plz-expr-has-image');
                    if (!$(this).children('i').length) {
                        $(this).prepend('<i class="fa-solid fa-check" style="font-size:0.8em;margin-right:3px;opacity:0.7;"></i>');
                    }
                }
            });
        } catch (err) {
            error('Studio', 'Portrait generation failed:', err);
            if (window.toastr) window.toastr.error(`Generate failed: ${err.message}`, 'PersonaLyze');
            $icon.removeClass('fa-spinner fa-spin').addClass('fa-image');
            $btn.prop('disabled', false);
            $section.find('.plz-portrait-preview-btn').prop('disabled', false);
        }
    });

    // ─── Register Tab ─────────────────────────────────────────────────────────

    // Live key preview
    $overlay.on('input', '#plz-reg-name', function () {
        const key = slugify(this.value);
        $('#plz-reg-key-preview').text(key || '—');
    });

    // Submit new character
    $overlay.on('click', '#plz-reg-submit', function () {
        const name   = $('#plz-reg-name').val().trim();
        const anchor = $('#plz-reg-anchor').val().trim();
        const key    = slugify(name);

        if (!name || !key) {
            $('#plz-reg-status').text('A character name is required.');
            return;
        }
        if (!anchor) {
            $('#plz-reg-status').text('An Identity Anchor is required.');
            return;
        }

        const existing = getCharacter(key);
        if (existing) {
            $('#plz-reg-status').text(`"${name}" is already registered (key: ${key}). Use the Studio to edit them.`);
            return;
        }

        upsertCharacter(key, anchor);
        $('#plz-reg-name').val('');
        $('#plz-reg-anchor').val('').trigger('input');
        $('#plz-reg-key-preview').text('—');
        $('#plz-reg-status').text('');

        // Auto-add to the current chat's roster if there's an AI message to anchor to.
        const context = getContext();
        let lastAiIdx = -1;
        for (let i = context.chat.length - 1; i >= 0; i--) {
            if (!context.chat[i].is_user) { lastAiIdx = i; break; }
        }
        if (lastAiIdx !== -1 && !state.activeRoster.includes(key)) {
            const newRoster = [...state.activeRoster, key];
            setActiveRoster(newRoster);
            lockedWriteRoster(lastAiIdx, newRoster).catch(err =>
                error('Workshop', 'Auto-roster write failed:', err)
            );
        }

        setWorkshopCharacter(key);
        renderRoster();
        switchTab('studio');

        if (window.toastr) window.toastr.success(`"${name}" added to the Global Portfolio.`, 'PersonaLyze');
    });
}