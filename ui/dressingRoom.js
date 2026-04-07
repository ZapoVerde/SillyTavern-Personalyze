/**
 * @file data/default-user/extensions/personalyze/ui/dressingRoom.js
 * @stamp {"utc":"2026-04-07T00:00:00.000Z"}
 * @architectural-role UI (Dressing Room)
 * @description
 * Implements the Dressing Room modal, a confirmation dialog for newly 
 * discovered outfits. 
 * 
 * Updated to support the Multi-Engine architecture. The engine selection 
 * dropdown is generated dynamically based on the "Availability" toggles 
 * in the extension settings.
 *
 * @api-declaration
 * openDressingRoom(proposed) -> Promise<{key, label, description, provider}|null>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [callPopup, fetchPreviewBlob, smartResize, DOM, getSettings]
 */

import { callPopup } from '../../../../../script.js';
import { fetchPreviewBlob } from '../imageCache.js';
import { getSettings } from '../settings.js';
import { slugify, escapeHtml } from '../utils/history.js';
import { smartResize } from '../utils/dom.js';
import { error } from '../utils/logger.js';
import { startWorkshopTurn } from '../utils/callLog.js';

/**
 * Builds the dynamic engine selection HTML based on master availability toggles.
 * @returns {string}
 */
function getEngineSelectorHTML() {
    const s = getSettings();
    const options = [];

    // Check master toggles from settings
    if (s.engineEnablePollinations !== false) {
        options.push('<option value="pollinations">Pollinations (Fast/Default)</option>');
    }
    if (s.engineEnableFal) {
        options.push('<option value="fal">Fal AI (High Speed/Quality)</option>');
    }
    if (s.engineEnableHuggingFace) {
        options.push('<option value="huggingface">Hugging Face (LoRA/Space)</option>');
    }

    // Safety fallback: if nothing is enabled, provide Pollinations
    if (options.length === 0) {
        options.push('<option value="pollinations">Pollinations (Fallback)</option>');
    }

    return `
        <div style="display:flex; align-items:center; gap:8px; margin-top:10px;">
            <label style="font-size:0.88em; opacity:0.75; white-space:nowrap;">Engine:</label>
            <select id="plz-dr-provider" class="text_pole" style="flex:1;">
                ${options.join('')}
            </select>
        </div>`;
}

/**
 * Opens the Dressing Room modal for an outfit or expression.
 * @param {object} proposed { dimension, label, key, description, characterId, anchor }
 * @returns {Promise<{key: string, label: string, description: string, provider: string}|null>}
 */
export async function openDressingRoom(proposed) {
    const dimensionLabel = proposed.dimension === 'outfit' ? 'Outfit' : 'Expression';
    const aspectStyle    = proposed.dimension === 'outfit'
        ? 'aspect-ratio: 2/3; object-fit: cover;'
        : 'aspect-ratio: 4/3; object-fit: cover;';

    // Provider selector only shown for outfits
    const providerHtml = proposed.dimension === 'outfit' ? getEngineSelectorHTML() : '';

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

        ${providerHtml}

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
        const provider    = $('#plz-dr-provider').val() || 'pollinations';
        if (!description) return;
        
        const $btn = $(this);
        const originalText = $btn.text();
        
        $btn.prop('disabled', true).text(`Waiting for ${provider}...`);
        
        startWorkshopTurn('Dressing Room Preview');
        try {
            const objectUrl = await fetchPreviewBlob(description, proposed.characterId, provider);
            $('#plz-dr-preview-container').show();
            $('#plz-dr-preview-img').attr('src', objectUrl);
        } catch (err) {
            error('DressingRoom', 'Preview failed:', err);
            if (window.toastr) window.toastr.error(`Preview failed: ${err.message}`, 'PersonaLyze');
        } finally {
            $btn.prop('disabled', false).text(originalText);
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
        provider: $('#plz-dr-provider').val() || 'pollinations',
    };
}