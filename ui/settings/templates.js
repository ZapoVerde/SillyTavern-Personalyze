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
                // Image generation calls have response=null and error=null by design.
                const isImageCall = !c.response && !c.error;
                return `
                <div style="margin-top:8px;border-left:2px solid rgba(255,255,255,0.1);padding-left:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.8em;margin-bottom:3px;">
                        <strong>${escapeHtml(c.label)}</strong>
                        <span style="display:flex;gap:8px;align-items:center;">
                            <span style="font-size:0.85em;opacity:0.4;">${callTime}</span>
                            ${status}
                        </span>
                    </div>
                    ${copyBlock(c.prompt, 'Prompt')}
                    ${c.response ? copyBlock(c.response, 'Response') : ''}
                    ${isImageCall ? `<div style="font-size:0.72em;opacity:0.35;margin-top:3px;font-style:italic;">image generation — no text response</div>` : ''}
                    ${c.error ? `<div style="font-size:0.75em;color:var(--SmartThemeErrorColor);margin-top:4px;">${escapeHtml(c.error)}</div>` : ''}
                </div>`;
            }).join('');
            return `
            <div style="margin-bottom:14px;padding:10px;background:rgba(255,255,255,0.04);border-radius:6px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <strong style="font-size:0.88em;">${escapeHtml(turn.label)}</strong>
                    <span style="font-size:0.78em;opacity:0.4;">${turnTime}</span>
                </div>
                ${calls || '<span style="font-size:0.8em;opacity:0.5;">No calls.</span>'}
            </div>`;
        }).join('');
    }

    return `
    <h3 style="margin-top:0;">Call Logs</h3>
    <div style="margin-bottom:6px;"><strong style="font-size:0.9em;">Pipeline</strong> <span style="font-size:0.8em;opacity:0.5;">(last 2 turns)</span></div>
    ${renderTurns(pipelineLogs)}
    <hr style="margin:16px 0;opacity:0.2;">
    <div style="margin-bottom:6px;"><strong style="font-size:0.9em;">Settings / Modal</strong> <span style="font-size:0.8em;opacity:0.5;">(last 3)</span></div>
    ${renderTurns(workshopLogs)}`;
}

/** Utility for help tooltips. */
function tip(text) {
    return `<span class="plz-info-icon" title="${text}" style="cursor:help; opacity:0.6; margin-left:4px;"><i class="fa-solid fa-circle-info"></i></span>`;
}

/** Builds a pipeline stage row. */
function buildCallRow(id, label, profileKey, historyKey, description, extraButtons = '') {
    const historyRow = historyKey ? `
        <div style="margin-top:10px; display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap;">History Window:</label>
            <input id="plz-history-${id}" type="number" min="0" step="1" class="text_pole plz-history-input" 
                   data-history-key="${historyKey}" style="width:60px;" />
            <span style="font-size:0.83em; opacity:0.6;">pairs</span>
        </div>` : '';

    return `
    <div class="plz-call-row" style="margin-bottom:14px; padding:12px; border:1px solid var(--SmartThemeBorderColor,#555); border-radius:6px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div style="display:flex; align-items:center;">
                <strong style="font-size:0.9em;">${label}</strong>
                ${tip(description)}
            </div>
            <div style="display:flex; gap:6px;">${extraButtons}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:80px;">Connection:</label>
            <select id="plz-profile-${id}" class="text_pole" style="flex:1;" data-profile-key="${profileKey}"></select>
        </div>
        ${historyRow}
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
                    "Used for Subject Detection, the Change Gate, and Scene/Wardrobe checks. Recommended: Mistral Small.", `
                    <button class="menu_button plz-open-prompt" data-prompt-key="phase1SubjectPrompt">Subject?</button>
                    <button class="menu_button plz-open-prompt" data-prompt-key="phase2ChangePrompt">Changed?</button>
                    <button class="menu_button plz-open-prompt" data-prompt-key="sceneChangePrompt">Scene?</button>
                    <button class="menu_button plz-open-prompt" data-prompt-key="wardrobeValidityPrompt">Wardrobe?</button>`)}

                ${buildCallRow('smart', 'Smart Model (Phase 3 & Workshop)', 'smartProfileId', 'describerHistory',
                    "Used for State Extraction, Anchor Scan, Redress, and Force Costume. Recommended: Gemini Flash Lite or Claude Haiku.", `
                    <button class="menu_button plz-open-prompt" data-prompt-key="phase3LayeredPrompt">Extract</button>
                    <button class="menu_button plz-open-prompt" data-prompt-key="anchorScanPrompt">Anchor</button>
                    <button class="menu_button plz-open-prompt" data-prompt-key="redressPrompt">Redress</button>
                    <button class="menu_button plz-open-prompt" data-prompt-key="forceCostumePrompt">Costume</button>
                    <button class="menu_button plz-open-prompt" data-prompt-key="forceCostumeHintTemplate">Hint</button>`)}

                <!-- Workshop & Utils -->
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
                    <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:110px;">Portrait Position</label>
                    <select id="plz-portrait-position" class="text_pole" style="flex:1;">
                        <option value="bottom-right" ${s.portraitPosition === 'bottom-right' ? 'selected' : ''}>Bottom Right</option>
                        <option value="center-left" ${s.portraitPosition === 'center-left' ? 'selected' : ''}>Center Left</option>
                    </select>
                </div>

                <div style="margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--SmartThemeBorderColor,#444);">
                    <button class="menu_button" id="plz-open-engines" style="width:100%;"><i class="fa-solid fa-gear"></i> Configure Engines</button>
                </div>

                <div style="display:flex; gap:8px;">
                    <button class="menu_button" id="plz-open-workshop" style="flex:1;"><i class="fa-solid fa-dna"></i> Workshop</button>
                    <button class="menu_button" id="plz-view-logs" style="flex:1;"><i class="fa-solid fa-list"></i> Logs</button>
                </div>
            </div>
        </div>
    </div>`;
}