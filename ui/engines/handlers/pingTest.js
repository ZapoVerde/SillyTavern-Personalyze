/**
 * @file data/default-user/extensions/personalyze/ui/engines/handlers/pingTest.js
 * @stamp {"utc":"2026-04-26T00:00:00.000Z"}
 * @architectural-role IO Executor (API Connectivity & Key Management)
 * @description
 * Binds three categories of API interaction handlers to the Engines modal:
 *
 * 1. Vault Save — writes a new API key to the SillyTavern secret store and
 *    refreshes the key-status indicators.
 * 2. Ping — sends a lightweight connectivity probe to each engine's API and
 *    renders the pass/fail result inline.
 * 3. Test — triggers a small image generation against the selected model and
 *    displays the result in a popup, confirming the full request pipeline is
 *    operational end-to-end.
 *
 * @api-declaration
 * bindPingTestHandlers($modal) → void
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [DOM, writeSecret, pingFns, fetchPreviewBlob, callPopup, keyStatus.js]
 */

import { SECRET_RUNWARE } from '../../../defaults.js';
import { error } from '../../../utils/logger.js';
import { pingPollinations, pingFal, pingPiAPI, pingRunware } from '../../../utils/ping.js';
import { fetchPreviewBlob } from '../../../imageCache.js';
import { writeSecret } from '../../../../../../secrets.js';
import { openModal } from '../../../utils/modal.js';
import { updateEngineKeyStatuses } from './keyStatus.js';

/**
 * Binds vault-save, ping, and test-generation handlers to the engines modal.
 * @param {jQuery} $modal - The #plz-engines-overlay element.
 */
export function bindPingTestHandlers($modal) {

    // ── Vault Save ─────────────────────────────────────────────────────────────
    $modal.on('click', '.plz-eng-vault-save', async function () {
        const secretName = $(this).data('secret');
        let inputId, label;

        if (secretName === 'api_key_fal')       { inputId = '#plz-eng-fal-key';     label = 'PersonaLyze: Fal AI'; }
        else if (secretName === 'api_key_piapi') { inputId = '#plz-eng-piapi-key';   label = 'PersonaLyze: PiAPI'; }
        else if (secretName === SECRET_RUNWARE)  { inputId = '#plz-eng-runware-key'; label = 'PersonaLyze: Runware'; }
        else                                     { inputId = '#plz-eng-pol-key';     label = 'PersonaLyze: Pollinations'; }

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

    // ── Ping ───────────────────────────────────────────────────────────────────
    $modal.on('click', '#plz-eng-pol-ping',     async () => _runPing(pingPollinations, '#plz-eng-pol-status'));
    $modal.on('click', '#plz-eng-fal-ping',     async () => _runPing(pingFal,          '#plz-eng-fal-status'));
    $modal.on('click', '#plz-eng-piapi-ping',   async () => _runPing(pingPiAPI,        '#plz-eng-piapi-status'));
    $modal.on('click', '#plz-eng-runware-ping', async () => _runPing(pingRunware,      '#plz-eng-runware-status'));

    // ── Test Generation ────────────────────────────────────────────────────────
    $modal.on('click', '#plz-eng-pol-test',     async function () { await _runEngineTest($(this), '#plz-eng-pol-status',     'pollinations'); });
    $modal.on('click', '#plz-eng-fal-test',     async function () { await _runEngineTest($(this), '#plz-eng-fal-status',     'fal'); });
    $modal.on('click', '#plz-eng-piapi-test',   async function () { await _runEngineTest($(this), '#plz-eng-piapi-status',   'piapi'); });
    $modal.on('click', '#plz-eng-runware-test', async function () { await _runEngineTest($(this), '#plz-eng-runware-status', 'runware'); });
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

async function _runPing(pingFn, statusSelector) {
    const $status = $(statusSelector).text('Pinging...');
    const result = await pingFn();
    $status.html(result.ok
        ? '<span style="color:var(--SmartThemeQuoteColor);">✓ Responsive</span>'
        : `<span style="color:var(--SmartThemeErrorColor);">✗ ${result.error}</span>`
    );
}

async function _runEngineTest($btn, statusSelector, providerId) {
    const $status = $(statusSelector);
    const prompt = $('#plz-eng-test-prompt').val().trim();
    const model = $(`#plz-eng-${providerId}-model`).val();
    if (!prompt) return;

    const originalHtml = $btn.html();
    $btn.prop('disabled', true);
    $status.text('Generating test image...');
    try {
        const useLayerDiffuse = (providerId === 'runware')
            ? $('#plz-eng-runware-layerdiffuse').prop('checked')
            : false;
        const objectUrl = await fetchPreviewBlob(providerId, model, prompt, '', 256, 384, 1, [], useLayerDiffuse);
        $status.text('✓ Image generated');
        await openModal({
            content: `<h3 style="margin-top:0;">Test OK</h3><img src="${objectUrl}" style="width:100%;border-radius:6px;margin-top:8px;" />`,
            buttons: [{ label: 'Close', value: null, style: 'muted' }],
        });
    } catch (err) {
        $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${err.message.slice(0, 80)}</span>`);
        error('EnginesModal', 'Test failed:', err);
    } finally {
        $btn.prop('disabled', false).html(originalHtml);
    }
}
