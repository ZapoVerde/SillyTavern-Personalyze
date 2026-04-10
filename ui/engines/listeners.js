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
import { DEFAULT_TEST_PROMPT } from '../../defaults.js';
import { log, error } from '../../utils/logger.js';
import { pingPollinations, pingFal, pingPiAPI } from '../../utils/ping.js';
import { writeSecret, secret_state } from '../../../../../secrets.js';
import { callPopup } from '../../../../../../script.js';
import { getCachedModels } from '../panel/models.js';
import { smartResize } from '../../utils/dom.js';

// ─── Key Status ───────────────────────────────────────────────────────────────

/**
 * Updates all engine key status indicators in the engines modal.
 */
export function updateEngineKeyStatuses() {
    const polState   = secret_state['api_key_pollinations'];
    const falState   = secret_state['api_key_fal'];
    const piapiState = secret_state['api_key_piapi'];

    const hasPol   = Array.isArray(polState)   && polState.length   > 0;
    const hasFal   = Array.isArray(falState)   && falState.length   > 0;
    const hasPiAPI = Array.isArray(piapiState) && piapiState.length > 0;

    const okHtml  = '<span style="color:var(--SmartThemeQuoteColor,#28a745); font-size:0.9em;">● Key saved in vault</span>';
    const errHtml = '<span style="color:var(--SmartThemeErrorColor,#e05555); font-size:0.9em;">○ No key found</span>';

    $('#plz-eng-pol-key-status').html(hasPol ? okHtml : errHtml);
    $('#plz-eng-fal-key-status').html(hasFal ? okHtml : errHtml);
    $('#plz-eng-piapi-key-status').html(hasPiAPI ? okHtml : errHtml);
}

// ─── UI Refresh ───────────────────────────────────────────────────────────────

/**
 * Syncs all modal inputs to current settings.
 */
export function refreshEnginesUI() {
    const s = getSettings();

    // 0. Default Engine Buttons
    const defaultEngine = s.defaultEngine || 'pollinations';
    $('.plz-eng-set-default').each(function () {
        const engineId = $(this).data('engine');
        const isDefault = engineId === defaultEngine;
        $(this)
            .toggleClass('plz-active', isDefault)
            .html(`<i class="fa-${isDefault ? 'solid' : 'regular'} fa-star"></i> ${isDefault ? 'Default Engine' : 'Set as Default'}`);
    });

    // 0b. Availability Toggles
    $('#plz-eng-pol-enabled').prop('checked', s.engineEnablePollinations !== false);
    $('#plz-eng-fal-enabled').prop('checked', !!s.engineEnableFal);
    $('#plz-eng-piapi-enabled').prop('checked', !!s.engineEnablePiAPI);

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
    $('#plz-eng-piapi-rmbg').prop('checked', !!s.piapiRemoveBackground);
    $('#plz-eng-piapi-rmbg-model').val(s.piapiRmbgModel).prop('disabled', !s.piapiRemoveBackground);

    // 3. Test Prompt Area
    const $testArea = $('#plz-eng-test-prompt');
    $testArea.val(s.testPrompt ?? DEFAULT_TEST_PROMPT);
    smartResize($testArea[0]);

    // 4. Update Vault Indicators
    updateEngineKeyStatuses();
}

// ─── Event Bindings ───────────────────────────────────────────────────────────

/**
 * Binds all event handlers for the engines modal.
 * @param {jQuery} $modal - The overlay element (#plz-engines-overlay).
 */
export function bindEnginesHandlers($modal) {

    // 0. Default Engine Selection
    $modal.on('click', '.plz-eng-set-default', function () {
        const engineId = $(this).data('engine');
        updateSetting('defaultEngine', engineId);
        $('.plz-eng-set-default').each(function () {
            const id = $(this).data('engine');
            const isDefault = id === engineId;
            $(this)
                .toggleClass('plz-active', isDefault)
                .html(`<i class="fa-${isDefault ? 'solid' : 'regular'} fa-star"></i> ${isDefault ? 'Default Engine' : 'Set as Default'}`);
        });
    });

    // 1. Vault Save
    $modal.on('click', '.plz-eng-vault-save', async function () {
        const secretName = $(this).data('secret');
        let inputId;
        let label;

        if (secretName === 'api_key_fal') {
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

    $modal.on('change', '#plz-eng-piapi-rmbg', function () {
        const enabled = $(this).prop('checked');
        updateSetting('piapiRemoveBackground', enabled);
        $('#plz-eng-piapi-rmbg-model').prop('disabled', !enabled);
    });

    $modal.on('change', '#plz-eng-piapi-rmbg-model', function () {
        updateSetting('piapiRmbgModel', $(this).val());
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

    log('EnginesModal', 'Handlers bound.');
}