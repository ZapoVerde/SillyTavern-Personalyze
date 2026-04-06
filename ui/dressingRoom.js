/**
 * @file data/default-user/extensions/personalyze/ui/dressingRoom.js
 * @stamp {"utc":"2026-04-05T00:00:00.000Z"}
 * @architectural-role UI (Dressing Room)
 * @description
 * Implements the Dressing Room modal, a confirmation dialog for newly 
 * discovered outfits or expressions. Allows the user to refine labels 
 * and visual descriptions, and generate a preview before committing the 
 * entry to the Global Portfolio.
 *
 * @api-declaration
 * openDressingRoom(proposed) -> Promise<{key, label, description}|null>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [callPopup, fetchPreviewBlob, smartResize, DOM]
 */

import { callPopup } from '../../../../../script.js';
import { fetchPreviewBlob, buildPortraitPrompt } from '../imageCache.js';
import { slugify, escapeHtml } from '../utils/history.js';
import { smartResize } from '../utils/dom.js';
import { error } from '../utils/logger.js';
import { startWorkshopTurn } from '../utils/callLog.js';

/**
 * Opens the Dressing Room modal for an outfit or expression.
 * @param {object} proposed { dimension, label, key, description }
 * @returns {Promise<{key: string, label: string, description: string}|null>}
 */
export async function openDressingRoom(proposed) {
    const dimensionLabel = proposed.dimension === 'outfit' ? 'Outfit' : 'Expression';
    const aspectStyle    = proposed.dimension === 'outfit'
        ? 'aspect-ratio: 2/3; object-fit: cover;'
        : 'aspect-ratio: 4/3; object-fit: cover;';

    const popupPromise = callPopup(
        `<h3>New ${escapeHtml(dimensionLabel)} Discovered</h3>

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Label (Display Name)</label>
        <input type="text" id="plz-dr-label" class="text_pole"
               value="${escapeHtml(proposed.label ?? '')}" style="width:100%;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Key</label>
        <input type="text" id="plz-dr-key" class="text_pole" readonly
               value="${escapeHtml(proposed.key ?? '')}"
               style="width:100%; opacity:0.6; cursor:not-allowed;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Description (Image Prompt)</label>
        <textarea id="plz-dr-description" class="text_pole plz-auto-textarea" rows="3"
                  style="width:100%; font-family:monospace; font-size:0.9em; overflow:hidden;" spellcheck="false">${escapeHtml(proposed.description ?? '')}</textarea>

        <div style="margin-top:10px;">
            <button class="menu_button" id="plz-dr-preview-btn">Generate Preview</button>
            <span id="plz-dr-preview-status" style="font-size:0.82em;opacity:0.65;margin-left:8px;"></span>
        </div>
        <div id="plz-dr-preview-container" style="display:none;margin-top:8px;">
            <img id="plz-dr-preview-img" src="" alt="Preview"
                 style="width:100%;border-radius:4px;${aspectStyle}" />
        </div>`,
        'confirm',
    );

    // Multi-pass resize trigger to ensure stability in the popup lifecycle
    const triggerResize = () => {
        const el = document.getElementById('plz-dr-description');
        if (el) smartResize(el);
    };

    requestAnimationFrame(() => {
        triggerResize();
        setTimeout(triggerResize, 50);
    });

    $('#plz-dr-label').on('input', function () {
        $('#plz-dr-key').val(slugify(this.value));
    });

    $('#plz-dr-description').on('input', function () {
        smartResize(this);
    });

    $('#plz-dr-preview-btn').on('click', async function () {
        const description = $('#plz-dr-description').val().trim();
        if (!description) return;
        const $btn = $(this);
        $btn.prop('disabled', true).text('Fetching...');
        startWorkshopTurn('Dressing Room Preview');
        try {
            const prompt    = buildPortraitPrompt(proposed.anchor ?? '', description, '');
            const objectUrl = await fetchPreviewBlob(prompt, proposed.characterId);
            $('#plz-dr-preview-container').show();
            $('#plz-dr-preview-img').attr('src', objectUrl);
        } catch (err) {
            error('DressingRoom', 'Preview failed:', err);
        } finally {
            $btn.prop('disabled', false).text('Generate Preview');
        }
    });

    const confirmed = await popupPromise;
    if (!confirmed) return null;

    const label = $('#plz-dr-label').val().trim();
    if (!label) return null;

    return {
        key: slugify(label),
        label,
        description: $('#plz-dr-description').val().trim(),
    };
}