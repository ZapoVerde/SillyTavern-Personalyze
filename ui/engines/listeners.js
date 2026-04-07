/**
 * @file data/default-user/extensions/personalyze/ui/engines/listeners.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role UI Logic (Engines Modal)
 * @description
 * Event bindings for the Engines configuration modal.
 * Handles key save/ping/test, provider/model selection, and Space ID management.
 *
 * @api-declaration
 * bindEnginesHandlers($modal) → void
 * refreshEnginesUI() → void
 * updateEngineKeyStatuses() → void
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [settings.hfProvider, settings.hfImageModel, settings.imageModel, settings.hfSpaceId, settings.hfSavedSpaces]
 *     external_io: [DOM, writeSecret, fetchPreviewBlob, toastr, callPopup]
 */

import { getSettings, updateSetting } from '../../settings.js';
import { fetchPreviewBlob } from '../../imageCache.js';
import { HF_PROVIDER_MODELS } from '../../defaults.js';
import { log, error } from '../../utils/logger.js';
import { writeSecret, secret_state } from '../../../../../secrets.js';
import { getRequestHeaders, callPopup } from '../../../../../../script.js';
import { rebuildSpaceDropdown } from './templates.js';

// ─── Key Status ───────────────────────────────────────────────────────────────

/**
 * Updates all three key status indicators in the engines modal.
 */
export function updateEngineKeyStatuses() {
    const polState = secret_state['api_key_pollinations'];
    const hfState  = secret_state['api_key_huggingface'];

    const hasPol = Array.isArray(polState) && polState.length > 0;
    const hasHf  = Array.isArray(hfState)  && hfState.length  > 0;

    const polHtml  = hasPol
        ? '<span style="color:var(--SmartThemeQuoteColor,#28a745);">● Key saved</span>'
        : '<span style="color:var(--SmartThemeErrorColor,#e05555);">○ No key</span>';
    const hfHtml   = hasHf
        ? '<span style="color:var(--SmartThemeQuoteColor,#28a745);">● Key saved</span>'
        : '<span style="color:var(--SmartThemeErrorColor,#e05555);">○ No key</span>';

    $('#plz-eng-pol-key-status').html(polHtml);
    $('#plz-eng-hf-key-status').html(hfHtml);
    $('#plz-eng-space-hf-status').html(hfHtml);
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Rebuilds the HF model dropdown for the given provider.
 * @param {string} provider
 * @param {string} selectedModel
 */
function refreshHFModelDropdown(provider, selectedModel) {
    const models = HF_PROVIDER_MODELS[provider]?.models ?? [];
    const options = models
        .map(m => `<option value="${m}"${m === selectedModel ? ' selected' : ''}>${m}</option>`)
        .join('');
    $('#plz-eng-hf-model').html(options);
}

// ─── UI Refresh ───────────────────────────────────────────────────────────────

/**
 * Syncs all modal inputs to current settings.
 */
export function refreshEnginesUI() {
    const s = getSettings();
    $('#plz-eng-pol-model').val(s.imageModel);
    $('#plz-eng-hf-provider').val(s.hfProvider);
    refreshHFModelDropdown(s.hfProvider, s.hfImageModel);
    $('#plz-eng-space-id').val(s.hfSpaceId ?? '');
    updateEngineKeyStatuses();
}

// ─── Event Bindings ───────────────────────────────────────────────────────────

/**
 * Binds all event handlers for the engines modal.
 * @param {jQuery} $modal - The overlay element (#plz-engines-overlay).
 */
export function bindEnginesHandlers($modal) {

    // 1. Key save
    $modal.on('click', '.plz-eng-vault-save', async function () {
        const secretName = $(this).data('secret');
        const inputId    = secretName === 'api_key_huggingface' ? '#plz-eng-hf-key' : '#plz-eng-pol-key';
        const key        = $(inputId).val().trim();

        if (!key) {
            if (window.toastr) window.toastr.warning('Please paste the API key first.', 'PersonaLyze');
            return;
        }

        try {
            const label = secretName === 'api_key_huggingface'
                ? 'PersonaLyze: Hugging Face'
                : 'PersonaLyze: Pollinations';
            await writeSecret(secretName, key, label);
            $(inputId).val('');
            updateEngineKeyStatuses();
            if (window.toastr) window.toastr.success('API key saved to vault.', 'PersonaLyze');
        } catch (err) {
            error('EnginesModal', 'Failed to write secret:', err);
            if (window.toastr) window.toastr.error('Failed to save key to vault.', 'PersonaLyze');
        }
    });

    // 2. Key field Enter → trigger ping
    $modal.on('keydown', '#plz-eng-pol-key', function (e) {
        if (e.key === 'Enter') $('#plz-eng-pol-ping').trigger('click');
    });
    $modal.on('keydown', '#plz-eng-hf-key', function (e) {
        if (e.key === 'Enter') $('#plz-eng-hf-ping').trigger('click');
    });

    // 3. Pollinations ping
    $modal.on('click', '#plz-eng-pol-ping', async function () {
        const $btn = $(this);
        const $status = $('#plz-eng-pol-status');
        $btn.prop('disabled', true);
        $status.text('Pinging...');
        try {
            const response = await fetch('/api/plugins/personalyze/poll-ping', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: '{}',
            });
            if (response.ok) {
                $status.text('✓ Reachable');
            } else {
                $status.text('✗ Unreachable');
            }
        } catch (err) {
            $status.text('✗ Unreachable');
        } finally {
            $btn.prop('disabled', false);
        }
    });

    // 4. Pollinations test
    $modal.on('click', '#plz-eng-pol-test', async function () {
        const $btn = $(this);
        const $status = $('#plz-eng-pol-status');
        $btn.prop('disabled', true);
        $status.text('Testing...');
        try {
            const objectUrl = await fetchPreviewBlob(
                'a simple illustration of a blue bird, white background',
                'test',
                'pollinations',
            );
            $status.text('✓ Image generated');
            await callPopup(
                `<h3>Pollinations — Test OK</h3>
                 <p style="opacity:0.65;font-size:0.88em;">The Pollinations engine responded successfully. Test image below:</p>
                 <img src="${objectUrl}" style="width:100%;border-radius:6px;margin-top:8px;" />`,
                'text',
            );
        } catch (err) {
            $status.text(`✗ ${err.message.slice(0, 80)}`);
            error('EnginesModal', 'Pollinations test failed:', err);
        } finally {
            $btn.prop('disabled', false);
        }
    });

    // 5. HF Router ping
    $modal.on('click', '#plz-eng-hf-ping', async function () {
        const $btn = $(this);
        const $status = $('#plz-eng-hf-status');
        $btn.prop('disabled', true);
        $status.text('Pinging...');
        try {
            const response = await fetch('/api/plugins/personalyze/hf-ping', {
                method: 'POST',
                headers: getRequestHeaders(),
            });
            if (response.ok) {
                const data = await response.json();
                $status.text(`✓ Key valid — ${data.user || 'authenticated'}`);
            } else {
                const data = await response.json().catch(() => ({}));
                $status.text(`✗ ${data.error || `HF returned ${response.status}`}`);
            }
        } catch (err) {
            $status.text(`✗ ${err.message.slice(0, 80)}`);
        } finally {
            $btn.prop('disabled', false);
        }
    });

    // 6. HF Router test
    $modal.on('click', '#plz-eng-hf-test', async function () {
        const $btn = $(this);
        const $status = $('#plz-eng-hf-status');
        $btn.prop('disabled', true);
        $status.text('Testing...');
        try {
            const objectUrl = await fetchPreviewBlob(
                'a simple illustration of a blue bird, white background',
                'test',
                'huggingface',
            );
            $status.text('✓ Image generated');
            await callPopup(
                `<h3>HF Router — Test OK</h3>
                 <p style="opacity:0.65;font-size:0.88em;">The HuggingFace router responded successfully. Test image below:</p>
                 <img src="${objectUrl}" style="width:100%;border-radius:6px;margin-top:8px;" />`,
                'text',
            );
        } catch (err) {
            $status.text(`✗ ${err.message.slice(0, 80)}`);
            error('EnginesModal', 'HF Router test failed:', err);
        } finally {
            $btn.prop('disabled', false);
        }
    });

    // 7. Provider change
    $modal.on('change', '#plz-eng-hf-provider', function () {
        const val = $(this).val();
        updateSetting('hfProvider', val);
        const firstModel = HF_PROVIDER_MODELS[val]?.models[0] ?? '';
        refreshHFModelDropdown(val, firstModel);
        updateSetting('hfImageModel', firstModel);
    });

    // 8. HF Model change
    $modal.on('change', '#plz-eng-hf-model', function () {
        updateSetting('hfImageModel', $(this).val());
    });

    // 9. Pollinations model change
    $modal.on('change', '#plz-eng-pol-model', function () {
        updateSetting('imageModel', $(this).val());
    });

    // 10. Space ID input
    $modal.on('input', '#plz-eng-space-id', function () {
        updateSetting('hfSpaceId', $(this).val().trim());
    });

    // 11. Space ID Enter → ping
    $modal.on('keydown', '#plz-eng-space-id', function (e) {
        if (e.key === 'Enter') $('#plz-eng-space-ping').trigger('click');
    });

    // 12. Space dropdown toggle
    $modal.on('click', '#plz-eng-space-toggle', function () {
        const $dd = $('#plz-eng-space-dropdown');
        const isHidden = $dd.css('display') === 'none';
        $dd.css('display', isHidden ? 'block' : 'none');
    });

    // 13. Space entry click (select a space)
    $modal.on('click', '.plz-eng-space-entry span[data-space-id]', function () {
        const id = $(this).data('space-id');
        $('#plz-eng-space-id').val(id);
        updateSetting('hfSpaceId', id);
        $('#plz-eng-space-dropdown').css('display', 'none');
    });

    // 14. Space remove
    $modal.on('click', '.plz-eng-space-remove', function (e) {
        e.stopPropagation();
        const id = $(this).data('space-id');
        const current = getSettings().hfSavedSpaces ?? [];
        const newList = current.filter(s => s !== id);
        updateSetting('hfSavedSpaces', newList);
        $('#plz-eng-space-dropdown').html(rebuildSpaceDropdown(newList));
    });

    // 15. Add to list
    $modal.on('click', '#plz-eng-space-add', function () {
        const spaceId = $('#plz-eng-space-id').val().trim();
        if (!spaceId.includes('/')) {
            if (window.toastr) window.toastr.warning('Space ID must be in format owner/space-name.', 'PersonaLyze');
            return;
        }
        const current = getSettings().hfSavedSpaces ?? [];
        if (current.includes(spaceId)) {
            if (window.toastr) window.toastr.warning('This space is already in the list.', 'PersonaLyze');
            return;
        }
        const newList = [...current, spaceId];
        updateSetting('hfSavedSpaces', newList);
        $('#plz-eng-space-dropdown').html(rebuildSpaceDropdown(newList));
        if (window.toastr) window.toastr.success(`Added ${spaceId} to saved spaces.`, 'PersonaLyze');
    });

    // 16. Space ping
    $modal.on('click', '#plz-eng-space-ping', async function () {
        const $btn = $(this);
        const $status = $('#plz-eng-space-status');
        const spaceId = $('#plz-eng-space-id').val().trim();
        $btn.prop('disabled', true);
        $status.text('Pinging...');
        try {
            const response = await fetch('/api/plugins/personalyze/space-ping', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ spaceId }),
            });
            if (response.ok) {
                const data = await response.json();
                $status.text(`✓ Space online — ${data.info?.space_id || spaceId}`);
            } else {
                const data = await response.json().catch(() => ({}));
                $status.text(`✗ ${data.error || `Space returned ${response.status}`}`);
            }
        } catch (err) {
            $status.text(`✗ ${err.message.slice(0, 80)}`);
        } finally {
            $btn.prop('disabled', false);
        }
    });

    // 17. Space test
    $modal.on('click', '#plz-eng-space-test', async function () {
        const $btn = $(this);
        const $status = $('#plz-eng-space-status');
        $btn.prop('disabled', true);
        $status.text('Testing (this may take 30s+)...');
        try {
            const objectUrl = await fetchPreviewBlob(
                'a simple illustration of a blue bird, white background',
                'test',
                'hf-space',
            );
            $status.text('✓ Image generated');
            await callPopup(
                `<h3>HF Space — Test OK</h3>
                 <p style="opacity:0.65;font-size:0.88em;">The HuggingFace Space responded successfully. Test image below:</p>
                 <img src="${objectUrl}" style="width:100%;border-radius:6px;margin-top:8px;" />`,
                'text',
            );
        } catch (err) {
            $status.text(`✗ ${err.message.slice(0, 80)}`);
            error('EnginesModal', 'HF Space test failed:', err);
        } finally {
            $btn.prop('disabled', false);
        }
    });

    log('EnginesModal', 'Handlers bound.');
}
