/**
 * @file data/default-user/extensions/personalyze/ui/engines/handlers/runwareUpload.js
 * @stamp {"utc":"2026-04-26T00:00:00.000Z"}
 * @architectural-role IO Executor + Stateful Owner (Runware Model Upload)
 * @description
 * Manages the full lifecycle of the Runware model upload flow:
 *
 * - Owns session-ephemeral form state (_uploadState) so values persist across
 *   overlay open/close within the same browser session.
 * - Renders and injects the upload overlay on demand.
 * - Handles form persistence (restore on open, sync on change, reset button).
 * - Submits the upload request to the /runware-upload-model server proxy,
 *   capturing the exchange in the Forensic Flight Recorder.
 * - Implements the "Close & Continue in Background" pattern: the overlay may
 *   be dismissed while the fetch is in flight; completion falls back to toastr.
 * - On successful "ready" status, registers the model in the local blueprint
 *   store and triggers a UI refresh.
 *
 * @api-declaration
 * bindRunwareUploadHandler($modal) → void
 *
 * @contract
 *   assertions:
 *     purity: IO Executor + Stateful Owner
 *     state_ownership: [_uploadState]
 *     external_io: [DOM, /api/plugins/personalyze/runware-upload-model, getRequestHeaders,
 *                   callLog.js, models.js, uiRefresh.js]
 */

import { error } from '../../../utils/logger.js';
import { getRequestHeaders } from '../../../../../../../script.js';
import { startSystemTurn, logCall, logPatchLast } from '../../../utils/callLog.js';
import { saveManualModel, saveManualLora } from '../../panel/models.js';
import { getRunwareUploadFormHTML } from '../templates.js';
import { refreshEnginesUI } from './uiRefresh.js';

// ─── Session-Ephemeral Form State ─────────────────────────────────────────────
// Owned by this module. Survives overlay close/reopen within one page session.
const _uploadState = {
    name: '', air: '', version: 'v1', downloadURL: '',
    architecture: 'sdxl', category: 'checkpoint',
    format: 'safetensors', type: 'base',
};

const _typeOptions = {
    checkpoint: [['base','base'],['inpainting','inpainting'],['refiner','refiner'],['pix2pix','pix2pix']],
    lora:       [['positive','positive'],['negative','negative']],
    lycoris:    [['positive','positive'],['negative','negative']],
    embeddings: [['positive','positive'],['negative','negative']],
    vae:        [],
};

// ─── Private Helpers ──────────────────────────────────────────────────────────

function _rebuildTypeOptions($overlay, category, selectedType) {
    const opts = _typeOptions[category] ?? [];
    const $sel = $overlay.find('#plz-upload-type');
    const $row = $overlay.find('#plz-upload-type-row');
    if (opts.length === 0) { $row.hide(); return; }
    $row.show();
    $sel.html(opts.map(([v, l]) => `<option value="${v}"${v === selectedType ? ' selected' : ''}>${l}</option>`).join(''));
}

// ─── Public Binding ───────────────────────────────────────────────────────────

/**
 * Binds the upload-overlay trigger to #plz-upload-runware-model in the modal.
 * @param {jQuery} $modal - The #plz-engines-overlay element.
 */
export function bindRunwareUploadHandler($modal) {
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

        // ── Restore persisted state ────────────────────────────────────────────
        $overlay.find('#plz-upload-name').val(_uploadState.name);
        $overlay.find('#plz-upload-air').val(_uploadState.air);
        $overlay.find('#plz-upload-version').val(_uploadState.version);
        $overlay.find('#plz-upload-url').val(_uploadState.downloadURL);
        $overlay.find('#plz-upload-arch').val(_uploadState.architecture);
        $overlay.find('#plz-upload-category').val(_uploadState.category);
        $overlay.find('#plz-upload-format').val(_uploadState.format);
        _rebuildTypeOptions($overlay, _uploadState.category, _uploadState.type);

        // ── Sync state on every change ─────────────────────────────────────────
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

        // ── Reset button ───────────────────────────────────────────────────────
        $overlay.on('click', '#plz-upload-reset', () => {
            Object.assign(_uploadState, {
                name: '', air: '', version: 'v1', downloadURL: '',
                architecture: 'sdxl', category: 'checkpoint',
                format: 'safetensors', type: 'base',
            });
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

        // ── Rebuild type options when category changes ─────────────────────────
        $overlay.on('change', '#plz-upload-category', function () {
            _rebuildTypeOptions($overlay, $(this).val(), '');
        });

        // ── Copy status text ───────────────────────────────────────────────────
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

        // ── Close ──────────────────────────────────────────────────────────────
        $overlay.on('click', '#plz-upload-close', () => $overlay.remove());
        $overlay.on('click', function (e) { if (e.target === this) $overlay.remove(); });

        // ── Submit ─────────────────────────────────────────────────────────────
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

            $submit.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Uploading...');
            $btnRow.append(`<button id="plz-upload-bg" class="menu_button" style="flex:1;">
                <i class="fa-solid fa-arrow-right-from-bracket"></i> Close & Continue
            </button>`);
            $overlay.on('click', '#plz-upload-bg', () => $overlay.remove());
            $status.html('<span style="opacity:0.7;">Submitting to Runware...</span>');

            const isOpen  = () => $.contains(document, $overlay[0]);
            const resetBtn = () => {
                $overlay.find('#plz-upload-bg').remove();
                $submit.prop('disabled', false).html('<i class="fa-solid fa-upload"></i> Submit Upload');
            };

            startSystemTurn('Runware Model Upload');
            logCall(`UploadModel [${air}]`, `[${architecture}/${category}] ${name}\n${downloadURL}`, null, null, reqBundle);

            try {
                const response = await fetch('/api/plugins/personalyze/runware-upload-model', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify(reqBundle)
                });
                const taskUUID = response.headers.get('x-task-uuid') ?? '—';

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    const msg = errData.error || `HTTP ${response.status}`;
                    logPatchLast(null, msg, { taskUUID }, errData.responseDocument ?? null);
                    if (isOpen()) { $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${msg}</span>`); resetBtn(); }
                    else if (window.toastr) window.toastr.error(`Upload failed: ${msg}`);
                    return;
                }

                const data = await response.json();
                logPatchLast(data.result, data.error ?? null, { taskUUID }, data.responseDocument ?? null);

                if (data.error) {
                    if (isOpen()) { $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${data.error}</span>`); resetBtn(); }
                    else if (window.toastr) window.toastr.error(`Upload failed: ${data.error}`);
                    return;
                }

                const result = data.result;
                const statusText = result?.status ?? 'accepted';

                if (statusText === 'ready') {
                    if (category === 'lora') saveManualLora(name, air, null);
                    else saveManualModel(name, air);
                    await refreshEnginesUI();
                }

                const statusColor = statusText === 'ready' ? 'var(--SmartThemeQuoteColor)' : 'inherit';
                const statusLine  = `✓ ${statusText}${result?.message ? ' — ' + result.message : ''} <span style="opacity:0.5; font-size:0.8em;">[${taskUUID}]</span>`;
                if (isOpen()) { $status.html(`<span style="color:${statusColor};">${statusLine}</span>`); resetBtn(); }
                else if (window.toastr) window.toastr.success(`Upload ${statusText}: ${name}`);

            } catch (err) {
                logPatchLast(null, err.message, null, null);
                error('EnginesModal', 'Model upload failed:', err);
                if (isOpen()) { $status.html(`<span style="color:var(--SmartThemeErrorColor);">✗ ${err.message}</span>`); resetBtn(); }
                else if (window.toastr) window.toastr.error(`Upload error: ${err.message}`);
            }
        });
    });
}
