/**
 * @file data/default-user/extensions/personalyze/ui/engines/listeners.js
 * @stamp {"utc":"2026-04-07T00:00:00.000Z"}
 * @architectural-role UI Logic (Engines Modal)
 * @description
 * Event bindings for the Engines configuration modal. 
 * 
 * Updated to support the Multi-Engine architecture, including Fal AI.
 * Handles the "Availability" master toggles to control which engines appear 
 * in the Dressing Room and Studio dropdowns.
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
 *     external_io:[DOM, writeSecret, fetchPreviewBlob, toastr, models.js]
 */

import { getSettings, updateSetting } from '../../settings.js';
import { fetchPreviewBlob } from '../../imageCache.js';
import { HF_PROVIDER_MODELS, DEFAULT_TEST_PROMPT } from '../../defaults.js';
import { log, error } from '../../utils/logger.js';
import { pingPollinations, pingHFRouter, pingHFSpace, pingFal, pingPiAPI } from '../../utils/ping.js';
import { writeSecret, secret_state } from '../../../../../secrets.js';
import { callPopup } from '../../../../../../script.js';
import { rebuildSpaceDropdown } from './templates.js';
import { getCachedModels } from '../panel/models.js';
import { smartResize } from '../../utils/dom.js';

// ─── Key Status ───────────────────────────────────────────────────────────────

/**
 * Updates all engine key status indicators in the engines modal.
 */
export function updateEngineKeyStatuses() {
    const polState   = secret_state['api_key_pollinations'];
    const hfState    = secret_state['api_key_huggingface'];
    const falState   = secret_state['api_key_fal'];
    const piapiState = secret_state['api_key_piapi'];

    const hasPol   = Array.isArray(polState)   && polState.length   > 0;
    const hasHf    = Array.isArray(hfState)    && hfState.length    > 0;
    const hasFal   = Array.isArray(falState)   && falState.length   > 0;
    const hasPiAPI = Array.isArray(piapiState) && piapiState.length > 0;

    const okHtml  = '<span style="color:var(--SmartThemeQuoteColor,#28a745); font-size:0.9em;">● Key saved in vault</span>';
    const errHtml = '<span style="color:var(--SmartThemeErrorColor,#e05555); font-size:0.9em;">○ No key found</span>';

    $('#plz-eng-pol-key-status').html(hasPol ? okHtml : errHtml);
    $('#plz-eng-hf-key-status').html(hasHf ? okHtml : errHtml);
    $('#plz-eng-fal-key-status').html(hasFal ? okHtml : errHtml);
    $('#plz-eng-piapi-key-status').html(hasPiAPI ? okHtml : errHtml);
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Rebuilds the HF model dropdown for the given provider.
 */
function refreshHFModelDropdown(provider, selectedModel) {
    const models = HF_PROVIDER_MODELS[provider]?.models ??[];
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

    // 0. Availability Toggles
    $('#plz-eng-pol-enabled').prop('checked', s.engineEnablePollinations !== false);
    $('#plz-eng-fal-enabled').prop('checked', !!s.engineEnableFal);
    $('#plz-eng-piapi-enabled').prop('checked', !!s.engineEnablePiAPI);
    $('#plz-eng-hf-enabled').prop('checked', !!s.engineEnableHuggingFace);

    // 1. Populate Pollinations Model Dropdown from Discovery Cache
    const currentPolModel = s.imageModel;
    const $polSelect = $('#plz-eng-pol-model');
    if ($polSelect.length) {
        const dynamicModels = getCachedModels();
        const options = dynamicModels
            .map(m => `<option value="${m}"${m === currentPolModel ? ' selected' : ''}>${m}</option>`)
            .join('');
        $polSelect.html(options);
        $polSelect.val(currentPolModel);
    }

    // 2. Populate Fal AI
    $('#plz-eng-fal-model').val(s.falModel);

    // 2b. Populate PiAPI
    $('#plz-eng-piapi-model').val(s.piapiModel);

    // 3. Populate Hugging Face Provider/Model
    $('#plz-eng-hf-provider').val(s.hfProvider);
    refreshHFModelDropdown(s.hfProvider, s.hfImageModel);

    // 4. Populate HF Space
    $('#plz-eng-space-id').val(s.hfSpaceId ?? '');

    // 5. Test Prompt Area
    const $testArea = $('#plz-eng-test-prompt');
    $testArea.val(s.testPrompt ?? DEFAULT_TEST_PROMPT);
    smartResize($testArea[0]);

    // 6. Update Vault Indicators
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
        let inputId;
        let label;

        if (secretName === 'api_key_huggingface') {
            inputId = '#plz-eng-hf-key';
            label   = 'PersonaLyze: Hugging Face';
        } else if (secretName === 'api_key_fal') {
            inputId = '#plz-eng-fal-key';
            label   = 'PersonaLyze: Fal AI';
        } else if (secretName === 'api_key_piapi') {
            inputId = '#plz-eng-piapi-key';
            label   = 'PersonaLyze: PiAPI';
        } else {
            inputId = '#plz-eng-pol-key';
            label   = 'PersonaLyze: Pollinations';
        }

        const key = $(inputId).val().trim();

        if (!key) {
            if (window.toastr) window.toastr.warning('Please paste the API key first.', 'PersonaLyze');
            return;
        }

        try {
            const result = await writeSecret(secretName, key, label);
            if (result === null) {
                error('EnginesModal', 'writeSecret returned null — vault write failed silently.');
                if (window.toastr) window.toastr.error('Failed to save key to vault.', 'PersonaLyze');
                return;
            }
            $(inputId).val('');
            updateEngineKeyStatuses();
            if (window.toastr) window.toastr.success('API key saved to vault.', 'PersonaLyze');
        } catch (err) {
            error('EnginesModal', 'Failed to write secret:', err);
            if (window.toastr) window.toastr.error('Failed to save key to vault.', 'PersonaLyze');
        }
    });

    // 2. Pollinations Ping & Test
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

    $modal.on('click', '#plz-eng-pol-test', async function () {
        await runEngineTest($(this), '#plz-eng-pol-status', 'pollinations', 'Pollinations');
    });

    // 3. Fal AI Ping & Test
    $modal.on('click', '#plz-eng-fal-ping', async function () {
        const $btn = $(this);
        const $status = $('#plz-eng-fal-status');
        $btn.prop('disabled', true);
        $status.text('Validating key...');

        const result = await pingFal();
        if (result.ok) {
            $status.html(`<span style="color:var(--SmartThemeQuoteColor);">✓ Key valid</span>`);
        } else {
            $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${result.error}</span>`);
        }
        $btn.prop('disabled', false);
    });

    $modal.on('click', '#plz-eng-fal-test', async function () {
        await runEngineTest($(this), '#plz-eng-fal-status', 'fal', 'Fal AI');
    });

    // 4. PiAPI Ping & Test
    $modal.on('click', '#plz-eng-piapi-ping', async function () {
        const $btn = $(this);
        const $status = $('#plz-eng-piapi-status');
        $btn.prop('disabled', true);
        $status.text('Validating key...');

        const result = await pingPiAPI();
        if (result.ok) {
            $status.html(`<span style="color:var(--SmartThemeQuoteColor);">✓ Key valid</span>`);
        } else {
            $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${result.error}</span>`);
        }
        $btn.prop('disabled', false);
    });

    $modal.on('click', '#plz-eng-piapi-test', async function () {
        await runEngineTest($(this), '#plz-eng-piapi-status', 'piapi', 'PiAPI');
    });

    // 5. HF Router Ping & Test
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

    $modal.on('click', '#plz-eng-hf-test', async function () {
        await runEngineTest($(this), '#plz-eng-hf-status', 'huggingface', 'HF Router');
    });

    // 5. HF Space Ping & Test
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

    $modal.on('click', '#plz-eng-space-test', async function () {
        await runEngineTest($(this), '#plz-eng-space-status', 'hf-space', 'HF Space');
    });

    /**
     * Shared logic for testing an engine's generation capability.
     */
    async function runEngineTest($btn, statusSelector, providerId, providerName) {
        const $status = $(statusSelector);
        const prompt = $('#plz-eng-test-prompt').val().trim();
        if (!prompt) return;

        $btn.prop('disabled', true);
        $status.text('Generating test image...');
        try {
            const objectUrl = await fetchPreviewBlob(prompt, 'test', providerId);
            $status.text('✓ Image generated');
            await callPopup(
                `<h3>${providerName} — Test OK</h3>
                 <p style="opacity:0.65;font-size:0.88em;">Engine responded successfully using custom test prompt.</p>
                 <img src="${objectUrl}" style="width:100%;border-radius:6px;margin-top:8px;" />`,
                'text',
            );
        } catch (err) {
            $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${err.message.slice(0, 80)}</span>`);
            error('EnginesModal', `${providerName} test failed:`, err);
        } finally {
            $btn.prop('disabled', false);
        }
    }

    // ─── Settings Synchronization ───

    // Availability Toggles
    $modal.on('change', '#plz-eng-pol-enabled', function () {
        updateSetting('engineEnablePollinations', $(this).prop('checked'));
    });
    $modal.on('change', '#plz-eng-fal-enabled', function () {
        updateSetting('engineEnableFal', $(this).prop('checked'));
    });
    $modal.on('change', '#plz-eng-piapi-enabled', function () {
        updateSetting('engineEnablePiAPI', $(this).prop('checked'));
    });
    $modal.on('change', '#plz-eng-hf-enabled', function () {
        updateSetting('engineEnableHuggingFace', $(this).prop('checked'));
    });

    // Model Selectors
    $modal.on('change', '#plz-eng-pol-model', function () {
        updateSetting('imageModel', $(this).val());
    });

    $modal.on('change', '#plz-eng-fal-model', function () {
        updateSetting('falModel', $(this).val());
    });

    $modal.on('change', '#plz-eng-piapi-model', function () {
        updateSetting('piapiModel', $(this).val());
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

    // ─── Test Prompt Actions ───

    $modal.on('input', '#plz-eng-test-prompt', function () {
        smartResize(this);
        updateSetting('testPrompt', $(this).val());
    });

    $modal.on('click', '#plz-eng-test-prompt-reset', function () {
        const $area = $('#plz-eng-test-prompt');
        $area.val(DEFAULT_TEST_PROMPT);
        smartResize($area[0]);
        updateSetting('testPrompt', DEFAULT_TEST_PROMPT);
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
        const current = getSettings().hfSavedSpaces ??[];
        const newList = current.filter(s => s !== id);
        updateSetting('hfSavedSpaces', newList);
        $('#plz-eng-space-dropdown').html(rebuildSpaceDropdown(newList));
    });

    $modal.on('click', '#plz-eng-space-add', function () {
        const spaceId = $('#plz-eng-space-id').val().trim();
        if (!spaceId.includes('/')) return;
        const current = getSettings().hfSavedSpaces ??[];
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