/**
 * @file data/default-user/extensions/personalyze/ui/settings/templates.js
 * @stamp {"utc":"2026-04-09T00:00:00.000Z"}
 * @architectural-role Pure UI Templates
 * @description
 * Pure functions for generating the Personalyze settings panel HTML.
 * Updated for the 3-Phase Layered State architecture and Dual-Model routing.
 *
 * @api-declaration
 * buildPanelHTML(settings, meta, profileNames) -> string (HTML)
 * buildLogModalHTML(pipelineLogs, workshopLogs) -> string (HTML)
 *
 * @contract
 *   assertions:
 *     purity: Pure (Structural)
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../../utils/history.js';

/**
 * Renders the call log modal HTML.
 * - All timestamps shown in UTC.
 * - Two sections: Pipeline (last 2 turns) and Settings / Modal (last 3).
 * - Every prompt and response has a Copy button.
 * - Image generation calls show the prompt only (no response block).
 */
export function buildLogModalHTML(pipelineLogs, workshopLogs) {
    let _copyId = 0;

    /** Formats a ms-epoch timestamp as "YYYY-MM-DD HH:MM:SS UTC". */
    function utcTime(ts) {
        return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    }

    /**
     * Renders a labelled text block (prompt or response) with a Copy button.
     * Uses an element ID so the button can read textContent directly (avoids
     * re-encoding / decoding issues with special characters).
     */
    function copyBlock(rawText, sectionLabel) {
        if (!rawText) return '';
        const id = `plz-log-copy-${_copyId++}`;
        const escaped = escapeHtml(rawText);
        const onclickJs = `(function(){`
            + `var el=document.getElementById('${id}');`
            + `navigator.clipboard.writeText(el.textContent).then(function(){`
            + `el.style.outline='1px solid #4caf50';`
            + `setTimeout(function(){el.style.outline='';},900);`
            + `});`
            + `})();event.stopPropagation();`;
        return `
        <div style="margin-top:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.78em;opacity:0.65;margin-bottom:2px;">
                <span>${sectionLabel}</span>
                <button onclick="${onclickJs}"
                    class="menu_button"
                    style="font-size:0.72em;padding:1px 7px;line-height:1.6;opacity:0.75;cursor:pointer;"
                    title="Copy to clipboard">
                    <i class="fa-regular fa-copy"></i> Copy
                </button>
            </div>
            <pre id="${id}" style="font-size:0.75em;white-space:pre-wrap;word-break:break-word;max-height:150px;overflow-y:auto;margin:0;padding:6px;background:rgba(0,0,0,0.25);border-radius:4px;">${escaped}</pre>
        </div>`;
    }

    function renderTurns(turns) {
        if (!turns.length) return `<p style="opacity:0.5;font-size:0.88em;">No entries yet.</p>`;
        return [...turns].reverse().map(turn => {
            const turnTime = utcTime(turn.timestamp);
            const calls = turn.calls.map(c => {
                const callTime = utcTime(c.timestamp);
                const status = c.error
                    ? `<span style="color:var(--SmartThemeErrorColor);">✗ ${escapeHtml(c.error)}</span>`
                    : `<span style="opacity:0.55;">✓</span>`;
                const isImageCall = c.label === 'PortraitGenerate';
                const imageBlock = isImageCall && c.response
                    ? `<div style="margin-top:6px;">
                           <div style="font-size:0.78em;opacity:0.65;margin-bottom:3px;">Result</div>
                           <a href="user/images/personalyze/${encodeURIComponent(c.response)}" target="_blank" style="display:inline-block;">
                               <img src="user/images/personalyze/${encodeURIComponent(c.response)}"
                                    style="max-width:120px;max-height:120px;border-radius:4px;display:block;"
                                    title="${escapeHtml(c.response)}" />
                           </a>
                       </div>`
                    : '';

                const metaBlock = c.meta
                    ? (() => {
                        const m = c.meta;
                        const dur = (m.started_at && m.ended_at)
                            ? `${((new Date(m.ended_at) - new Date(m.started_at)) / 1000).toFixed(1)}s`
                            : null;
                        const rows = [
                            m.task_id  && `<tr><td style="opacity:0.6;padding-right:12px;">Task ID</td><td>${escapeHtml(m.task_id)}</td></tr>`,
                            m.model    && `<tr><td style="opacity:0.6;padding-right:12px;">Model</td><td>${escapeHtml(m.model)}</td></tr>`,
                            m.status   && `<tr><td style="opacity:0.6;padding-right:12px;">Status</td><td>${escapeHtml(m.status)}</td></tr>`,
                            dur        && `<tr><td style="opacity:0.6;padding-right:12px;">Duration</td><td>${dur}</td></tr>`,
                            m.points   && `<tr><td style="opacity:0.6;padding-right:12px;">Points</td><td>${m.points.toLocaleString()}</td></tr>`,
                            m.image_url && `<tr><td style="opacity:0.6;padding-right:12px;">CDN URL</td><td style="word-break:break-all;font-size:0.9em;">${escapeHtml(m.image_url)}</td></tr>`,
                            m.error    && `<tr><td style="opacity:0.6;padding-right:12px;">API Error</td><td style="color:var(--SmartThemeErrorColor);">${escapeHtml(String(m.error))}</td></tr>`,
                        ].filter(Boolean).join('');
                        return `<details style="margin-top:6px;">
                            <summary style="font-size:0.78em;opacity:0.65;cursor:pointer;list-style:none;">PiAPI Task Metadata</summary>
                            <table style="font-size:0.78em;margin-top:4px;border-collapse:collapse;">${rows}</table>
                        </details>`;
                    })()
                    : '';
                return `
                <details style="margin-top:6px;border-left:2px solid rgba(255,255,255,0.1);padding-left:8px;">
                    <summary style="display:flex;justify-content:space-between;align-items:center;font-size:0.8em;cursor:pointer;list-style:none;padding:2px 0;">
                        <strong>${escapeHtml(c.label)}</strong>
                        <span style="display:flex;gap:8px;align-items:center;">
                            <span style="font-size:0.85em;opacity:0.4;">${callTime}</span>
                            ${status}
                        </span>
                    </summary>
                    ${copyBlock(c.prompt, 'Prompt')}
                    ${!isImageCall && c.response ? copyBlock(c.response, 'Response') : ''}
                    ${imageBlock}
                    ${metaBlock}
                    ${isImageCall && !c.response && !c.error ? `<div style="font-size:0.72em;opacity:0.35;margin-top:3px;font-style:italic;">generating…</div>` : ''}
                    ${c.error ? `<div style="font-size:0.75em;color:var(--SmartThemeErrorColor);margin-top:4px;">${escapeHtml(c.error)}</div>` : ''}
                </details>`;
            }).join('');
            return `
            <details style="margin-bottom:8px;padding:10px;background:rgba(255,255,255,0.04);border-radius:6px;">
                <summary style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;list-style:none;">
                    <strong style="font-size:0.88em;">${escapeHtml(turn.label)}</strong>
                    <span style="font-size:0.78em;opacity:0.4;">${turnTime}</span>
                </summary>
                ${calls || '<span style="font-size:0.8em;opacity:0.5;">No calls.</span>'}
            </details>`;
        }).join('');
    }

    return `
    <h3 style="margin-top:0;text-align:left;">Call Logs</h3>
    <details>
        <summary style="cursor:pointer;font-size:0.9em;margin-bottom:6px;list-style:none;">
            <strong>Pipeline</strong> <span style="font-size:0.88em;opacity:0.5;">(last 2 turns)</span>
        </summary>
        ${renderTurns(pipelineLogs)}
    </details>
    <hr style="margin:12px 0;opacity:0.2;">
    <details>
        <summary style="cursor:pointer;font-size:0.9em;margin-bottom:6px;list-style:none;">
            <strong>Settings / Modal</strong> <span style="font-size:0.88em;opacity:0.5;">(last 3)</span>
        </summary>
        ${renderTurns(workshopLogs)}
    </details>`;
}

/** Utility for help tooltips. */
function tip(text) {
    return `<span class="plz-info-icon" title="${text}" style="cursor:help; opacity:0.6; margin-left:4px;"><i class="fa-solid fa-circle-info"></i></span>`;
}

/**
 * Builds a pipeline stage row.
 * @param {string} id
 * @param {string} label
 * @param {string} profileKey
 * @param {string|null} historyKey
 * @param {string} description
 * @param {Array<{key: string, label: string}>} promptButtons
 */
function buildCallRow(id, label, profileKey, historyKey, description, promptButtons = []) {
    const historyRow = historyKey ? `
        <div style="margin-top:10px; display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap;">History Window:</label>
            <input id="plz-history-${id}" type="number" min="0" step="1" class="text_pole plz-history-input"
                   data-history-key="${historyKey}" style="width:60px;" />
            <span style="font-size:0.83em; opacity:0.6;">pairs</span>
        </div>` : '';

    const buttonRows = promptButtons.map(btn =>
        `<button class="menu_button plz-open-prompt plz-btn-left" data-prompt-key="${btn.key}"
                 style="width:100%; font-size:0.82em;">${btn.label}</button>`
    ).join('');

    return `
    <div class="plz-call-row" style="margin-bottom:14px; padding:12px; border:1px solid var(--SmartThemeBorderColor,#555); border-radius:6px;">
        <div style="display:flex; align-items:center; margin-bottom:10px;">
            <strong style="font-size:0.9em;">${label}</strong>
            ${tip(description)}
        </div>
        ${buttonRows ? `<div style="display:flex; flex-direction:column; gap:5px; margin-bottom:10px;">${buttonRows}</div>` : ''}
        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:80px;">Connection:</label>
            <select id="plz-profile-${id}" class="text_pole" style="flex:1;" data-profile-key="${profileKey}"></select>
        </div>
        ${historyRow}
    </div>`;
}

/** Renders the Style Library selector section. */
function buildStyleManagerHTML(meta) {
    const lib = meta.styleLibrary ?? {};
    const defName = meta.defaultStyleName ?? '';
    const names = Object.keys(lib);
    const styleOptions = names.map(n =>
        `<option value="${n}"${n === defName ? ' selected' : ''}>${n}${n === defName ? ' ⭐' : ''}</option>`
    ).join('');

    return `
    <div style="margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--SmartThemeBorderColor,#444);">
        <div style="font-size:0.8em; opacity:0.6; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Portrait Styles</div>
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
            <select id="plz-style-select" class="text_pole" style="flex:1;">${styleOptions}</select>
            <button id="plz-style-star" class="menu_button" title="Set as global default">⭐</button>
            <button id="plz-style-add" class="menu_button" title="New style">➕</button>
            <button id="plz-style-delete" class="menu_button" style="color:#e05555;" title="Delete style">🗑️</button>
        </div>
        <button id="plz-style-edit" class="menu_button" style="width:100%;">✏️ Edit "${names.includes(defName) ? defName : (names[0] ?? '')}"</button>
    </div>`;
}

/** Main Settings Panel template. */
export function buildPanelHTML(settings, meta, profileNames = ['Default']) {
    const s = settings;
    const profileOptions = profileNames.map(n => `<option value="${n}"${n === meta.currentProfileName ? ' selected' : ''}>${n}</option>`).join('');

    return `
    <div id="plz-settings" class="extension_settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b><i class="fa-solid fa-user"></i> Personalyze</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">

                <!-- Profile Management -->
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--SmartThemeBorderColor,#444);">
                    <select id="plz-profile-select" class="text_pole" style="flex:1;">${profileOptions}</select>
                    <button id="plz-profile-save" class="menu_button">💾</button>
                    <button id="plz-profile-add" class="menu_button">➕</button>
                    <button id="plz-profile-delete" class="menu_button" style="color:#e05555;">🗑️</button>
                </div>

                <div style="margin-bottom:14px;">
                    <label class="checkbox_label"><input type="checkbox" id="plz-enabled" ${s.enabled ? 'checked' : ''} /><span>Enable PersonaLyze</span></label>
                </div>

                <!-- Pipeline Stages -->
                ${buildCallRow('fast', 'Fast Model (Phase 1 & 2)', 'fastProfileId', 'detectionHistory',
                    "Used for Subject Detection, the Change Gate, and Scene/Wardrobe checks. Recommended: Mistral Small.",
                    [
                        { key: 'phase1SubjectPrompt',    label: 'Who is the subject of this turn?' },
                        { key: 'phase2ChangePrompt',     label: "Has the subject's appearance or emotion changed?" },
                        { key: 'sceneChangePrompt',      label: 'Has the scene moved to a new location?' },
                        { key: 'wardrobeValidityPrompt', label: 'Are the current outfits still valid for this scene?' },
                    ])}

                ${buildCallRow('smart', 'Smart Model (Phase 3 & Workshop)', 'smartProfileId', 'describerHistory',
                    "Used for State Extraction, Anchor Scan, Redress, and Force Costume. Recommended: Gemini Flash Lite or Claude Haiku.",
                    [
                        { key: 'phase3LayeredPrompt',      label: 'Extract the updated visual state layer by layer' },
                        { key: 'anchorScanPrompt',         label: "Scan a transcript for a character's permanent physical identity" },
                        { key: 'redressPrompt',            label: 'Determine new clothing after a scene transition' },
                        { key: 'forceCostumePrompt',       label: 'Manually extract an outfit from a specific turn' },
                        { key: 'forceCostumeHintTemplate', label: 'Hint block template (wraps the keyword hint)' },
                    ])}

                <!-- Workshop & Utils -->
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
                    <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:110px;">Portrait Position</label>
                    <select id="plz-portrait-position" class="text_pole" style="flex:1;">
                        <option value="bottom-right" ${s.portraitPosition === 'bottom-right' ? 'selected' : ''}>Bottom Right</option>
                        <option value="center-left" ${s.portraitPosition === 'center-left' ? 'selected' : ''}>Center Left</option>
                    </select>
                </div>

                <div style="margin-bottom:10px;">
                    <label class="checkbox_label"><input type="checkbox" id="plz-portrait-status" ${s.showPortraitStatus ? 'checked' : ''} /><span>Show generation progress bar on portrait</span></label>
                </div>

                <div style="margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--SmartThemeBorderColor,#444);">
                    <button class="menu_button" id="plz-open-engines" style="width:100%;"><i class="fa-solid fa-gear"></i> Configure Engines</button>
                </div>

                ${buildStyleManagerHTML(meta)}

                <div style="display:flex; gap:8px;">
                    <button class="menu_button" id="plz-open-workshop" style="flex:1;"><i class="fa-solid fa-dna"></i> Workshop</button>
                    <button class="menu_button" id="plz-view-logs" style="flex:1;"><i class="fa-solid fa-list"></i> Logs</button>
                </div>
            </div>
        </div>
    </div>`;
}