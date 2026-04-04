/**
 * @file data/default-user/extensions/personalyze/ui/dressingRoom.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role UI (Discovery Approval Modal)
 * @description
 * The Dressing Room modal. Shown whenever the pipeline's Step 3 (Wardrobe
 * Expansion) discovers a new outfit or expression that has not been seen before.
 *
 * The modal presents the LLM-extracted label and description to the user for
 * review before the entry is registered in the Global Portfolio. The user can
 * edit both the label and the description, preview a generated thumbnail, or
 * reject the discovery entirely.
 *
 * On approval, the modal returns the finalized { key, label, description } to
 * the caller. On rejection, it returns null.
 *
 * The immutable key is derived from the label using slugify() at the moment the
 * user confirms — any edits to the label before confirmation are reflected in
 * the key. After confirmation the key is fixed.
 *
 * @api-declaration
 * openDressingRoom(proposed) → Promise<{ key, label, description }|null>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [callPopup, fetchPreviewBlob, DOM]
 */

import { callPopup } from '../../../../../script.js';
import { fetchPreviewBlob } from '../imageCache.js';
import { slugify, escapeHtml } from '../utils/history.js';
import { error } from '../utils/logger.js';

/**
 * Opens the Dressing Room approval modal for a newly discovered outfit or expression.
 *
 * @param {object} proposed
 * @param {'outfit'|'expression'} proposed.dimension
 * @param {string} proposed.label
 * @param {string} proposed.description
 * @param {string} proposed.key   Pre-slugified key (may change if label is edited).
 * @returns {Promise<{ key: string, label: string, description: string }|null>}
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

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Key (Unique ID — set on confirm)</label>
        <input type="text" id="plz-dr-key" class="text_pole" readonly
               value="${escapeHtml(proposed.key ?? '')}"
               style="width:100%; opacity:0.6; cursor:not-allowed;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Description (Image Prompt)</label>
        <textarea id="plz-dr-description" class="text_pole" rows="3"
                  style="width:100%; font-family:monospace; font-size:0.9em;">${escapeHtml(proposed.description ?? '')}</textarea>

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

    // Live key preview as the user types the label
    $('#plz-dr-label').on('input', function () {
        $('#plz-dr-key').val(slugify(this.value));
    });

    // Preview generation
    $('#plz-dr-preview-btn').on('click', async function () {
        const description = $('#plz-dr-description').val().trim();
        if (!description) {
            if (window.toastr) window.toastr.warning('Enter a description first.', 'PersonaLyze');
            return;
        }

        const $btn    = $(this);
        const $status = $('#plz-dr-preview-status');
        $btn.prop('disabled', true).text('Fetching...');
        $status.text('');

        try {
            const objectUrl = await fetchPreviewBlob(description);
            $('#plz-dr-preview-container').show();
            $('#plz-dr-preview-img').attr('src', objectUrl);
            $status.text('Preview ready');
        } catch (err) {
            error('DressingRoom', 'Preview failed:', err);
            $status.text(`Failed: ${err.message}`);
            if (window.toastr) window.toastr.warning(err.message, 'PersonaLyze Preview');
        } finally {
            $btn.prop('disabled', false).text('Generate Preview');
        }
    });

    const confirmed = await popupPromise;
    if (!confirmed) return null;

    const label       = $('#plz-dr-label').val().trim();
    const description = $('#plz-dr-description').val().trim();

    if (!label) {
        if (window.toastr) window.toastr.warning('Label is required.', 'PersonaLyze');
        return null;
    }

    return {
        key: slugify(label),
        label,
        description,
    };
}
