/**
 * @file data/default-user/extensions/personalyze/ui/workshop/listeners.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role UI Event Listeners
 * @description
 * Centralizes all DOM event bindings for the Character Workshop modal.
 *
 * @api-declaration
 * bindWorkshopEvents(handlers) → void
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [state (via setWorkshopCharacter)]
 *     external_io: [jQuery DOM Events, registry.js, characterWorkshop.js]
 */

import { getContext } from '../../../../../extensions.js';
import { state, setWorkshopCharacter } from '../../state.js';
import {
    getAllCharacterIds,
    getCharacter,
    upsertCharacter,
    upsertOutfit,
    upsertExpression
} from '../../registry.js';
import { getSettings } from '../../settings.js';
import { slugify, buildDescriberContext } from '../../utils/history.js';
import { detectAnchorScan } from '../../detector.js';
import { error } from '../../utils/logger.js';

/**
 * Binds all event listeners for the Character Workshop modal.
 * @param {object} handlers  { switchTab, renderRoster, renderStudio }
 */
export function bindWorkshopEvents({ switchTab, renderRoster, renderStudio }) {
    const $overlay = $('#plz-workshop-overlay');

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

    // Save identity anchor
    $overlay.on('click', '#plz-studio-anchor-save', function () {
        const id     = state._workshopCharacterId;
        const anchor = $('#plz-studio-anchor').val().trim();
        if (!id || !anchor) return;

        upsertCharacter(id, anchor);
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
            <textarea id="plz-add-entry-desc" class="text_pole" rows="3"
                      style="width:100%;font-family:monospace;font-size:0.9em;"></textarea>`,
            'confirm'
        );

        $('#plz-add-entry-label').on('input', function () {
            $('#plz-add-entry-key').val(slugify(this.value));
        });

        const confirmed = await popupPromise;
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
                $('#plz-reg-anchor').val(result.anchor);
            } else {
                // Studio — only update the anchor textarea, leave name alone.
                $('#plz-studio-anchor').val(result.anchor);
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
        $('#plz-reg-anchor').val('');
        $('#plz-reg-key-preview').text('—');
        $('#plz-reg-status').text('');

        setWorkshopCharacter(key);
        renderRoster();
        switchTab('studio');

        if (window.toastr) window.toastr.success(`"${name}" added to the Global Portfolio.`, 'PersonaLyze');
    });
}
