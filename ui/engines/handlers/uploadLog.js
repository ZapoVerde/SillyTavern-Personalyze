/**
 * @file data/default-user/extensions/personalyze/ui/engines/handlers/uploadLog.js
 * @stamp {"utc":"2026-04-26T00:00:00.000Z"}
 * @architectural-role Stateful Owner + IO Executor (Runware Upload Job Log)
 * @description
 * Owns the persistent log of Runware model upload jobs, stored in localStorage.
 * Captures the full lifecycle of each job:
 *   1. Submission — request bundle, timestamp, taskUUID
 *   2. Upload response — raw result document from Runware
 *   3. Poll ticks — each search probe (attempt #, timestamp, found/not found)
 *   4. Resolution — final status (ready / error / timeout)
 *
 * Provides an in-page log viewer overlay: each job is a collapsible <details>
 * block showing its complete lifecycle, suitable for sharing with Runware support.
 *
 * @api-declaration
 * logJobStart(job)                         → void
 * logJobResponse(taskUUID, data)           → void
 * logJobPollTick(taskUUID, attempt, found) → void
 * logJobResolved(taskUUID, status, err)    → void
 * registerResumeHandler(fn)               → void
 * openUploadLogModal()                     → void
 *
 * @contract
 *   assertions:
 *     purity: Stateful Owner + IO Executor
 *     state_ownership: [localStorage:plz_runware_upload_log]
 *     external_io: [localStorage, DOM]
 */

const _STORAGE_KEY = 'plz_runware_upload_log';
const _MAX_ENTRIES = 50;

// Injected by runwareUpload.js to avoid circular imports
let _resumeHandler = null;

/**
 * Registers the function that resumes polling for a timed-out job.
 * Called once during bindRunwareUploadHandler().
 * @param {Function} fn - fn({ air, name, category, taskUUID, onTick, onReady, onTimeout })
 */
export function registerResumeHandler(fn) {
    _resumeHandler = fn;
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────

function _read() {
    try { return JSON.parse(localStorage.getItem(_STORAGE_KEY) ?? '[]'); }
    catch { return []; }
}

function _write(entries) {
    try { localStorage.setItem(_STORAGE_KEY, JSON.stringify(entries.slice(0, _MAX_ENTRIES))); }
    catch { /* storage quota — silently skip */ }
}

function _patch(taskUUID, updater) {
    const entries = _read();
    const idx = entries.findIndex(e => e.taskUUID === taskUUID);
    if (idx !== -1) { updater(entries[idx]); _write(entries); }
}

// ─── Lifecycle Writers ────────────────────────────────────────────────────────

/**
 * Creates a new log entry for a job at the moment of submission.
 * @param {{ taskUUID, air, name, category, architecture, format, reqBundle }} job
 */
export function logJobStart({ taskUUID, air, name, category, architecture, format, reqBundle }) {
    const entries = _read();
    entries.unshift({
        taskUUID,
        air,
        name,
        category,
        architecture,
        format,
        reqBundle,
        submittedAt: new Date().toISOString(),
        uploadResponse: null,
        uploadError: null,
        pollAttempts: [],
        finalStatus: 'uploading',
        resolvedAt: null,
    });
    _write(entries);
}

/**
 * Patches the entry with the raw upload API response.
 * @param {string} taskUUID
 * @param {{ result: object|null, error: string|null, responseDocument: object|null }} data
 */
export function logJobResponse(taskUUID, { result, error, responseDocument }) {
    _patch(taskUUID, e => {
        e.uploadResponse = responseDocument ?? result ?? null;
        e.uploadError    = error ?? null;
        if (error) {
            e.finalStatus = 'error';
        } else {
            // Reflect whatever Runware reported (e.g. "validated", "accepted", "ready")
            const rwStatus = result?.status ?? responseDocument?.data?.[0]?.status;
            if (rwStatus) e.finalStatus = rwStatus;
        }
    });
}

/**
 * Appends a poll tick to the job's attempt history.
 * @param {string}  taskUUID
 * @param {number}  attempt  - 1-based attempt number.
 * @param {boolean} found    - Whether the model appeared in search results.
 */
export function logJobPollTick(taskUUID, attempt, found) {
    _patch(taskUUID, e => {
        e.pollAttempts.push({ attempt, at: new Date().toISOString(), found });
        e.finalStatus = 'polling'; // overwritten by logJobResolved on completion
    });
}

/**
 * Marks a job as fully resolved.
 * @param {string}      taskUUID
 * @param {'ready'|'error'|'timeout'} status
 * @param {string|null} errorMsg
 */
export function logJobResolved(taskUUID, status, errorMsg = null) {
    _patch(taskUUID, e => {
        e.finalStatus  = status;
        e.resolvedAt   = new Date().toISOString();
        if (errorMsg) e.uploadError = errorMsg;
    });
}

// ─── Log Viewer ───────────────────────────────────────────────────────────────

export function openUploadLogModal() {
    $('#plz-upload-log-overlay').remove();

    const $overlay = $(`
        <div id="plz-upload-log-overlay" class="plz-overlay" style="z-index:10002;">
            <div class="plz-modal" style="max-width:600px; max-height:80vh; display:flex; flex-direction:column;">
                <div class="plz-workshop-header">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3 style="margin:0;"><i class="fa-solid fa-list-check"></i> Runware Upload Log</h3>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <button id="plz-log-clear" class="menu_button" style="font-size:0.8em; padding:2px 8px;">Clear</button>
                            <button id="plz-log-close" class="menu_button" style="padding:2px 10px;">✕</button>
                        </div>
                    </div>
                </div>
                <div id="plz-log-body" class="plz-workshop-body" style="overflow-y:auto; flex:1; padding:8px 12px;">
                </div>
            </div>
        </div>`);

    $('body').append($overlay);
    _renderEntries($overlay);

    $overlay.on('click', '#plz-log-close', () => $overlay.remove());
    $overlay.on('click', function (e) { if (e.target === this) $overlay.remove(); });

    $overlay.on('click', '#plz-log-clear', () => {
        _write([]);
        _renderEntries($overlay);
    });

    // Copy full job log to clipboard
    $overlay.on('click', '.plz-log-copy', async function (e) {
        e.stopPropagation(); // don't toggle the <details>
        const taskUUID = $(this).data('task-uuid');
        const entry = _read().find(en => en.taskUUID === taskUUID);
        if (!entry) return;
        try {
            await navigator.clipboard.writeText(_serialiseJob(entry));
            if (window.toastr) window.toastr.info('Job log copied to clipboard.');
        } catch {
            if (window.toastr) window.toastr.warning('Copy failed — try selecting manually.');
        }
    });

    // Resume polling for a timed-out job
    $overlay.on('click', '.plz-log-resume', function () {
        const taskUUID = $(this).data('task-uuid');
        const entries  = _read();
        const entry    = entries.find(e => e.taskUUID === taskUUID);
        if (!entry || !_resumeHandler) return;

        const $btn = $(this);
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Watching...');

        // Reset timeout status so the log entry reflects we're trying again
        _patch(taskUUID, e => { e.finalStatus = 'polling'; e.resolvedAt = null; });

        _resumeHandler({
            ...entry,
            onTick: ({ attempt }) => {
                logJobPollTick(taskUUID, attempt, false);
                $btn.html(`<i class="fa-solid fa-spinner fa-spin"></i> attempt ${attempt}`);
            },
            onReady: () => {
                logJobResolved(taskUUID, 'ready');
                _renderEntries($overlay);
            },
            onTimeout: () => {
                logJobResolved(taskUUID, 'timeout');
                _renderEntries($overlay);
            },
        });
    });
}

// ─── Private Render ───────────────────────────────────────────────────────────

function _renderEntries($overlay) {
    const entries = _read();
    const $body = $overlay.find('#plz-log-body');

    if (entries.length === 0) {
        $body.html('<div style="opacity:0.5; text-align:center; padding:24px;">No upload jobs recorded yet.</div>');
        return;
    }

    $body.html(entries.map(_renderJob).join(''));
}

function _statusBadge(status) {
    const map = {
        uploading:  ['⏳', 'inherit'],
        validated:  ['⏳', 'inherit'],
        accepted:   ['⏳', 'inherit'],
        polling:    ['⏳', 'inherit'],
        ready:      ['✓',  'var(--SmartThemeQuoteColor,#28a745)'],
        error:      ['✗',  'var(--SmartThemeErrorColor,#e05555)'],
        timeout:    ['⚠',  'var(--SmartThemeWarnColor,#e0a040)'],
    };
    const [icon, color] = map[status] ?? ['?', 'inherit'];
    return `<span style="color:${color}; font-weight:bold; margin-right:5px;">${icon} ${status}</span>`;
}

function _fmt(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

function _json(obj) {
    if (!obj) return '<em style="opacity:0.5;">—</em>';
    return `<pre style="margin:0; white-space:pre-wrap; word-break:break-all; font-size:0.78em; background:var(--SmartThemeBlurTintColor,#1a1a1a); padding:6px 8px; border-radius:4px;">${JSON.stringify(obj, null, 2)}</pre>`;
}

function _serialiseJob(e) {
    const lines = [
        `=== Runware Upload Job ===`,
        `Name:       ${e.name}`,
        `AIR:        ${e.air}`,
        `Task UUID:  ${e.taskUUID ?? '—'}`,
        `Category:   ${e.category} / ${e.architecture} / ${e.format}`,
        `Status:     ${e.finalStatus}`,
        `Submitted:  ${_fmt(e.submittedAt)}`,
        `Resolved:   ${_fmt(e.resolvedAt)}`,
        ``,
        `--- Request Bundle ---`,
        JSON.stringify(e.reqBundle, null, 2),
        ``,
        `--- Upload Response ---`,
        e.uploadError ? `Error: ${e.uploadError}` : '',
        JSON.stringify(e.uploadResponse, null, 2),
        ``,
        `--- Poll History (${e.pollAttempts.length} attempts) ---`,
        ...e.pollAttempts.map(p => `${_fmt(p.at)}  attempt ${p.attempt}  ${p.found ? '✓ found' : '○ not found'}`),
    ];
    return lines.join('\n').trim();
}

function _renderJob(entry) {
    const {
        taskUUID, air, name, category, architecture, format,
        submittedAt, resolvedAt, finalStatus,
        uploadResponse, uploadError, pollAttempts, reqBundle,
    } = entry;

    const pollRows = pollAttempts.length === 0
        ? '<em style="opacity:0.5;">No poll attempts recorded.</em>'
        : pollAttempts.map(p =>
            `<div style="display:flex; gap:12px; font-size:0.78em; padding:1px 0;">
                <span style="opacity:0.5; min-width:90px;">${_fmt(p.at)}</span>
                <span style="min-width:60px;">attempt ${p.attempt}</span>
                <span style="color:${p.found ? 'var(--SmartThemeQuoteColor)' : 'inherit'};">${p.found ? '✓ found' : '○ not found'}</span>
            </div>`
          ).join('');

    return `
        <details style="border-bottom:1px solid var(--SmartThemeBorderColor,#333); padding:6px 0;">
            <summary style="cursor:pointer; list-style:none; display:flex; justify-content:space-between; align-items:center; gap:8px; padding:4px 0; user-select:none;">
                <span style="display:flex; align-items:center; gap:6px; flex:1; min-width:0; overflow:hidden;">
                    ${_statusBadge(finalStatus)}
                    <strong style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</strong>
                    <span style="opacity:0.5; font-size:0.8em; white-space:nowrap;">${air}</span>
                </span>
                <span style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                    <span style="opacity:0.45; font-size:0.75em; white-space:nowrap;">${_fmt(submittedAt)}</span>
                    <button class="plz-log-copy menu_button" data-task-uuid="${taskUUID}" style="font-size:0.72em; padding:1px 7px;" title="Copy full job log">
                        <i class="fa-regular fa-copy"></i>
                    </button>
                </span>
            </summary>
            <div style="padding:8px 4px 4px; display:flex; flex-direction:column; gap:10px;">

                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
                        <div style="font-size:0.75em; font-weight:bold; opacity:0.6; text-transform:uppercase; letter-spacing:.04em;">Job Info</div>
                        ${finalStatus === 'timeout' ? `<button class="plz-log-resume menu_button" data-task-uuid="${taskUUID}" style="font-size:0.75em; padding:1px 8px;"><i class="fa-solid fa-rotate-right"></i> Resume Watch</button>` : ''}
                    </div>
                    <div style="font-size:0.8em; font-family:monospace; display:grid; grid-template-columns:auto 1fr; gap:2px 12px;">
                        <span style="opacity:0.5;">Task UUID</span><span>${taskUUID ?? '—'}</span>
                        <span style="opacity:0.5;">Category</span><span>${category} / ${architecture} / ${format}</span>
                        <span style="opacity:0.5;">Submitted</span><span>${_fmt(submittedAt)}</span>
                        <span style="opacity:0.5;">Resolved</span><span>${_fmt(resolvedAt)}</span>
                    </div>
                </div>

                <details>
                    <summary style="cursor:pointer; list-style:none; font-size:0.8em; font-weight:bold; opacity:0.7; user-select:none;">▶ Request Bundle</summary>
                    <div style="margin-top:4px;">${_json(reqBundle)}</div>
                </details>

                <details>
                    <summary style="cursor:pointer; list-style:none; font-size:0.8em; font-weight:bold; opacity:0.7; user-select:none;">▶ Upload Response</summary>
                    <div style="margin-top:4px;">${uploadError ? `<span style="color:var(--SmartThemeErrorColor);">${uploadError}</span>` : ''}${_json(uploadResponse)}</div>
                </details>

                <details>
                    <summary style="cursor:pointer; list-style:none; font-size:0.8em; font-weight:bold; opacity:0.7; user-select:none;">▶ Poll History (${pollAttempts.length} attempt${pollAttempts.length !== 1 ? 's' : ''})</summary>
                    <div style="margin-top:4px; font-family:monospace;">${pollRows}</div>
                </details>

            </div>
        </details>`;
}
