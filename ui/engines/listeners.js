/**
 * @file data/default-user/extensions/personalyze/ui/engines/listeners.js
 * @stamp {"utc":"2026-04-19T10:20:00.000Z"}
 * @architectural-role UI Logic (Engines Modal)
 * @description
 * Event bindings for the Engines configuration modal. 
 * 
 * Updated for Dynamic Blueprint Architecture:
 * 1. Added listener for #plz-open-model-manager.
 * 2. Maintained standard key validation and ping/test logic.
 *
 * @api-declaration
 * bindEnginesHandlers($modal) → void
 * refreshEnginesUI() → Promise<void>
 * updateEngineKeyStatuses() → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [settings]
 *     external_io:[DOM, writeSecret, fetchPreviewBlob, toastr, models.js, getRequestHeaders, modelManagerModal.js]
 */

import { getSettings, updateSetting } from '../../settings.js';
import { fetchPreviewBlob } from '../../imageCache.js';
import { DEFAULT_TEST_PROMPT, SECRET_RUNWARE } from '../../defaults.js';
import { log, error } from '../../utils/logger.js';
import { pingPollinations, pingFal, pingPiAPI, pingRunware } from '../../utils/ping.js';
import { writeSecret, secret_state } from '../../../../../secrets.js';
import { getRequestHeaders, callPopup } from '../../../../../../script.js';
import { getCachedModels } from '../panel/models.js';
import { smartResize } from '../../utils/dom.js';
import { openModelManager } from '../models/modelManagerModal.js';

// ─── Key Status ───────────────────────────────────────────────────────────────

/**
 * Updates all engine key status indicators in the engines modal.
 * Uses a hybrid approach: secret_state for standard keys, plugin proxy for custom keys.
 */
export async function updateEngineKeyStatuses() {
    // 1. Pollinations check (Standard ST key, exists in secret_state)
    const polState = secret_state['api_key_pollinations'];
    const hasPol = Array.isArray(polState) && polState.length > 0;

    // 2. Custom Extension keys check (Do not exist in frontend secret_state)
    const customKeys = ['api_key_fal', 'api_key_piapi', SECRET_RUNWARE];
    let customStatus = {
        'api_key_fal': false,
        'api_key_piapi': false,
        [SECRET_RUNWARE]: false
    };

    try {
        const response = await fetch('/api/plugins/personalyze/keys-status', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ keys: customKeys })
        });

        if (response.ok) {
            customStatus = await response.json();
        }
    } catch (err) {
        error('EnginesModal', 'Failed to fetch key statuses from server proxy:', err);
    }

    const okHtml  = '<span style="color:var(--SmartThemeQuoteColor,#28a745); font-size:0.9em;">● Key saved in vault</span>';
    const errHtml = '<span style="color:var(--SmartThemeErrorColor,#e05555); font-size:0.9em;">○ No key found</span>';

    $('#plz-eng-pol-key-status').html(hasPol ? okHtml : errHtml);
    $('#plz-eng-fal-key-status').html(customStatus['api_key_fal'] ? okHtml : errHtml);
    $('#plz-eng-piapi-key-status').html(customStatus['api_key_piapi'] ? okHtml : errHtml);
    $('#plz-eng-runware-key-status').html(customStatus[SECRET_RUNWARE] ? okHtml : errHtml);
}

// ─── UI Refresh ───────────────────────────────────────────────────────────────

/**
 * Syncs all modal inputs to current settings.
 */
export async function refreshEnginesUI() {
    const s = getSettings();

    // 1. Availability Toggles
    $('#plz-eng-pol-enabled').prop('checked', s.engineEnablePollinations !== false);
    $('#plz-eng-fal-enabled').prop('checked', !!s.engineEnableFal);
    $('#plz-eng-piapi-enabled').prop('checked', !!s.engineEnablePiAPI);
    $('#plz-eng-runware-enabled').prop('checked', !!s.engineEnableRunware);

    // 2. Populate Pollinations
    const $polSelect = $('#plz-eng-pol-model');
    if ($polSelect.length) {
        const dynamicModels = getCachedModels();
        const options = dynamicModels
            .map(m => `<option value="${m}"${m === s.imageModel ? ' selected' : ''}>${m}</option>`)
            .join('');
        $polSelect.html(options);
        $polSelect.val(s.imageModel);
    }

    // 3. Populate Tabs
    $('#plz-eng-fal-model').val(s.falModel);
    $('#plz-eng-piapi-model').val(s.piapiModel);
    $('#plz-eng-piapi-rmbg').prop('checked', !!s.piapiRemoveBackground);
    $('#plz-eng-piapi-rmbg-model').val(s.piapiRmbgModel).prop('disabled', !s.piapiRemoveBackground);

    $('#plz-eng-runware-model').val(s.runwareModel);
    $('#plz-eng-runware-layerdiffuse').prop('checked', !!s.runwareUseLayerDiffuse);
    $('#plz-eng-runware-rmbg').prop('checked', !!s.runwareRemoveBackground);
    $('#plz-eng-runware-rmbg-model').val(s.runwareRmbgModel).prop('disabled', !s.runwareRemoveBackground);

    // 4. Test Prompt Area
    const $testArea = $('#plz-eng-test-prompt');
    $testArea.val(s.testPrompt ?? DEFAULT_TEST_PROMPT);
    smartResize($testArea[0]);

    await updateEngineKeyStatuses();
}

// ─── Event Bindings ───────────────────────────────────────────────────────────

/**
 * Binds all event handlers for the engines modal.
 * @param {jQuery} $modal - The overlay element (#plz-engines-overlay).
 */
export function bindEnginesHandlers($modal) {

    // 0. Model Manager Trigger
    $modal.on('click', '#plz-open-model-manager', async () => {
        await openModelManager();
    });

    // 1. Vault Save
    $modal.on('click', '.plz-eng-vault-save', async function () {
        const secretName = $(this).data('secret');
        let inputId, label;

        if (secretName === 'api_key_fal') { inputId = '#plz-eng-fal-key'; label = 'PersonaLyze: Fal AI'; }
        else if (secretName === 'api_key_piapi') { inputId = '#plz-eng-piapi-key'; label = 'PersonaLyze: PiAPI'; }
        else if (secretName === SECRET_RUNWARE) { inputId = '#plz-eng-runware-key'; label = 'PersonaLyze: Runware'; }
        else { inputId = '#plz-eng-pol-key'; label = 'PersonaLyze: Pollinations'; }

        const key = $(inputId).val().trim();
        if (!key) { if (window.toastr) window.toastr.warning('Please paste the API key first.'); return; }

        try {
            const result = await writeSecret(secretName, key, label);
            if (result !== null) {
                $(inputId).val('');
                await updateEngineKeyStatuses();
                if (window.toastr) window.toastr.success('API key saved to vault.');
            }
        } catch (err) { error('EnginesModal', 'Vault write failed:', err); }
    });

    // 2. Ping Handlers
    $modal.on('click', '#plz-eng-pol-ping', async () => await runPing(pingPollinations, '#plz-eng-pol-status'));
    $modal.on('click', '#plz-eng-fal-ping', async () => await runPing(pingFal, '#plz-eng-fal-status'));
    $modal.on('click', '#plz-eng-piapi-ping', async () => await runPing(pingPiAPI, '#plz-eng-piapi-status'));
    $modal.on('click', '#plz-eng-runware-ping', async () => await runPing(pingRunware, '#plz-eng-runware-status'));

    async function runPing(pingFn, statusSelector) {
        const $status = $(statusSelector).text('Pinging...');
        const result = await pingFn();
        $status.html(result.ok ? '<span style="color:var(--SmartThemeQuoteColor);">✓ Responsive</span>' : `<span style="color:var(--SmartThemeErrorColor);">✗ ${result.error}</span>`);
    }

    // 3. Test Handlers
    $modal.on('click', '#plz-eng-pol-test', async function() { await runEngineTest($(this), '#plz-eng-pol-status', 'pollinations'); });
    $modal.on('click', '#plz-eng-fal-test', async function() { await runEngineTest($(this), '#plz-eng-fal-status', 'fal'); });
    $modal.on('click', '#plz-eng-piapi-test', async function() { await runEngineTest($(this), '#plz-eng-piapi-status', 'piapi'); });
    $modal.on('click', '#plz-eng-runware-test', async function() { await runEngineTest($(this), '#plz-eng-runware-status', 'runware'); });

    /**
     * Executes a test generation using explicit parameters from the modal UI.
     */
    async function runEngineTest($btn, statusSelector, providerId) {
        const $status = $(statusSelector);
        const prompt = $('#plz-eng-test-prompt').val().trim();
        const model = $(`#plz-eng-${providerId}-model`).val();
        if (!prompt) return;

        const originalHtml = $btn.html();
        $btn.prop('disabled', true);
        $status.text('Generating test image...');
        try {
            const useLayerDiffuse = (providerId === 'runware') ? $('#plz-eng-runware-layerdiffuse').prop('checked') : false;
            const objectUrl = await fetchPreviewBlob(providerId, model, prompt, '', 256, 384, 1, [], useLayerDiffuse);
            
            $status.text('✓ Image generated');
            await callPopup(`<h3>Test OK</h3><img src="${objectUrl}" style="width:100%;border-radius:6px;margin-top:8px;" />`, 'text');
        } catch (err) {
            $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${err.message.slice(0, 80)}</span>`);
            error('EnginesModal', 'Test failed:', err);
        } finally { $btn.prop('disabled', false).html(originalHtml); }
    }

    // 4. Settings Sync
    $modal.on('change', '#plz-eng-pol-enabled', function () { updateSetting('engineEnablePollinations', $(this).prop('checked')); });
    $modal.on('change', '#plz-eng-fal-enabled', function () { updateSetting('engineEnableFal', $(this).prop('checked')); });
    $modal.on('change', '#plz-eng-piapi-enabled', function () { updateSetting('engineEnablePiAPI', $(this).prop('checked')); });
    $modal.on('change', '#plz-eng-runware-enabled', function () { updateSetting('engineEnableRunware', $(this).prop('checked')); });

    $modal.on('change', '#plz-eng-pol-model', function () { updateSetting('imageModel', $(this).val()); });
    $modal.on('change', '#plz-eng-fal-model', function () { updateSetting('falModel', $(this).val()); });
    $modal.on('change', '#plz-eng-piapi-model', function () { updateSetting('piapiModel', $(this).val()); });
    $modal.on('change', '#plz-eng-runware-model', function () { updateSetting('runwareModel', $(this).val()); });

    $modal.on('change', '#plz-eng-piapi-rmbg', function () { 
        const enabled = $(this).prop('checked');
        updateSetting('piapiRemoveBackground', enabled);
        $('#plz-eng-piapi-rmbg-model').prop('disabled', !enabled);
        if (enabled) $('#plz-eng-runware-rmbg').prop('checked', false).trigger('change');
    });

    $modal.on('change', '#plz-eng-runware-rmbg', function () { 
        const enabled = $(this).prop('checked');
        updateSetting('runwareRemoveBackground', enabled);
        $('#plz-eng-runware-rmbg-model').prop('disabled', !enabled);
        if (enabled) $('#plz-eng-piapi-rmbg').prop('checked', false).trigger('change');
    });

    $modal.on('change', '#plz-eng-piapi-rmbg-model', function () { updateSetting('piapiRmbgModel', $(this).val()); });
    $modal.on('change', '#plz-eng-runware-rmbg-model', function () { updateSetting('runwareRmbgModel', $(this).val()); });
    $modal.on('change', '#plz-eng-runware-layerdiffuse', function () { updateSetting('runwareUseLayerDiffuse', $(this).prop('checked')); });

    $modal.on('input', '#plz-eng-test-prompt', function () { smartResize(this); updateSetting('testPrompt', $(this).val()); });
    $modal.on('click', '#plz-eng-test-prompt-reset', () => { 
        const $area = $('#plz-eng-test-prompt').val(DEFAULT_TEST_PROMPT);
        smartResize($area[0]); updateSetting('testPrompt', DEFAULT_TEST_PROMPT); 
    });

    log('EnginesModal', 'Handlers bound.');
}