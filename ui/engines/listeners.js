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
import { startSystemTurn, logCall, logPatchLast } from '../../utils/callLog.js';
import { saveManualModel, saveManualLora } from '../panel/models.js';
import { getRunwareUploadFormHTML } from './templates.js';

// ─── Upload Form State (ephemeral session memory) ─────────────────────────────
const _uploadState = { name: '', air: '', version: 'v1', downloadURL: '', architecture: 'sdxl', category: 'checkpoint', format: 'safetensors', type: 'base' };

const _typeOptions = {
    checkpoint: [['base','base'],['inpainting','inpainting'],['refiner','refiner'],['pix2pix','pix2pix']],
    lora:       [['positive','positive'],['negative','negative']],
    lycoris:    [['positive','positive'],['negative','negative']],
    embeddings: [['positive','positive'],['negative','negative']],
    vae:        [],
};

function _rebuildTypeOptions($overlay, category, selectedType) {
    const opts = _typeOptions[category] ?? [];
    const $sel = $overlay.find('#plz-upload-type');
    const $row = $overlay.find('#plz-upload-type-row');
    if (opts.length === 0) {
        $row.hide();
        return;
    }
    $row.show();
    $sel.html(opts.map(([v, l]) => `<option value="${v}"${v === selectedType ? ' selected' : ''}>${l}</option>`).join(''));
}

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

    // 0a. Runware Model Upload
    $modal.on('click', '#plz-upload-runware-model', () => {
        $('#plz-upload-overlay').remove();

        const $overlay = $(`
            <div id="plz-upload-overlay" class="plz-overlay" style="z-index:10001;">
                <div class="plz-modal" style="max-width:440px;">
                    <div class="plz-workshop-header">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <h3 style="margin:0;"><i class="fa-solid fa-cloud-arrow-up"></i> Upload Model to Runware</h3>
                            <div style="display:flex; gap:6px; align-items:center;">
                                <button id="plz-upload-reset" class="menu_button" style="padding:2px 8px; font-size:0.8em;">Reset</button>
                                <button id="plz-upload-close" class="menu_button" style="padding:2px 10px;">✕</button>
                            </div>
                        </div>
                    </div>
                    <div class="plz-workshop-body">
                        ${getRunwareUploadFormHTML()}
                        <div style="display:flex; justify-content:flex-end; margin-top:8px;">
                            <button id="plz-upload-copy" class="menu_button" style="font-size:0.75em; padding:1px 8px;" title="Copy response to clipboard">
                                <i class="fa-regular fa-copy"></i> Copy
                            </button>
                        </div>
                        <div id="plz-upload-status" style="font-size:0.85em; min-height:1.4em;"></div>
                        <div id="plz-upload-btn-row" style="display:flex; gap:8px; margin-top:4px;">
                            <button id="plz-upload-submit" class="menu_button" style="flex:1;">
                                <i class="fa-solid fa-upload"></i> Submit Upload
                            </button>
                        </div>
                    </div>
                </div>
            </div>`);

        $('body').append($overlay);

        // Restore persisted values
        $overlay.find('#plz-upload-name').val(_uploadState.name);
        $overlay.find('#plz-upload-air').val(_uploadState.air);
        $overlay.find('#plz-upload-version').val(_uploadState.version);
        $overlay.find('#plz-upload-url').val(_uploadState.downloadURL);
        $overlay.find('#plz-upload-arch').val(_uploadState.architecture);
        $overlay.find('#plz-upload-category').val(_uploadState.category);
        $overlay.find('#plz-upload-format').val(_uploadState.format);
        _rebuildTypeOptions($overlay, _uploadState.category, _uploadState.type);

        // Sync state on any input change
        $overlay.on('input change', 'input, select', () => {
            _uploadState.name         = $overlay.find('#plz-upload-name').val();
            _uploadState.air          = $overlay.find('#plz-upload-air').val();
            _uploadState.version      = $overlay.find('#plz-upload-version').val();
            _uploadState.downloadURL  = $overlay.find('#plz-upload-url').val();
            _uploadState.architecture = $overlay.find('#plz-upload-arch').val();
            _uploadState.category     = $overlay.find('#plz-upload-category').val();
            _uploadState.format       = $overlay.find('#plz-upload-format').val();
            _uploadState.type         = $overlay.find('#plz-upload-type').val();
        });

        // Reset button
        $overlay.on('click', '#plz-upload-reset', () => {
            Object.assign(_uploadState, { name: '', air: '', version: 'v1', downloadURL: '', architecture: 'sdxl', category: 'checkpoint', format: 'safetensors', type: 'base' });
            $overlay.find('#plz-upload-name').val('');
            $overlay.find('#plz-upload-air').val('');
            $overlay.find('#plz-upload-version').val('v1');
            $overlay.find('#plz-upload-url').val('');
            $overlay.find('#plz-upload-arch').val('sdxl');
            $overlay.find('#plz-upload-category').val('checkpoint');
            $overlay.find('#plz-upload-format').val('safetensors');
            $overlay.find('#plz-upload-status').html('');
            _rebuildTypeOptions($overlay, 'checkpoint', 'base');
        });

        // Rebuild type options when category changes
        $overlay.on('change', '#plz-upload-category', function () {
            _rebuildTypeOptions($overlay, $(this).val(), '');
        });

        $overlay.on('click', '#plz-upload-copy', async () => {
            const text = $overlay.find('#plz-upload-status').text().trim();
            if (!text) return;
            try {
                await navigator.clipboard.writeText(text);
                if (window.toastr) window.toastr.info('Copied to clipboard.');
            } catch {
                if (window.toastr) window.toastr.warning('Copy failed — select manually.');
            }
        });

        $overlay.on('click', '#plz-upload-close', () => $overlay.remove());
        $overlay.on('click', function (e) { if (e.target === this) $overlay.remove(); });

        $overlay.on('click', '#plz-upload-submit', async () => {
            const name         = $overlay.find('#plz-upload-name').val().trim();
            const air          = $overlay.find('#plz-upload-air').val().trim();
            const version      = $overlay.find('#plz-upload-version').val().trim();
            const downloadURL  = $overlay.find('#plz-upload-url').val().trim();
            const architecture = $overlay.find('#plz-upload-arch').val();
            const category     = $overlay.find('#plz-upload-category').val();
            const format       = $overlay.find('#plz-upload-format').val();
            const type         = $overlay.find('#plz-upload-type').val();
            const $status      = $overlay.find('#plz-upload-status');
            const $submit      = $overlay.find('#plz-upload-submit');

            if (!name || !air || !downloadURL) {
                $status.html('<span style="color:var(--SmartThemeErrorColor);">Name, AIR ID, and URL are required.</span>');
                return;
            }

            const reqBundle = { name, air, version, downloadURL, architecture, category, format, ...(type ? { type } : {}) };
            const $btnRow = $overlay.find('#plz-upload-btn-row');

            // Switch to in-progress button row
            $submit.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Uploading...');
            $btnRow.append(`<button id="plz-upload-bg" class="menu_button" style="flex:1;">
                <i class="fa-solid fa-arrow-right-from-bracket"></i> Close & Continue
            </button>`);
            $overlay.on('click', '#plz-upload-bg', () => $overlay.remove());
            $status.html('<span style="opacity:0.7;">Submitting to Runware...</span>');

            const isOpen = () => $.contains(document, $overlay[0]);

            startSystemTurn('Runware Model Upload');
            logCall('UploadModel', `[${architecture}/${category}] ${name}\n${downloadURL}`, null, null, reqBundle);

            const resetBtn = () => {
                $overlay.find('#plz-upload-bg').remove();
                $submit.prop('disabled', false).html('<i class="fa-solid fa-upload"></i> Submit Upload');
            };

            try {
                const response = await fetch('/api/plugins/personalyze/runware-upload-model', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify(reqBundle)
                });

                if (!response.ok) {
                    const msg = (await response.json().catch(() => ({}))).error || `HTTP ${response.status}`;
                    logPatchLast(null, msg, null, null);
                    if (isOpen()) { $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${msg}</span>`); resetBtn(); }
                    else if (window.toastr) window.toastr.error(`Upload failed: ${msg}`);
                    return;
                }

                // Read the stream — Runware may send NDJSON or a single JSON blob
                log('UploadStream', `Response ok, status=${response.status}, streaming body...`);
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buf = '';
                let lastResult = null;
                let lastError = null;
                let chunkCount = 0;

                const processChunk = (text) => {
                    try {
                        const chunk = JSON.parse(text);
                        log('UploadStream', `Parsed chunk:`, chunk);
                        const errors = chunk.errors ?? [];
                        const result = chunk.data?.[0];
                        if (errors.length) {
                            lastError = errors[0].message || JSON.stringify(errors[0]);
                            if (isOpen()) $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${lastError}</span>`);
                        } else if (result?.status) {
                            lastResult = result;
                            if (isOpen()) $status.html(`<span style="opacity:0.8;">⟳ ${result.status}…</span>`);
                        }
                    } catch { /* not yet a complete JSON object */ }
                };

                while (true) {
                    const { done, value } = await reader.read();
                    log('UploadStream', `Chunk #${++chunkCount} done=${done} bytes=${value?.length ?? 0}`);
                    if (done) break;
                    buf += decoder.decode(value, { stream: true });

                    // Try newline-delimited first (NDJSON)
                    const lines = buf.split('\n');
                    buf = lines.pop() ?? '';
                    for (const line of lines) {
                        if (line.trim()) processChunk(line);
                    }

                    // Also try parsing the accumulated buffer as a complete JSON object
                    // — handles the case where Runware sends one blob without trailing newline
                    if (buf.trim()) processChunk(buf);
                }

                // Stream closed — surface final state
                if (lastError) {
                    logPatchLast(null, lastError, null, null);
                    if (isOpen()) { $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${lastError}</span>`); resetBtn(); }
                    else if (window.toastr) window.toastr.error(`Upload failed: ${lastError}`);
                } else if (lastResult) {
                    logPatchLast(lastResult, null, null, lastResult);
                    if (lastResult.status === 'ready') {
                        if (category === 'lora') saveManualLora(name, air, null);
                        else saveManualModel(name, air);
                        await refreshEnginesUI();
                    }
                    if (isOpen()) {
                        const color = lastResult.status === 'ready' ? 'var(--SmartThemeQuoteColor)' : 'inherit';
                        $status.html(`<span style="color:${color};">✓ ${lastResult.status}${lastResult.message ? ' — ' + lastResult.message : ''}</span>`);
                        resetBtn();
                    } else {
                        if (window.toastr) window.toastr.success(`Upload ${lastResult.status}: ${name}`);
                    }
                }

            } catch (err) {
                logPatchLast(null, err.message, null, null);
                error('EnginesModal', 'Model upload failed:', err);
                if (isOpen()) { $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${err.message}</span>`); resetBtn(); }
                else if (window.toastr) window.toastr.error(`Upload error: ${err.message}`);
            }
        });
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