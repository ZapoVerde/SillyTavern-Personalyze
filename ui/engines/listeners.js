/**
 * @file data/default-user/extensions/personalyze/ui/engines/listeners.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role UI Logic (Engines Modal)
 * @description
 * Event bindings for the Engines configuration modal.
 * Uses the standalone ping utility to validate connections.
 *
 * @api-declaration
 * bindEnginesHandlers($modal) → void
 * refreshEnginesUI() → void
 * updateEngineKeyStatuses() → void
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [settings]
 *     external_io: [DOM, writeSecret, ping utility, toastr]
 */

import { getSettings, updateSetting } from '../../settings.js';
import { fetchPreviewBlob } from '../../imageCache.js';
import { HF_PROVIDER_MODELS } from '../../defaults.js';
import { log, error } from '../../utils/logger.js';
import { pingPollinations, pingHFRouter, pingHFSpace } from '../../utils/ping.js';
import { writeSecret, secret_state } from '../../../../../secrets.js';
import { callPopup } from '../../../../../../script.js';
import { rebuildSpaceDropdown } from './templates.js';

// ─── Key Status ───────────────────────────────────────────────────────────────

/**
 * Updates all engine key status indicators in the engines modal.
 */
export function updateEngineKeyStatuses() {
    const polState = secret_state['api_key_pollinations'];
    const hfState  = secret_state['api_key_huggingface'];

    const hasPol = Array.isArray(polState) && polState.length > 0;
    const hasHf  = Array.isArray(hfState)  && hfState.length  > 0;

    const polHtml  = hasPol
        ? '<span style="color:var(--SmartThemeQuoteColor,#28a745); font-size:0.9em;">● Key saved in vault</span>'
        : '<span style="color:var(--SmartThemeErrorColor,#e05555); font-size:0.9em;">○ No key found</span>';
    const hfHtml   = hasHf
        ? '<span style="color:var(--SmartThemeQuoteColor,#28a745); font-size:0.9em;">● Key saved in vault</span>'
        : '<span style="color:var(--SmartThemeErrorColor,#e05555); font-size:0.9em;">○ No key found</span>';

    $('#plz-eng-pol-key-status').html(polHtml);
    $('#plz-eng-hf-key-status').html(hfHtml);
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

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

    // 1. Vault Save
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

    // 2. Pollinations Ping
    $modal.on('click', '#plz-eng-pol-ping', async function () {
        const $btn = $(this);
        const $status = $('#plz-eng-pol-status');
        $btn.prop('disabled', true);
        $status.text('Pinging...');

        const result = await pingPollinations();
        if (result.ok) {
            $status.html('<span style="color:var(--SmartThemeQuoteColor);">✓ Reachable</span>');
        } else {
            $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${result.error}</span>`);
        }
        $btn.prop('disabled', false);
    });

    // 3. Pollinations Test
    $modal.on('click', '#plz-eng-pol-test', async function () {
        const $btn = $(this);
        const $status = $('#plz-eng-pol-status');
        $btn.prop('disabled', true);
        $status.text('Generating test image...');
        try {
            const objectUrl = await fetchPreviewBlob(
                'a simple illustration of a blue bird, white background',
                'test',
                'pollinations',
            );
            $status.text('✓ Image generated');
            await callPopup(
                `<h3>Pollinations — Test OK</h3>
                 <p style="opacity:0.65;font-size:0.88em;">The engine responded successfully. Test image below:</p>
                 <img src="${objectUrl}" style="width:100%;border-radius:6px;margin-top:8px;" />`,
                'text',
            );
        } catch (err) {
            $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${err.message.slice(0, 80)}</span>`);
            error('EnginesModal', 'Pollinations test failed:', err);
        } finally {
            $btn.prop('disabled', false);
        }
    });

    // 4. HF Router Ping
    $modal.on('click', '#plz-eng-hf-ping', async function () {
        const $btn = $(this);
        const $status = $('#plz-eng-hf-status');
        $btn.prop('disabled', true);
        $status.text('Validating key...');

        const result = await pingHFRouter();
        if (result.ok) {
            $status.html(`<span style="color:var(--SmartThemeQuoteColor);">✓ Key valid — ${result.user || 'authenticated'}</span>`);
        } else {
            $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${result.error}</span>`);
        }
        $btn.prop('disabled', false);
    });

    // 5. HF Router Test
    $modal.on('click', '#plz-eng-hf-test', async function () {
        const $btn = $(this);
        const $status = $('#plz-eng-hf-status');
        $btn.prop('disabled', true);
        $status.text('Generating test image...');
        try {
            const objectUrl = await fetchPreviewBlob(
                'a simple illustration of a blue bird, white background',
                'test',
                'huggingface',
            );
            $status.text('✓ Image generated');
            await callPopup(
                `<h3>HF Router — Test OK</h3>
                 <p style="opacity:0.65;font-size:0.88em;">The router responded successfully. Test image below:</p>
                 <img src="${objectUrl}" style="width:100%;border-radius:6px;margin-top:8px;" />`,
                'text',
            );
        } catch (err) {
            $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${err.message.slice(0, 80)}</span>`);
            error('EnginesModal', 'HF Router test failed:', err);
        } finally {
            $btn.prop('disabled', false);
        }
    });

    // 6. HF Space Ping
    $modal.on('click', '#plz-eng-space-ping', async function () {
        const $btn = $(this);
        const $status = $('#plz-eng-space-status');
        const spaceId = $('#plz-eng-space-id').val().trim();
        if (!spaceId) return;

        $btn.prop('disabled', true);
        $status.text('Pinging space...');

        const result = await pingHFSpace(spaceId);
        if (result.ok) {
            const hardware = result.info?.hardware || 'unknown hardware';
            $status.html(`<span style="color:var(--SmartThemeQuoteColor);">✓ Space Online (${hardware})</span>`);
        } else {
            $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${result.error}</span>`);
        }
        $btn.prop('disabled', false);
    });

    // 7. HF Space Test
    $modal.on('click', '#plz-eng-space-test', async function () {
        const $btn = $(this);
        const $status = $('#plz-eng-space-status');
        $btn.prop('disabled', true);
        $status.text('Generating from space (may take 30s+)...');
        try {
            const objectUrl = await fetchPreviewBlob(
                'a simple illustration of a blue bird, white background',
                'test',
                'hf-space',
            );
            $status.text('✓ Image generated');
            await callPopup(
                `<h3>HF Space — Test OK</h3>
                 <p style="opacity:0.65;font-size:0.88em;">The Gradio space responded successfully. Test image below:</p>
                 <img src="${objectUrl}" style="width:100%;border-radius:6px;margin-top:8px;" />`,
                'text',
            );
        } catch (err) {
            $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${err.message.slice(0, 80)}</span>`);
            error('EnginesModal', 'HF Space test failed:', err);
        } finally {
            $btn.prop('disabled', false);
        }
    });

    // ─── Settings Synchronization ───

    $modal.on('change', '#plz-eng-pol-model', function () {
        updateSetting('imageModel', $(this).val());
    });

    $modal.on('change', '#plz-eng-hf-provider', function () {
        const val = $(this).val();
        updateSetting('hfProvider', val);
        const firstModel = HF_PROVIDER_MODELS[val]?.models[0] ?? '';
        refreshHFModelDropdown(val, firstModel);
        updateSetting('hfImageModel', firstModel);
    });

    $modal.on('change', '#plz-eng-hf-model', function () {
        updateSetting('hfImageModel', $(this).val());
    });

    $modal.on('input', '#plz-eng-space-id', function () {
        updateSetting('hfSpaceId', $(this).val().trim());
    });

    // ─── Space Dropdown ───

    $modal.on('click', '#plz-eng-space-toggle', function (e) {
        e.stopPropagation();
        $('#plz-eng-space-dropdown').toggle();
    });

    $modal.on('click', '.plz-eng-space-entry span[data-space-id]', function () {
        const id = $(this).data('space-id');
        $('#plz-eng-space-id').val(id).trigger('input');
        $('#plz-eng-space-dropdown').hide();
    });

    $modal.on('click', '.plz-eng-space-remove', function (e) {
        e.stopPropagation();
        const id = $(this).data('space-id');
        const current = getSettings().hfSavedSpaces ?? [];
        const newList = current.filter(s => s !== id);
        updateSetting('hfSavedSpaces', newList);
        $('#plz-eng-space-dropdown').html(rebuildSpaceDropdown(newList));
    });

    $modal.on('click', '#plz-eng-space-add', function () {
        const spaceId = $('#plz-eng-space-id').val().trim();
        if (!spaceId.includes('/')) return;
        const current = getSettings().hfSavedSpaces ?? [];
        if (current.includes(spaceId)) return;
        const newList = [...current, spaceId];
        updateSetting('hfSavedSpaces', newList);
        $('#plz-eng-space-dropdown').html(rebuildSpaceDropdown(newList));
    });

    // Auto-hide dropdown on outside click
    $(document).on('click.plz-space-dd', function(e) {
        if (!$(e.target).closest('#plz-eng-space-toggle, #plz-eng-space-dropdown').length) {
            $('#plz-eng-space-dropdown').hide();
        }
    });

    log('EnginesModal', 'Handlers bound.');
}